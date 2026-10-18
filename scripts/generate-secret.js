const crypto = require("node:crypto");

const label = process.argv[2] || "secret";
const safeLabel = label
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 24) || "secret";

console.log(`${safeLabel}_${crypto.randomBytes(32).toString("base64url")}`);
