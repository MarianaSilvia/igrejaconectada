import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = path.join(projectRoot, ".env");
if (existsSync(envPath)) process.loadEnvFile(envPath);
