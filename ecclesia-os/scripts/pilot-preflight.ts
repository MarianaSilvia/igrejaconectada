import "../src/server/env.js";
import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const requestedMode = process.env.APP_MODE ?? "demo";
const validationMode = process.argv.includes("--homologation")
  ? "homologation"
  : requestedMode;
const mode = validationMode;
const dataKey = process.env.DATA_KEY_HEX ?? "";
const mfaKey = process.env.MFA_KEY_HEX ?? "";
const communication = process.env.COMMUNICATION_TRANSPORT ?? "disabled";
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const migrationFiles = await readdir(path.join(projectRoot, "migrations"));
const migrationNumbers = migrationFiles
  .map((file) => Number(file.match(/^(\d+)_/)?.[1] ?? 0))
  .filter(Number.isFinite);
const latestMigration = Math.max(0, ...migrationNumbers);
let efiConfigValid = mode === "demo";
if (mode === "homologation") {
  try {
    const configPath = process.env.EFI_CONFIG_PATH ?? "";
    const raw = JSON.parse(await readFile(configPath, "utf8")) as unknown;
    if (!Array.isArray(raw) || raw.length === 0) throw new Error("empty");
    for (const account of raw) {
      if (!account || typeof account !== "object") throw new Error("account");
      const value = account as Record<string, unknown>;
      for (const key of [
        "churchId",
        "accountId",
        "clientId",
        "clientSecret",
        "pixKey",
        "certificatePath",
      ]) {
        if (typeof value[key] !== "string" || !value[key]) throw new Error(key);
      }
      await access(String(value.certificatePath));
    }
    efiConfigValid = true;
  } catch {
    efiConfigValid = false;
  }
}
const checks = {
  mode: ["demo", "homologation"].includes(mode),
  database: mode === "demo" || Boolean(process.env.DATABASE_URL),
  serviceDatabase: mode === "demo" || Boolean(process.env.SERVICE_DATABASE_URL),
  migrationDatabase:
    mode === "demo" || Boolean(process.env.MIGRATION_DATABASE_URL),
  distinctDatabaseRoles:
    mode === "demo" ||
    Boolean(
      process.env.DATABASE_URL &&
      process.env.SERVICE_DATABASE_URL &&
      process.env.MIGRATION_DATABASE_URL &&
      new Set([
        process.env.DATABASE_URL,
        process.env.SERVICE_DATABASE_URL,
        process.env.MIGRATION_DATABASE_URL,
      ]).size === 3,
    ),
  publicHttps:
    mode === "demo" || (process.env.PUBLIC_ORIGIN ?? "").startsWith("https://"),
  dataKey: mode === "demo" ? true : /^[0-9a-f]{64}$/i.test(dataKey),
  mfaKey: mode === "demo" ? true : /^[0-9a-f]{64}$/i.test(mfaKey),
  distinctEncryptionKeys:
    mode === "demo" ||
    (dataKey.length > 0 && mfaKey.length > 0 && dataKey !== mfaKey),
  efi: mode === "demo" || Boolean(process.env.EFI_CONFIG_PATH),
  efiConfigValid,
  communicationCallback:
    communication !== "webhook" ||
    (process.env.COMMUNICATION_CALLBACK_TOKEN ?? "").length >= 16,
  communicationEndpoints:
    communication !== "webhook" ||
    [
      process.env.COMMUNICATION_EMAIL_WEBHOOK,
      process.env.COMMUNICATION_SMS_WEBHOOK,
    ].every((url) => Boolean(url) && url!.startsWith("https://")),
  communicationTokenSeparation:
    communication !== "webhook" ||
    ((process.env.COMMUNICATION_WEBHOOK_TOKEN ?? "").length >= 16 &&
      process.env.COMMUNICATION_WEBHOOK_TOKEN !==
        process.env.COMMUNICATION_CALLBACK_TOKEN),
  communicationHttps:
    communication !== "webhook" ||
    [
      process.env.COMMUNICATION_EMAIL_WEBHOOK,
      process.env.COMMUNICATION_SMS_WEBHOOK,
    ]
      .filter(Boolean)
      .every((url) => url!.startsWith("https://")),
  migrations: latestMigration >= 63,
};
const ok = Object.values(checks).every(Boolean);
console.log(JSON.stringify({ ok, mode, latestMigration, checks }, null, 2));
if (!ok) process.exitCode = 1;
