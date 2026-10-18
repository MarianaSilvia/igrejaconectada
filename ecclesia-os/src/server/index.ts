import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import https from "node:https";
import { openDatabase } from "./db.js";
import { seed } from "./seed.js";
import { createApp } from "./app.js";
import { Efi } from "./efi.js";
import express from "express";
import { startIntegrationWorker } from "./integration-jobs.js";
import { startWorkflowWorker } from "./participation.js";
import {
  startCommunicationWorker,
  type CommunicationTransport,
} from "./communication-jobs.js";
import { sealTotpSecrets } from "./access.js";
import path from "node:path";
if (existsSync(".env")) process.loadEnvFile(".env");
const mode = process.env.APP_MODE ?? process.env.MODE ?? "demo";
if (!["demo", "homologation"].includes(mode))
  throw new Error(
    "Esta versão habilita demo e homologação. Produção exige concluir o checklist de lançamento em docs/OPERACAO.md.",
  );
const db = await openDatabase();
if (mode === "homologation" && !process.env.DATABASE_URL)
  throw new Error(
    "Homologação exige PostgreSQL externo configurado em DATABASE_URL.",
  );
if (
  mode === "homologation" &&
  (!process.env.SERVICE_DATABASE_URL ||
    process.env.SERVICE_DATABASE_URL === process.env.DATABASE_URL)
)
  throw new Error(
    "Homologação exige credenciais distintas para DATABASE_URL (ecclesia_app) e SERVICE_DATABASE_URL (ecclesia_service).",
  );
if (!process.env.DATABASE_URL) await db.migrate();
if (mode === "demo") await seed(db);
let key: Buffer;
if (process.env.DATA_KEY_HEX) {
  key = Buffer.from(process.env.DATA_KEY_HEX, "hex");
} else {
  if (mode !== "demo")
    throw new Error("DATA_KEY_HEX obrigatória fora da demo.");
  await mkdir(".local", { recursive: true });
  if (!existsSync(".local/data-key"))
    await writeFile(".local/data-key", randomBytes(32).toString("hex"), {
      mode: 0o600,
    });
  key = Buffer.from(await readFile(".local/data-key", "utf8"), "hex");
}
if (key.length !== 32)
  throw new Error("DATA_KEY_HEX deve conter 64 caracteres hexadecimais.");
const port = Number(process.env.PORT ?? 3100),
  origin = process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const efi = await Efi.load();
if (mode === "homologation" && !origin.startsWith("https://"))
  throw new Error("PUBLIC_ORIGIN deve usar HTTPS na homologação.");
if (mode === "homologation" && !efi.accounts.length)
  throw new Error("Configure EFI_CONFIG_PATH.");
if (mode === "homologation") await db.verifyRuntimeSeparation();
const mfaKey = process.env.MFA_KEY_HEX
  ? Buffer.from(process.env.MFA_KEY_HEX, "hex")
  : key;
if (
  mfaKey.length !== 32 ||
  (mode === "homologation" && (!process.env.MFA_KEY_HEX || mfaKey.equals(key)))
)
  throw new Error(
    "Homologação exige MFA_KEY_HEX com 32 bytes, diferente de DATA_KEY_HEX.",
  );
await sealTotpSecrets(db, mfaKey);
const app = createApp(db, {
  mode: mode as "demo" | "homologation",
  key,
  mfaKey,
  efi,
  origin,
  communicationCallbackToken: process.env.COMMUNICATION_CALLBACK_TOKEN,
});
if (existsSync("dist/index.html")) {
  app.use(express.static(path.resolve("dist"), { maxAge: 0 }));
  app.get("/{*path}", (_r, s) => s.sendFile(path.resolve("dist/index.html")));
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.resolve("vite.config.ts"),
  });
  app.use(vite.middlewares);
}
const tlsReady =
  process.env.EFI_TLS_CERT_PATH &&
  process.env.EFI_TLS_KEY_PATH &&
  process.env.EFI_WEBHOOK_CA_PATH;
if (mode === "homologation" && !tlsReady)
  throw new Error("Homologação exige TLS e CA Efí para validar webhooks.");
const communicationTransport = (process.env.COMMUNICATION_TRANSPORT ??
  "disabled") as CommunicationTransport;
if (!["disabled", "demo", "webhook"].includes(communicationTransport))
  throw new Error(
    "COMMUNICATION_TRANSPORT deve ser disabled, demo ou webhook.",
  );
const communicationCallbackToken =
  process.env.COMMUNICATION_CALLBACK_TOKEN ?? "";
if (mode === "homologation" && communicationTransport === "webhook") {
  if (communicationCallbackToken.length < 16)
    throw new Error(
      "Homologação exige COMMUNICATION_CALLBACK_TOKEN com pelo menos 16 caracteres.",
    );
  if (
    communicationCallbackToken ===
    (process.env.COMMUNICATION_WEBHOOK_TOKEN ?? "")
  )
    throw new Error(
      "COMMUNICATION_CALLBACK_TOKEN deve ser diferente do token de saída.",
    );
  const webhookUrls = [
    process.env.COMMUNICATION_EMAIL_WEBHOOK,
    process.env.COMMUNICATION_SMS_WEBHOOK,
  ];
  if (webhookUrls.some((url) => !url || !url.startsWith("https://")))
    throw new Error("Homologação exige webhooks HTTPS para e-mail e SMS.");
}
const host = process.env.HOST ?? (process.env.RENDER ? "0.0.0.0" : "127.0.0.1");
const server = tlsReady
  ? https.createServer(
      {
        cert: readFileSync(process.env.EFI_TLS_CERT_PATH!),
        key: readFileSync(process.env.EFI_TLS_KEY_PATH!),
        ca: readFileSync(process.env.EFI_WEBHOOK_CA_PATH!),
        requestCert: true,
        rejectUnauthorized: false,
      },
      app,
    )
  : app.listen(port, host, () =>
      console.log(`EcclesiaOS · ${mode} · ${origin} · ${host}:${port}`),
    );
if (tlsReady)
  server.listen(port, host, () =>
    console.log(`EcclesiaOS · ${mode} · ${origin} · ${host}:${port}`),
  );
app.get("/health", async (_req, res) => {
  try {
    await db.transaction((q) => q("SELECT 1"));
    res.json({ ok: true, mode: mode });
  } catch {
    res.status(503).json({ ok: false });
  }
});
app.get("/ready", async (_req, res) => {
  const ready = Boolean(process.env.DATABASE_URL || mode === "demo") &&
    key.length === 32 && origin.startsWith("http");
  res.status(ready ? 200 : 503).json({ ok: ready, mode: mode });
});
let stopping = false;
const stopWorker =
  process.env.RUN_INTEGRATION_WORKER === "false"
    ? async () => {}
    : startIntegrationWorker(db, efi);
const stopWorkflow = startWorkflowWorker(db, key);
const stopCommunication = startCommunicationWorker(
  db,
  communicationTransport,
  {
    emailUrl: process.env.COMMUNICATION_EMAIL_WEBHOOK,
    smsUrl: process.env.COMMUNICATION_SMS_WEBHOOK,
    token: process.env.COMMUNICATION_WEBHOOK_TOKEN,
  },
  key,
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    server.close(async () => {
      await stopWorker();
      await stopWorkflow();
      await stopCommunication();
      await db.close();
      process.exit(0);
    });
  });
