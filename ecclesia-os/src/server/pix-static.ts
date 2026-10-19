import { createHash } from "node:crypto";

export type PixKeyType = "cpf" | "cnpj" | "email" | "phone" | "random";

const cleanText = (value: string, max: number) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, "")
    .toUpperCase()
    .slice(0, max);

const field = (id: string, value: string) =>
  id + String(value.length).padStart(2, "0") + value;

const crc16 = (value: string) => {
  let crc = 0xffff;
  for (const char of Buffer.from(value, "utf8")) {
    crc ^= char << 8;
    for (let i = 0; i < 8; i++)
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

export function validatePixKey(type: PixKeyType, value: string) {
  const key = value.trim();
  if (!key) return false;
  if (type === "cpf") return /^\d{11}$/.test(key.replace(/\D/g, ""));
  if (type === "cnpj") return /^\d{14}$/.test(key.replace(/\D/g, ""));
  if (type === "email") return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(key);
  if (type === "phone") return /^\+?\d{10,15}$/.test(key.replace(/[\s()-]/g, ""));
  return key.length <= 77;
}

export function buildPixPayload(input: {
  key: string;
  keyType: PixKeyType;
  merchantName: string;
  merchantCity: string;
  amount?: number;
  description?: string;
}) {
  if (!validatePixKey(input.keyType, input.key))
    throw new Error("A chave Pix não é válida para o tipo informado.");
  const merchantName = cleanText(input.merchantName, 25);
  const merchantCity = cleanText(input.merchantCity, 15);
  if (!merchantName || !merchantCity) throw new Error("Informe nome e cidade para o QR Code Pix.");
  const gui = field("00", "BR.GOV.BCB.PIX");
  const key = field("01", input.key.trim());
  const description = input.description?.trim()
    ? field("02", cleanText(input.description, 72))
    : "";
  const merchantAccount = field("26", gui + key + description);
  const amount = input.amount && input.amount > 0 ? field("54", input.amount.toFixed(2)) : "";
  const payload = [
    field("00", "01"),
    merchantAccount,
    field("52", "0000"),
    field("53", "986"),
    amount,
    field("58", "BR"),
    field("59", merchantName),
    field("60", merchantCity),
    field("62", field("05", "***")),
  ].join("");
  return payload + "6304" + crc16(payload + "6304");
}
