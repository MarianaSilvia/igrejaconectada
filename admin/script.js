const state = {
  catalog: [],
  faqs: [],
  config: null,
  readiness: null,
  orders: [],
  handoffs: [],
  conversations: {},
  events: [],
  outbox: [],
  testerSessionId: `admin-${Date.now()}`,
  adminToken: "",
  lastRefreshAt: null,
  orderFilters: {
    query: "",
    status: "all"
  },
  handoffFilters: {
    query: "",
    status: "all"
  }
};

const catalogList = document.querySelector("#catalog-list");
const faqList = document.querySelector("#faq-list");
const readinessList = document.querySelector("#readiness-list");
const ordersList = document.querySelector("#orders-list");
const handoffsList = document.querySelector("#handoffs-list");
const testerLog = document.querySelector("#tester-log");
const testerForm = document.querySelector("#tester-form");
const testerInput = document.querySelector("#tester-input");
const metricProducts = document.querySelector("#metric-products");
const metricStockAlerts = document.querySelector("#metric-stock-alerts");
const metricOrders = document.querySelector("#metric-orders");
const metricPending = document.querySelector("#metric-pending");
const metricConversations = document.querySelector("#metric-conversations");
const metricHandoffs = document.querySelector("#metric-handoffs");
const metricOutbox = document.querySelector("#metric-outbox");
const exportOrders = document.querySelector("#export-orders");
const exportHandoffs = document.querySelector("#export-handoffs");
const orderSearch = document.querySelector("#order-search");
const orderStatusFilter = document.querySelector("#order-status-filter");
const clearOrderFilters = document.querySelector("#clear-order-filters");
const handoffSearch = document.querySelector("#handoff-search");
const handoffStatusFilter = document.querySelector("#handoff-status-filter");
const clearHandoffFilters = document.querySelector("#clear-handoff-filters");
const downloadBackup = document.querySelector("#download-backup");
const downloadStoreProfile = document.querySelector("#download-store-profile");
const exportConversations = document.querySelector("#export-conversations");
const exportEvents = document.querySelector("#export-events");
const exportOutbox = document.querySelector("#export-outbox");
const restoreBackupFile = document.querySelector("#restore-backup-file");
const validateStoreProfileFile = document.querySelector("#validate-store-profile-file");
const applyStoreProfileFile = document.querySelector("#apply-store-profile-file");
const storeProfileStatus = document.querySelector("#store-profile-status");
const eventsList = document.querySelector("#events-list");
const conversationsList = document.querySelector("#conversations-list");
const outboxList = document.querySelector("#outbox-list");
const authPanel = document.querySelector("#auth-panel");
const authForm = document.querySelector("#auth-form");
const authToken = document.querySelector("#auth-token");
const logoutButton = document.querySelector("#logout");
const refreshStatus = document.querySelector("#refresh-status");
const metricsSection = document.querySelector(".metrics");
const layoutSection = document.querySelector(".layout");
const configFields = {
  storeName: document.querySelector("#config-store-name"),
  currency: document.querySelector("#config-currency"),
  openingMessage: document.querySelector("#config-opening"),
  deliveryInfo: document.querySelector("#config-delivery"),
  pickupInfo: document.querySelector("#config-pickup"),
  paymentInfo: document.querySelector("#config-payment"),
  paymentMethods: document.querySelector("#config-payment-methods"),
  deliveryZones: document.querySelector("#config-delivery-zones"),
  humanHandoffMessage: document.querySelector("#config-handoff"),
  businessTimezone: document.querySelector("#config-business-timezone"),
  businessHours: document.querySelector("#config-business-hours"),
  handoffRules: document.querySelector("#config-handoff-rules"),
  handoffKeywords: document.querySelector("#config-handoff-keywords"),
  orderPending: document.querySelector("#config-order-pending"),
  orderConfirmed: document.querySelector("#config-order-confirmed"),
  orderCancelled: document.querySelector("#config-order-cancelled"),
  orderDone: document.querySelector("#config-order-done")
};
const whatsappFields = {
  webhookUrl: document.querySelector("#whatsapp-webhook-url"),
  verifyUrl: document.querySelector("#whatsapp-verify-url"),
  testCommand: document.querySelector("#whatsapp-test-command")
};

function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2400);
}

function confirmAction(message) {
  return window.confirm(message);
}

function loadAdminToken() {
  const params = new URLSearchParams(window.location.search);
  const tokenFromUrl = params.get("token");
  if (tokenFromUrl) {
    window.localStorage.setItem("chatbotAdminToken", tokenFromUrl);
    state.adminToken = tokenFromUrl;
    return;
  }

  state.adminToken = window.localStorage.getItem("chatbotAdminToken") || "";
}

function setAuthenticatedView(isAuthenticated) {
  authPanel.hidden = isAuthenticated;
  metricsSection.hidden = !isAuthenticated;
  layoutSection.hidden = !isAuthenticated;
  logoutButton.hidden = !state.adminToken;
  if (!isAuthenticated) {
    authToken.focus();
  }
}

function withToken(path) {
  if (!state.adminToken) {
    return path;
  }

  const url = new URL(path, window.location.origin);
  url.searchParams.set("token", state.adminToken);
  return `${url.pathname}${url.search}`;
}

async function api(path, options = {}) {
  const headers = { "content-type": "application/json", ...(options.headers || {}) };
  if (state.adminToken) {
    headers.authorization = `Bearer ${state.adminToken}`;
  }

  const response = await fetch(path, {
    headers,
    ...options
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || "Erro na requisicao.");
    error.status = response.status;
    throw error;
  }
  return data;
}

function updateMetrics() {
  metricProducts.textContent = state.catalog.filter((item) => item.available !== false).length;
  metricStockAlerts.textContent = state.catalog.filter((item) => stockStatus(item) !== "ok").length;
  metricOrders.textContent = state.orders.length;
  metricPending.textContent = state.orders.filter((order) => order.status === "pending_confirmation").length;
  metricConversations.textContent = Object.keys(state.conversations).length;
  metricHandoffs.textContent = state.handoffs.filter((handoff) => handoff.status === "open").length;
  metricOutbox.textContent = state.outbox.length;
}

function setRefreshStatus(message) {
  refreshStatus.textContent = message;
}

function markDashboardRefreshed() {
  state.lastRefreshAt = new Date();
  setRefreshStatus(`Atualizado ${state.lastRefreshAt.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`);
}

function isEditingDashboard() {
  const active = document.activeElement;
  if (!active) return false;
  if (!["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName)) return false;
  return Boolean(active.closest(".layout"));
}

function updateProtectedLinks() {
  exportOrders.href = withToken("/orders.csv");
  exportHandoffs.href = withToken("/handoffs.csv");
  downloadBackup.href = withToken("/backup.json");
  downloadStoreProfile.href = withToken("/store-profile.json");
  exportConversations.href = withToken("/conversations.json");
  exportEvents.href = withToken("/events.csv");
  exportOutbox.href = withToken("/outbox.csv");
}

function stockStatus(item) {
  if (item.stock === undefined || item.stock === null || item.stock === "") {
    return "ok";
  }
  const stock = Number(item.stock);
  if (!Number.isFinite(stock)) {
    return "ok";
  }
  if (stock <= 0) {
    return "out";
  }
  if (stock <= 2) {
    return "low";
  }
  return "ok";
}

function productTemplate(item) {
  const row = document.createElement("div");
  const status = stockStatus(item);
  row.className = `product-row stock-${status}`;
  row.dataset.id = item.id;
  row.innerHTML = `
    <label>ID<input data-field="id" value="${escapeHtml(item.id)}" /></label>
    <label>Nome<input data-field="name" value="${escapeHtml(item.name)}" /></label>
    <label>Categoria<input data-field="category" value="${escapeHtml(item.category || "")}" /></label>
    <label>Preco<input data-field="price" type="number" step="0.01" min="0" value="${Number(item.price).toFixed(2)}" /></label>
    <label>Estoque<input data-field="stock" type="number" step="1" min="0" value="${item.stock ?? ""}" placeholder="Livre" /></label>
    <label>Descricao<textarea data-field="description">${escapeHtml(item.description || "")}</textarea></label>
    <label class="check-label"><input data-field="available" type="checkbox" ${item.available !== false ? "checked" : ""} /> Disponivel</label>
    <span class="stock-badge">${status === "out" ? "Esgotado" : status === "low" ? "Baixo" : "OK"}</span>
    <button class="danger" type="button" data-action="remove">Remover</button>
  `;
  return row;
}

function renderCatalog() {
  catalogList.innerHTML = "";
  if (state.catalog.length === 0) {
    catalogList.innerHTML = `<div class="empty">Nenhum produto cadastrado.</div>`;
    return;
  }

  state.catalog.forEach((item) => catalogList.appendChild(productTemplate(item)));
}

function faqTemplate(item) {
  const row = document.createElement("div");
  row.className = "faq-row";
  row.innerHTML = `
    <label>ID<input data-field="id" value="${escapeHtml(item.id)}" /></label>
    <label>Pergunta<input data-field="question" value="${escapeHtml(item.question)}" /></label>
    <label>Resposta<textarea data-field="answer">${escapeHtml(item.answer || "")}</textarea></label>
    <label>Palavras-chave<textarea data-field="keywords">${escapeHtml((item.keywords || []).join(", "))}</textarea></label>
    <label class="check-label"><input data-field="active" type="checkbox" ${item.active !== false ? "checked" : ""} /> Ativa</label>
    <button class="danger" type="button" data-action="remove-faq">Remover</button>
  `;
  return row;
}

function renderFaqs() {
  faqList.innerHTML = "";
  if (state.faqs.length === 0) {
    faqList.innerHTML = `<div class="empty">Nenhuma FAQ cadastrada.</div>`;
    return;
  }

  state.faqs.forEach((item) => faqList.appendChild(faqTemplate(item)));
}

function renderConfig() {
  const config = state.config;
  if (!config) return;

  configFields.storeName.value = config.storeName || "";
  configFields.currency.value = config.currency || "BRL";
  configFields.openingMessage.value = config.openingMessage || "";
  configFields.deliveryInfo.value = config.deliveryInfo || "";
  configFields.pickupInfo.value = config.pickupInfo || "";
  configFields.paymentInfo.value = config.paymentInfo || "";
  configFields.paymentMethods.value = paymentMethodsToText(config.paymentMethods);
  configFields.deliveryZones.value = deliveryZonesToText(config.deliveryZones);
  configFields.humanHandoffMessage.value = config.humanHandoffMessage || "";
  configFields.businessTimezone.value = config.businessHours?.timezone || "America/Sao_Paulo";
  configFields.businessHours.value = businessHoursToText(config.businessHours);
  configFields.handoffRules.value = (config.handoffRules || []).join("\n");
  configFields.handoffKeywords.value = (config.handoffKeywords || []).join(", ");
  configFields.orderPending.value = config.orderStatusMessages?.pending_confirmation || "";
  configFields.orderConfirmed.value = config.orderStatusMessages?.confirmed || "";
  configFields.orderCancelled.value = config.orderStatusMessages?.cancelled || "";
  configFields.orderDone.value = config.orderStatusMessages?.done || "";
}

function renderReadiness() {
  readinessList.innerHTML = "";
  if (!state.readiness) {
    readinessList.innerHTML = `<div class="empty">Status de prontidao indisponivel.</div>`;
    return;
  }

  state.readiness.checks.forEach((check) => {
    const item = document.createElement("div");
    item.className = `readiness-item ${check.status}`;
    item.innerHTML = `
      <span>${escapeHtml(check.status)}</span>
      <strong>${escapeHtml(check.label)}</strong>
      <p>${escapeHtml(check.detail)}</p>
    `;
    readinessList.appendChild(item);
  });
}

function renderWhatsAppInfo() {
  const webhookUrl = `${window.location.origin}/webhooks/whatsapp`;
  whatsappFields.webhookUrl.value = webhookUrl;
  whatsappFields.verifyUrl.value = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=SEU_TOKEN&hub.challenge=ok`;
  whatsappFields.testCommand.value = `node scripts\\verify-whatsapp.js ${window.location.origin}`;
}

function renderOrders() {
  ordersList.innerHTML = "";
  if (state.orders.length === 0) {
    ordersList.innerHTML = `<div class="empty">Nenhum pedido ainda. Use o teste rapido ou o prototipo para criar um.</div>`;
    return;
  }

  const query = state.orderFilters.query.trim().toLowerCase();
  const filteredOrders = state.orders
    .filter((order) => {
      const statusMatches = state.orderFilters.status === "all" || order.status === state.orderFilters.status;
      if (!statusMatches) return false;
      if (!query) return true;

      const searchable = [
        order.id,
        order.sessionId,
        order.status,
        order.summary,
        order.internalNotes,
        order.state?.customerName,
        order.state?.deliveryMode,
        order.state?.address,
        order.state?.payment,
        order.state?.notes
      ].filter(Boolean).join(" ").toLowerCase();

      return searchable.includes(query);
    });

  if (filteredOrders.length === 0) {
    ordersList.innerHTML = `<div class="empty">Nenhum pedido encontrado com esses filtros.</div>`;
    return;
  }

  filteredOrders
    .slice()
    .reverse()
    .forEach((order) => {
      const card = document.createElement("article");
      card.className = "order-card";
      card.innerHTML = `
        <strong>${escapeHtml(order.id)}</strong>
        <p>${new Date(order.createdAt).toLocaleString("pt-BR")}</p>
        <pre>${escapeHtml(order.summary)}</pre>
        <select data-order-status="${escapeHtml(order.id)}">
          <option value="pending_confirmation">Pendente</option>
          <option value="confirmed">Confirmado</option>
          <option value="cancelled">Cancelado</option>
          <option value="done">Finalizado</option>
        </select>
        <textarea data-order-notes="${escapeHtml(order.id)}" placeholder="Notas internas do pedido...">${escapeHtml(order.internalNotes || "")}</textarea>
        ${renderOrderHistory(order)}
        <div class="button-row">
          <button type="button" data-order-save="${escapeHtml(order.id)}">Salvar pedido</button>
          <button type="button" data-order-notify="${escapeHtml(order.id)}">Salvar e avisar cliente</button>
        </div>
      `;
      card.querySelector("select").value = order.status;
      ordersList.appendChild(card);
    });
}

function renderOrderHistory(order) {
  const history = (order.statusHistory || []).slice(-5).reverse();
  if (history.length === 0) {
    return "";
  }

  return `
    <div class="order-history">
      <strong>Historico</strong>
      ${history.map((item) => `
        <p>${new Date(item.at).toLocaleString("pt-BR")} - ${escapeHtml(item.status)}${item.notified ? " - cliente avisado" : ""}${item.stockAdjustment ? " - estoque ajustado" : ""}</p>
      `).join("")}
    </div>
  `;
}

function renderHandoffHistory(handoff) {
  const history = (handoff.statusHistory || []).slice(-5).reverse();
  if (history.length === 0) {
    return "";
  }

  return `
    <div class="handoff-history">
      <strong>Historico</strong>
      ${history.map((item) => `
        <p>${new Date(item.at).toLocaleString("pt-BR")} - ${escapeHtml(item.status)}${item.hasNotes ? " - notas salvas" : ""}</p>
      `).join("")}
    </div>
  `;
}

function renderHandoffs() {
  handoffsList.innerHTML = "";
  if (state.handoffs.length === 0) {
    handoffsList.innerHTML = `<div class="empty">Nenhum atendimento humano aberto.</div>`;
    return;
  }

  const query = state.handoffFilters.query.trim().toLowerCase();
  const filteredHandoffs = state.handoffs.filter((handoff) => {
    const statusMatches = state.handoffFilters.status === "all" || handoff.status === state.handoffFilters.status;
    if (!statusMatches) return false;
    if (!query) return true;

    const searchable = [
      handoff.id,
      handoff.sessionId,
      handoff.status,
      handoff.reason,
      handoff.lastMessage,
      handoff.notes
    ].filter(Boolean).join(" ").toLowerCase();

    return searchable.includes(query);
  });

  if (filteredHandoffs.length === 0) {
    handoffsList.innerHTML = `<div class="empty">Nenhum atendimento encontrado com esses filtros.</div>`;
    return;
  }

  filteredHandoffs.slice(0, 20).forEach((handoff) => {
    const card = document.createElement("article");
    card.className = "handoff-card";
    card.innerHTML = `
      <strong>${escapeHtml(handoff.sessionId)}</strong>
      <p>${new Date(handoff.createdAt).toLocaleString("pt-BR")} - ${escapeHtml(handoff.reason)}</p>
      <p>${escapeHtml(handoff.lastMessage || "")}</p>
      <select data-handoff-status="${escapeHtml(handoff.id)}">
        <option value="open">Aberto</option>
        <option value="in_progress">Em atendimento</option>
        <option value="resolved">Resolvido</option>
        <option value="cancelled">Cancelado</option>
      </select>
      <textarea data-handoff-notes="${escapeHtml(handoff.id)}" placeholder="Notas internas...">${escapeHtml(handoff.notes || "")}</textarea>
      ${renderHandoffHistory(handoff)}
      <textarea data-handoff-reply="${escapeHtml(handoff.id)}" placeholder="Resposta para o cliente..."></textarea>
      <div class="button-row">
        <button type="button" data-handoff-save="${escapeHtml(handoff.id)}">Salvar atendimento</button>
        <button type="button" data-handoff-send="${escapeHtml(handoff.id)}">Enviar resposta</button>
      </div>
    `;
    card.querySelector("select").value = handoff.status;
    handoffsList.appendChild(card);
  });
}

function renderEvents() {
  eventsList.innerHTML = "";
  if (state.events.length === 0) {
    eventsList.innerHTML = `<div class="empty">Nenhum evento registrado ainda.</div>`;
    return;
  }

  state.events.slice(0, 10).forEach((event) => {
    const item = document.createElement("div");
    item.className = "compact-item";
    item.innerHTML = `
      <strong>${escapeHtml(event.type)}</strong>
      <span>${new Date(event.createdAt).toLocaleString("pt-BR")}</span>
      <pre>${escapeHtml(JSON.stringify(event.details || {}, null, 2))}</pre>
    `;
    eventsList.appendChild(item);
  });
}

function renderConversations() {
  conversationsList.innerHTML = "";
  const entries = Object.entries(state.conversations);
  if (entries.length === 0) {
    conversationsList.innerHTML = `<div class="empty">Nenhuma conversa registrada ainda.</div>`;
    return;
  }

  entries
    .map(([sessionId, messages]) => ({ sessionId, messages }))
    .sort((a, b) => {
      const lastA = a.messages.at(-1)?.createdAt || "";
      const lastB = b.messages.at(-1)?.createdAt || "";
      return lastB.localeCompare(lastA);
    })
    .slice(0, 10)
    .forEach(({ sessionId, messages }) => {
      const lastMessage = messages.at(-1);
      const item = document.createElement("div");
      item.className = "compact-item";
      item.innerHTML = `
        <strong>${escapeHtml(sessionId)}</strong>
        <span>${messages.length} mensagens${lastMessage ? ` - ${new Date(lastMessage.createdAt).toLocaleString("pt-BR")}` : ""}</span>
        ${renderConversationPreview(messages)}
        <div class="button-row">
          <a href="${withToken(`/conversations/export?sessionId=${encodeURIComponent(sessionId)}`)}">Exportar transcript</a>
          <button type="button" data-delete-session="${escapeHtml(sessionId)}">Apagar dados da sessao</button>
        </div>
      `;
      conversationsList.appendChild(item);
    });
}

function renderConversationPreview(messages) {
  return `
    <div class="conversation-preview">
      ${messages.slice(-6).map((message) => `
        <div class="conversation-message ${escapeHtml(message.sender)}">
          <span>${senderLabel(message.sender)}${message.createdAt ? ` - ${new Date(message.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}</span>
          <p>${escapeHtml(message.text)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function senderLabel(sender) {
  const labels = {
    user: "Cliente",
    bot: "Bot",
    operator: "Atendente"
  };
  return labels[sender] || sender;
}

function renderOutbox() {
  outboxList.innerHTML = "";
  if (state.outbox.length === 0) {
    outboxList.innerHTML = `<div class="empty">Nenhuma mensagem de saida registrada.</div>`;
    return;
  }

  state.outbox.slice(0, 10).forEach((item) => {
    const row = document.createElement("div");
    row.className = "compact-item";
    row.innerHTML = `
      <strong>${escapeHtml(item.status)} - ${escapeHtml(item.sessionId)}</strong>
      <span>${new Date(item.updatedAt || item.createdAt).toLocaleString("pt-BR")} - ${item.attempts || 1} tentativa(s)${item.providerStatus ? ` - Meta: ${escapeHtml(item.providerStatus)}` : ""}</span>
      <pre>${escapeHtml(item.text || "")}</pre>
      ${["failed", "skipped"].includes(item.status) ? `<button type="button" data-outbox-retry="${escapeHtml(item.id)}">Reenviar</button>` : ""}
    `;
    outboxList.appendChild(row);
  });
}

function readCatalogFromForm() {
  return [...catalogList.querySelectorAll(".product-row")].map((row) => ({
    id: row.querySelector('[data-field="id"]').value.trim(),
    name: row.querySelector('[data-field="name"]').value.trim(),
    category: row.querySelector('[data-field="category"]').value.trim(),
    price: Number(row.querySelector('[data-field="price"]').value),
    stock: row.querySelector('[data-field="stock"]').value === "" ? null : Number(row.querySelector('[data-field="stock"]').value),
    description: row.querySelector('[data-field="description"]').value.trim(),
    available: row.querySelector('[data-field="available"]').checked
  }));
}

function readFaqsFromForm() {
  return [...faqList.querySelectorAll(".faq-row")].map((row) => ({
    id: row.querySelector('[data-field="id"]').value.trim(),
    question: row.querySelector('[data-field="question"]').value.trim(),
    answer: row.querySelector('[data-field="answer"]').value.trim(),
    keywords: row.querySelector('[data-field="keywords"]').value
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean),
    active: row.querySelector('[data-field="active"]').checked
  }));
}

function readConfigFromForm() {
  return {
    ...state.config,
    storeName: configFields.storeName.value.trim(),
    currency: configFields.currency.value.trim() || "BRL",
    openingMessage: configFields.openingMessage.value.trim(),
    deliveryInfo: configFields.deliveryInfo.value.trim(),
    pickupInfo: configFields.pickupInfo.value.trim(),
    paymentInfo: configFields.paymentInfo.value.trim(),
    paymentMethods: textToPaymentMethods(configFields.paymentMethods.value),
    deliveryZones: textToDeliveryZones(configFields.deliveryZones.value),
    humanHandoffMessage: configFields.humanHandoffMessage.value.trim(),
    businessHours: textToBusinessHours(configFields.businessHours.value, configFields.businessTimezone.value.trim() || "America/Sao_Paulo"),
    orderStatusMessages: {
      pending_confirmation: configFields.orderPending.value.trim(),
      confirmed: configFields.orderConfirmed.value.trim(),
      cancelled: configFields.orderCancelled.value.trim(),
      done: configFields.orderDone.value.trim()
    },
    handoffRules: configFields.handoffRules.value
      .split("\n")
      .map((rule) => rule.trim())
      .filter(Boolean),
    handoffKeywords: configFields.handoffKeywords.value
      .split(/[\n,]/)
      .map((keyword) => keyword.trim())
      .filter(Boolean)
  };
}

function paymentMethodsToText(paymentMethods = []) {
  return paymentMethods.map((method) => {
    return [
      method.id,
      method.label,
      (method.keywords || []).join(","),
      method.instructions || "",
      method.active === false ? "inativo" : "ativo"
    ].join(" | ");
  }).join("\n");
}

function textToPaymentMethods(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id = "", label = "", keywords = "", instructions = "", active = "ativo"] = line.split("|").map((item) => item.trim());
      return {
        id,
        label,
        keywords: keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean),
        instructions,
        active: !["inativo", "false", "0", "nao", "não"].includes(active.toLowerCase())
      };
    });
}

function deliveryZonesToText(deliveryZones = []) {
  return deliveryZones.map((zone) => {
    return [
      zone.id,
      zone.name,
      (zone.keywords || []).join(","),
      zone.fee ?? 0,
      zone.eta || "",
      zone.minOrder ?? 0,
      zone.active === false ? "inativo" : "ativo"
    ].join(" | ");
  }).join("\n");
}

function textToDeliveryZones(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [id = "", name = "", keywords = "", fee = "0", eta = "", minOrder = "0", active = "ativo"] = line.split("|").map((item) => item.trim());
      return {
        id,
        name,
        keywords: keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean),
        fee: Number(fee || 0),
        eta,
        minOrder: Number(minOrder || 0),
        active: !["inativo", "false", "0", "nao", "não"].includes(active.toLowerCase())
      };
    });
}

function businessHoursToText(businessHours) {
  const labels = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];
  const weekly = businessHours?.weekly || [];
  return labels.map((label, day) => {
    const entry = weekly.find((item) => item.day === day);
    if (!entry || entry.closed === true) {
      return `${label}=fechado`;
    }
    return `${label}=${entry.open}-${entry.close}`;
  }).join("\n");
}

function textToBusinessHours(text, timezone) {
  const dayMap = {
    dom: 0,
    domingo: 0,
    seg: 1,
    segunda: 1,
    ter: 2,
    terca: 2,
    terça: 2,
    qua: 3,
    quarta: 3,
    qui: 4,
    quinta: 4,
    sex: 5,
    sexta: 5,
    sab: 6,
    sábado: 6,
    sabado: 6
  };
  const weekly = String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawDay, rawRange = ""] = line.split("=");
      const day = dayMap[String(rawDay || "").trim().toLowerCase()];
      const range = rawRange.trim().toLowerCase();
      if (day === undefined) {
        return null;
      }
      if (range === "fechado" || range === "closed") {
        return { day, closed: true };
      }
      const [open, close] = range.split("-").map((value) => value.trim());
      return { day, open, close };
    })
    .filter(Boolean);

  return { timezone, weekly };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function addBubble(text, sender = "bot") {
  const bubble = document.createElement("div");
  bubble.className = `bubble ${sender}`;
  bubble.textContent = text;
  testerLog.appendChild(bubble);
  testerLog.scrollTop = testerLog.scrollHeight;
}

async function loadDashboard() {
  const [catalogData, faqData, configData, readinessData, ordersData, handoffsData, conversationsData, eventsData, outboxData] = await Promise.all([
    api("/catalog"),
    api("/faqs"),
    api("/config"),
    api("/ready"),
    api("/orders"),
    api("/handoffs"),
    api("/conversations"),
    api("/events"),
    api("/outbox")
  ]);
  state.catalog = catalogData.catalog;
  state.faqs = faqData.faqs;
  state.config = configData.config;
  state.readiness = readinessData;
  state.orders = ordersData.orders;
  state.handoffs = handoffsData.handoffs;
  state.conversations = conversationsData.conversations;
  state.events = eventsData.events;
  state.outbox = outboxData.outbox;
  renderConfig();
  renderReadiness();
  renderWhatsAppInfo();
  renderCatalog();
  renderFaqs();
  renderOrders();
  renderHandoffs();
  renderEvents();
  renderConversations();
  renderOutbox();
  updateMetrics();
  updateProtectedLinks();
  setAuthenticatedView(true);
  markDashboardRefreshed();
}

async function loadDashboardWithAuthHandling() {
  try {
    await loadDashboard();
    return true;
  } catch (error) {
    if (error.status === 401) {
      window.localStorage.removeItem("chatbotAdminToken");
      state.adminToken = "";
      updateProtectedLinks();
      setAuthenticatedView(false);
      setRefreshStatus("Aguardando token");
      showToast("Informe o token administrativo.");
      return false;
    }
    showToast(error.message);
    return false;
  }
}

async function readJsonUpload(file) {
  if (!file) {
    throw new Error("Selecione um arquivo JSON.");
  }
  return JSON.parse(await file.text());
}

function renderStoreProfileStatus(data) {
  const issues = data.issues || [];
  storeProfileStatus.className = `profile-status ${data.ok ? "ok" : "warning"}`;
  storeProfileStatus.textContent = data.ok
    ? `Perfil valido para ${data.storeName}. Produtos: ${data.products}. FAQs: ${data.faqs}.`
    : `Perfil valido no formato, mas ainda nao pronto para producao:\n${issues.join("\n")}`;
}

document.querySelector("#refresh").addEventListener("click", async () => {
  setRefreshStatus("Atualizando...");
  const loaded = await loadDashboardWithAuthHandling();
  if (loaded) {
    showToast("Painel atualizado.");
  }
});

setInterval(async () => {
  if (!state.adminToken || document.hidden || isEditingDashboard()) {
    return;
  }

  setRefreshStatus("Atualizando...");
  await loadDashboardWithAuthHandling();
}, 30000);

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const token = authToken.value.trim();
  if (!token) {
    showToast("Digite o token administrativo.");
    return;
  }
  state.adminToken = token;
  window.localStorage.setItem("chatbotAdminToken", token);
  updateProtectedLinks();
  await loadDashboardWithAuthHandling();
});

logoutButton.addEventListener("click", () => {
  window.localStorage.removeItem("chatbotAdminToken");
  state.adminToken = "";
  updateProtectedLinks();
  setAuthenticatedView(false);
  setRefreshStatus("Aguardando token");
  showToast("Token removido deste navegador.");
});

document.querySelector("#add-product").addEventListener("click", () => {
  state.catalog.push({
    id: String(state.catalog.length + 1),
    name: "Novo produto",
    category: "Geral",
    price: 0,
    stock: null,
    description: "Descricao do produto",
    available: true
  });
  renderCatalog();
  updateMetrics();
});

document.querySelector("#add-faq").addEventListener("click", () => {
  state.faqs.push({
    id: `faq-${state.faqs.length + 1}`,
    question: "Nova pergunta",
    answer: "Resposta curta para o cliente.",
    keywords: ["palavra-chave"],
    active: true
  });
  renderFaqs();
});

catalogList.addEventListener("click", (event) => {
  if (event.target.dataset.action !== "remove") return;
  event.target.closest(".product-row").remove();
  state.catalog = readCatalogFromForm();
  updateMetrics();
});

faqList.addEventListener("click", (event) => {
  if (event.target.dataset.action !== "remove-faq") return;
  event.target.closest(".faq-row").remove();
  state.faqs = readFaqsFromForm();
});

document.querySelector("#save-catalog").addEventListener("click", async () => {
  try {
    const catalog = readCatalogFromForm();
    const data = await api("/catalog", {
      method: "POST",
      body: JSON.stringify({ catalog })
    });
    state.catalog = data.catalog;
    renderCatalog();
    updateMetrics();
    showToast("Catalogo salvo.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#save-faqs").addEventListener("click", async () => {
  try {
    const faqs = readFaqsFromForm();
    const data = await api("/faqs", {
      method: "POST",
      body: JSON.stringify({ faqs })
    });
    state.faqs = data.faqs;
    renderFaqs();
    showToast("FAQs salvas.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#save-config").addEventListener("click", async () => {
  try {
    const config = readConfigFromForm();
    const data = await api("/config", {
      method: "POST",
      body: JSON.stringify({ config })
    });
    state.config = data.config;
    renderConfig();
    showToast("Configuracao salva.");
  } catch (error) {
    showToast(error.message);
  }
});

orderSearch.addEventListener("input", () => {
  state.orderFilters.query = orderSearch.value;
  renderOrders();
});

orderStatusFilter.addEventListener("change", () => {
  state.orderFilters.status = orderStatusFilter.value;
  renderOrders();
});

clearOrderFilters.addEventListener("click", () => {
  state.orderFilters.query = "";
  state.orderFilters.status = "all";
  orderSearch.value = "";
  orderStatusFilter.value = "all";
  renderOrders();
});

handoffSearch.addEventListener("input", () => {
  state.handoffFilters.query = handoffSearch.value;
  renderHandoffs();
});

handoffStatusFilter.addEventListener("change", () => {
  state.handoffFilters.status = handoffStatusFilter.value;
  renderHandoffs();
});

clearHandoffFilters.addEventListener("click", () => {
  state.handoffFilters.query = "";
  state.handoffFilters.status = "all";
  handoffSearch.value = "";
  handoffStatusFilter.value = "all";
  renderHandoffs();
});

ordersList.addEventListener("change", async (event) => {
  const id = event.target.dataset.orderStatus;
  if (!id) return;
  try {
    await saveOrderUpdate(id);
    showToast("Pedido atualizado.");
  } catch (error) {
    await loadDashboard();
    showToast(error.message);
  }
});

ordersList.addEventListener("click", async (event) => {
  const saveId = event.target.dataset.orderSave;
  const notifyId = event.target.dataset.orderNotify;
  const id = saveId || notifyId;
  if (!id) return;
  try {
    const data = await saveOrderUpdate(id, Boolean(notifyId));
    showToast(data.notification ? "Pedido atualizado e cliente avisado." : "Pedido atualizado.");
  } catch (error) {
    await loadDashboard();
    showToast(error.message);
  }
});

async function saveOrderUpdate(id, notifyCustomer = false) {
  const status = ordersList.querySelector(`[data-order-status="${CSS.escape(id)}"]`).value;
  const internalNotes = ordersList.querySelector(`[data-order-notes="${CSS.escape(id)}"]`).value;
  const data = await api("/orders/status", {
    method: "POST",
    body: JSON.stringify({ id, status, internalNotes, notifyCustomer })
  });
  await loadDashboard();
  return data;
}

handoffsList.addEventListener("click", async (event) => {
  const saveId = event.target.dataset.handoffSave;
  const sendId = event.target.dataset.handoffSend;
  const id = saveId || sendId;
  if (!id) return;

  try {
    const status = handoffsList.querySelector(`[data-handoff-status="${CSS.escape(id)}"]`).value;
    const notes = handoffsList.querySelector(`[data-handoff-notes="${CSS.escape(id)}"]`).value;
    if (saveId) {
      await api("/handoffs/status", {
        method: "POST",
        body: JSON.stringify({ id, status, notes })
      });
      showToast("Atendimento atualizado.");
    }

    if (sendId) {
      const handoff = state.handoffs.find((item) => item.id === id);
      const replyField = handoffsList.querySelector(`[data-handoff-reply="${CSS.escape(id)}"]`);
      const text = replyField.value.trim();
      if (!text) {
        showToast("Digite uma resposta para enviar.");
        return;
      }
      await api("/messages/send", {
        method: "POST",
        body: JSON.stringify({ sessionId: handoff.sessionId, text })
      });
      replyField.value = "";
      showToast("Resposta registrada/enviada.");
    }

    await loadDashboard();
  } catch (error) {
    await loadDashboardWithAuthHandling();
    showToast(error.message);
  }
});

document.querySelector("#clear-orders").addEventListener("click", async () => {
  if (!confirmAction("Limpar todos os pedidos de teste? Esta acao nao pode ser desfeita sem backup.")) {
    return;
  }

  try {
    await api("/orders/clear", { method: "POST", body: "{}" });
    await loadDashboard();
    showToast("Pedidos de teste limpos.");
  } catch (error) {
    showToast(error.message);
  }
});

document.querySelector("#clear-history").addEventListener("click", async () => {
  if (!confirmAction("Limpar conversas, caixa de saida, eventos e controles temporarios? Esta acao nao pode ser desfeita sem backup.")) {
    return;
  }

  try {
    await api("/conversations/clear", { method: "POST", body: "{}" });
    await api("/outbox/clear", { method: "POST", body: "{}" });
    await api("/rate-limits/clear", { method: "POST", body: "{}" });
    await api("/processed-webhooks/clear", { method: "POST", body: "{}" });
    await api("/events/clear", { method: "POST", body: "{}" });
    await loadDashboard();
    showToast("Historico limpo.");
  } catch (error) {
    await loadDashboardWithAuthHandling();
    showToast(error.message);
  }
});

conversationsList.addEventListener("click", async (event) => {
  const sessionId = event.target.dataset.deleteSession;
  if (!sessionId) return;
  if (!confirmAction(`Apagar/anonimizar dados da sessao ${sessionId}? Esta acao nao pode ser desfeita sem backup.`)) {
    return;
  }

  try {
    await api("/privacy/delete-session", {
      method: "POST",
      body: JSON.stringify({ sessionId })
    });
    await loadDashboard();
    showToast("Dados da sessao removidos.");
  } catch (error) {
    await loadDashboardWithAuthHandling();
    showToast(error.message);
  }
});

outboxList.addEventListener("click", async (event) => {
  const id = event.target.dataset.outboxRetry;
  if (!id) return;

  try {
    await api("/outbox/retry", {
      method: "POST",
      body: JSON.stringify({ id })
    });
    await loadDashboard();
    showToast("Mensagem reenviada ou tentativa registrada.");
  } catch (error) {
    await loadDashboardWithAuthHandling();
    showToast(error.message);
  }
});

restoreBackupFile.addEventListener("change", async () => {
  const file = restoreBackupFile.files[0];
  if (!file) return;
  if (!confirmAction("Restaurar este backup vai sobrescrever os dados locais atuais. Continuar?")) {
    restoreBackupFile.value = "";
    return;
  }

  try {
    const backup = JSON.parse(await file.text());
    await api("/backup/restore", {
      method: "POST",
      body: JSON.stringify({ backup, confirmRestore: true })
    });
    await loadDashboard();
    showToast("Backup restaurado.");
  } catch (error) {
    showToast(error.message);
  } finally {
    restoreBackupFile.value = "";
  }
});

validateStoreProfileFile.addEventListener("change", async () => {
  const file = validateStoreProfileFile.files[0];
  try {
    const profile = await readJsonUpload(file);
    const data = await api("/store-profile/validate", {
      method: "POST",
      body: JSON.stringify({ profile })
    });
    renderStoreProfileStatus(data);
    showToast(data.ok ? "Perfil validado." : "Perfil ainda tem dados de exemplo.");
  } catch (error) {
    storeProfileStatus.className = "profile-status warning";
    storeProfileStatus.textContent = error.message;
    showToast(error.message);
  } finally {
    validateStoreProfileFile.value = "";
  }
});

applyStoreProfileFile.addEventListener("change", async () => {
  const file = applyStoreProfileFile.files[0];
  if (!file) return;
  if (!confirmAction("Aplicar este perfil vai sobrescrever configuracao, catalogo e FAQs atuais. Um backup sera criado antes. Continuar?")) {
    applyStoreProfileFile.value = "";
    return;
  }

  try {
    const profile = await readJsonUpload(file);
    const data = await api("/store-profile/apply", {
      method: "POST",
      body: JSON.stringify({ profile, confirmApply: true })
    });
    state.config = data.config;
    state.catalog = data.catalog;
    state.faqs = data.faqs;
    storeProfileStatus.className = "profile-status ok";
    storeProfileStatus.textContent = `Perfil aplicado. Backup anterior: ${data.preStoreProfileBackup}`;
    await loadDashboard();
    showToast("Perfil da loja aplicado.");
  } catch (error) {
    storeProfileStatus.className = "profile-status warning";
    storeProfileStatus.textContent = error.message;
    showToast(error.message);
  } finally {
    applyStoreProfileFile.value = "";
  }
});

document.querySelector("#reset-session").addEventListener("click", async () => {
  try {
    await api("/sessions/reset", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.testerSessionId })
    });
    state.testerSessionId = `admin-${Date.now()}`;
    testerLog.innerHTML = "";
    showToast("Conversa reiniciada.");
  } catch (error) {
    showToast(error.message);
  }
});

testerForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = testerInput.value.trim();
  if (!message) return;

  addBubble(message, "user");
  testerInput.value = "";
  try {
    const data = await api("/chat", {
      method: "POST",
      body: JSON.stringify({ sessionId: state.testerSessionId, message })
    });

    data.messages.forEach((item) => addBubble(item.text));
    if (data.order) {
      await loadDashboard();
    }
  } catch (error) {
    addBubble(error.message, "bot");
    showToast(error.message);
  }
});

loadAdminToken();
updateProtectedLinks();
setAuthenticatedView(false);
loadDashboardWithAuthHandling();
