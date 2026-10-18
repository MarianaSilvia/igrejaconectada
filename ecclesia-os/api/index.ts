import { randomBytes } from "node:crypto";
import { openDatabase } from "../src/server/db.js";
import { seed } from "../src/server/seed.js";
import { createApp } from "../src/server/app.js";
import { Efi } from "../src/server/efi.js";

let appPromise: Promise<any> | undefined;

async function bootstrap() {
  const mode = process.env.APP_MODE ?? "demo";
  if (mode !== "demo" && mode !== "homologation") {
    throw new Error("APP_MODE deve ser demo ou homologation.");
  }

  const db = await openDatabase();
  if (!process.env.DATABASE_URL) {
    await db.migrate();
    if (mode === "demo") await seed(db);
  }

  const key = process.env.DATA_KEY_HEX
    ? Buffer.from(process.env.DATA_KEY_HEX, "hex")
    : randomBytes(32);
  const mfaKey = process.env.MFA_KEY_HEX
    ? Buffer.from(process.env.MFA_KEY_HEX, "hex")
    : key;

  if (key.length !== 32 || mfaKey.length !== 32) {
    throw new Error("DATA_KEY_HEX e MFA_KEY_HEX devem conter 32 bytes.");
  }

  const origin =
    process.env.PUBLIC_ORIGIN ?? "https://ecclesia-os.vercel.app";
  const efi = await Efi.load();

  return createApp(db, {
    mode: mode as "demo" | "homologation",
    key,
    mfaKey,
    efi,
    origin,
    communicationCallbackToken:
      process.env.COMMUNICATION_CALLBACK_TOKEN,
  });
}

export default async function handler(req: any, res: any) {
  appPromise ??= bootstrap();
  const app = await appPromise;
  return app(req, res);
}
