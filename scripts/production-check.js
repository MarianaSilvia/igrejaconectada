const fs = require("node:fs");
const path = require("node:path");
const { loadEnvFile } = require("../backend/env");
const { dataFile, ensureDataFiles } = require("../backend/data-paths");
const { storeDataIssues, validateBackup, validateCatalog, validateConfig, validateFaqs } = require("../backend/data-validators");

loadEnvFile();
ensureDataFiles();

const root = path.resolve(__dirname, "..");
const args = new Set(process.argv.slice(2));
const production = args.has("--production");
const offline = args.has("--offline");
const jsonOutput = args.has("--json");
const reportArgIndex = process.argv.indexOf("--report");
const reportPath = reportArgIndex >= 0 ? process.argv[reportArgIndex + 1] : "";
const baseUrlArgIndex = process.argv.indexOf("--url");
const baseUrl = baseUrlArgIndex >= 0 ? process.argv[baseUrlArgIndex + 1] : process.env.PUBLIC_BASE_URL || "";
const checks = [];

function addCheck(status, label, detail = "") {
  checks.push({ status, label, detail });
}

function readJson(relativePath, fallback) {
  const filePath = relativePath.startsWith("data/")
    ? dataFile(path.basename(relativePath))
    : path.join(root, relativePath);
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasRealValue(name, placeholders = []) {
  const value = process.env[name] || "";
  return Boolean(value.trim()) && !placeholders.some((placeholder) => value.includes(placeholder));
}

function strongSecretEnv(name, placeholders = []) {
  const value = process.env[name] || "";
  if (!hasRealValue(name, placeholders)) {
    return { ok: false, detail: "Nao definido ou placeholder" };
  }
  if (value.trim().length < 32) {
    return { ok: false, detail: "Use pelo menos 32 caracteres" };
  }
  return { ok: true, detail: `${value.trim().length} caracteres` };
}

function positiveIntegerEnv(name) {
  const value = process.env[name] || "";
  if (!value.trim()) {
    return { ok: false, detail: "Nao definido" };
  }

  const number = Number(value);
  if (!Number.isInteger(number) || number <= 0) {
    return { ok: false, detail: `${value} nao e um inteiro positivo` };
  }

  return { ok: true, detail: value };
}

function graphVersionEnv() {
  const value = process.env.WHATSAPP_GRAPH_VERSION || "";
  if (!value.trim()) {
    return { ok: false, detail: "Nao definido" };
  }
  if (!/^v\d+\.\d+$/.test(value.trim())) {
    return { ok: false, detail: `${value} nao segue o formato v20.0` };
  }
  return { ok: true, detail: value };
}

function checkEnv() {
  const adminToken = strongSecretEnv("ADMIN_TOKEN", ["troque", "um-token", "gere-um-token"]);
  const verifyToken = strongSecretEnv("WHATSAPP_VERIFY_TOKEN", ["troque", "token-de-verificacao", "gere-um-token"]);
  addCheck(adminToken.ok ? "ok" : production ? "fail" : "warn", "ADMIN_TOKEN forte", adminToken.detail);
  addCheck(verifyToken.ok ? "ok" : production ? "fail" : "warn", "WHATSAPP_VERIFY_TOKEN forte", verifyToken.detail);
  const rateLimit = positiveIntegerEnv("MESSAGE_RATE_LIMIT");
  const rateWindow = positiveIntegerEnv("MESSAGE_RATE_WINDOW_MS");
  const graphVersion = graphVersionEnv();
  addCheck(rateLimit.ok ? "ok" : production ? "fail" : "warn", "MESSAGE_RATE_LIMIT inteiro positivo", rateLimit.detail);
  addCheck(rateWindow.ok ? "ok" : production ? "fail" : "warn", "MESSAGE_RATE_WINDOW_MS inteiro positivo", rateWindow.detail);
  addCheck(graphVersion.ok ? "ok" : production ? "fail" : "warn", "WHATSAPP_GRAPH_VERSION valido", graphVersion.detail);
  addCheck(hasRealValue("DATA_DIR") ? "ok" : production ? "fail" : "warn", "DATA_DIR persistente", production ? "Obrigatorio em hospedagem com arquivos JSON" : "Opcional em teste local");

  const publicUrlOk = /^https:\/\/[^/]+/i.test(baseUrl);
  addCheck(publicUrlOk ? "ok" : production ? "fail" : "warn", "PUBLIC_BASE_URL HTTPS", baseUrl || "Nao definido");

  for (const name of ["WHATSAPP_APP_SECRET", "WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"]) {
    addCheck(
      hasRealValue(name, ["segredo", "token-da", "id-do"]) ? "ok" : production ? "fail" : "warn",
      `${name} definido`,
      production ? "Obrigatorio para WhatsApp real" : "Pode ficar vazio em teste local"
    );
  }
}

function checkData() {
  let catalog = [];
  let faqs = [];
  let config = {};

  try {
    catalog = readJson("data/catalog.json", []);
    validateCatalog(catalog);
    addCheck("ok", "Catalogo valido");
    addCheck(catalog.some((item) => item.available !== false) ? "ok" : "fail", "Catalogo tem produto ativo", `${catalog.length} item(ns)`);
  } catch (error) {
    addCheck("fail", "Catalogo valido", error.message);
  }

  try {
    faqs = readJson("data/faqs.json", []);
    validateFaqs(faqs);
    addCheck("ok", "FAQs validas");
    addCheck(faqs.some((item) => item.active !== false) ? "ok" : "warn", "FAQs ativas", `${faqs.length} item(ns)`);
  } catch (error) {
    addCheck("fail", "FAQs validas", error.message);
  }

  try {
    config = readJson("data/store-config.json", {});
    validateConfig(config);
    addCheck("ok", "Configuracao valida");
    addCheck(config.storeName ? "ok" : "fail", "Nome da loja configurado");
    addCheck(config.openingMessage ? "ok" : "fail", "Mensagem inicial configurada");
    addCheck(config.deliveryInfo ? "ok" : "warn", "Informacao de entrega configurada");
    addCheck(config.pickupInfo ? "ok" : "warn", "Informacao de retirada configurada");
    addCheck(config.paymentInfo ? "ok" : "warn", "Informacao de pagamento configurada");
    addCheck(config.paymentMethods?.length > 0 ? "ok" : production ? "fail" : "warn", "Formas de pagamento configuradas");
    addCheck(config.businessHours?.weekly?.length > 0 ? "ok" : production ? "fail" : "warn", "Horario de atendimento configurado");
    addCheck(config.deliveryZones?.length > 0 ? "ok" : production ? "fail" : "warn", "Zonas de entrega configuradas");
  } catch (error) {
    addCheck("fail", "Configuracao valida", error.message);
  }

  const dataIssues = storeDataIssues(config, catalog, faqs);
  addCheck(
    dataIssues.length === 0 ? "ok" : production ? "fail" : "warn",
    "Dados reais da loja",
    dataIssues.length === 0 ? "Catalogo, FAQs e configuracao parecem personalizados" : dataIssues.join(" ")
  );
}

async function checkHttp() {
  if (offline) {
    addCheck("warn", "Teste HTTP", "Pulado por --offline");
    return;
  }

  if (!baseUrl) {
    addCheck(production ? "fail" : "warn", "Teste HTTP", "Defina PUBLIC_BASE_URL ou use --url");
    return;
  }

  const url = baseUrl.replace(/\/$/, "");
  try {
    const health = await fetch(`${url}/health`);
    addCheck(health.ok ? "ok" : "fail", "GET /health", `HTTP ${health.status}`);
    const csp = health.headers.get("content-security-policy") || "";
    const hasSecurityHeaders = health.headers.get("x-content-type-options") === "nosniff"
      && health.headers.get("referrer-policy") === "no-referrer"
      && health.headers.get("x-frame-options") === "DENY"
      && csp.includes("default-src 'self'")
      && csp.includes("frame-ancestors 'none'")
      && csp.includes("script-src 'self'");
    addCheck(hasSecurityHeaders ? "ok" : "fail", "Headers de seguranca HTTP");
  } catch (error) {
    addCheck(production ? "fail" : "warn", "GET /health", error.message);
    return;
  }

  try {
    const openApi = await fetch(`${url}/openapi.json`);
    const contentType = openApi.headers.get("content-type") || "";
    addCheck(openApi.ok && contentType.includes("application/json") ? "ok" : "fail", "GET /openapi.json", `HTTP ${openApi.status}`);
  } catch (error) {
    addCheck(production ? "fail" : "warn", "GET /openapi.json", error.message);
  }

  const prototypeAssets = [
    ["/prototype", "GET /prototype", "Chatbot para WhatsApp"],
    ["/prototype/script.js", "GET /prototype/script.js", "prototype-browser"],
    ["/prototype/styles.css", "GET /prototype/styles.css", ".phone"]
  ];
  for (const [pathname, label, marker] of prototypeAssets) {
    try {
      const response = await fetch(`${url}${pathname}`);
      const body = await response.text();
      addCheck(response.ok && body.includes(marker) ? "ok" : "fail", label, `HTTP ${response.status}`);
    } catch (error) {
      addCheck(production ? "fail" : "warn", label, error.message);
    }
  }

  if (process.env.ADMIN_TOKEN) {
    try {
      const adminPublic = await fetch(`${url}/admin`);
      const body = await adminPublic.text();
      addCheck(adminPublic.ok && body.includes("Painel do chatbot") ? "ok" : "fail", "GET /admin tela de acesso", `HTTP ${adminPublic.status}`);
    } catch (error) {
      addCheck(production ? "fail" : "warn", "GET /admin tela de acesso", error.message);
    }

    const protectedWithoutToken = [
      ["/ready", "GET /ready sem token"],
      ["/orders", "GET /orders sem token"],
      ["/backup.json", "GET /backup.json sem token"]
    ];
    for (const [pathname, label] of protectedWithoutToken) {
      try {
        const response = await fetch(`${url}${pathname}`);
        addCheck(response.status === 401 ? "ok" : "fail", label, `HTTP ${response.status}`);
      } catch (error) {
        addCheck(production ? "fail" : "warn", label, error.message);
      }
    }

    try {
      const preflight = await fetch(`${url}/orders`, {
        method: "OPTIONS",
        headers: {
          "access-control-request-headers": "authorization, content-type",
          "access-control-request-method": "GET"
        }
      });
      const allowedHeaders = preflight.headers.get("access-control-allow-headers") || "";
      const corsOk = preflight.status === 204 && allowedHeaders.toLowerCase().includes("authorization");
      addCheck(
        corsOk ? "ok" : "fail",
        "OPTIONS /orders CORS authorization",
        `HTTP ${preflight.status}`
      );
    } catch (error) {
      addCheck(production ? "fail" : "warn", "OPTIONS /orders CORS authorization", error.message);
    }

    try {
      const admin = await fetch(`${url}/admin`, {
        headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` }
      });
      const body = await admin.text();
      addCheck(admin.ok && body.includes("Painel do chatbot") ? "ok" : "fail", "GET /admin", `HTTP ${admin.status}`);
    } catch (error) {
      addCheck(production ? "fail" : "warn", "GET /admin", error.message);
    }

    const adminAssets = [
      ["/admin/script.js", "GET /admin/script.js", "loadDashboard"],
      ["/admin/styles.css", "GET /admin/styles.css", ".shell"]
    ];
    for (const [pathname, label, marker] of adminAssets) {
      try {
        const response = await fetch(`${url}${pathname}`, {
          headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` }
        });
        const body = await response.text();
        addCheck(response.ok && body.includes(marker) ? "ok" : "fail", label, `HTTP ${response.status}`);
      } catch (error) {
        addCheck(production ? "fail" : "warn", label, error.message);
      }
    }

    try {
      const ready = await fetch(`${url}/ready`, {
        headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` }
      });
      addCheck(ready.ok ? "ok" : "fail", "GET /ready", `HTTP ${ready.status}`);
      const cacheControl = ready.headers.get("cache-control") || "";
      addCheck(cacheControl.toLowerCase().includes("no-store") ? "ok" : "fail", "Rotas administrativas sem cache");
    } catch (error) {
      addCheck(production ? "fail" : "warn", "GET /ready", error.message);
    }

    const protectedExports = [
      ["/orders.csv", "GET /orders.csv"],
      ["/handoffs.csv", "GET /handoffs.csv"],
      ["/outbox.csv", "GET /outbox.csv"],
      ["/store-profile.json", "GET /store-profile.json"],
      ["/backup.json", "GET /backup.json"]
    ];
    for (const [pathname, label] of protectedExports) {
      try {
        const response = await fetch(`${url}${pathname}`, {
          headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` }
        });
        addCheck(response.ok ? "ok" : "fail", label, `HTTP ${response.status}`);
      } catch (error) {
        addCheck(production ? "fail" : "warn", label, error.message);
      }
    }

    let backupBody = null;
    try {
      const backup = await fetch(`${url}/backup.json`, {
        headers: { authorization: `Bearer ${process.env.ADMIN_TOKEN}` }
      });
      backupBody = await backup.json();
      validateBackup(backupBody);
      addCheck("ok", "Backup HTTP valido");
    } catch (error) {
      addCheck("fail", "Backup HTTP valido", error.message);
    }

    if (backupBody) {
      try {
        const profileValidation = await fetch(`${url}/store-profile/validate`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({
            profile: {
              config: backupBody.config,
              catalog: backupBody.catalog,
              faqs: backupBody.faqs || []
            }
          })
        });
        const profileBody = await profileValidation.json();
        addCheck(
          profileValidation.ok && profileBody.ok ? "ok" : "fail",
          "POST /store-profile/validate",
          profileBody.issues?.join(" ") || `HTTP ${profileValidation.status}`
        );
      } catch (error) {
        addCheck("fail", "POST /store-profile/validate", error.message);
      }

      try {
        const restoreWithoutConfirmation = await fetch(`${url}/backup/restore`, {
          method: "POST",
          headers: {
            authorization: `Bearer ${process.env.ADMIN_TOKEN}`,
            "content-type": "application/json"
          },
          body: JSON.stringify({ backup: backupBody })
        });
        addCheck(
          restoreWithoutConfirmation.status === 400 ? "ok" : "fail",
          "POST /backup/restore exige confirmacao",
          `HTTP ${restoreWithoutConfirmation.status}`
        );
      } catch (error) {
        addCheck("fail", "POST /backup/restore exige confirmacao", error.message);
      }
    }
  } else {
    addCheck(production ? "fail" : "warn", "Rotas administrativas HTTP", "ADMIN_TOKEN ausente");
  }

  if (process.env.WHATSAPP_VERIFY_TOKEN) {
    try {
      const challenge = "production-check";
      const verify = await fetch(`${url}/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(process.env.WHATSAPP_VERIFY_TOKEN)}&hub.challenge=${challenge}`);
      const body = await verify.text();
      addCheck(verify.ok && body === challenge ? "ok" : "fail", "GET /webhooks/whatsapp verificacao", `HTTP ${verify.status}`);
    } catch (error) {
      addCheck(production ? "fail" : "warn", "GET /webhooks/whatsapp verificacao", error.message);
    }
  } else {
    addCheck(production ? "fail" : "warn", "Webhook WhatsApp verificacao", "WHATSAPP_VERIFY_TOKEN ausente");
  }
}

function printResults() {
  const failures = checks.filter((check) => check.status === "fail");
  const warnings = checks.filter((check) => check.status === "warn");

  if (reportPath) {
    writeReport(reportPath, failures, warnings);
  }

  if (jsonOutput) {
    console.log(JSON.stringify({
      generatedAt: new Date().toISOString(),
      production,
      offline,
      baseUrl: baseUrl || null,
      summary: {
        failures: failures.length,
        warnings: warnings.length,
        checks: checks.length
      },
      checks
    }, null, 2));
    if (failures.length > 0) {
      process.exitCode = 1;
    }
    return;
  }

  for (const check of checks) {
    console.log(`${check.status.toUpperCase()} - ${check.label}${check.detail ? ` (${check.detail})` : ""}`);
  }

  console.log(`\nResumo: ${failures.length} falha(s), ${warnings.length} aviso(s).`);
  if (reportPath) {
    console.log(`Relatorio salvo: ${path.resolve(reportPath)}`);
  }
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

function reportSection(title, items) {
  if (items.length === 0) {
    return [`## ${title}`, "", "Nenhum item.", ""].join("\n");
  }

  return [
    `## ${title}`,
    "",
    ...items.map((check) => `- ${check.label}${check.detail ? `: ${check.detail}` : ""}`),
    ""
  ].join("\n");
}

function writeReport(targetPath, failures, warnings) {
  const okChecks = checks.filter((check) => check.status === "ok");
  const lines = [
    "# Relatorio de prontidao para producao",
    "",
    `Gerado em: ${new Date().toISOString()}`,
    `Modo: ${production ? "producao" : "local"}${offline ? " offline" : ""}`,
    `URL base: ${baseUrl || "nao definida"}`,
    "",
    `Resumo: ${failures.length} falha(s), ${warnings.length} aviso(s), ${okChecks.length} ok.`,
    "",
    failures.length === 0
      ? "Status: pronto nos itens verificados por este script."
      : "Status: ainda nao esta pronto para producao.",
    "",
    reportSection("Falhas", failures),
    reportSection("Avisos", warnings),
    reportSection("Itens OK", okChecks),
    "## Proximas acoes sugeridas",
    "",
    "- Corrija todas as falhas antes de conectar o webhook na Meta.",
    "- Depois de publicar em HTTPS, rode `npm run check:production` sem `--offline`.",
    "- Guarde tokens e credenciais fora do repositorio.",
    "- Baixe um backup antes de qualquer restauracao ou troca de dados reais.",
    ""
  ];

  fs.mkdirSync(path.dirname(path.resolve(targetPath)), { recursive: true });
  fs.writeFileSync(targetPath, `${lines.join("\n")}\n`);
}

async function run() {
  checkEnv();
  checkData();
  await checkHttp();
  printResults();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
