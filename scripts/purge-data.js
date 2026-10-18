const fs = require("node:fs");
const path = require("node:path");
const { loadEnvFile } = require("../backend/env");
const { dataFile, ensureDataFiles, getDataDir, writeJsonFile } = require("../backend/data-paths");
const { validateBackup } = require("../backend/data-validators");

loadEnvFile();
ensureDataFiles();

const args = process.argv.slice(2);
const daysArgIndex = args.indexOf("--days");
const days = daysArgIndex >= 0 ? Number(args[daysArgIndex + 1]) : 180;
const dryRun = args.includes("--dry-run");
const confirmed = args.includes("--confirm");

function usage() {
  console.log("Uso: node scripts/purge-data.js --days 180 --dry-run");
  console.log("Aplicar: node scripts/purge-data.js --days 180 --confirm");
}

function readJson(name) {
  return JSON.parse(fs.readFileSync(dataFile(name), "utf8"));
}

function writeJson(name, value) {
  writeJsonFile(dataFile(name), value);
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function toTime(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Date.parse(value || "");
  return Number.isFinite(parsed) ? parsed : null;
}

function lastConversationTime(messages) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return null;
  }
  return messages.reduce((latest, message) => {
    const time = toTime(message.createdAt);
    return time && time > latest ? time : latest;
  }, 0) || null;
}

function buildBackup() {
  const backup = {
    generatedAt: new Date().toISOString(),
    config: readJson("store-config.json"),
    catalog: readJson("catalog.json"),
    faqs: readJson("faqs.json"),
    orders: readJson("orders.json"),
    sessions: readJson("sessions.json"),
    conversations: readJson("conversations.json"),
    events: readJson("events.json"),
    handoffs: readJson("handoffs.json"),
    outbox: readJson("outbox.json"),
    rateLimits: readJson("rate-limits.json"),
    processedWebhooks: readJson("processed-webhooks.json")
  };
  validateBackup(backup);
  return backup;
}

function writeBackupSnapshot(backup) {
  const backupDir = path.join(getDataDir(), "backups");
  fs.mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `pre-purge-${timestamp()}.json`);
  writeJsonFile(backupPath, backup);
  return backupPath;
}

if (args.includes("--help")) {
  usage();
  process.exit(0);
}

if (!Number.isInteger(days) || days <= 0) {
  console.error("--days precisa ser um inteiro positivo.");
  process.exit(1);
}

if (!dryRun && !confirmed) {
  console.error("Use --dry-run para simular ou --confirm para aplicar a limpeza.");
  process.exit(1);
}

const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
const backup = buildBackup();
const removedSessionIds = new Set();

const conversations = {};
for (const [sessionId, messages] of Object.entries(backup.conversations)) {
  const lastTime = lastConversationTime(messages);
  if (lastTime && lastTime < cutoff) {
    removedSessionIds.add(sessionId);
    continue;
  }
  conversations[sessionId] = messages;
}

const sessions = { ...backup.sessions };
for (const sessionId of removedSessionIds) {
  delete sessions[sessionId];
}

const rateLimits = { ...backup.rateLimits };
for (const sessionId of removedSessionIds) {
  delete rateLimits[sessionId];
}
for (const [sessionId, value] of Object.entries(rateLimits)) {
  const windowStart = toTime(value?.windowStart);
  if (windowStart && windowStart < cutoff) {
    delete rateLimits[sessionId];
  }
}

const events = backup.events.filter((event) => {
  const time = toTime(event.createdAt);
  return !time || time >= cutoff;
});

const handoffs = backup.handoffs.filter((handoff) => {
  if (!["resolved", "cancelled"].includes(handoff.status)) {
    return true;
  }
  const time = toTime(handoff.updatedAt || handoff.createdAt);
  return !time || time >= cutoff;
});

const outbox = backup.outbox.filter((item) => {
  const time = toTime(item.updatedAt || item.createdAt);
  return !time || time >= cutoff;
});

const processedWebhooks = {};
for (const [messageId, record] of Object.entries(backup.processedWebhooks)) {
  const time = toTime(record?.processedAt);
  if (!time || time >= cutoff) {
    processedWebhooks[messageId] = record;
  }
}

const result = {
  dryRun,
  days,
  cutoff: new Date(cutoff).toISOString(),
  removed: {
    conversations: Object.keys(backup.conversations).length - Object.keys(conversations).length,
    sessions: Object.keys(backup.sessions).length - Object.keys(sessions).length,
    events: backup.events.length - events.length,
    handoffs: backup.handoffs.length - handoffs.length,
    outbox: backup.outbox.length - outbox.length,
    rateLimits: Object.keys(backup.rateLimits).length - Object.keys(rateLimits).length,
    processedWebhooks: Object.keys(backup.processedWebhooks).length - Object.keys(processedWebhooks).length
  }
};

if (dryRun) {
  console.log(JSON.stringify(result, null, 2));
  process.exit(0);
}

const backupPath = writeBackupSnapshot(backup);
writeJson("conversations.json", conversations);
writeJson("sessions.json", sessions);
writeJson("events.json", events);
writeJson("handoffs.json", handoffs);
writeJson("outbox.json", outbox);
writeJson("rate-limits.json", rateLimits);
writeJson("processed-webhooks.json", processedWebhooks);

console.log(JSON.stringify({ ...result, backupPath }, null, 2));
