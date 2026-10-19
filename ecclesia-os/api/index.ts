import { openDatabase } from "../src/server/db.js";
import { createApp } from "../src/server/app.js";
import { Efi } from "../src/server/efi.js";

let appPromise: Promise<any> | undefined;

const required = (name: string) => {
  const value = process.env[name];
  if (!value) throw new Error(`Variável obrigatória ausente: ${name}`);
  return value;
};

async function bootstrap() {
  const mode = process.env.APP_MODE ?? "demo";
  if (mode !== "homologation") {
    throw new Error(
      "O endpoint hospedado exige APP_MODE=homologation; o modo demo é somente local.",
    );
  }

  const databaseUrl = process.env.ECCLESIA_DATABASE_URL ?? process.env.DATABASE_URL;
  const serviceDatabaseUrl =
    process.env.ECCLESIA_SERVICE_DATABASE_URL ?? process.env.SERVICE_DATABASE_URL;
  required("ECCLESIA_DATABASE_URL");
  required("ECCLESIA_SERVICE_DATABASE_URL");
  required("MIGRATION_DATABASE_URL");
  required("DATA_KEY_HEX");
  required("MFA_KEY_HEX");
  const origin = required("PUBLIC_ORIGIN");
  if (!origin.startsWith("https://"))
    throw new Error("PUBLIC_ORIGIN deve usar HTTPS na homologação.");
  if (!databaseUrl || !serviceDatabaseUrl || databaseUrl === serviceDatabaseUrl)
    throw new Error("As credenciais de aplicação e serviço devem ser distintas.");

  const key = Buffer.from(required("DATA_KEY_HEX"), "hex");
  const mfaKey = Buffer.from(required("MFA_KEY_HEX"), "hex");
  if (key.length !== 32 || mfaKey.length !== 32 || key.equals(mfaKey))
    throw new Error("DATA_KEY_HEX e MFA_KEY_HEX devem ser chaves distintas de 32 bytes.");

  const db = await openDatabase();
  await db.verifyRuntimeSeparation();
  const efi = await Efi.load();
  return createApp(db, {
    mode: "homologation",
    key,
    mfaKey,
    efi,
    origin,
    communicationCallbackToken: process.env.COMMUNICATION_CALLBACK_TOKEN,
  });
}

export default async function handler(req: any, res: any) {
  appPromise ??= bootstrap();
  const app = await appPromise;
  return app(req, res);
}
