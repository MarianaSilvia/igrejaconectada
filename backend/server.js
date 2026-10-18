const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { loadEnvFile } = require("./env");
const { dataFile, ensureDataFiles, getDataDir, writeJsonFile } = require("./data-paths");
const {
  isValidHandoffStatus,
  isValidOrderStatus,
  validateBackup,
  validateCatalog,
  validateConfig,
  validateFaqs,
  storeDataIssues
} = require("./data-validators");

loadEnvFile();
ensureDataFiles();

const {
  buildOrderSummary,
  createConversationState,
  handleMessage,
  loadCatalog,
  loadConfig,
  loadFaqs
} = require("./bot-engine");
const { canSendWhatsApp, sendWhatsAppMessage } = require("./whatsapp-adapter");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const maxRequestBodyBytes = 1_000_000;
const root = path.resolve(__dirname, "..");
const ordersPath = dataFile("orders.json");
const catalogPath = dataFile("catalog.json");
const configPath = dataFile("store-config.json");
const faqsPath = dataFile("faqs.json");
const sessionsPath = dataFile("sessions.json");
const conversationsPath = dataFile("conversations.json");
const eventsPath = dataFile("events.json");
const handoffsPath = dataFile("handoffs.json");
const rateLimitsPath = dataFile("rate-limits.json");
const outboxPath = dataFile("outbox.json");
const processedWebhooksPath = dataFile("processed-webhooks.json");
const sessions = new Map();
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8"
};

function securityHeaders(extra = {}) {
  return {
    "content-security-policy": "default-src 'self'; base-uri 'none'; frame-ancestors 'none'; object-src 'none'; connect-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self'; form-action 'self'",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    ...extra
  };
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, securityHeaders({
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "authorization, content-type"
  }));
  res.end(body);
}

function getAdminToken() {
  return process.env.ADMIN_TOKEN || "";
}

function isStrongSecret(value) {
  const text = String(value || "").trim();
  return text.length >= 32
    && !["troque", "um-token", "gere-um-token", "token-de-verificacao"].some((placeholder) => text.includes(placeholder));
}

function isProtectedPath(pathname) {
  return pathname === "/config"
    || pathname === "/catalog"
    || pathname === "/faqs"
    || pathname === "/store-profile.json"
    || pathname === "/store-profile/validate"
    || pathname === "/store-profile/apply"
    || pathname === "/ready"
    || pathname === "/orders"
    || pathname === "/orders.csv"
    || pathname.startsWith("/orders/")
    || pathname === "/conversations"
    || pathname === "/conversations.json"
    || pathname.startsWith("/conversations/")
    || pathname === "/events"
    || pathname === "/events.csv"
    || pathname.startsWith("/events/")
    || pathname === "/handoffs"
    || pathname === "/handoffs.csv"
    || pathname.startsWith("/handoffs/")
    || pathname === "/messages/send"
    || pathname === "/outbox"
    || pathname === "/outbox.csv"
    || pathname.startsWith("/outbox/")
    || pathname === "/outbox/retry"
    || pathname === "/rate-limits/clear"
    || pathname === "/processed-webhooks/clear"
    || pathname === "/privacy/delete-session"
    || pathname === "/backup.json"
    || pathname === "/backup/restore"
    || pathname === "/sessions/reset";
}

function isSameToken(expectedToken, receivedToken) {
  if (!expectedToken || !receivedToken) {
    return false;
  }

  const expectedHash = crypto.createHash("sha256").update(expectedToken).digest();
  const receivedHash = crypto.createHash("sha256").update(receivedToken).digest();
  return crypto.timingSafeEqual(expectedHash, receivedHash);
}

function isAuthorized(req, url) {
  const token = getAdminToken();
  if (!token || !isProtectedPath(url.pathname)) {
    return true;
  }

  const header = req.headers.authorization || "";
  const bearerToken = header.startsWith("Bearer ") ? header.slice(7) : "";
  const queryToken = url.searchParams.get("token") || "";
  return isSameToken(token, bearerToken) || isSameToken(token, queryToken);
}

function sendText(res, statusCode, body, contentType = "text/plain; charset=utf-8") {
  res.writeHead(statusCode, securityHeaders({
    "content-type": contentType,
    "cache-control": "no-store"
  }));
  res.end(body);
}

function redirect(res, location) {
  res.writeHead(302, securityHeaders({ location }));
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const contentLength = Number(req.headers["content-length"] || 0);
    if (contentLength > maxRequestBodyBytes) {
      const error = new Error("Payload muito grande.");
      error.statusCode = 413;
      reject(error);
      return;
    }

    const chunks = [];
    let bodyBytes = 0;
    let tooLarge = false;
    req.on("data", (chunk) => {
      bodyBytes += chunk.length;
      if (bodyBytes > maxRequestBodyBytes) {
        tooLarge = true;
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (tooLarge) {
        const error = new Error("Payload muito grande.");
        error.statusCode = 413;
        reject(error);
        return;
      }
      const body = Buffer.concat(chunks).toString("utf8");
      if (!body) {
        resolve({});
        return;
      }

      try {
        const parsed = JSON.parse(body);
        if (parsed && typeof parsed === "object") {
          Object.defineProperty(parsed, "__rawBody", {
            enumerable: false,
            value: body
          });
        }
        resolve(parsed);
      } catch (error) {
        reject(new Error("JSON invalido."));
      }
    });
    req.on("error", reject);
  });
}

function isValidSignature(signatureHeader, rawBody, appSecret) {
  if (!appSecret) {
    return true;
  }
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${crypto
    .createHmac("sha256", appSecret)
    .update(rawBody || "")
    .digest("hex")}`;
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(signatureHeader);

  return expectedBuffer.length === receivedBuffer.length
    && crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function saveOrder(sessionId, state) {
  const catalog = loadCatalog();
  const config = loadConfig();
  const current = JSON.parse(fs.readFileSync(ordersPath, "utf8"));
  const orderState = {
    ...state,
    customerContact: state.customerContact || sessionId
  };
  const order = {
    id: `${Date.now()}-${sessionId}`,
    sessionId,
    createdAt: new Date().toISOString(),
    state: orderState,
    summary: buildOrderSummary(orderState, catalog, config),
    status: "pending_confirmation",
    internalNotes: "",
    statusHistory: [
      {
        at: new Date().toISOString(),
        status: "pending_confirmation",
        type: "created"
      }
    ]
  };

  current.push(order);
  writeJsonFile(ordersPath, current);
  return order;
}

function readOrders() {
  return JSON.parse(fs.readFileSync(ordersPath, "utf8"));
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readSessions() {
  if (!fs.existsSync(sessionsPath)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(sessionsPath, "utf8"));
}

function writeSessionsFile() {
  writeJsonFile(sessionsPath, Object.fromEntries(sessions));
}

function loadSessions() {
  sessions.clear();
  const savedSessions = readSessions();
  Object.entries(savedSessions).forEach(([sessionId, state]) => {
    sessions.set(sessionId, state);
  });
}

function writeOrders(orders) {
  writeJsonFile(ordersPath, orders);
}

function readConversations() {
  return readJsonFile(conversationsPath, {});
}

function writeConversations(conversations) {
  writeJsonFile(conversationsPath, conversations);
}

function readEvents() {
  return readJsonFile(eventsPath, []);
}

function readHandoffs() {
  return readJsonFile(handoffsPath, []);
}

function readRateLimits() {
  return readJsonFile(rateLimitsPath, {});
}

function readOutbox() {
  return readJsonFile(outboxPath, []);
}

function readCatalog() {
  return readJsonFile(catalogPath, []);
}

function readFaqs() {
  return readJsonFile(faqsPath, []);
}

function readProcessedWebhooks() {
  return readJsonFile(processedWebhooksPath, {});
}

function backupTimestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function buildBackup() {
  return {
    generatedAt: new Date().toISOString(),
    config: loadConfig(),
    catalog: readCatalog(),
    faqs: readFaqs(),
    orders: readOrders(),
    sessions: readSessions(),
    conversations: readConversations(),
    events: readEvents(),
    handoffs: readHandoffs(),
    outbox: readOutbox(),
    rateLimits: readRateLimits(),
    processedWebhooks: readProcessedWebhooks()
  };
}

function writeBackupSnapshot(prefix) {
  const backup = buildBackup();
  const backupDirectory = path.join(getDataDir(), "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const backupPath = path.join(backupDirectory, `${prefix}-${backupTimestamp()}.json`);
  writeJsonFile(backupPath, backup);
  return backupPath;
}

function writeProcessedWebhooks(processed) {
  writeJsonFile(processedWebhooksPath, processed);
}

function markWebhookProcessed(messageId, sessionId) {
  if (!messageId) {
    return { duplicate: false };
  }

  const processed = readProcessedWebhooks();
  if (processed[messageId]) {
    return { duplicate: true, record: processed[messageId] };
  }

  processed[messageId] = {
    sessionId,
    processedAt: new Date().toISOString()
  };
  writeProcessedWebhooks(Object.fromEntries(Object.entries(processed).slice(-1000)));
  return { duplicate: false, record: processed[messageId] };
}

function clearProcessedWebhooksForSession(sessionId) {
  const processed = readProcessedWebhooks();
  if (!sessionId) {
    writeProcessedWebhooks({});
    return;
  }

  for (const [messageId, record] of Object.entries(processed)) {
    if (record.sessionId === sessionId) {
      delete processed[messageId];
    }
  }
  writeProcessedWebhooks(processed);
}

function writeOutbox(outbox) {
  writeJsonFile(outboxPath, outbox.slice(-500));
}

function appendOutbox(entry) {
  const outbox = readOutbox();
  const item = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    attempts: 1,
    ...entry
  };
  outbox.push(item);
  writeOutbox(outbox);
  return item;
}

async function sendAndTrackOutbox(sessionId, text, source = "bot", existingItem = null, quickReplies = []) {
  if (!sessionId || !text) {
    throw new Error("sessionId e text sao obrigatorios.");
  }

  const sendResult = await sendWhatsAppMessage(sessionId, { text, quickReplies });
  const status = sendResult.ok ? "sent" : sendResult.skipped ? "skipped" : "failed";
  const providerMessageId = sendResult.body?.messages?.[0]?.id || existingItem?.providerMessageId || "";

  if (existingItem) {
    const outbox = readOutbox();
    const item = outbox.find((entry) => entry.id === existingItem.id);
    if (!item) {
      throw new Error("Mensagem da outbox nao encontrada.");
    }
    item.status = status;
    item.result = sendResult;
    item.providerMessageId = providerMessageId;
    item.quickReplies = quickReplies.length > 0 ? quickReplies : item.quickReplies || [];
    item.updatedAt = new Date().toISOString();
    item.attempts = (item.attempts || 1) + 1;
    writeOutbox(outbox);
    return { item, result: sendResult };
  }

  const item = appendOutbox({
    sessionId,
    channel: "whatsapp",
    text,
    quickReplies,
    status,
    result: sendResult,
    providerMessageId,
    source
  });
  return { item, result: sendResult };
}

function extractWhatsAppStatuses(payload) {
  const statuses = payload.entry?.[0]?.changes?.[0]?.value?.statuses;
  if (!Array.isArray(statuses)) {
    return [];
  }

  return statuses.map((status) => ({
    id: status.id || "",
    status: status.status || "",
    timestamp: status.timestamp || "",
    recipientId: status.recipient_id || "",
    conversationId: status.conversation?.id || "",
    errors: status.errors || []
  })).filter((status) => status.id);
}

function updateOutboxWithWhatsAppStatus(statusUpdate) {
  const outbox = readOutbox();
  const item = outbox.find((entry) => entry.providerMessageId === statusUpdate.id);
  if (!item) {
    return null;
  }

  item.providerStatus = statusUpdate.status;
  item.providerStatusUpdatedAt = new Date().toISOString();
  item.providerStatusPayload = statusUpdate;
  if (statusUpdate.status === "failed") {
    item.status = "failed";
  }
  writeOutbox(outbox);
  return item;
}

async function retryOutboxMessage(id) {
  const normalizedId = typeof id === "string" ? id.trim() : "";
  if (!normalizedId) {
    throw new Error("id e obrigatorio.");
  }
  if (normalizedId.length > 200) {
    throw new Error("id deve ter no maximo 200 caracteres.");
  }

  const item = readOutbox().find((entry) => entry.id === normalizedId);
  if (!item) {
    throw new Error("Mensagem da outbox nao encontrada.");
  }
  if (!["failed", "skipped"].includes(item.status)) {
    throw new Error("Apenas mensagens failed ou skipped podem ser reenviadas.");
  }

  const retry = await sendAndTrackOutbox(item.sessionId, item.text, item.source || "retry", item, item.quickReplies || []);
  appendEvent("outbox.retry", { id: normalizedId, sessionId: item.sessionId, status: retry.item.status });
  return retry;
}

function normalizeSessionId(value, fallback) {
  const normalized = typeof value === "string" ? value.trim() : "";
  const sessionId = normalized || fallback;
  if (sessionId.length > 200) {
    throw new Error("sessionId deve ter no maximo 200 caracteres.");
  }
  return sessionId;
}

function normalizeIncomingText(value) {
  const text = typeof value === "string" ? value.trim() : "";
  if (text.length > 4000) {
    throw new Error("Mensagem deve ter no maximo 4000 caracteres.");
  }
  return text;
}

function deleteSessionData(sessionId) {
  const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!normalizedSessionId) {
    throw new Error("sessionId e obrigatorio.");
  }
  if (normalizedSessionId.length > 200) {
    throw new Error("sessionId deve ter no maximo 200 caracteres.");
  }

  sessions.delete(normalizedSessionId);
  writeSessionsFile();

  const conversations = readConversations();
  const hadConversation = Boolean(conversations[normalizedSessionId]);
  delete conversations[normalizedSessionId];
  writeConversations(conversations);

  const handoffs = readHandoffs();
  const remainingHandoffs = handoffs.filter((handoff) => handoff.sessionId !== normalizedSessionId);
  writeHandoffs(remainingHandoffs);

  const outbox = readOutbox();
  const remainingOutbox = outbox.filter((item) => item.sessionId !== normalizedSessionId);
  writeOutbox(remainingOutbox);

  const rateLimits = readRateLimits();
  delete rateLimits[normalizedSessionId];
  writeRateLimits(rateLimits);

  clearProcessedWebhooksForSession(normalizedSessionId);

  const orders = readOrders();
  let redactedOrders = 0;
  orders.forEach((order) => {
    if (order.sessionId !== normalizedSessionId) return;
    redactedOrders += 1;
    order.sessionId = `redacted-${order.id}`;
    order.updatedAt = new Date().toISOString();
    order.state = {
      ...order.state,
      customerName: "[removido]",
      customerContact: "[removido]",
      address: "[removido]",
      payment: "[removido]",
      notes: "[removido]"
    };
    order.internalNotes = "[removido]";
    order.summary = "Pedido anonimizado por solicitacao de privacidade.";
  });
  writeOrders(orders);

  appendEvent("privacy.session_deleted", {
    sessionId: normalizedSessionId,
    hadConversation,
    removedHandoffs: handoffs.length - remainingHandoffs.length,
    removedOutbox: outbox.length - remainingOutbox.length,
    redactedOrders
  });

  return {
    sessionId: normalizedSessionId,
    hadConversation,
    removedHandoffs: handoffs.length - remainingHandoffs.length,
    removedOutbox: outbox.length - remainingOutbox.length,
    redactedOrders
  };
}

function conversationTranscript(sessionId) {
  const messages = readConversations()[sessionId] || [];
  return [
    `Transcript da sessao: ${sessionId}`,
    `Gerado em: ${new Date().toISOString()}`,
    "",
    ...messages.map((message) => {
      return `[${message.createdAt}] ${message.sender}: ${message.text}`;
    })
  ].join("\n");
}

async function sendManualMessage(sessionId, text) {
  const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  const normalizedText = typeof text === "string" ? text.trim() : "";
  if (!normalizedSessionId || !normalizedText) {
    throw new Error("sessionId e text sao obrigatorios.");
  }
  if (normalizedText.length > 2000) {
    throw new Error("Resposta manual deve ter no maximo 2000 caracteres.");
  }

  appendConversationMessage(normalizedSessionId, "operator", normalizedText, { channel: "manual" });
  const tracked = await sendAndTrackOutbox(normalizedSessionId, normalizedText, "operator");
  appendEvent("operator.message_sent", {
    sessionId: normalizedSessionId,
    status: tracked.item.status
  });

  return tracked.result;
}

function defaultOrderStatusMessages() {
  return {
    pending_confirmation: "{storeName}: recebemos seu pedido {orderId}. Ele esta aguardando confirmacao da loja.",
    confirmed: "{storeName}: seu pedido {orderId} foi confirmado pela loja.",
    cancelled: "{storeName}: seu pedido {orderId} foi cancelado pela loja.",
    done: "{storeName}: seu pedido {orderId} foi finalizado. Obrigado pela preferencia."
  };
}

function fillTemplate(template, values) {
  return String(template || "").replace(/\{([a-zA-Z0-9_]+)\}/g, (match, key) => {
    return values[key] ?? match;
  });
}

function buildOrderStatusNotification(order, config = loadConfig()) {
  const storeName = config.storeName || "loja";
  const statusText = {
    pending_confirmation: "recebido e esta aguardando confirmacao da loja",
    confirmed: "foi confirmado pela loja",
    cancelled: "foi cancelado pela loja",
    done: "foi finalizado"
  };
  const readableStatus = statusText[order.status] || `foi atualizado para ${order.status}`;
  const templates = {
    ...defaultOrderStatusMessages(),
    ...(config.orderStatusMessages || {})
  };
  const template = templates[order.status];

  if (template) {
    return fillTemplate(template, {
      storeName,
      orderId: order.id,
      status: readableStatus,
      customerName: order.state?.customerName || "cliente"
    });
  }

  return [
    `${storeName}: seu pedido ${order.id} ${readableStatus}.`,
    "Se precisar ajustar algo, responda esta mensagem para falar com a loja."
  ].join("\n");
}

function writeRateLimits(rateLimits) {
  writeJsonFile(rateLimitsPath, rateLimits);
}

function writeHandoffs(handoffs) {
  writeJsonFile(handoffsPath, handoffs);
}

function writeEvents(events) {
  writeJsonFile(eventsPath, events.slice(-500));
}

function appendEvent(type, details = {}) {
  const events = readEvents();
  events.push({
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    createdAt: new Date().toISOString(),
    type,
    details
  });
  writeEvents(events);
}

function appendConversationMessage(sessionId, sender, text, meta = {}) {
  const conversations = readConversations();
  const current = conversations[sessionId] || [];
  current.push({
    createdAt: new Date().toISOString(),
    sender,
    text,
    meta
  });
  conversations[sessionId] = current.slice(-200);
  writeConversations(conversations);
}

function findLastConversationText(sessionId, sender = "user") {
  const messages = readConversations()[sessionId] || [];
  return [...messages].reverse().find((message) => message.sender === sender)?.text || "";
}

function createHandoff(sessionId, reason = "Cliente pediu atendente.") {
  const handoffs = readHandoffs();
  const openHandoff = handoffs.find((item) => item.sessionId === sessionId && item.status === "open");
  if (openHandoff) {
    openHandoff.updatedAt = new Date().toISOString();
    openHandoff.reason = reason || openHandoff.reason;
    openHandoff.statusHistory = openHandoff.statusHistory || [];
    writeHandoffs(handoffs);
    return openHandoff;
  }

  const createdAt = new Date().toISOString();
  const handoff = {
    id: `${Date.now()}-${sessionId}`,
    sessionId,
    createdAt,
    updatedAt: createdAt,
    status: "open",
    reason,
    lastMessage: findLastConversationText(sessionId),
    notes: "",
    statusHistory: [
      {
        at: createdAt,
        status: "open",
        type: "created"
      }
    ]
  };
  handoffs.push(handoff);
  writeHandoffs(handoffs);
  appendEvent("handoff.created", { id: handoff.id, sessionId });
  return handoff;
}

function checkRateLimit(sessionId) {
  const limit = Number.parseInt(process.env.MESSAGE_RATE_LIMIT || "30", 10);
  const windowMs = Number.parseInt(process.env.MESSAGE_RATE_WINDOW_MS || "600000", 10);
  if (!Number.isFinite(limit) || limit <= 0) {
    return { allowed: true };
  }

  const now = Date.now();
  const rateLimits = readRateLimits();
  const current = rateLimits[sessionId] || { windowStart: now, count: 0 };
  if (now - current.windowStart > windowMs) {
    current.windowStart = now;
    current.count = 0;
  }

  current.count += 1;
  rateLimits[sessionId] = current;
  writeRateLimits(rateLimits);

  if (current.count > limit) {
    appendEvent("rate_limit.exceeded", { sessionId, limit, windowMs });
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((current.windowStart + windowMs - now) / 1000)
    };
  }

  return { allowed: true };
}

function stockAlerts(catalog) {
  return catalog.filter((item) => {
    if (item.stock === undefined || item.stock === null || item.stock === "") {
      return false;
    }
    const stock = Number(item.stock);
    return Number.isFinite(stock) && stock <= 2;
  });
}

function hasPersistentDataDir() {
  return Boolean(String(process.env.DATA_DIR || "").trim());
}

function publicBaseUrlStatus() {
  const value = String(process.env.PUBLIC_BASE_URL || "").trim();
  return {
    ok: /^https:\/\/[^/]+/i.test(value),
    value
  };
}

function graphVersionStatus() {
  const value = String(process.env.WHATSAPP_GRAPH_VERSION || "v20.0").trim();
  return {
    ok: /^v\d+\.\d+$/.test(value),
    value
  };
}

function rateLimitStatus() {
  const limit = Number.parseInt(process.env.MESSAGE_RATE_LIMIT || "30", 10);
  const windowMs = Number.parseInt(process.env.MESSAGE_RATE_WINDOW_MS || "600000", 10);
  return {
    ok: Number.isInteger(limit) && limit > 0 && Number.isInteger(windowMs) && windowMs > 0,
    limit,
    windowMs
  };
}

function readinessCheck() {
  const config = loadConfig();
  const catalog = loadCatalog();
  const fullCatalog = readCatalog();
  const faqs = loadFaqs();
  const alerts = stockAlerts(fullCatalog);
  const dataIssues = storeDataIssues(config, fullCatalog, readFaqs());
  const adminToken = getAdminToken();
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "";
  const publicUrl = publicBaseUrlStatus();
  const graphVersion = graphVersionStatus();
  const rateLimit = rateLimitStatus();
  const checks = [
    {
      id: "catalog",
      label: "Catalogo com produtos ativos",
      status: catalog.length > 0 ? "ok" : "missing",
      detail: `${catalog.length} produtos ativos`
    },
    {
      id: "faqs",
      label: "Perguntas frequentes cadastradas",
      status: faqs.length > 0 ? "ok" : "warning",
      detail: `${faqs.length} FAQs ativas`
    },
    {
      id: "stock-alerts",
      label: "Alertas de estoque",
      status: alerts.length > 0 ? "warning" : "ok",
      detail: alerts.length > 0 ? `${alerts.length} produto(s) com estoque baixo ou zerado` : "Sem alertas de estoque"
    },
    {
      id: "store-config",
      label: "Configuracao da loja",
      status: config.storeName && config.openingMessage ? "ok" : "missing",
      detail: config.storeName || "Nome da loja nao configurado"
    },
    {
      id: "real-store-data",
      label: "Dados reais da loja",
      status: dataIssues.length === 0 ? "ok" : "warning",
      detail: dataIssues.length === 0 ? "Catalogo, FAQs e configuracao personalizados" : dataIssues.join(" ")
    },
    {
      id: "admin-token",
      label: "Painel protegido por token",
      status: isStrongSecret(adminToken) ? "ok" : "warning",
      detail: isStrongSecret(adminToken)
        ? "ADMIN_TOKEN forte"
        : adminToken
          ? "ADMIN_TOKEN precisa ter pelo menos 32 caracteres e nao ser placeholder"
          : "Sem ADMIN_TOKEN; recomendado apenas para uso local"
    },
    {
      id: "webhook-token",
      label: "Token de verificacao do webhook",
      status: isStrongSecret(verifyToken) ? "ok" : "warning",
      detail: isStrongSecret(verifyToken)
        ? "WHATSAPP_VERIFY_TOKEN forte"
        : verifyToken
          ? "WHATSAPP_VERIFY_TOKEN precisa ter pelo menos 32 caracteres e nao ser placeholder"
          : "Usando dev-token local"
    },
    {
      id: "webhook-signature",
      label: "Assinatura de webhook",
      status: process.env.WHATSAPP_APP_SECRET ? "ok" : "warning",
      detail: process.env.WHATSAPP_APP_SECRET ? "WHATSAPP_APP_SECRET definido" : "Assinatura desligada para testes locais"
    },
    {
      id: "public-base-url",
      label: "URL publica HTTPS",
      status: publicUrl.ok ? "ok" : "warning",
      detail: publicUrl.ok ? publicUrl.value : "Defina PUBLIC_BASE_URL com HTTPS antes de conectar a Meta"
    },
    {
      id: "whatsapp-graph-version",
      label: "Versao da API Graph",
      status: graphVersion.ok ? "ok" : "warning",
      detail: graphVersion.ok ? graphVersion.value : "Use formato como v20.0"
    },
    {
      id: "whatsapp-send",
      label: "Envio pela API da Meta",
      status: canSendWhatsApp() ? "ok" : "warning",
      detail: canSendWhatsApp() ? "Credenciais de envio configuradas" : "Sem WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID"
    },
    {
      id: "rate-limit",
      label: "Limite de mensagens",
      status: rateLimit.ok ? "ok" : "warning",
      detail: rateLimit.ok ? `${rateLimit.limit} mensagens por ${rateLimit.windowMs}ms` : "Configure MESSAGE_RATE_LIMIT e MESSAGE_RATE_WINDOW_MS como inteiros positivos"
    },
    {
      id: "data-dir",
      label: "Diretorio de dados",
      status: hasPersistentDataDir() ? "ok" : "warning",
      detail: hasPersistentDataDir() ? getDataDir() : `${getDataDir()} (defina DATA_DIR persistente em producao)`
    }
  ];

  const readyForProduction = checks.every((check) => check.status === "ok");
  const readyForLocalUse = catalog.length > 0 && Boolean(config.openingMessage);
  return {
    readyForLocalUse,
    readyForProduction,
    checks
  };
}

function writeCatalog(catalog) {
  writeJsonFile(catalogPath, catalog);
  appendEvent("catalog.updated", { count: catalog.length });
}

function writeConfig(config) {
  writeJsonFile(configPath, config);
  appendEvent("config.updated", { storeName: config.storeName });
}

function adjustCatalogStockForOrder(order, nextStatus) {
  const productId = order.state?.selectedProductId;
  const quantity = Number(order.state?.quantity || 1);
  if (!productId || !Number.isFinite(quantity) || quantity <= 0) {
    return null;
  }

  const catalog = readCatalog();
  const product = catalog.find((item) => item.id === productId);
  if (!product || product.stock === undefined || product.stock === null || product.stock === "") {
    return null;
  }

  const currentStock = Number(product.stock);
  if (!Number.isFinite(currentStock)) {
    return null;
  }

  if (nextStatus === "confirmed" && !order.stockReserved) {
    if (currentStock < quantity) {
      return {
        error: `Estoque insuficiente para ${product.name}. Disponivel: ${currentStock}.`
      };
    }
    product.stock = currentStock - quantity;
    order.stockReserved = true;
    writeCatalog(catalog);
    return { productId, reserved: quantity, stock: product.stock };
  }

  if (order.stockReserved && ["cancelled", "pending_confirmation"].includes(nextStatus)) {
    product.stock = currentStock + quantity;
    order.stockReserved = false;
    writeCatalog(catalog);
    return { productId, restored: quantity, stock: product.stock };
  }

  return null;
}

function restoreBackup(backup) {
  validateBackup(backup);
  const preRestoreBackup = writeBackupSnapshot("pre-restore");
  writeJsonFile(configPath, backup.config);
  writeJsonFile(catalogPath, backup.catalog);
  writeJsonFile(faqsPath, backup.faqs || []);
  writeOrders(backup.orders);
  writeJsonFile(sessionsPath, backup.sessions);
  writeConversations(backup.conversations);
  writeEvents(backup.events);
  writeHandoffs(backup.handoffs || []);
  writeOutbox(backup.outbox || []);
  writeRateLimits(backup.rateLimits || {});
  writeProcessedWebhooks(backup.processedWebhooks || {});
  loadSessions();
  appendEvent("backup.restored", {
    orders: backup.orders.length,
    sessions: Object.keys(backup.sessions).length,
    conversations: Object.keys(backup.conversations).length,
    preRestoreBackup
  });
  return { preRestoreBackup };
}

function escapeCsv(value) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function ordersToCsv(orders) {
  const headers = ["id", "createdAt", "updatedAt", "sessionId", "status", "customerName", "customerContact", "payment", "deliveryMode", "address", "notes", "internalNotes", "statusHistory", "summary"];
  const rows = orders.map((order) => {
    const state = order.state || {};
    return [
      order.id,
      order.createdAt,
      order.updatedAt || "",
      order.sessionId,
      order.status,
      state.customerName || "",
      state.customerContact || "",
      state.payment || "",
      state.deliveryMode || "",
      state.address || "",
      state.notes || "",
      order.internalNotes || "",
      JSON.stringify(order.statusHistory || []),
      order.summary || ""
    ].map(escapeCsv).join(",");
  });

  return [headers.join(","), ...rows].join("\n");
}

function eventsToCsv(events) {
  const headers = ["id", "createdAt", "type", "details"];
  const rows = events.map((event) => [
    event.id,
    event.createdAt,
    event.type,
    JSON.stringify(event.details || {})
  ].map(escapeCsv).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function handoffsToCsv(handoffs) {
  const headers = ["id", "createdAt", "updatedAt", "sessionId", "status", "reason", "lastMessage", "notes", "statusHistory"];
  const rows = handoffs.map((handoff) => [
    handoff.id,
    handoff.createdAt,
    handoff.updatedAt || "",
    handoff.sessionId,
    handoff.status,
    handoff.reason || "",
    handoff.lastMessage || "",
    handoff.notes || "",
    JSON.stringify(handoff.statusHistory || [])
  ].map(escapeCsv).join(","));

  return [headers.join(","), ...rows].join("\n");
}

function outboxToCsv(outbox) {
  const headers = ["id", "createdAt", "updatedAt", "sessionId", "status", "providerStatus", "attempts", "source", "text"];
  const rows = outbox.map((item) => [
    item.id,
    item.createdAt,
    item.updatedAt || "",
    item.sessionId,
    item.status,
    item.providerStatus || "",
    item.attempts || 1,
    item.source || "",
    item.text || ""
  ].map(escapeCsv).join(","));
  return [headers.join(","), ...rows].join("\n");
}

function serveStatic(res, publicPrefix, directory, pathname) {
  const relativePath = pathname === publicPrefix
    ? "index.html"
    : decodeURIComponent(pathname.slice(publicPrefix.length + 1));
  const requestedPath = path.resolve(directory, relativePath || "index.html");
  const relativeToDirectory = path.relative(directory, requestedPath);

  if (relativeToDirectory.startsWith("..") || path.isAbsolute(relativeToDirectory)) {
    sendJson(res, 403, { error: "Caminho bloqueado." });
    return true;
  }

  if (!fs.existsSync(requestedPath) || !fs.statSync(requestedPath).isFile()) {
    return false;
  }

  const extension = path.extname(requestedPath);
  const body = fs.readFileSync(requestedPath);
  res.writeHead(200, securityHeaders({ "content-type": mimeTypes[extension] || "application/octet-stream" }));
  res.end(body);
  return true;
}

function getSession(sessionId) {
  if (!sessions.has(sessionId)) {
    sessions.set(sessionId, createConversationState());
  }
  return sessions.get(sessionId);
}

function setSession(sessionId, state) {
  sessions.set(sessionId, state);
  writeSessionsFile();
}

function extractWhatsAppMessage(payload) {
  const metaMessage = payload.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (metaMessage) {
    const interactiveReply = metaMessage.interactive?.button_reply?.title
      || metaMessage.interactive?.button_reply?.id
      || metaMessage.interactive?.list_reply?.title
      || metaMessage.interactive?.list_reply?.id
      || "";
    return {
      sessionId: normalizeSessionId(metaMessage.from, "meta-whatsapp"),
      message: normalizeIncomingText(metaMessage.text?.body || metaMessage.button?.text || interactiveReply),
      messageId: metaMessage.id || ""
    };
  }

  return {
    sessionId: normalizeSessionId(payload.from || payload.phone || payload.sessionId, "demo-whatsapp"),
    message: normalizeIncomingText(payload.text || payload.message || payload.body || ""),
    messageId: payload.id || payload.messageId || ""
  };
}

function validateStoreProfile(profile) {
  validateConfig(profile?.config);
  validateCatalog(profile?.catalog);
  validateFaqs(profile?.faqs || []);
  return storeDataIssues(profile.config, profile.catalog, profile.faqs || []);
}

function buildStoreProfile() {
  return {
    generatedAt: new Date().toISOString(),
    config: loadConfig(),
    catalog: readCatalog(),
    faqs: readFaqs()
  };
}

function applyStoreProfile(profile) {
  const issues = validateStoreProfile(profile);
  if (issues.length > 0) {
    const error = new Error(`Perfil ainda parece conter dados de exemplo: ${issues.join(" ")}`);
    error.statusCode = 400;
    throw error;
  }

  const preStoreProfileBackup = writeBackupSnapshot("pre-store-profile");
  writeJsonFile(configPath, profile.config);
  writeJsonFile(catalogPath, profile.catalog);
  writeJsonFile(faqsPath, profile.faqs || []);
  appendEvent("store_profile.applied", {
    storeName: profile.config.storeName,
    products: profile.catalog.length,
    faqs: (profile.faqs || []).length
  });
  return { preStoreProfileBackup };
}

async function route(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const adminDirectory = path.join(root, "admin");
  const prototypeDirectory = path.join(root, "prototype");

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (!isAuthorized(req, url)) {
    sendJson(res, 401, { error: "Nao autorizado. Envie Authorization: Bearer ADMIN_TOKEN ou use ?token=ADMIN_TOKEN." });
    return;
  }

  if (req.method === "GET" && url.pathname === "/") {
    redirect(res, "/admin");
    return;
  }

  if (req.method === "GET" && (url.pathname === "/admin" || url.pathname.startsWith("/admin/"))) {
    if (serveStatic(res, "/admin", adminDirectory, url.pathname)) {
      return;
    }
  }

  if (req.method === "GET" && (url.pathname === "/prototype" || url.pathname.startsWith("/prototype/"))) {
    if (serveStatic(res, "/prototype", prototypeDirectory, url.pathname)) {
      return;
    }
  }

  if (req.method === "GET" && url.pathname === "/health") {
    sendJson(res, 200, {
      ok: true,
      service: "chatbot-whatsapp-loja",
      whatsappSendConfigured: canSendWhatsApp(),
      adminProtected: Boolean(getAdminToken())
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/openapi.json") {
    sendJson(res, 200, JSON.parse(fs.readFileSync(path.join(root, "docs", "openapi.json"), "utf8")));
    return;
  }

  if (req.method === "GET" && url.pathname === "/ready") {
    sendJson(res, 200, readinessCheck());
    return;
  }

  if (req.method === "GET" && url.pathname === "/config") {
    sendJson(res, 200, { config: loadConfig() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/config") {
    const payload = await readBody(req);
    validateConfig(payload.config);
    writeConfig(payload.config);
    sendJson(res, 200, { config: loadConfig() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/catalog") {
    sendJson(res, 200, { catalog: readCatalog() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/catalog") {
    const payload = await readBody(req);
    validateCatalog(payload.catalog);
    writeCatalog(payload.catalog);
    sendJson(res, 200, { catalog: readCatalog() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/faqs") {
    sendJson(res, 200, { faqs: readFaqs() });
    return;
  }

  if (req.method === "POST" && url.pathname === "/faqs") {
    const payload = await readBody(req);
    validateFaqs(payload.faqs);
    writeJsonFile(faqsPath, payload.faqs);
    appendEvent("faqs.updated", { count: payload.faqs.length });
    sendJson(res, 200, { faqs: readFaqs() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/store-profile.json") {
    res.writeHead(200, securityHeaders({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": "attachment; filename=\"perfil-da-loja-chatbot.json\""
    }));
    res.end(`${JSON.stringify(buildStoreProfile(), null, 2)}\n`);
    return;
  }

  if (req.method === "POST" && url.pathname === "/store-profile/validate") {
    const payload = await readBody(req);
    const profile = payload.profile || payload;
    const issues = validateStoreProfile(profile);
    sendJson(res, 200, {
      ok: issues.length === 0,
      issues,
      products: profile.catalog.length,
      faqs: (profile.faqs || []).length,
      storeName: profile.config.storeName
    });
    return;
  }

  if (req.method === "POST" && url.pathname === "/store-profile/apply") {
    const payload = await readBody(req);
    if (payload.confirmApply !== true) {
      sendJson(res, 400, { error: "confirmApply=true e obrigatorio para aplicar perfil da loja." });
      return;
    }
    const profile = payload.profile || {};
    const result = applyStoreProfile(profile);
    sendJson(res, 200, {
      ok: true,
      preStoreProfileBackup: result.preStoreProfileBackup,
      config: loadConfig(),
      catalog: readCatalog(),
      faqs: readFaqs()
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/orders") {
    sendJson(res, 200, { orders: readOrders() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/conversations") {
    sendJson(res, 200, { conversations: readConversations() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/conversations.json") {
    res.writeHead(200, securityHeaders({
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": "attachment; filename=\"conversas-chatbot.json\""
    }));
    res.end(`${JSON.stringify(readConversations(), null, 2)}\n`);
    return;
  }

  if (req.method === "GET" && url.pathname === "/conversations/export") {
    const sessionId = normalizeSessionId(url.searchParams.get("sessionId") || "", "");
    if (!sessionId) {
      sendJson(res, 400, { error: "sessionId e obrigatorio." });
      return;
    }
    res.writeHead(200, securityHeaders({
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": `attachment; filename="transcript-${encodeURIComponent(sessionId)}.txt"`
    }));
    res.end(conversationTranscript(sessionId));
    return;
  }

  if (req.method === "POST" && url.pathname === "/conversations/clear") {
    writeConversations({});
    appendEvent("conversations.cleared");
    sendJson(res, 200, { conversations: {} });
    return;
  }

  if (req.method === "GET" && url.pathname === "/events") {
    sendJson(res, 200, { events: readEvents().slice(-100).reverse() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/events.csv") {
    res.writeHead(200, securityHeaders({
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": "attachment; filename=\"eventos-chatbot.csv\""
    }));
    res.end(eventsToCsv(readEvents()));
    return;
  }

  if (req.method === "GET" && url.pathname === "/handoffs") {
    sendJson(res, 200, { handoffs: readHandoffs().slice().reverse() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/handoffs.csv") {
    res.writeHead(200, securityHeaders({
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": "attachment; filename=\"atendimentos-chatbot.csv\""
    }));
    res.end(handoffsToCsv(readHandoffs()));
    return;
  }

  if (req.method === "GET" && url.pathname === "/outbox") {
    sendJson(res, 200, { outbox: readOutbox().slice().reverse() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/outbox.csv") {
    res.writeHead(200, securityHeaders({
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": "attachment; filename=\"saida-chatbot.csv\""
    }));
    res.end(outboxToCsv(readOutbox()));
    return;
  }

  if (req.method === "POST" && url.pathname === "/outbox/clear") {
    writeOutbox([]);
    appendEvent("outbox.cleared");
    sendJson(res, 200, { outbox: [] });
    return;
  }

  if (req.method === "POST" && url.pathname === "/outbox/retry") {
    const payload = await readBody(req);
    const retry = await retryOutboxMessage(payload.id);
    sendJson(res, 200, { outboxItem: retry.item, result: retry.result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/rate-limits/clear") {
    writeRateLimits({});
    appendEvent("rate_limits.cleared");
    sendJson(res, 200, { rateLimits: {} });
    return;
  }

  if (req.method === "POST" && url.pathname === "/processed-webhooks/clear") {
    writeProcessedWebhooks({});
    appendEvent("processed_webhooks.cleared");
    sendJson(res, 200, { processedWebhooks: {} });
    return;
  }

  if (req.method === "POST" && url.pathname === "/messages/send") {
    const payload = await readBody(req);
    const result = await sendManualMessage(payload.sessionId, payload.text);
    sendJson(res, 200, { result });
    return;
  }

  if (req.method === "POST" && url.pathname === "/privacy/delete-session") {
    const payload = await readBody(req);
    sendJson(res, 200, deleteSessionData(payload.sessionId));
    return;
  }

  if (req.method === "POST" && url.pathname === "/handoffs/status") {
    const payload = await readBody(req);
    const handoffId = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!handoffId) {
      sendJson(res, 400, { error: "id e obrigatorio." });
      return;
    }
    if (handoffId.length > 200) {
      sendJson(res, 400, { error: "id deve ter no maximo 200 caracteres." });
      return;
    }
    const handoffs = readHandoffs();
    const handoff = handoffs.find((item) => item.id === handoffId);
    if (!handoff) {
      sendJson(res, 404, { error: "Atendimento nao encontrado." });
      return;
    }

    const nextStatus = payload.status || handoff.status;
    if (!isValidHandoffStatus(nextStatus)) {
      sendJson(res, 400, { error: "Status de atendimento invalido." });
      return;
    }

    const previousStatus = handoff.status;
    handoff.status = nextStatus;
    handoff.notes = payload.notes ?? handoff.notes;
    handoff.updatedAt = new Date().toISOString();
    handoff.statusHistory = handoff.statusHistory || [];
    handoff.statusHistory.push({
      at: handoff.updatedAt,
      status: handoff.status,
      previousStatus,
      type: "status_updated",
      hasNotes: Boolean(handoff.notes)
    });
    writeHandoffs(handoffs);
    appendEvent("handoff.status_updated", { id: handoff.id, status: handoff.status });
    sendJson(res, 200, { handoff });
    return;
  }

  if (req.method === "POST" && url.pathname === "/events/clear") {
    writeEvents([]);
    sendJson(res, 200, { events: [] });
    return;
  }

  if (req.method === "GET" && url.pathname === "/backup.json") {
    sendJson(res, 200, buildBackup());
    return;
  }

  if (req.method === "POST" && url.pathname === "/backup/restore") {
    const payload = await readBody(req);
    if (payload.confirmRestore !== true) {
      sendJson(res, 400, { error: "confirmRestore=true e obrigatorio para restaurar backup." });
      return;
    }
    const restoreResult = restoreBackup(payload.backup);
    sendJson(res, 200, {
      ok: true,
      preRestoreBackup: restoreResult.preRestoreBackup,
      orders: readOrders().length,
      sessions: Object.keys(readSessions()).length,
      conversations: Object.keys(readConversations()).length,
      handoffs: readHandoffs().length,
      outbox: readOutbox().length,
      rateLimits: Object.keys(readRateLimits()).length,
      processedWebhooks: Object.keys(readProcessedWebhooks()).length
    });
    return;
  }

  if (req.method === "GET" && url.pathname === "/orders.csv") {
    const csv = ordersToCsv(readOrders());
    res.writeHead(200, securityHeaders({
      "content-type": "text/csv; charset=utf-8",
      "cache-control": "no-store",
      "content-disposition": "attachment; filename=\"pedidos-chatbot.csv\""
    }));
    res.end(csv);
    return;
  }

  if (req.method === "POST" && url.pathname === "/orders/status") {
    const payload = await readBody(req);
    const orderId = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!orderId) {
      sendJson(res, 400, { error: "id e obrigatorio." });
      return;
    }
    if (orderId.length > 200) {
      sendJson(res, 400, { error: "id deve ter no maximo 200 caracteres." });
      return;
    }
    const orders = readOrders();
    const order = orders.find((item) => item.id === orderId);
    if (!order) {
      sendJson(res, 404, { error: "Pedido nao encontrado." });
      return;
    }

    const nextStatus = payload.status || order.status;
    if (!isValidOrderStatus(nextStatus)) {
      sendJson(res, 400, { error: "Status de pedido invalido." });
      return;
    }

    const stockAdjustment = adjustCatalogStockForOrder(order, nextStatus);
    if (stockAdjustment?.error) {
      sendJson(res, 409, { error: stockAdjustment.error });
      return;
    }

    const previousStatus = order.status;
    order.status = nextStatus;
    order.internalNotes = payload.internalNotes ?? payload.notes ?? order.internalNotes ?? "";
    order.updatedAt = new Date().toISOString();

    let notification = null;
    if (payload.notifyCustomer) {
      if (String(order.sessionId || "").startsWith("redacted-")) {
        notification = {
          skipped: true,
          error: "Pedido anonimizado; cliente nao pode ser notificado."
        };
      } else {
        const notificationText = payload.notificationText || buildOrderStatusNotification(order);
        notification = await sendManualMessage(order.sessionId, notificationText);
        appendEvent("order.customer_notified", {
          id: order.id,
          sessionId: order.sessionId,
          status: order.status
        });
      }
    }

    order.statusHistory = order.statusHistory || [];
    order.statusHistory.push({
      at: order.updatedAt,
      status: order.status,
      previousStatus,
      type: "status_updated",
      notified: Boolean(notification),
      stockAdjustment,
      hasInternalNotes: Boolean(order.internalNotes)
    });
    writeOrders(orders);
    appendEvent("order.status_updated", {
      id: order.id,
      status: order.status,
      previousStatus,
      hasInternalNotes: Boolean(order.internalNotes),
      stockAdjustment
    });

    sendJson(res, 200, { order, notification, stockAdjustment });
    return;
  }

  if (req.method === "POST" && url.pathname === "/orders/clear") {
    writeOrders([]);
    appendEvent("orders.cleared");
    sendJson(res, 200, { orders: [] });
    return;
  }

  if (req.method === "POST" && url.pathname === "/sessions/reset") {
    const payload = await readBody(req);
    const hasSessionId = payload.sessionId !== undefined && payload.sessionId !== null;
    const normalizedSessionId = hasSessionId && typeof payload.sessionId === "string"
      ? payload.sessionId.trim()
      : "";
    if (hasSessionId && !normalizedSessionId) {
      sendJson(res, 400, { error: "sessionId deve ser texto preenchido quando informado." });
      return;
    }
    if (normalizedSessionId.length > 200) {
      sendJson(res, 400, { error: "sessionId deve ter no maximo 200 caracteres." });
      return;
    }

    if (normalizedSessionId) {
      sessions.delete(normalizedSessionId);
    } else {
      sessions.clear();
    }
    writeSessionsFile();
    if (normalizedSessionId) {
      const rateLimits = readRateLimits();
      delete rateLimits[normalizedSessionId];
      writeRateLimits(rateLimits);
      clearProcessedWebhooksForSession(normalizedSessionId);
    } else {
      writeRateLimits({});
      clearProcessedWebhooksForSession();
    }
    appendEvent("sessions.reset", { sessionId: normalizedSessionId || "all" });
    sendJson(res, 200, { ok: true, sessionId: normalizedSessionId || null, scope: normalizedSessionId ? "session" : "all" });
    return;
  }

  if (req.method === "GET" && url.pathname === "/webhooks/whatsapp") {
    const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "dev-token";
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === verifyToken && challenge) {
      sendText(res, 200, challenge);
      return;
    }

    sendText(res, 403, "Token de verificacao invalido.");
    return;
  }

  if (req.method === "POST" && (url.pathname === "/chat" || url.pathname === "/webhooks/whatsapp")) {
    const payload = await readBody(req);
    const isWhatsAppWebhook = url.pathname === "/webhooks/whatsapp";
    if (isWhatsAppWebhook && !isValidSignature(req.headers["x-hub-signature-256"], payload.__rawBody, process.env.WHATSAPP_APP_SECRET || "")) {
      appendEvent("whatsapp.signature_rejected");
      sendJson(res, 403, { error: "Assinatura do webhook invalida." });
      return;
    }

    if (isWhatsAppWebhook) {
      const statusUpdates = extractWhatsAppStatuses(payload);
      if (statusUpdates.length > 0) {
        const updated = statusUpdates.map(updateOutboxWithWhatsAppStatus).filter(Boolean);
        appendEvent("whatsapp.statuses_processed", {
          count: statusUpdates.length,
          updated: updated.length
        });
        sendJson(res, 200, {
          statuses: statusUpdates,
          updatedOutboxItems: updated.length,
          messages: [],
          outbound: []
        });
        return;
      }
    }

    const incoming = url.pathname === "/webhooks/whatsapp"
      ? extractWhatsAppMessage(payload)
      : {
          sessionId: normalizeSessionId(payload.sessionId, "demo"),
          message: normalizeIncomingText(payload.message || ""),
          messageId: ""
        };

    if (isWhatsAppWebhook) {
      const processed = markWebhookProcessed(incoming.messageId, incoming.sessionId);
      if (processed.duplicate) {
        appendEvent("whatsapp.webhook_duplicate", { sessionId: incoming.sessionId, messageId: incoming.messageId });
        sendJson(res, 200, {
          sessionId: incoming.sessionId,
          messageId: incoming.messageId,
          duplicate: true,
          messages: [],
          outbound: []
        });
        return;
      }
    }

    if (isWhatsAppWebhook && !incoming.message) {
      appendEvent("whatsapp.webhook_ignored", { sessionId: incoming.sessionId, reason: "empty_message" });
      sendJson(res, 200, {
        sessionId: incoming.sessionId,
        ignored: true,
        reason: "empty_message",
        messages: [],
        outbound: []
      });
      return;
    }

    const rateLimit = checkRateLimit(incoming.sessionId);
    if (!rateLimit.allowed) {
      sendJson(res, 429, {
        error: "Muitas mensagens em pouco tempo. Tente novamente mais tarde.",
        retryAfterSeconds: rateLimit.retryAfterSeconds
      });
      return;
    }

    const previousState = getSession(incoming.sessionId);
    appendConversationMessage(incoming.sessionId, "user", incoming.message, { channel: isWhatsAppWebhook ? "whatsapp" : "local" });
    const result = handleMessage(incoming.message, previousState);
    setSession(incoming.sessionId, result.state);
    result.messages.forEach((message) => {
      appendConversationMessage(incoming.sessionId, "bot", message.text, { quickReplies: message.quickReplies || [] });
    });

    let order = null;
    if (result.state.completed && !previousState.completed) {
      order = saveOrder(incoming.sessionId, result.state);
      appendEvent("order.created", { id: order.id, sessionId: incoming.sessionId });
    }

    let handoff = null;
    if (result.state.needsHuman && !previousState.needsHuman) {
      handoff = createHandoff(incoming.sessionId, incoming.message || "Cliente pediu atendente.");
    }

    const outbound = [];
    if (isWhatsAppWebhook) {
      for (const message of result.messages) {
        const tracked = await sendAndTrackOutbox(incoming.sessionId, message.text, "bot", null, message.quickReplies || []);
        outbound.push(tracked.result);
      }
      appendEvent("whatsapp.webhook_processed", { sessionId: incoming.sessionId, outboundCount: outbound.length });
    }

    sendJson(res, 200, {
      sessionId: incoming.sessionId,
      messages: result.messages,
      state: result.state,
      order,
      handoff,
      outbound
    });
    return;
  }

  if (req.method === "GET") {
    sendText(res, 404, "Pagina nao encontrada.");
    return;
  }

  sendJson(res, 404, { error: "Rota nao encontrada." });
}

const server = http.createServer((req, res) => {
  route(req, res).catch((error) => {
    sendJson(res, error.statusCode || 400, { error: error.message });
  });
});

loadSessions();

server.listen(port, () => {
  console.log(`Chatbot local ouvindo em http://localhost:${port}`);
});
