import { existsSync, readFileSync } from "node:fs";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { randomBytes } from "node:crypto";
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
const mode = process.env.APP_MODE ?? (process.env.VERCEL ? "homologation" : "demo");
if (!["demo", "homologation"].includes(mode))
  throw new Error(
    "Esta versão habilita demo e homologação. Produção exige concluir o checklist de lançamento em docs/OPERACAO.md.",
  );
if (
  mode === "homologation" &&
  (!(process.env.ECCLESIA_DATABASE_URL ?? process.env.DATABASE_URL) ||
    !process.env.MIGRATION_DATABASE_URL)
)
  throw new Error(
    "Homologação exige ECCLESIA_DATABASE_URL e MIGRATION_DATABASE_URL.",
  );
if (
  mode === "homologation" &&
  (!(process.env.ECCLESIA_SERVICE_DATABASE_URL ?? process.env.SERVICE_DATABASE_URL) ||
    (process.env.ECCLESIA_SERVICE_DATABASE_URL ?? process.env.SERVICE_DATABASE_URL) === (process.env.ECCLESIA_DATABASE_URL ?? process.env.DATABASE_URL))
)
  throw new Error(
    "Homologação exige credenciais distintas para DATABASE_URL (ecclesia_app) e SERVICE_DATABASE_URL (ecclesia_service).",
  );
const db = await openDatabase();
if (!(process.env.ECCLESIA_DATABASE_URL ?? process.env.DATABASE_URL)) await db.migrate();
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
const port = Number(process.env.PORT ?? 3000),
  origin = process.env.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const efi = new Efi([]);
if (mode === "homologation" && !origin.startsWith("https://"))
  throw new Error("PUBLIC_ORIGIN deve usar HTTPS na homologação.");
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
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.resolve("dist/index.html"));
    }
    next();
  });
} else {
  const { createServer } = await import("vite");
  const vite = await createServer({
    configFile: path.resolve("vite.config.ts"),
    server: { middlewareMode: true },
  });
  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api")) return next();
    try {
      const htmlPath = path.resolve("src/web/index.html");
      const template = await readFile(htmlPath, "utf-8");
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(html);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}
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
const server = app.listen(port, "0.0.0.0", () =>
  console.log(`EcclesiaOS · ${mode} · ${origin}`),
);
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
