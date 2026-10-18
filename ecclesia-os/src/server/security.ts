import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export const token = () => randomBytes(32).toString("base64url");
export function passwordHash(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}
export function passwordMatches(password: string, stored: string) {
  const [salt, key] = stored.split(":");
  if (!salt || !key) return false;
  const derived = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, "hex");
  return (
    expected.length === derived.length && timingSafeEqual(expected, derived)
  );
}
export function totp(secret: string, time = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of secret.toUpperCase())
    bits += alphabet.indexOf(c).toString(2).padStart(5, "0");
  const bytes = Buffer.from(
    (bits.match(/.{8}/g) || []).map((b) => parseInt(b, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest[19] & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1000000)
    .toString()
    .padStart(6, "0");
}
export function totpStep(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return null;
  for (const delta of [-30000, 0, 30000]) {
    const time = Date.now() + delta;
    if (timingSafeEqual(Buffer.from(totp(secret, time)), Buffer.from(code)))
      return Math.floor(time / 30000);
  }
  return null;
}
export function verifyTotp(secret: string, code: string) {
  return totpStep(secret, code) !== null;
}
export function encrypt(value: string, key: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString("base64");
}
export function decrypt(value: string, key: Buffer) {
  const b = Buffer.from(value, "base64");
  const decipher = createDecipheriv("aes-256-gcm", key, b.subarray(0, 12));
  decipher.setAuthTag(b.subarray(12, 28));
  return Buffer.concat([
    decipher.update(b.subarray(28)),
    decipher.final(),
  ]).toString("utf8");
}
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function requireThat(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new HttpError(status, message);
}
