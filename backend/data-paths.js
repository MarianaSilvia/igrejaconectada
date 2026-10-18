const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const bundledDataDir = path.join(root, "data");

const fallbackContent = {
  "catalog.json": [],
  "faqs.json": [],
  "store-config.json": {},
  "orders.json": [],
  "sessions.json": {},
  "conversations.json": {},
  "events.json": [],
  "handoffs.json": [],
  "rate-limits.json": {},
  "outbox.json": [],
  "processed-webhooks.json": {}
};

function getDataDir() {
  return process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : bundledDataDir;
}

function dataFile(name) {
  return path.join(getDataDir(), name);
}

function writeJsonFile(filePath, value) {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true });
  const temporaryPath = path.join(directory, `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`);
    try {
      fs.renameSync(temporaryPath, filePath);
    } catch (error) {
      if (error.code !== "EPERM") {
        throw error;
      }
      fs.copyFileSync(temporaryPath, filePath);
      fs.unlinkSync(temporaryPath);
    }
  } catch (error) {
    if (fs.existsSync(temporaryPath)) {
      fs.unlinkSync(temporaryPath);
    }
    throw error;
  }
}

function ensureDataFiles(files = Object.keys(fallbackContent)) {
  const targetDir = getDataDir();
  fs.mkdirSync(targetDir, { recursive: true });

  for (const file of files) {
    const target = path.join(targetDir, file);
    if (fs.existsSync(target)) {
      continue;
    }

    const bundled = path.join(bundledDataDir, file);
    if (fs.existsSync(bundled)) {
      fs.copyFileSync(bundled, target);
      continue;
    }

    writeJsonFile(target, fallbackContent[file] ?? {});
  }
}

module.exports = {
  dataFile,
  ensureDataFiles,
  getDataDir,
  writeJsonFile
};
