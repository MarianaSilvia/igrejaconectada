const fs = require("node:fs");
const path = require("node:path");

function parseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) {
    return null;
  }

  const separatorIndex = trimmed.indexOf("=");
  if (separatorIndex === -1) {
    return null;
  }

  const key = trimmed.slice(0, separatorIndex).trim();
  let value = trimmed.slice(separatorIndex + 1).trim();
  if (!key) {
    return null;
  }

  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

function loadEnvFile(filePath = path.resolve(__dirname, "..", ".env")) {
  if (!fs.existsSync(filePath)) {
    return { loaded: false, path: filePath, keys: [] };
  }

  const keys = [];
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const parsed = parseEnvLine(line);
    if (!parsed || process.env[parsed.key] !== undefined) {
      return;
    }
    process.env[parsed.key] = parsed.value;
    keys.push(parsed.key);
  });

  return { loaded: true, path: filePath, keys };
}

module.exports = {
  loadEnvFile,
  parseEnvLine
};
