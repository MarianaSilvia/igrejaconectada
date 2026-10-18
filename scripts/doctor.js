const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { storeDataIssues, validateCatalog, validateConfig, validateFaqs } = require("../backend/data-validators");

const root = path.resolve(__dirname, "..");
const offline = process.argv.includes("--offline");
const requiredJsonFiles = [
  "data/catalog.json",
  "data/faqs.json",
  "data/store-config.json",
  "data/orders.json",
  "data/sessions.json",
  "data/conversations.json",
  "data/events.json",
  "data/handoffs.json",
  "data/rate-limits.json",
  "data/outbox.json",
  "data/processed-webhooks.json"
];
const requiredEnvKeys = [
  "PORT",
  "PUBLIC_BASE_URL",
  "DATA_DIR",
  "ADMIN_TOKEN",
  "WHATSAPP_VERIFY_TOKEN",
  "WHATSAPP_APP_SECRET",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_PHONE_NUMBER_ID",
  "WHATSAPP_GRAPH_VERSION",
  "MESSAGE_RATE_LIMIT",
  "MESSAGE_RATE_WINDOW_MS"
];
const expectedOpenApiPaths = [
  "/health",
  "/ready",
  "/chat",
  "/webhooks/whatsapp",
  "/catalog",
  "/faqs",
  "/config",
  "/store-profile.json",
  "/store-profile/validate",
  "/store-profile/apply",
  "/conversations",
  "/conversations.json",
  "/conversations/export",
  "/conversations/clear",
  "/events",
  "/events.csv",
  "/events/clear",
  "/orders",
  "/orders.csv",
  "/orders/status",
  "/orders/clear",
  "/handoffs",
  "/handoffs.csv",
  "/handoffs/status",
  "/messages/send",
  "/outbox",
  "/outbox.csv",
  "/outbox/clear",
  "/outbox/retry",
  "/rate-limits/clear",
  "/processed-webhooks/clear",
  "/backup.json",
  "/backup/restore",
  "/sessions/reset",
  "/privacy/delete-session"
];

const checks = [];

function addCheck(label, ok, detail = "") {
  checks.push({ label, ok, detail });
}

function readJson(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo ausente: ${relativePath}`);
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: options.env || process.env
  });
  return {
    ok: result.status === 0,
    status: result.status,
    output: `${result.stdout || ""}${result.stderr || ""}`.trim()
  };
}

function readEnvKeys(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo ausente: ${relativePath}`);
  }

  return new Set(
    fs.readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .map((line) => line.split("=")[0])
      .filter(Boolean)
  );
}

function readText(relativePath) {
  const filePath = path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo ausente: ${relativePath}`);
  }
  return fs.readFileSync(filePath, "utf8");
}

function listFilesRecursive(directory) {
  if (!fs.existsSync(directory)) {
    return [];
  }
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? listFilesRecursive(entryPath) : [entryPath];
  });
}

function checkOfflineBackupRestore() {
  const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-doctor-"));
  try {
    const sourceDataDir = path.join(root, "data");
    for (const file of fs.readdirSync(sourceDataDir)) {
      if (file.endsWith(".json")) {
        fs.copyFileSync(path.join(sourceDataDir, file), path.join(tempDataDir, file));
      }
    }

    const env = { ...process.env, DATA_DIR: tempDataDir };
    const backup = run(process.execPath, ["scripts/backup-data.js"], { env });
    if (!backup.ok) {
      return { ok: false, detail: backup.output };
    }

    const backupDir = path.join(tempDataDir, "backups");
    const backupFile = fs.readdirSync(backupDir)
      .filter((file) => file.startsWith("backup-") && file.endsWith(".json"))
      .map((file) => path.join(backupDir, file))[0];
    if (!backupFile) {
      return { ok: false, detail: "Backup nao foi criado" };
    }

    const withoutConfirm = run(process.execPath, ["scripts/restore-data.js", backupFile], { env });
    if (withoutConfirm.status !== 1 || !withoutConfirm.output.includes("--confirm")) {
      return { ok: false, detail: "Restore sem --confirm nao foi bloqueado corretamente" };
    }

    const withConfirm = run(process.execPath, ["scripts/restore-data.js", backupFile, "--confirm"], { env });
    if (!withConfirm.ok) {
      return { ok: false, detail: withConfirm.output };
    }

    const preRestoreFile = fs.readdirSync(backupDir)
      .find((file) => file.startsWith("pre-restore-") && file.endsWith(".json"));
    if (!preRestoreFile) {
      return { ok: false, detail: "Snapshot pre-restore nao foi criado" };
    }

    const temporaryFiles = listFilesRecursive(tempDataDir).filter((file) => file.endsWith(".tmp"));
    if (temporaryFiles.length > 0) {
      return { ok: false, detail: `${temporaryFiles.length} arquivo(s) .tmp sobrando` };
    }

    return { ok: true, detail: "backup, bloqueio sem --confirm e restore com snapshot validados" };
  } finally {
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
}

for (const file of requiredJsonFiles) {
  try {
    readJson(file);
    addCheck(`JSON valido: ${file}`, true);
  } catch (error) {
    addCheck(`JSON valido: ${file}`, false, error.message);
  }
}

try {
  const openApi = readJson("docs/openapi.json");
  addCheck("OpenAPI valido: docs/openapi.json", true);
  const openApiPaths = openApi.paths || {};
  const missingPaths = expectedOpenApiPaths.filter((pathname) => !openApiPaths[pathname]);
  addCheck("OpenAPI cobre rotas principais", missingPaths.length === 0, missingPaths.join(", "));
  const restoreSchema = openApiPaths["/backup/restore"]?.post;
  addCheck(
    "OpenAPI documenta restore com snapshot",
    Boolean(
      restoreSchema?.requestBody
        && restoreSchema.requestBody.content?.["application/json"]?.schema?.required?.includes("confirmRestore")
        && restoreSchema.responses?.["200"]?.content?.["application/json"]?.schema?.properties?.preRestoreBackup
        && restoreSchema.responses?.["413"]
    )
  );
  addCheck(
    "OpenAPI documenta limite de payload",
    Boolean(
      openApiPaths["/chat"]?.post?.responses?.["413"]
        && openApiPaths["/webhooks/whatsapp"]?.post?.responses?.["413"]
        && restoreSchema?.responses?.["413"]
    )
  );
} catch (error) {
  addCheck("OpenAPI valido: docs/openapi.json", false, error.message);
  addCheck("OpenAPI cobre rotas principais", false, error.message);
  addCheck("OpenAPI documenta restore com snapshot", false, error.message);
  addCheck("OpenAPI documenta limite de payload", false, error.message);
}

try {
  const envKeys = readEnvKeys(".env.example");
  const missingKeys = requiredEnvKeys.filter((key) => !envKeys.has(key));
  addCheck(".env.example tem variaveis esperadas", missingKeys.length === 0, missingKeys.join(", "));
} catch (error) {
  addCheck(".env.example tem variaveis esperadas", false, error.message);
}

try {
  const productionEnvKeys = readEnvKeys(".env.production.example");
  const missingKeys = requiredEnvKeys.filter((key) => !productionEnvKeys.has(key));
  addCheck(".env.production.example tem variaveis esperadas", missingKeys.length === 0, missingKeys.join(", "));
} catch (error) {
  addCheck(".env.production.example tem variaveis esperadas", false, error.message);
}

try {
  const catalog = readJson("data/catalog.json");
  validateCatalog(catalog);
  addCheck("Catalogo valido", true);
  addCheck("Catalogo tem produto ativo", catalog.some((item) => item.available !== false), `${catalog.length} itens`);
} catch (error) {
  addCheck("Catalogo valido", false, error.message);
}

try {
  const config = readJson("data/store-config.json");
  validateConfig(config);
  addCheck("Configuracao valida", true);
  addCheck("Configuracao tem mensagem inicial", Boolean(config.openingMessage), "openingMessage");
  addCheck("Configuracao tem nome da loja", Boolean(config.storeName), "storeName");
} catch (error) {
  addCheck("Configuracao valida", false, error.message);
}

try {
  const faqs = readJson("data/faqs.json");
  validateFaqs(faqs);
  addCheck("FAQs validas", true);
  addCheck("FAQs ativas", faqs.some((item) => item.active !== false), `${faqs.length} itens`);
} catch (error) {
  addCheck("FAQs validas", false, error.message);
}

try {
  const config = readJson("data/store-config.json");
  const catalog = readJson("data/catalog.json");
  const faqs = readJson("data/faqs.json");
  const issues = storeDataIssues(config, catalog, faqs);
  addCheck(
    "Dados reais da loja",
    true,
    issues.length === 0 ? "catalogo, FAQs e configuracao parecem personalizados" : `pendente para producao: ${issues.join(" ")}`
  );
} catch (error) {
  addCheck("Dados reais da loja", false, error.message);
}

try {
  const dockerfile = readText("Dockerfile");
  addCheck("Dockerfile define DATA_DIR persistente", /ENV\s+DATA_DIR=\/data/.test(dockerfile));
  addCheck("Dockerfile declara volume de dados", /VOLUME\s+\["\/data"\]/.test(dockerfile));
  addCheck("Dockerfile tem healthcheck HTTP", /HEALTHCHECK[\s\S]+\/health/.test(dockerfile));
} catch (error) {
  addCheck("Dockerfile valido", false, error.message);
}

try {
  const dockerignore = readText(".dockerignore");
  const dockerignoreEntries = dockerignore.split(/\r?\n/);
  addCheck(".dockerignore exclui backups locais", dockerignoreEntries.includes("backups"));
  addCheck(".dockerignore exclui relatorios locais", dockerignoreEntries.includes("reports"));
} catch (error) {
  addCheck(".dockerignore valido", false, error.message);
}

try {
  const restoreScript = readText("scripts/restore-data.js");
  const operationDocs = readText("docs/operacao.md");
  addCheck("Restore offline exige confirmacao", restoreScript.includes("--confirm") && operationDocs.includes("restore-data.js backups\\backup-arquivo.json --confirm"));
} catch (error) {
  addCheck("Restore offline exige confirmacao", false, error.message);
}

try {
  const dataPaths = readText("backend/data-paths.js");
  const server = readText("backend/server.js");
  const backupScript = readText("scripts/backup-data.js");
  const restoreScript = readText("scripts/restore-data.js");
  addCheck(
    "Escrita JSON operacional atomica",
    dataPaths.includes("function writeJsonFile")
      && dataPaths.includes("fs.renameSync")
      && server.includes("writeJsonFile")
      && backupScript.includes("writeJsonFile")
      && restoreScript.includes("writeJsonFile")
  );
} catch (error) {
  addCheck("Escrita JSON operacional atomica", false, error.message);
}

try {
  const staleTemporaryFiles = listFilesRecursive(path.join(root, "data"))
    .filter((file) => file.endsWith(".tmp"));
  addCheck(
    "Sem temporarios JSON orfaos",
    staleTemporaryFiles.length === 0,
    staleTemporaryFiles.map((file) => path.relative(root, file)).join(", ")
  );
} catch (error) {
  addCheck("Sem temporarios JSON orfaos", false, error.message);
}

try {
  const result = checkOfflineBackupRestore();
  addCheck("Backup/restore offline funcional", result.ok, result.detail);
} catch (error) {
  addCheck("Backup/restore offline funcional", false, error.message);
}

try {
  const result = run(process.execPath, ["scripts/apply-store-profile.js", "docs/store-profile.example.json", "--dry-run"]);
  addCheck("Perfil de loja exemplo valido", result.ok, result.output);
} catch (error) {
  addCheck("Perfil de loja exemplo valido", false, error.message);
}

try {
  const result = run(process.execPath, ["scripts/purge-data.js", "--days", "180", "--dry-run"]);
  addCheck("Retencao de dados simula limpeza", result.ok, result.output);
} catch (error) {
  addCheck("Retencao de dados simula limpeza", false, error.message);
}

const syntaxFiles = [
  "backend/server.js",
  "backend/env.js",
  "backend/data-paths.js",
  "backend/data-validators.js",
  "backend/bot-engine.js",
  "backend/whatsapp-adapter.js",
  "backend/self-test.js",
  "backend/integration-test.js",
  "scripts/setup-env.js",
  "scripts/generate-secret.js",
  "scripts/apply-store-profile.js",
  "scripts/purge-data.js",
  "scripts/verify-whatsapp.js",
  "scripts/send-whatsapp-test.js",
  "scripts/production-check.js",
  "scripts/backup-data.js",
  "scripts/restore-data.js",
  "scripts/offline-smoke.js",
  "admin/script.js",
  "prototype/script.js",
  "scripts/doctor.js"
];

for (const file of syntaxFiles) {
  const result = run(process.execPath, ["--check", file]);
  addCheck(`Sintaxe JS: ${file}`, result.ok, result.output);
}

const selfTest = run(process.execPath, ["backend/self-test.js"]);
addCheck("Self-test", selfTest.ok, selfTest.output);

const offlineSmoke = run(process.execPath, ["scripts/offline-smoke.js"]);
addCheck("Offline smoke", offlineSmoke.ok, offlineSmoke.output);

if (offline) {
  addCheck("Integration-test", true, "Pulado por --offline");
} else {
  const integrationTest = run(process.execPath, ["backend/integration-test.js"]);
  addCheck("Integration-test", integrationTest.ok, integrationTest.output);
}

const failed = checks.filter((check) => !check.ok);
for (const check of checks) {
  const icon = check.ok ? "OK" : "FAIL";
  console.log(`${icon} - ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failed.length > 0) {
  console.error(`\n${failed.length} verificacao(oes) falharam.`);
  process.exitCode = 1;
} else {
  console.log("\nDoctor passou. Projeto saudavel.");
}
