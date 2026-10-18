const fs = require("node:fs");
const path = require("node:path");
const { loadEnvFile } = require("../backend/env");
const { dataFile, ensureDataFiles, getDataDir, writeJsonFile } = require("../backend/data-paths");
const { storeDataIssues, validateCatalog, validateConfig, validateFaqs } = require("../backend/data-validators");

loadEnvFile();
ensureDataFiles();

const profilePath = process.argv[2] || "";
const confirmed = process.argv.includes("--confirm");
const dryRun = process.argv.includes("--dry-run");

function usage() {
  console.log("Uso: node scripts/apply-store-profile.js caminho\\perfil.json --confirm");
  console.log("Validacao sem gravar: node scripts/apply-store-profile.js caminho\\perfil.json --dry-run");
  console.log("Exemplo: node scripts/apply-store-profile.js docs\\store-profile.example.json --confirm");
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildCurrentProfile() {
  return {
    generatedAt: new Date().toISOString(),
    config: readJsonFile(dataFile("store-config.json")),
    catalog: readJsonFile(dataFile("catalog.json")),
    faqs: readJsonFile(dataFile("faqs.json"))
  };
}

if (!profilePath || process.argv.includes("--help")) {
  usage();
  process.exit(profilePath ? 0 : 1);
}

if (!confirmed && !dryRun) {
  console.error("Use --confirm para aplicar o perfil da loja e sobrescrever configuracao, catalogo e FAQs.");
  process.exit(1);
}

const resolvedProfilePath = path.resolve(profilePath);
if (!fs.existsSync(resolvedProfilePath)) {
  console.error(`Perfil nao encontrado: ${resolvedProfilePath}`);
  process.exit(1);
}

const profile = readJsonFile(resolvedProfilePath);
validateConfig(profile.config);
validateCatalog(profile.catalog);
validateFaqs(profile.faqs || []);

const issues = storeDataIssues(profile.config, profile.catalog, profile.faqs || []);
if (issues.length > 0) {
  console.error(`Perfil ainda parece conter dados de exemplo: ${issues.join(" ")}`);
  process.exit(1);
}

if (dryRun) {
  console.log(`Perfil valido: ${resolvedProfilePath}`);
  console.log("Nenhum arquivo foi alterado porque --dry-run foi usado.");
  process.exit(0);
}

const backupDir = path.join(getDataDir(), "backups");
fs.mkdirSync(backupDir, { recursive: true });
const backupPath = path.join(backupDir, `pre-store-profile-${timestamp()}.json`);
writeJsonFile(backupPath, buildCurrentProfile());

writeJsonFile(dataFile("store-config.json"), profile.config);
writeJsonFile(dataFile("catalog.json"), profile.catalog);
writeJsonFile(dataFile("faqs.json"), profile.faqs || []);

console.log(`Perfil aplicado: ${resolvedProfilePath}`);
console.log(`Backup anterior: ${backupPath}`);
