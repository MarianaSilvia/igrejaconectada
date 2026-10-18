const fs = require("node:fs");
const path = require("node:path");
const { loadEnvFile } = require("../backend/env");
const { dataFile, ensureDataFiles, getDataDir, writeJsonFile } = require("../backend/data-paths");
const { validateBackup } = require("../backend/data-validators");

const root = path.resolve(__dirname, "..");
const confirmRestore = process.argv.includes("--confirm");
const inputArg = process.argv.slice(2).find((arg) => arg !== "--confirm") || "";
const inputPath = inputArg ? path.resolve(inputArg) : "";

loadEnvFile();
ensureDataFiles();

function writeJson(relativePath, value) {
  const name = path.basename(relativePath);
  writeJsonFile(dataFile(name), value);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function readCurrentBackup() {
  return {
    generatedAt: new Date().toISOString(),
    config: JSON.parse(fs.readFileSync(dataFile("store-config.json"), "utf8")),
    catalog: JSON.parse(fs.readFileSync(dataFile("catalog.json"), "utf8")),
    faqs: JSON.parse(fs.readFileSync(dataFile("faqs.json"), "utf8")),
    orders: JSON.parse(fs.readFileSync(dataFile("orders.json"), "utf8")),
    sessions: JSON.parse(fs.readFileSync(dataFile("sessions.json"), "utf8")),
    conversations: JSON.parse(fs.readFileSync(dataFile("conversations.json"), "utf8")),
    events: JSON.parse(fs.readFileSync(dataFile("events.json"), "utf8")),
    handoffs: JSON.parse(fs.readFileSync(dataFile("handoffs.json"), "utf8")),
    outbox: JSON.parse(fs.readFileSync(dataFile("outbox.json"), "utf8")),
    rateLimits: JSON.parse(fs.readFileSync(dataFile("rate-limits.json"), "utf8")),
    processedWebhooks: JSON.parse(fs.readFileSync(dataFile("processed-webhooks.json"), "utf8"))
  };
}

function writePreRestoreBackup() {
  const currentBackup = readCurrentBackup();
  const backupDir = path.join(getDataDir(), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `pre-restore-${timestamp()}.json`);
  writeJsonFile(backupPath, currentBackup);
  return backupPath;
}

if (!inputPath) {
  console.error("Uso: node scripts/restore-data.js caminho\\para\\backup.json --confirm");
  process.exit(1);
}

if (!confirmRestore) {
  console.error("Restauracao bloqueada: adicione --confirm para sobrescrever os dados atuais.");
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`Backup nao encontrado: ${inputPath}`);
  process.exit(1);
}

const backup = JSON.parse(fs.readFileSync(inputPath, "utf8"));
validateBackup(backup);
const preRestoreBackup = writePreRestoreBackup();

writeJson("data/store-config.json", backup.config);
writeJson("data/catalog.json", backup.catalog);
writeJson("data/faqs.json", backup.faqs || []);
writeJson("data/orders.json", backup.orders);
writeJson("data/sessions.json", backup.sessions);
writeJson("data/conversations.json", backup.conversations);
writeJson("data/events.json", backup.events);
writeJson("data/handoffs.json", backup.handoffs || []);
writeJson("data/outbox.json", backup.outbox || []);
writeJson("data/rate-limits.json", backup.rateLimits || {});
writeJson("data/processed-webhooks.json", backup.processedWebhooks || {});

console.log(`Backup restaurado: ${inputPath}`);
console.log(`Backup anterior salvo em: ${preRestoreBackup}`);
