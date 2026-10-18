import https from "node:https";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import { decimal } from "./finance.js";
import { HttpError, requireThat } from "./security.js";
const accountSchema = z.object({
  churchId: z.uuid(),
  accountId: z.string().min(1),
  clientId: z.string().min(1),
  clientSecret: z.string().min(1),
  pixKey: z.string().min(1),
  certificatePath: z.string().min(1),
  certificatePassword: z.string().optional(),
});
export type EfiAccount = z.infer<typeof accountSchema>;
export class Efi {
  constructor(public accounts: EfiAccount[]) {}
  static async load() {
    return new Efi(
      process.env.EFI_CONFIG_PATH
        ? z
            .array(accountSchema)
            .parse(
              JSON.parse(await readFile(process.env.EFI_CONFIG_PATH, "utf8")),
            )
        : [],
    );
  }
  account(church: string) {
    const a = this.accounts.find((a) => a.churchId === church);
    requireThat(a, 503, "Configure a conta Efí desta igreja no servidor.");
    return a;
  }
  private async request(
    a: EfiAccount,
    method: string,
    path: string,
    body?: unknown,
    bearer?: string,
  ): Promise<any> {
    const pfx = await readFile(a.certificatePath);
    const data = body === undefined ? undefined : JSON.stringify(body);
    return new Promise((resolve, reject) => {
      const req = https.request(
        {
          hostname: "pix-h.api.efipay.com.br",
          path,
          method,
          pfx,
          passphrase: a.certificatePassword,
          headers: {
            "Content-Type": "application/json",
            Authorization: bearer
              ? `Bearer ${bearer}`
              : `Basic ${Buffer.from(`${a.clientId}:${a.clientSecret}`).toString("base64")}`,
          },
          timeout: 15000,
        },
        (res) => {
          let text = "";
          res.on("data", (d) => {
            text += d;
            if (text.length > 2_000_000) req.destroy();
          });
          res.on("end", () => {
            if (!res.statusCode || res.statusCode >= 300)
              return reject(
                new HttpError(
                  res.statusCode === 404 ? 404 : 502,
                  "A Efí não concluiu a operação. Consulte a conciliação antes de repetir.",
                ),
              );
            try {
              resolve(JSON.parse(text));
            } catch {
              reject(new HttpError(502, "Resposta inválida da Efí."));
            }
          });
        },
      );
      req.on("timeout", () => req.destroy(new Error("Efí timeout")));
      req.on("error", () =>
        reject(new HttpError(502, "Falha de conexão segura com a Efí.")),
      );
      if (data) req.write(data);
      req.end();
    });
  }
  private async auth(a: EfiAccount) {
    const r = await this.request(a, "POST", "/oauth/token", {
      grant_type: "client_credentials",
    });
    requireThat(
      typeof r.access_token === "string",
      502,
      "Autorização Efí inválida.",
    );
    return r.access_token;
  }
  async create(church: string, txid: string, amount: number) {
    const a = this.account(church);
    const t = await this.auth(a);
    const r = await this.request(
      a,
      "PUT",
      `/v2/cob/${txid}`,
      {
        calendario: { expiracao: 3600 },
        valor: { original: decimal(amount) },
        chave: a.pixKey,
        solicitacaoPagador: "Contribuição EcclesiaOS",
      },
      t,
    );
    requireThat(
      r.txid === txid && typeof r.pixCopiaECola === "string",
      502,
      "Cobrança Efí inválida.",
    );
    return { account: a.accountId, copyPaste: r.pixCopiaECola };
  }
  async query(church: string, txid: string) {
    const a = this.account(church);
    const t = await this.auth(a);
    return this.request(
      a,
      "GET",
      `/v2/cob/${encodeURIComponent(txid)}`,
      undefined,
      t,
    );
  }
  async registerWebhook(church: string, url: string) {
    const a = this.account(church);
    const t = await this.auth(a);
    return this.request(
      a,
      "PUT",
      `/v2/webhook/${encodeURIComponent(a.pixKey)}`,
      { webhookUrl: url },
      t,
    );
  }
}
