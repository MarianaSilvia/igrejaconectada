const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const envPath = path.join(root, ".env");
const force = process.argv.includes("--force");

function secret(prefix) {
  return `${prefix}_${crypto.randomBytes(24).toString("base64url")}`;
}

function line(key, value) {
  return `${key}=${value}`;
}

if (fs.existsSync(envPath) && !force) {
  console.log(".env ja existe. Use `node scripts/setup-env.js --force` para recriar.");
  process.exit(0);
}

const values = [
  "# Configuracao local gerada automaticamente.",
  "# Preencha as variaveis WHATSAPP_* da Meta antes de usar WhatsApp real.",
  line("PORT", "3000"),
  line("PUBLIC_BASE_URL", ""),
  line("DATA_DIR", ""),
  line("ADMIN_TOKEN", secret("admin")),
  line("WHATSAPP_VERIFY_TOKEN", secret("verify")),
  line("WHATSAPP_APP_SECRET", ""),
  line("WHATSAPP_ACCESS_TOKEN", ""),
  line("WHATSAPP_PHONE_NUMBER_ID", ""),
  line("WHATSAPP_GRAPH_VERSION", "v20.0"),
  line("MESSAGE_RATE_LIMIT", "30"),
  line("MESSAGE_RATE_WINDOW_MS", "600000")
];

fs.writeFileSync(envPath, `${values.join("\n")}\n`);

const adminToken = values.find((item) => item.startsWith("ADMIN_TOKEN=")).split("=")[1];
console.log(".env criado com tokens locais fortes.");
console.log(`Painel local: http://localhost:3000/admin?token=${adminToken}`);
console.log("Antes do WhatsApp real, preencha WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID.");
