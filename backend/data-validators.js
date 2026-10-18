const ORDER_STATUSES = ["pending_confirmation", "confirmed", "cancelled", "done"];
const HANDOFF_STATUSES = ["open", "in_progress", "resolved", "cancelled"];
const SAMPLE_PRODUCT_NAMES = new Set([
  "produto destaque",
  "kit presente",
  "lancamento da semana",
  "oferta especial"
]);
const SAMPLE_FAQ_IDS = new Set(["horario", "troca"]);
const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6];

function assertArray(value, name) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} deve ser uma lista.`);
  }
}

function assertObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} deve ser um objeto.`);
  }
}

function isValidOrderStatus(status) {
  return ORDER_STATUSES.includes(status);
}

function isValidHandoffStatus(status) {
  return HANDOFF_STATUSES.includes(status);
}

function validateCatalog(catalog) {
  assertArray(catalog, "catalog");

  const ids = new Set();
  catalog.forEach((item, index) => {
    const id = typeof item.id === "string" ? item.id.trim() : "";
    const name = typeof item.name === "string" ? item.name.trim() : "";
    const category = typeof item.category === "string" ? item.category.trim() : "";
    const price = Number(item.price);
    if (!id || !name || !category || !Number.isFinite(price) || price < 0) {
      throw new Error(`Produto invalido na posicao ${index + 1}.`);
    }
    if (item.stock !== undefined && item.stock !== null && item.stock !== "" && (!Number.isFinite(Number(item.stock)) || Number(item.stock) < 0)) {
      throw new Error(`Estoque invalido no produto ${id}.`);
    }
    if (item.available !== undefined && typeof item.available !== "boolean") {
      throw new Error(`Disponibilidade invalida no produto ${id}.`);
    }
    if (ids.has(id)) {
      throw new Error(`Produto duplicado: ${id}.`);
    }
    ids.add(id);
  });
}

function validateFaqs(faqs) {
  assertArray(faqs, "faqs");

  const ids = new Set();
  faqs.forEach((faq, index) => {
    const id = typeof faq.id === "string" ? faq.id.trim() : "";
    const question = typeof faq.question === "string" ? faq.question.trim() : "";
    const answer = typeof faq.answer === "string" ? faq.answer.trim() : "";
    if (!id || !question || !answer || !Array.isArray(faq.keywords)) {
      throw new Error(`FAQ invalida na posicao ${index + 1}.`);
    }
    faq.keywords.forEach((keyword, keywordIndex) => {
      if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
        throw new Error(`Palavra-chave invalida na FAQ ${id}, posicao ${keywordIndex + 1}.`);
      }
    });
    if (faq.active !== undefined && typeof faq.active !== "boolean") {
      throw new Error(`Status invalido na FAQ ${id}.`);
    }
    if (ids.has(id)) {
      throw new Error(`FAQ duplicada: ${id}.`);
    }
    ids.add(id);
  });
}

function validateConfig(config) {
  assertObject(config, "config");

  const requiredFields = ["storeName", "currency", "openingMessage", "deliveryInfo", "paymentInfo", "humanHandoffMessage"];
  requiredFields.forEach((field) => {
    if (!config[field] || typeof config[field] !== "string") {
      throw new Error(`Campo obrigatorio ausente na configuracao: ${field}.`);
    }
  });

  if (config.pickupInfo !== undefined && typeof config.pickupInfo !== "string") {
    throw new Error("pickupInfo deve ser texto.");
  }

  if (!Array.isArray(config.handoffRules)) {
    throw new Error("handoffRules deve ser uma lista.");
  }
  config.handoffRules.forEach((rule, index) => {
    if (!rule || typeof rule !== "string") {
      throw new Error(`Regra de atendimento humano invalida na posicao ${index + 1}.`);
    }
  });

  if (config.handoffKeywords !== undefined && !Array.isArray(config.handoffKeywords)) {
    throw new Error("handoffKeywords deve ser uma lista.");
  }
  (config.handoffKeywords || []).forEach((keyword, index) => {
    if (!keyword || typeof keyword !== "string") {
      throw new Error(`Palavra de atendimento humano invalida na posicao ${index + 1}.`);
    }
  });

  if (config.orderStatusMessages !== undefined) {
    assertObject(config.orderStatusMessages, "orderStatusMessages");
    ORDER_STATUSES.forEach((status) => {
      if (!config.orderStatusMessages[status] || typeof config.orderStatusMessages[status] !== "string") {
        throw new Error(`Mensagem de status invalida: ${status}.`);
      }
    });
  }

  if (config.businessHours !== undefined) {
    assertObject(config.businessHours, "businessHours");
    if (!config.businessHours.timezone || typeof config.businessHours.timezone !== "string") {
      throw new Error("businessHours.timezone deve ser texto.");
    }
    if (!Array.isArray(config.businessHours.weekly)) {
      throw new Error("businessHours.weekly deve ser uma lista.");
    }
    const days = new Set();
    config.businessHours.weekly.forEach((entry, index) => {
      assertObject(entry, `businessHours.weekly[${index}]`);
      if (!WEEK_DAYS.includes(entry.day)) {
        throw new Error(`Dia invalido em businessHours.weekly na posicao ${index + 1}.`);
      }
      if (days.has(entry.day)) {
        throw new Error(`Dia duplicado em businessHours.weekly: ${entry.day}.`);
      }
      days.add(entry.day);
      if (entry.closed !== true) {
        if (!isTimeString(entry.open) || !isTimeString(entry.close)) {
          throw new Error(`Horario invalido em businessHours.weekly no dia ${entry.day}.`);
        }
      }
    });
  }

  if (config.deliveryZones !== undefined) {
    assertArray(config.deliveryZones, "deliveryZones");
    const ids = new Set();
    config.deliveryZones.forEach((zone, index) => {
      assertObject(zone, `deliveryZones[${index}]`);
      const id = typeof zone.id === "string" ? zone.id.trim() : "";
      const name = typeof zone.name === "string" ? zone.name.trim() : "";
      if (!id || !name || !Array.isArray(zone.keywords) || zone.keywords.length === 0) {
        throw new Error(`Zona de entrega invalida na posicao ${index + 1}.`);
      }
      if (ids.has(id)) {
        throw new Error(`Zona de entrega duplicada: ${id}.`);
      }
      ids.add(id);
      zone.keywords.forEach((keyword, keywordIndex) => {
        if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
          throw new Error(`Palavra-chave invalida na zona ${id}, posicao ${keywordIndex + 1}.`);
        }
      });
      if (zone.fee !== undefined && zone.fee !== null && (!Number.isFinite(Number(zone.fee)) || Number(zone.fee) < 0)) {
        throw new Error(`Taxa de entrega invalida na zona ${id}.`);
      }
      if (zone.minOrder !== undefined && zone.minOrder !== null && (!Number.isFinite(Number(zone.minOrder)) || Number(zone.minOrder) < 0)) {
        throw new Error(`Pedido minimo invalido na zona ${id}.`);
      }
      if (zone.active !== undefined && typeof zone.active !== "boolean") {
        throw new Error(`Status invalido na zona ${id}.`);
      }
    });
  }

  if (config.paymentMethods !== undefined) {
    assertArray(config.paymentMethods, "paymentMethods");
    const ids = new Set();
    config.paymentMethods.forEach((method, index) => {
      assertObject(method, `paymentMethods[${index}]`);
      const id = typeof method.id === "string" ? method.id.trim() : "";
      const label = typeof method.label === "string" ? method.label.trim() : "";
      if (!id || !label || !Array.isArray(method.keywords) || method.keywords.length === 0) {
        throw new Error(`Forma de pagamento invalida na posicao ${index + 1}.`);
      }
      if (ids.has(id)) {
        throw new Error(`Forma de pagamento duplicada: ${id}.`);
      }
      ids.add(id);
      method.keywords.forEach((keyword, keywordIndex) => {
        if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
          throw new Error(`Palavra-chave invalida na forma de pagamento ${id}, posicao ${keywordIndex + 1}.`);
        }
      });
      if (method.instructions !== undefined && typeof method.instructions !== "string") {
        throw new Error(`Instrucao invalida na forma de pagamento ${id}.`);
      }
      if (method.active !== undefined && typeof method.active !== "boolean") {
        throw new Error(`Status invalido na forma de pagamento ${id}.`);
      }
    });
  }
}

function isTimeString(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ""))) {
    return false;
  }
  const [hour, minute] = value.split(":").map(Number);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function storeDataIssues(config = {}, catalog = [], faqs = []) {
  const issues = [];
  const storeName = normalizeText(config.storeName);
  if (!storeName || storeName === "loja") {
    issues.push("Nome da loja ainda parece exemplo.");
  }

  const productNames = new Set(catalog.map((item) => normalizeText(item.name)));
  const sampleProducts = [...productNames].filter((name) => SAMPLE_PRODUCT_NAMES.has(name));
  if (sampleProducts.length > 0) {
    issues.push(`${sampleProducts.length} produto(s) ainda parecem exemplo.`);
  }

  const activeFaqs = faqs.filter((faq) => faq.active !== false);
  const sampleFaqs = activeFaqs.filter((faq) => SAMPLE_FAQ_IDS.has(normalizeText(faq.id)));
  if (activeFaqs.length > 0 && sampleFaqs.length === activeFaqs.length) {
    issues.push("FAQs ativas ainda parecem exemplos.");
  }

  const openingMessage = normalizeText(config.openingMessage);
  if (openingMessage.includes("assistente da loja") && openingMessage.includes("montar um pedido")) {
    issues.push("Mensagem inicial ainda parece generica.");
  }

  return issues;
}

function validateBackup(backup) {
  assertObject(backup, "backup");
  validateConfig(backup.config);
  validateCatalog(backup.catalog);
  validateFaqs(backup.faqs || []);
  assertArray(backup.orders, "orders");
  assertObject(backup.sessions, "sessions");
  assertObject(backup.conversations, "conversations");
  assertArray(backup.events, "events");
  assertArray(backup.handoffs || [], "handoffs");
  assertArray(backup.outbox || [], "outbox");
  assertObject(backup.rateLimits || {}, "rateLimits");
  assertObject(backup.processedWebhooks || {}, "processedWebhooks");
}

module.exports = {
  HANDOFF_STATUSES,
  ORDER_STATUSES,
  assertArray,
  assertObject,
  isValidHandoffStatus,
  isValidOrderStatus,
  storeDataIssues,
  validateBackup,
  validateCatalog,
  validateConfig,
  validateFaqs
};
