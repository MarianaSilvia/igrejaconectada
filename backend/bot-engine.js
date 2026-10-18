const fs = require("node:fs");
const { dataFile } = require("./data-paths");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function hasStock(item) {
  return item.stock === undefined || item.stock === null || item.stock === "" || Number(item.stock) > 0;
}

function loadCatalog() {
  return readJson(dataFile("catalog.json")).filter((item) => item.available !== false && hasStock(item));
}

function loadConfig() {
  return readJson(dataFile("store-config.json"));
}

function loadFaqs() {
  const faqsPath = dataFile("faqs.json");
  if (!fs.existsSync(faqsPath)) {
    return [];
  }
  return readJson(faqsPath).filter((item) => item.active !== false);
}

function createConversationState() {
  return {
    step: "menu",
    selectedCategory: "",
    selectedProductId: null,
    quantity: 1,
    customerName: "",
    customerContact: "",
    deliveryMode: "",
    address: "",
    deliveryZoneId: "",
    deliveryZoneName: "",
    deliveryFee: null,
    deliveryEta: "",
    payment: "",
    notes: "",
    completed: false,
    needsHuman: false
  };
}

function formatMoney(value, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency
  }).format(value);
}

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function getSelectedProduct(state, catalog) {
  return catalog.find((item) => item.id === state.selectedProductId) || null;
}

function getTotal(state, catalog) {
  const product = getSelectedProduct(state, catalog);
  return product ? product.price * state.quantity : 0;
}

function getEstimatedTotalWithDelivery(state, catalog) {
  const subtotal = getTotal(state, catalog);
  const deliveryFee = Number(state.deliveryFee);
  return Number.isFinite(deliveryFee) ? subtotal + deliveryFee : null;
}

function getStockLimit(product) {
  if (!product || product.stock === undefined || product.stock === null || product.stock === "") {
    return null;
  }
  const stock = Number(product.stock);
  return Number.isFinite(stock) ? stock : null;
}

function getCategories(catalog) {
  return [...new Set(catalog.map((item) => item.category).filter(Boolean))];
}

function findCategory(message, catalog) {
  const normalized = normalize(message);
  return getCategories(catalog).find((category) => normalize(category) === normalized) || null;
}

function buildOrderSummary(state, catalog, config = loadConfig()) {
  const product = getSelectedProduct(state, catalog);
  const totalWithDelivery = getEstimatedTotalWithDelivery(state, catalog);

  return [
    "Resumo do pedido",
    `Produto: ${product ? product.name : "a definir"}`,
    `Categoria: ${product?.category || state.selectedCategory || "a definir"}`,
    `Quantidade: ${state.quantity || 1}`,
    `Total estimado: ${formatMoney(getTotal(state, catalog), config.currency)}`,
    totalWithDelivery === null ? null : `Total estimado com frete: ${formatMoney(totalWithDelivery, config.currency)}`,
    `Cliente: ${state.customerName || "a informar"}`,
    `Contato: ${state.customerContact || "a informar"}`,
    `Entrega/retirada: ${state.deliveryMode || "a definir"}`,
    `Endereco: ${state.address || "a informar"}`,
    `Frete estimado: ${state.deliveryFee === null || state.deliveryFee === undefined ? "a confirmar" : `${state.deliveryZoneName || "zona cadastrada"} - ${formatMoney(state.deliveryFee, config.currency)}${state.deliveryEta ? ` (${state.deliveryEta})` : ""}`}`,
    `Pagamento: ${state.payment || "a definir"}`,
    `Observacoes do cliente: ${state.notes || "nenhuma"}`,
    "",
    "Observacao: confirmar estoque, frete, prazo e pagamento antes de finalizar."
  ].filter((line) => line !== null).join("\n");
}

function activeDeliveryZones(config) {
  return (config.deliveryZones || []).filter((zone) => zone.active !== false);
}

function activePaymentMethods(config) {
  const methods = (config.paymentMethods || []).filter((method) => method.active !== false);
  if (methods.length > 0) {
    return methods;
  }

  return [
    { id: "pix", label: "Pix", keywords: ["pix"], instructions: "", active: true },
    { id: "cartao", label: "Cartao", keywords: ["cartao"], instructions: "", active: true },
    { id: "dinheiro", label: "Dinheiro", keywords: ["dinheiro"], instructions: "", active: true }
  ];
}

function paymentQuickReplies(config) {
  return activePaymentMethods(config).map((method) => method.label).slice(0, 10);
}

function matchPaymentMethod(text, config) {
  const normalizedText = normalize(text);
  return activePaymentMethods(config).find((method) => {
    if (normalize(method.label) === normalizedText || normalize(method.id) === normalizedText) {
      return true;
    }
    return (method.keywords || []).some((keyword) => normalizedText.includes(normalize(keyword)));
  }) || null;
}

function paymentInfoText(config) {
  const methods = activePaymentMethods(config);
  const methodLines = methods
    .filter((method) => method.label)
    .map((method) => `- ${method.label}${method.instructions ? `: ${method.instructions}` : ""}`);
  if (methodLines.length === 0) {
    return config.paymentInfo;
  }
  return `${config.paymentInfo}\n\nFormas cadastradas:\n${methodLines.join("\n")}`;
}

function estimateDelivery(address, config) {
  const normalizedAddress = normalize(address);
  const zones = activeDeliveryZones(config);
  const zone = zones.find((item) => {
    return (item.keywords || []).some((keyword) => normalizedAddress.includes(normalize(keyword)));
  });

  if (!zone) {
    return {
      matched: false,
      text: zones.length > 0
        ? "Nao encontrei esse bairro nas zonas cadastradas. A loja confirma frete e prazo manualmente."
        : "A loja ainda nao cadastrou zonas de entrega. Frete e prazo serao confirmados manualmente."
    };
  }

  const fee = Number(zone.fee || 0);
  return {
    matched: true,
    zone,
    fee,
    text: `Estimativa para ${zone.name}: frete ${formatMoney(fee, config.currency)}${zone.eta ? `, prazo ${zone.eta}` : ""}${zone.minOrder ? `, pedido minimo ${formatMoney(Number(zone.minOrder), config.currency)}` : ""}. A loja confirma antes de finalizar.`
  };
}

function menuResponse(config) {
  return {
    text: "Como posso ajudar agora?",
    quickReplies: ["Ver produtos", "Fazer pedido", "Entrega e retirada", "Pagamento", "Falar com atendente"]
  };
}

function catalogResponse(catalog, config) {
  const categories = getCategories(catalog);
  if (categories.length > 1) {
    return {
      text: `Temos estas categorias:\n\n${categories.map((category) => `- ${category}`).join("\n")}\n\nDigite uma categoria ou o numero do produto se ja souber qual quer.`,
      quickReplies: categories.slice(0, 10)
    };
  }

  const lines = catalog.map((item) => {
    return `${item.id}. ${item.name} - ${formatMoney(item.price, config.currency)}\n${item.description}`;
  });

  return {
    text: `Aqui estao alguns produtos para o MVP:\n\n${lines.join("\n\n")}\n\nDigite o numero do produto para escolher.`,
    quickReplies: catalog.slice(0, 3).map((item) => item.id)
  };
}

function categoryCatalogResponse(category, catalog, config) {
  const products = catalog.filter((item) => normalize(item.category) === normalize(category));
  const lines = products.map((item) => {
    return `${item.id}. ${item.name} - ${formatMoney(item.price, config.currency)}\n${item.description}`;
  });

  return {
    text: `Produtos em ${category}:\n\n${lines.join("\n\n")}\n\nDigite o numero do produto para escolher ou "categorias" para voltar.`,
    quickReplies: products.slice(0, 10).map((item) => item.id)
  };
}

function findFaqAnswer(message, faqs = loadFaqs()) {
  const normalized = normalize(message);
  return faqs.find((faq) => {
    return (faq.keywords || []).some((keyword) => normalized.includes(normalize(keyword)));
  }) || null;
}

function localDateParts(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    day: weekdayMap[parts.weekday] ?? 0,
    minutes: Number(parts.hour) * 60 + Number(parts.minute)
  };
}

function timeToMinutes(value) {
  const [hour, minute] = String(value || "00:00").split(":").map(Number);
  return hour * 60 + minute;
}

function dayName(day) {
  return ["domingo", "segunda", "terca", "quarta", "quinta", "sexta", "sabado"][day] || String(day);
}

function businessHoursStatus(config, now = new Date()) {
  const hours = config.businessHours;
  if (!hours?.weekly?.length) {
    return {
      configured: false,
      open: null,
      text: "O horario de atendimento humano ainda nao foi configurado. A loja confirma manualmente assim que possivel."
    };
  }

  const local = localDateParts(now, hours.timezone);
  const today = hours.weekly.find((entry) => entry.day === local.day);
  if (!today || today.closed) {
    const next = nextOpenDay(hours.weekly, local.day);
    return {
      configured: true,
      open: false,
      text: next
        ? `Atendimento humano fechado agora. Proximo horario: ${dayName(next.day)} das ${next.open} as ${next.close}.`
        : "Atendimento humano fechado agora. A loja ainda nao cadastrou o proximo horario de abertura."
    };
  }

  const open = timeToMinutes(today.open);
  const close = timeToMinutes(today.close);
  const isOpen = local.minutes >= open && local.minutes < close;
  return {
    configured: true,
    open: isOpen,
    text: isOpen
      ? `Atendimento humano aberto agora, ate ${today.close}.`
      : `Atendimento humano fechado agora. Hoje atende das ${today.open} as ${today.close}.`
  };
}

function nextOpenDay(weekly, currentDay) {
  for (let offset = 1; offset <= 7; offset += 1) {
    const day = (currentDay + offset) % 7;
    const entry = weekly.find((item) => item.day === day);
    if (entry && entry.closed !== true) {
      return entry;
    }
  }
  return null;
}

function shouldHandoff(message, config) {
  const normalized = normalize(message);
  return (config.handoffKeywords || []).some((keyword) => {
    const normalizedKeyword = normalize(keyword);
    return normalizedKeyword && normalized.includes(normalizedKeyword);
  });
}

function handleMessage(message, state = createConversationState(), options = {}) {
  const catalog = (options.catalog || loadCatalog()).filter((item) => item.available !== false && hasStock(item));
  const config = options.config || loadConfig();
  const faqs = options.faqs || loadFaqs();
  const text = String(message || "").trim();
  const normalized = normalize(text);
  const response = { state: { ...state }, messages: [] };

  function say(messageText, quickReplies = []) {
    response.messages.push({ text: messageText, quickReplies });
  }

  function setStep(step) {
    response.state.step = step;
  }

  if (!text || normalized === "inicio" || normalized === "oi" || normalized === "ola" || normalized === "menu") {
    setStep("menu");
    say(config.openingMessage);
    response.messages.push(menuResponse(config));
    return response;
  }

  if (state.step === "quantity") {
    const quantity = Number.parseInt(text, 10);
    if (Number.isFinite(quantity) && quantity > 0) {
      const product = getSelectedProduct(response.state, catalog);
      const stockLimit = getStockLimit(product);
      if (stockLimit !== null && quantity > stockLimit) {
        say(`No momento temos ${stockLimit} unidade(s) disponivel(is) para esse item. Me diga uma quantidade ate ${stockLimit}.`, String(stockLimit) === "1" ? ["1"] : ["1", String(stockLimit)]);
        return response;
      }
      response.state.quantity = quantity;
      setStep("customer_name");
      say("Perfeito. Qual e o seu nome para colocarmos no pedido?");
    } else {
      say("Me diga a quantidade em numero, por exemplo: 2.");
    }
    return response;
  }

  const selectedProduct = catalog.find((item) => item.id === text);
  if (selectedProduct) {
    response.state.selectedCategory = selectedProduct.category || "";
    response.state.selectedProductId = selectedProduct.id;
    response.state.quantity = 1;
    setStep("quantity");
    say(`Boa escolha: ${selectedProduct.name}. Quantas unidades voce quer?`, ["1", "2", "3"]);
    return response;
  }

  if (normalized === "categorias" || normalized === "categoria") {
    response.state.selectedCategory = "";
    setStep("catalog");
    response.messages.push(catalogResponse(catalog, config));
    return response;
  }

  const selectedCategory = findCategory(text, catalog);
  if (selectedCategory) {
    response.state.selectedCategory = selectedCategory;
    setStep("catalog_category");
    response.messages.push(categoryCatalogResponse(selectedCategory, catalog, config));
    return response;
  }

  if (state.step === "customer_name") {
    response.state.customerName = text;
    setStep("delivery_mode");
    say("Voce prefere entrega ou retirada?", ["Entrega", "Retirada"]);
    return response;
  }

  if (state.step === "delivery_mode") {
    response.state.deliveryMode = text;
    if (normalize(text) === "retirada") {
      setStep("payment");
      const pickupText = config.pickupInfo ? `${config.pickupInfo}\n\n` : "";
      say(`${pickupText}Qual forma de pagamento voce prefere?`, paymentQuickReplies(config));
    } else {
      setStep("address");
      say("Me envie o endereco completo para estimarmos o frete.");
    }
    return response;
  }

  if (state.step === "address") {
    response.state.address = text;
    const delivery = estimateDelivery(text, config);
    if (delivery.matched) {
      response.state.deliveryZoneId = delivery.zone.id;
      response.state.deliveryZoneName = delivery.zone.name;
      response.state.deliveryFee = delivery.fee;
      response.state.deliveryEta = delivery.zone.eta || "";
    }
    setStep("payment");
    say(`${delivery.text}\n\nQual forma de pagamento voce prefere?`, paymentQuickReplies(config));
    return response;
  }

  if (state.step === "payment") {
    const method = matchPaymentMethod(text, config);
    response.state.payment = method ? method.label : text;
    setStep("notes");
    const instructions = method?.instructions ? `${method.instructions}\n\n` : "";
    say(`${instructions}Alguma observacao para o pedido? Ex.: presente, sem cebola, horario preferido. Se nao tiver, responda: sem observacao.`, ["Sem observacao"]);
    return response;
  }

  if (state.step === "notes") {
    response.state.notes = normalized === "sem observacao" || normalized === "sem observacoes" ? "" : text;
    setStep("review");
    say(
      `Confira seu pedido antes de enviar para a loja:\n\n${buildOrderSummary(response.state, catalog, config)}\n\nSe estiver tudo certo, confirme para a loja revisar disponibilidade, frete e prazo.`,
      ["Confirmar pedido", "Alterar observacoes", "Cancelar pedido"]
    );
    return response;
  }

  if (state.step === "review") {
    if (normalized.includes("confirmar")) {
      response.state.completed = true;
      setStep("confirmation");
      say(
        `Pedido enviado para confirmacao da loja:\n\n${buildOrderSummary(response.state, catalog, config)}\n\nUm atendente deve revisar disponibilidade, frete e prazo antes de finalizar.`,
        ["Novo atendimento", "Falar com atendente"]
      );
      return response;
    }

    if (normalized.includes("alterar") || normalized.includes("observacao")) {
      setStep("notes");
      say("Claro. Me envie a observacao atualizada para o pedido. Se nao tiver, responda: sem observacao.", ["Sem observacao"]);
      return response;
    }

    if (normalized.includes("cancelar")) {
      response.state = createConversationState();
      say("Pedido cancelado antes de enviar para a loja. Posso te ajudar com outro atendimento?", ["Ver produtos", "Fazer pedido", "Menu"]);
      return response;
    }

    say("Para enviar o pedido para a loja, escolha uma opcao.", ["Confirmar pedido", "Alterar observacoes", "Cancelar pedido"]);
    return response;
  }

  if (normalized.includes("atendente") || normalized.includes("humano") || shouldHandoff(text, config)) {
    response.state.needsHuman = true;
    setStep("human_handoff");
    say(`${config.humanHandoffMessage}\n\n${businessHoursStatus(config).text}`);
    return response;
  }

  if (normalized.includes("horario") || normalized.includes("funcionamento") || normalized.includes("abre") || normalized.includes("fecha")) {
    setStep("business_hours");
    say(businessHoursStatus(config).text, ["Fazer pedido", "Falar com atendente", "Menu"]);
    return response;
  }

  if (normalized.includes("produto") || normalized.includes("catalogo")) {
    setStep("catalog");
    response.messages.push(catalogResponse(catalog, config));
    return response;
  }

  if (normalized.includes("pedido") || normalized.includes("comprar") || normalized.includes("novo atendimento")) {
    setStep("catalog");
    response.messages.push(catalogResponse(catalog, config));
    return response;
  }

  if (normalized.includes("entrega") || normalized.includes("retirada")) {
    setStep("delivery_info");
    const zones = activeDeliveryZones(config);
    const zonesText = zones.length > 0
      ? `\n\nZonas cadastradas:\n${zones.map((zone) => `- ${zone.name}: ${formatMoney(Number(zone.fee || 0), config.currency)}${zone.eta ? `, ${zone.eta}` : ""}`).join("\n")}`
      : "";
    const pickupText = config.pickupInfo ? `\n\nRetirada: ${config.pickupInfo}` : "";
    say(`${config.deliveryInfo}${pickupText}${zonesText}`, ["Fazer pedido", "Menu"]);
    return response;
  }

  if (normalized.includes("pagamento") || normalized.includes("pix") || normalized.includes("cartao")) {
    setStep("payment_info");
    say(paymentInfoText(config), ["Fazer pedido", "Menu"]);
    return response;
  }

  const faq = findFaqAnswer(text, faqs);
  if (faq) {
    setStep("faq");
    say(faq.answer, ["Fazer pedido", "Falar com atendente", "Menu"]);
    return response;
  }

  say("Entendi. Para este MVP, posso te ajudar com produtos, pedido, pagamento, entrega ou atendimento humano.", [
    "Ver produtos",
    "Fazer pedido",
    "Falar com atendente"
  ]);
  return response;
}

module.exports = {
  buildOrderSummary,
  createConversationState,
  handleMessage,
  loadCatalog,
  loadConfig,
  loadFaqs,
  activePaymentMethods,
  businessHoursStatus,
  estimateDelivery,
  getEstimatedTotalWithDelivery
};
