const fs = require("node:fs");
const path = require("node:path");
const { loadEnvFile } = require("../backend/env");
const { dataFile, ensureDataFiles, getDataDir, writeJsonFile } = require("../backend/data-paths");
const { validateBackup } = require("../backend/data-validators");

loadEnvFile();
ensureDataFiles();

const backupDir = path.join(getDataDir(), "backups");

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

const backup = {
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

validateBackup(backup);

fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `backup-${timestamp()}.json`);
writeJsonFile(backupPath, backup);

console.log(`Backup criado: ${backupPath}`);
