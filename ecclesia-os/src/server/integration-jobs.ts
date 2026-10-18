import { randomUUID } from "node:crypto";
import type { Database, Row } from "./db.js";
import type { Efi } from "./efi.js";
import { cents, decimal, settle } from "./finance.js";
import { HttpError, requireThat } from "./security.js";
import { audit } from "./seed.js";

export async function processIntegrationJob(
  db: Database,
  efi: Efi,
  id?: string,
) {
  const lease = randomUUID();
  const job: Row | null = await db.transaction(async (q) => {
    const [j] = await q(
      `SELECT * FROM integration_jobs WHERE
      ($1::uuid IS NULL OR resource_id=$1) AND ((status='pending' AND available_at<=now()) OR (status='running' AND locked_until<now()))
      ORDER BY available_at,id FOR UPDATE SKIP LOCKED LIMIT 1`,
      [id ?? null],
    );
    if (!j) return null;
    await q(
      "UPDATE integration_jobs SET status='running',attempts=attempts+1,locked_until=now()+interval '2 minutes',lease_token=$2 WHERE id=$1",
      [j.id, lease],
    );
    return { ...j, attempts: j.attempts + 1 };
  });
  if (!job) return false;
  try {
    const [charge] = await db.transaction((q) =>
      q("SELECT * FROM pix_charges WHERE id=$1", [job.resource_id]),
    );
    requireThat(charge, 404, "Cobrança não encontrada.");
    let again = false;
    if (job.kind === "pix.create" && charge.status === "creating") {
      let copyPaste: string,
        expiresAt = charge.expires_at;
      if (charge.provider === "demo")
        copyPaste = `DEMONSTRACAO-SEM-VALOR-FINANCEIRO:${charge.txid}:${decimal(Number(charge.amount_cents))}`;
      else {
        requireThat(
          efi.account(charge.church_id).accountId === charge.provider_account,
          409,
          "Conta recebedora alterada.",
        );
        // A timeout is ambiguous: query the persisted txid before attempting the same PUT.
        let existing: any;
        if (job.attempts > 1) {
          try {
            existing = await efi.query(charge.church_id, charge.txid);
          } catch (e) {
            if (!(e instanceof HttpError && e.status === 404)) throw e;
          }
        }
        if (existing) {
          requireThat(
            existing.txid === charge.txid &&
              cents(existing.valor?.original ?? "") ===
                Number(charge.amount_cents),
            502,
            "Cobrança recuperada divergente.",
          );
          requireThat(
            typeof existing.pixCopiaECola === "string",
            502,
            "QR Code indisponível.",
          );
          copyPaste = existing.pixCopiaECola;
          const created = Date.parse(existing.calendario?.criacao);
          const seconds = Number(existing.calendario?.expiracao);
          if (
            Number.isFinite(created) &&
            Number.isFinite(seconds) &&
            seconds > 0
          )
            expiresAt = new Date(created + seconds * 1000).toISOString();
        } else {
          const result = await efi.create(
            charge.church_id,
            charge.txid,
            Number(charge.amount_cents),
          );
          requireThat(
            result.account === charge.provider_account,
            409,
            "Conta recebedora alterada; revise a configuração.",
          );
          copyPaste = result.copyPaste;
          expiresAt = new Date(Date.now() + 3600000).toISOString();
        }
      }
      await db.transaction(async (q) => {
        const [owned] = await q(
          "SELECT id FROM integration_jobs WHERE id=$1 AND lease_token=$2 AND status='running' FOR UPDATE",
          [job.id, lease],
        );
        requireThat(owned, 409, "Operação em recuperação por outro processo.");
        await q(
          "UPDATE pix_charges SET copy_paste=$2,status='active',expires_at=$3 WHERE id=$1 AND status='creating'",
          [charge.id, copyPaste, expiresAt],
        );
        if (charge.provider === "efi")
          await q(
            "INSERT INTO integration_jobs(church_id,kind,resource_id,available_at) VALUES($1,'pix.reconcile',$2,now()+interval '30 seconds') ON CONFLICT DO NOTHING",
            [charge.church_id, charge.id],
          );
        await audit(q, null, charge.church_id, "pix.created", charge.id);
      });
    } else if (
      job.kind === "pix.reconcile" &&
      ["active", "expired"].includes(charge.status)
    ) {
      await reconcileCharge(db, efi, charge);
      const [latest] = await db.transaction((q) =>
        q("SELECT status,expires_at FROM pix_charges WHERE id=$1", [charge.id]),
      );
      again =
        ["active", "expired"].includes(latest.status) &&
        Date.now() < new Date(latest.expires_at).getTime() + 7 * 86400000;
    }
    await db.transaction((q) =>
      q(
        "UPDATE integration_jobs SET status=$3,available_at=now()+interval '1 minute',locked_until=NULL,last_error=NULL WHERE id=$1 AND lease_token=$2",
        [job.id, lease, again ? "pending" : "done"],
      ),
    );
  } catch {
    // Never persist provider response bodies, credentials, or personal details in operational errors.
    await db.transaction((q) =>
      q(
        "UPDATE integration_jobs SET status=$3,available_at=now()+($4::int*interval '1 second'),locked_until=NULL,last_error='Falha na integração. Consulte a cobrança antes de repetir.' WHERE id=$1 AND lease_token=$2",
        [
          job.id,
          lease,
          job.attempts >= 12 ? "failed" : "pending",
          Math.min(3600, 15 * 2 ** Math.min(job.attempts, 8)),
        ],
      ),
    );
  }
  return true;
}

export async function reconcileCharge(db: Database, efi: Efi, charge: Row) {
  requireThat(
    efi.account(charge.church_id).accountId === charge.provider_account,
    409,
    "Conta recebedora alterada.",
  );
  const result = await efi.query(charge.church_id, charge.txid);
  requireThat(result.txid === charge.txid, 502, "Identificador divergente.");
  for (const p of result.pix ?? []) {
    requireThat(p.txid === charge.txid, 409, "Recebimento divergente.");
    await settle(db, {
      provider: "efi",
      account: charge.provider_account,
      txid: p.txid,
      endToEndId: p.endToEndId,
      amount: cents(p.valor),
    });
  }
  if (result.status === "ATIVA" && new Date(charge.expires_at) < new Date())
    await db.transaction((q) =>
      q(
        "UPDATE pix_charges SET status='expired' WHERE id=$1 AND status='active'",
        [charge.id],
      ),
    );
  return result.status;
}

export function startIntegrationWorker(db: Database, efi: Efi) {
  let pending: Promise<unknown> | null = null;
  const tick = () => {
    if (!pending)
      pending = processIntegrationJob(db, efi)
        .catch(() => {})
        .finally(() => {
          pending = null;
        });
  };
  const timer = setInterval(tick, 5000);
  timer.unref();
  tick();
  return async () => {
    clearInterval(timer);
    await pending;
  };
}
