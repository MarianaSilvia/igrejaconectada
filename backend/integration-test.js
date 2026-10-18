const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const port = 3999;
const baseUrl = `http://127.0.0.1:${port}`;
const adminToken = "integration-admin-token";
const verifyToken = "integration-verify-token";
const appSecret = "integration-app-secret";
let tempDataDir = "";
const createdBackupFiles = [];

function prepareTempDataDir() {
  tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-integration-"));
  const sourceDataDir = path.join(root, "data");
  for (const file of fs.readdirSync(sourceDataDir)) {
    if (file.endsWith(".json")) {
      fs.copyFileSync(path.join(sourceDataDir, file), path.join(tempDataDir, file));
    }
  }
}

function cleanupTempDataDir() {
  if (tempDataDir && fs.existsSync(tempDataDir)) {
    fs.rmSync(tempDataDir, { recursive: true, force: true });
  }
  tempDataDir = "";
}

function trackPreRestoreBackup(body) {
  assert.ok(body.preRestoreBackup);
  assert.equal(fs.existsSync(body.preRestoreBackup), true);
  createdBackupFiles.push(body.preRestoreBackup);
}

function cleanupCreatedBackupFiles() {
  for (const filePath of createdBackupFiles.splice(0)) {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}

async function request(pathname, options = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    headers: {
      "content-type": "application/json",
      ...(options.headers || {})
    },
    ...options
  });

  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }

  return { response, body };
}

async function waitForServer(child) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 10_000) {
    if (child.exitCode !== null) {
      throw new Error(`Servidor encerrou cedo com codigo ${child.exitCode}.`);
    }

    try {
      const { response } = await request("/health");
      if (response.ok) return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 120));
    }
  }

  throw new Error("Servidor nao ficou pronto a tempo.");
}

async function sendChat(sessionId, message) {
  return request("/chat", {
    method: "POST",
    body: JSON.stringify({ sessionId, message })
  });
}

async function run() {
  prepareTempDataDir();

  const child = spawn(process.execPath, ["backend/server.js"], {
    cwd: root,
    env: {
      ...process.env,
      PORT: String(port),
      ADMIN_TOKEN: adminToken,
      WHATSAPP_VERIFY_TOKEN: verifyToken,
      WHATSAPP_APP_SECRET: appSecret,
      WHATSAPP_GRAPH_VERSION: "v20.0",
      PUBLIC_BASE_URL: baseUrl,
      DATA_DIR: tempDataDir,
      MESSAGE_RATE_LIMIT: "100",
      MESSAGE_RATE_WINDOW_MS: "600000"
    },
    stdio: ["ignore", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await waitForServer(child);

    let result = await request("/admin");
    assert.equal(result.response.status, 200);
    assert.match(result.body, /Painel do chatbot/);

    result = await request("/ready");
    assert.equal(result.response.status, 401);

    result = await request("/ready", {
      headers: { authorization: "Bearer token-errado" }
    });
    assert.equal(result.response.status, 401);

    result = await request("/ready?token=token-errado");
    assert.equal(result.response.status, 401);

    result = await request("/orders", {
      method: "OPTIONS",
      headers: {
        "access-control-request-headers": "authorization, content-type",
        "access-control-request-method": "GET"
      }
    });
    assert.equal(result.response.status, 204);
    assert.match(result.response.headers.get("access-control-allow-headers") || "", /authorization/);

    result = await request(`/admin?token=${adminToken}`);
    assert.equal(result.response.status, 200);

    result = await request(`/ready?token=${adminToken}`);
    assert.equal(result.response.status, 200);

    result = await request(`/admin/%2e%2e/data/catalog.json?token=${adminToken}`);
    assert.ok([403, 404].includes(result.response.status));

    result = await request(`/admin/%2e%2e%5cdata%5ccatalog.json?token=${adminToken}`);
    assert.equal(result.response.status, 403);

    result = await request("/prototype/%2e%2e/data/catalog.json");
    assert.ok([403, 404].includes(result.response.status));

    result = await request("/catalog", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.ok(result.body.catalog.length > 0);
    const originalCatalog = result.body.catalog;

    result = await request("/catalog", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ catalog: [{ ...originalCatalog[0], category: "   " }, ...originalCatalog.slice(1)] })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /Produto invalido/);

    result = await request("/catalog", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ catalog: [{ ...originalCatalog[0], price: -1 }, ...originalCatalog.slice(1)] })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /Produto invalido/);

    const inactiveProduct = { ...originalCatalog[0], available: false };
    result = await request("/catalog", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ catalog: [inactiveProduct, ...originalCatalog.slice(1)] })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.catalog[0].available, false);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "integration-catalog-availability", message: "Ver produtos" })
    });
    assert.equal(result.response.status, 200);
    assert.doesNotMatch(result.body.messages[0].text, new RegExp(inactiveProduct.name));

    const outOfStockProduct = { ...originalCatalog[0], available: true, stock: 0 };
    result = await request("/catalog", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ catalog: [outOfStockProduct, ...originalCatalog.slice(1)] })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.catalog[0].stock, 0);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "integration-catalog-stock", message: outOfStockProduct.category })
    });
    assert.equal(result.response.status, 200);
    assert.doesNotMatch(result.body.messages[0].text, new RegExp(outOfStockProduct.name));

    result = await request("/catalog", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ catalog: originalCatalog })
    });
    assert.equal(result.response.status, 200);

    const stockManagedCatalog = [
      { ...originalCatalog[0], stock: 2 },
      ...originalCatalog.slice(1)
    ];
    result = await request("/catalog", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ catalog: stockManagedCatalog })
    });
    assert.equal(result.response.status, 200);

    result = await request("/ready", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.ok(result.body.checks.some((check) => check.id === "stock-alerts" && check.status === "warning"));

    const stockSessionId = "integration-stock-reserve";
    for (const message of ["Fazer pedido", originalCatalog[0].id, "2", "Joao", "Retirada", "Pix", "Sem observacao", "Confirmar pedido"]) {
      result = await sendChat(stockSessionId, message);
      assert.equal(result.response.status, 200);
    }
    const stockOrderId = result.body.order.id;

    result = await request("/orders/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: "   ", status: "confirmed" })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /id e obrigatorio/);

    result = await request("/orders/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: stockOrderId, status: "separando" })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /Status de pedido invalido/);

    result = await request("/orders/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: ` ${stockOrderId} `, status: "confirmed" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.stockAdjustment.reserved, 2);
    assert.equal(result.body.stockAdjustment.stock, 0);
    assert.equal(result.body.order.stockReserved, true);
    assert.ok(result.body.order.statusHistory.some((item) => item.status === "confirmed" && item.stockAdjustment));

    result = await request("/catalog", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.body.catalog.find((item) => item.id === originalCatalog[0].id).stock, 0);

    result = await request("/orders/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: stockOrderId, status: "confirmed" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.stockAdjustment, null);

    result = await request("/orders/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: stockOrderId, status: "cancelled" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.stockAdjustment.restored, 2);
    assert.equal(result.body.stockAdjustment.stock, 2);
    assert.equal(result.body.order.stockReserved, false);
    assert.ok(result.body.order.statusHistory.some((item) => item.status === "cancelled" && item.stockAdjustment));

    result = await request("/orders/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: stockOrderId, status: "confirmed" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.stockAdjustment.stock, 0);

    result = await request("/orders/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: stockOrderId, status: "cancelled" })
    });
    assert.equal(result.response.status, 200);

    result = await request("/catalog", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ catalog: [{ ...originalCatalog[0], stock: 1 }, ...originalCatalog.slice(1)] })
    });
    assert.equal(result.response.status, 200);

    result = await request("/orders/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: stockOrderId, status: "confirmed" })
    });
    assert.equal(result.response.status, 409);
    assert.match(result.body.error, /Estoque insuficiente/);

    result = await request("/orders/clear", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    assert.equal(result.response.status, 200);

    result = await request("/sessions/reset", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ sessionId: ` ${stockSessionId} ` })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.sessionId, stockSessionId);
    assert.equal(result.body.scope, "session");

    result = await request("/sessions/reset", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ sessionId: "   " })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /sessionId deve ser texto preenchido/);

    result = await request("/catalog", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ catalog: originalCatalog })
    });
    assert.equal(result.response.status, 200);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "integration-category", message: "Ver produtos" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.state.step, "catalog");
    assert.match(result.body.messages[0].text, /Mais vendidos/);
    assert.ok(result.body.messages[0].quickReplies.includes("Novidades"));

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "integration-category", message: "Novidades" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.state.step, "catalog_category");
    assert.match(result.body.messages[0].text, /Lancamento da semana/);
    assert.doesNotMatch(result.body.messages[0].text, /Produto destaque/);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: " integration-trimmed-session ", message: "Oi" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.sessionId, "integration-trimmed-session");

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "x".repeat(201), message: "Oi" })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /sessionId deve ter no maximo 200 caracteres/);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "integration-long-message", message: "x".repeat(4001) })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /Mensagem deve ter no maximo 4000 caracteres/);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({
        sessionId: "payload-grande",
        message: "x".repeat(1_000_001)
      })
    });
    assert.equal(result.response.status, 413);
    assert.match(result.body.error, /Payload muito grande/);

    result = await request("/openapi.json");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.openapi, "3.0.3");

    result = await request("/ready");
    assert.equal(result.response.status, 401);

    result = await request("/ready", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.readyForLocalUse, true);
    assert.ok(result.body.checks.some((check) => check.id === "catalog" && check.status === "ok"));
    assert.ok(result.body.checks.some((check) => check.id === "data-dir" && check.status === "ok"));
    assert.ok(result.body.checks.some((check) => check.id === "public-base-url" && check.status === "warning"));
    assert.ok(result.body.checks.some((check) => check.id === "whatsapp-graph-version" && check.status === "ok"));
    assert.ok(result.body.checks.some((check) => check.id === "rate-limit" && check.status === "ok"));

    result = await request("/faqs", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.ok(result.body.faqs.length > 0);
    const originalFaqs = result.body.faqs;

    result = await request("/faqs", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ faqs: [{ ...originalFaqs[0], keywords: [...originalFaqs[0].keywords, ""] }, ...originalFaqs.slice(1)] })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /Palavra-chave invalida/);

    const inactiveFaq = { ...originalFaqs[0], active: false };
    result = await request("/faqs", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ faqs: [inactiveFaq, ...originalFaqs.slice(1)] })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.faqs[0].active, false);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "integration-inactive-faq", message: inactiveFaq.keywords[0] })
    });
    assert.equal(result.response.status, 200);
    assert.notEqual(result.body.state.step, "faq");

    result = await request("/faqs", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ faqs: originalFaqs })
    });
    assert.equal(result.response.status, 200);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "integration-faq", message: "Qual e o horario?" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.state.step, "business_hours");

    const faqCatalog = [
      {
        id: "garantia-teste",
        question: "Tem garantia?",
        answer: "Garantia confirmada pela loja conforme o produto.",
        keywords: ["garantia"],
        active: true
      },
      ...originalFaqs
    ];
    result = await request("/faqs", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ faqs: faqCatalog })
    });
    assert.equal(result.response.status, 200);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "integration-faq-2", message: "Tem garantia?" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.state.step, "faq");
    assert.match(result.body.messages[0].text, /Garantia confirmada/);

    result = await request("/faqs", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ faqs: originalFaqs })
    });
    assert.equal(result.response.status, 200);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "integration-keyword-handoff", message: "Quero reclamar de um problema" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.state.step, "human_handoff");
    assert.ok(result.body.handoff);

    result = await request("/privacy/delete-session", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ sessionId: "integration-keyword-handoff" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.removedHandoffs, 1);

    result = await request("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: "integration-human", message: "Falar com atendente" })
    });
    assert.equal(result.response.status, 200);
    assert.ok(result.body.handoff);

    result = await request("/handoffs", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.handoffs.length, 1);
    const handoffId = result.body.handoffs[0].id;
    assert.equal(result.body.handoffs[0].statusHistory[0].type, "created");
    assert.equal(result.body.handoffs[0].statusHistory[0].status, "open");

    result = await request("/handoffs/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: "   ", status: "resolved" })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /id e obrigatorio/);

    result = await request("/handoffs/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: handoffId, status: "waiting_customer" })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /Status de atendimento invalido/);

    result = await request("/handoffs/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: ` ${handoffId} `, status: "resolved", notes: "Resolvido no teste." })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.handoff.status, "resolved");
    assert.ok(result.body.handoff.statusHistory.some((item) => item.status === "resolved" && item.previousStatus === "open" && item.hasNotes));

    result = await request("/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ sessionId: "integration-human", text: "   " })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /sessionId e text sao obrigatorios/);

    result = await request("/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ sessionId: "integration-human", text: "x".repeat(2001) })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /maximo 2000/);

    result = await request("/messages/send", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ sessionId: " integration-human ", text: " Resposta manual do teste. " })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.result.skipped, true);

    result = await request("/conversations", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.ok(result.body.conversations["integration-human"].some((message) => message.sender === "operator"));
    assert.ok(result.body.conversations["integration-human"].some((message) => message.sender === "operator" && message.text === "Resposta manual do teste."));

    result = await request(`/conversations/export?sessionId=integration-human`, {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.match(result.body, /Resposta manual do teste/);

    result = await request(`/conversations/export?sessionId=${encodeURIComponent(" integration-human ")}`, {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.match(result.body, /Transcript da sessao: integration-human/);

    result = await request(`/conversations/export?sessionId=${"x".repeat(201)}`, {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /sessionId deve ter no maximo 200 caracteres/);

    result = await request("/conversations.json", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.ok(result.body["integration-human"]);

    const sessionId = "integration-flow";
    for (const message of ["Fazer pedido", "1", "2", "Maria", "Entrega", "Rua Central, Centro", "Pix", "Sem observacao"]) {
      result = await sendChat(sessionId, message);
      assert.equal(result.response.status, 200);
    }
    assert.equal(result.body.state.step, "review");
    assert.equal(result.body.state.completed, false);
    assert.equal(result.body.order, null);

    result = await sendChat(sessionId, "Confirmar pedido");
    assert.equal(result.response.status, 200);
    assert.equal(result.body.state.completed, true);
    assert.ok(result.body.order);

    result = await request("/orders", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.body.orders.length, 1);
    const orderId = result.body.orders[0].id;
    assert.equal(result.body.orders[0].state.customerContact, sessionId);
    assert.match(result.body.orders[0].summary, new RegExp(`Contato: ${sessionId}`));
    assert.match(result.body.orders[0].summary, /Total estimado com frete/);
    assert.equal(result.body.orders[0].statusHistory[0].type, "created");

    result = await request("/config", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    const currentConfig = result.body.config;

    result = await request("/store-profile.json", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.config.storeName, currentConfig.storeName);
    assert.ok(result.body.catalog.length > 0);
    assert.ok(result.body.faqs.length > 0);

    result = await request("/store-profile/validate", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ profile: result.body })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.ok, false);
    assert.ok(result.body.issues.length > 0);

    const realStoreProfile = {
      config: {
        ...currentConfig,
        storeName: "Casa Aurora Presentes",
        openingMessage: "Oi! Sou o assistente da Casa Aurora Presentes. Posso mostrar presentes, montar seu pedido ou chamar a equipe.",
        deliveryInfo: "Entregamos por motoboy nos bairros atendidos e temos retirada na loja.",
        paymentInfo: "Aceitamos Pix, cartao e dinheiro na retirada."
      },
      catalog: [
        {
          id: "vela-lavanda",
          category: "Presentes",
          name: "Vela aromatica lavanda",
          price: 42.9,
          stock: 8,
          description: "Vela artesanal com aroma de lavanda.",
          available: true
        }
      ],
      faqs: [
        {
          id: "retirada-loja",
          question: "Posso retirar na loja?",
          answer: "Sim, a equipe confirma o melhor horario para retirada.",
          keywords: ["retirada", "buscar", "loja"],
          active: true
        }
      ]
    };

    result = await request("/store-profile/validate", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ profile: realStoreProfile })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.ok, true);
    assert.equal(result.body.products, 1);

    result = await request("/store-profile/apply", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ profile: realStoreProfile })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /confirmApply=true/);

    result = await request("/store-profile/apply", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ profile: realStoreProfile, confirmApply: true })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.config.storeName, "Casa Aurora Presentes");
    assert.equal(result.body.catalog[0].id, "vela-lavanda");
    assert.ok(result.body.preStoreProfileBackup);
    assert.equal(fs.existsSync(result.body.preStoreProfileBackup), true);
    createdBackupFiles.push(result.body.preStoreProfileBackup);

    result = await request("/config", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ config: currentConfig })
    });
    assert.equal(result.response.status, 200);

    result = await request("/catalog", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ catalog: originalCatalog })
    });
    assert.equal(result.response.status, 200);

    result = await request("/faqs", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ faqs: originalFaqs })
    });
    assert.equal(result.response.status, 200);

    result = await request("/config", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        config: {
          ...currentConfig,
          handoffRules: [...currentConfig.handoffRules, ""]
        }
      })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /Regra de atendimento humano invalida/);

    result = await request("/config", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        config: {
          ...currentConfig,
          orderStatusMessages: {
            ...currentConfig.orderStatusMessages,
            done: ""
          }
        }
      })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /Mensagem de status invalida: done/);

    result = await request("/config", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        config: {
          ...currentConfig,
          orderStatusMessages: {
            ...(currentConfig.orderStatusMessages || {}),
            confirmed: "Pedido {orderId} confirmado para {customerName} pela {storeName}."
          }
        }
      })
    });
    assert.equal(result.response.status, 200);

    result = await request("/orders/status", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        id: ` ${orderId} `,
        status: "confirmed",
        internalNotes: "Separar para retirada.",
        notifyCustomer: true
      })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.order.status, "confirmed");
    assert.equal(result.body.order.internalNotes, "Separar para retirada.");
    assert.equal(result.body.notification.skipped, true);
    assert.ok(result.body.order.statusHistory.some((item) => item.status === "confirmed" && item.notified));

    result = await request("/conversations", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.ok(result.body.conversations[sessionId].some((message) => {
      return message.sender === "operator" && message.text.includes(`Pedido ${orderId} confirmado para Maria pela Loja.`);
    }));

    result = await request("/outbox", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.ok(result.body.outbox.some((item) => item.text.includes(`Pedido ${orderId} confirmado para Maria pela Loja.`)));

    result = await request("/config", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ config: currentConfig })
    });
    assert.equal(result.response.status, 200);

    result = await request("/orders.csv", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.match(result.body, /internalNotes/);
    assert.match(result.body, /statusHistory/);
    assert.match(result.body, /customerContact/);
    assert.match(result.body, new RegExp(sessionId));
    assert.match(result.body, /Separar para retirada/);

    result = await request("/conversations", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.ok(result.body.conversations[sessionId].length >= 6);

    result = await request("/events", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.ok(result.body.events.some((event) => event.type === "order.created"));

    result = await request("/events.csv", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.match(result.body, /order\.created/);

    result = await request("/outbox.csv", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.match(result.body, /Resposta manual do teste/);

    result = await request("/handoffs.csv", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.match(result.body, /integration-human/);
    assert.match(result.body, /Resolvido no teste/);

    result = await request(`/backup.json?token=${adminToken}`);
    assert.equal(result.response.status, 200);
    assert.equal(result.body.orders.length, 1);
    assert.equal(result.body.handoffs.length, 1);
    assert.ok(result.body.faqs.length > 0);
    assert.ok(result.body.conversations[sessionId]);
    const backup = result.body;

    result = await request(`/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=ok`);
    assert.equal(result.body, "ok");

    const menuPayload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.integration-menu",
                    from: "5511888888888",
                    text: { body: "Oi" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });
    const menuSignature = `sha256=${crypto.createHmac("sha256", appSecret).update(menuPayload).digest("hex")}`;
    result = await request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": menuSignature },
      body: menuPayload
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.outbound[1].payload.interactive.type, "list");

    const listReplyPayload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.integration-list-reply",
                    from: "5511888888888",
                    interactive: {
                      type: "list_reply",
                      list_reply: {
                        id: "row_2_fazer_pedido",
                        title: "Fazer pedido"
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
      ]
    });
    const listReplySignature = `sha256=${crypto.createHmac("sha256", appSecret).update(listReplyPayload).digest("hex")}`;
    result = await request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": listReplySignature },
      body: listReplyPayload
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.state.step, "catalog");

    const webhookPayload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                messages: [
                  {
                    id: "wamid.integration-1",
                    from: "5511999999999",
                    text: { body: "Fazer pedido" }
                  }
                ]
              }
            }
          ]
        }
      ]
    });

    result = await request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=assinatura-invalida" },
      body: webhookPayload
    });
    assert.equal(result.response.status, 403);

    const validSignature = `sha256=${crypto.createHmac("sha256", appSecret).update(webhookPayload).digest("hex")}`;
    result = await request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": validSignature },
      body: webhookPayload
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.state.step, "catalog");

    result = await request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": validSignature },
      body: webhookPayload
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.duplicate, true);
    assert.equal(result.body.outbound.length, 0);

    result = await request(`/backup.json?token=${adminToken}`);
    assert.ok(Object.keys(result.body.processedWebhooks).length >= 1);

    result = await request("/outbox", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.response.status, 200);
    assert.ok(result.body.outbox.length > 0);
    assert.equal(result.body.outbox[0].status, "skipped");
    assert.equal(result.body.outbox[0].attempts, 1);
    assert.equal(result.body.outbox[0].result.payload.type, "interactive");
    assert.ok(result.body.outbox[0].quickReplies.length > 0);
    const outboxId = result.body.outbox[0].id;

    result = await request("/outbox/retry", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: "   " })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /id e obrigatorio/);

    result = await request("/outbox/retry", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ id: ` ${outboxId} ` })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.outboxItem.status, "skipped");
    assert.equal(result.body.outboxItem.attempts, 2);

    const statusBackup = {
      ...backup,
      outbox: [
        {
          id: "status-test-outbox",
          createdAt: new Date().toISOString(),
          sessionId: "5511999999999",
          channel: "whatsapp",
          text: "Mensagem de status.",
          status: "sent",
          providerMessageId: "wamid.status-test",
          attempts: 1
        }
      ]
    };
    result = await request("/backup/restore", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ backup: statusBackup })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /confirmRestore=true/);

    result = await request("/backup/restore", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ backup: statusBackup, confirmRestore: true })
    });
    assert.equal(result.response.status, 200);
    trackPreRestoreBackup(result.body);

    const statusPayload = JSON.stringify({
      entry: [
        {
          changes: [
            {
              value: {
                statuses: [
                  {
                    id: "wamid.status-test",
                    status: "read",
                    timestamp: "1791378000",
                    recipient_id: "5511999999999"
                  }
                ]
              }
            }
          ]
        }
      ]
    });
    const statusSignature = `sha256=${crypto.createHmac("sha256", appSecret).update(statusPayload).digest("hex")}`;
    result = await request("/webhooks/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": statusSignature },
      body: statusPayload
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.updatedOutboxItems, 1);

    result = await request("/outbox", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.body.outbox[0].providerStatus, "read");

    result = await request("/privacy/delete-session", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ sessionId: "   " })
    });
    assert.equal(result.response.status, 400);
    assert.match(result.body.error, /sessionId e obrigatorio/);

    result = await request("/privacy/delete-session", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ sessionId: ` ${sessionId} ` })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.sessionId, sessionId);
    assert.equal(result.body.redactedOrders, 1);

    result = await request("/orders", {
      headers: { authorization: `Bearer ${adminToken}` }
    });
    assert.equal(result.body.orders[0].internalNotes, "[removido]");
    assert.equal(result.body.orders[0].state.customerContact, "[removido]");
    assert.match(result.body.orders[0].sessionId, /^redacted-/);

    result = await request("/privacy/delete-session", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ sessionId: "integration-human" })
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.removedHandoffs, 1);

    result = await request("/orders/clear", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    assert.equal(result.response.status, 200);

    result = await request("/sessions/reset", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.scope, "all");

    result = await request("/conversations/clear", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    assert.equal(result.response.status, 200);

    result = await request("/events/clear", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    assert.equal(result.response.status, 200);

    result = await request("/rate-limits/clear", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    assert.equal(result.response.status, 200);

    result = await request("/processed-webhooks/clear", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    assert.equal(result.response.status, 200);

    result = await request("/backup/restore", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ backup, confirmRestore: true })
    });
    assert.equal(result.response.status, 200);
    trackPreRestoreBackup(result.body);
    assert.equal(result.body.orders, 1);
    assert.ok(result.body.conversations >= 1);
    assert.equal(result.body.handoffs, 1);
    assert.ok(result.body.rateLimits >= 1);

    result = await request("/orders/clear", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    assert.equal(result.response.status, 200);
    await request("/sessions/reset", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    await request("/conversations/clear", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    await request("/events/clear", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: "{}"
    });
    result = await request("/backup/restore", {
      method: "POST",
      headers: { authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({
        backup: {
          ...backup,
          orders: [],
          sessions: {},
          conversations: {},
          events: [],
          handoffs: [],
          outbox: [],
          rateLimits: {},
          processedWebhooks: {}
        },
        confirmRestore: true
      })
    });
    assert.equal(result.response.status, 200);
    trackPreRestoreBackup(result.body);

    console.log("Integration-test passou.");
  } finally {
    child.kill();
    cleanupCreatedBackupFiles();
    cleanupTempDataDir();
    if (stderr.trim()) {
      console.error(stderr.trim());
    }
  }
}

run().catch((error) => {
  cleanupCreatedBackupFiles();
  cleanupTempDataDir();
  console.error(error);
  process.exitCode = 1;
});
