const catalog = [
  { id: "1", category: "Mais vendidos", name: "Produto destaque", price: 49.9, description: "Boa opcao para quem quer comprar rapido." },
  { id: "2", category: "Mais vendidos", name: "Kit presente", price: 89.9, description: "Combo pronto para presentear." },
  { id: "3", category: "Novidades", name: "Lancamento da semana", price: 64.9, description: "Item novo no catalogo." },
  { id: "4", category: "Promocoes", name: "Oferta especial", price: 39.9, description: "Preco promocional sujeito a confirmacao." }
];

const backendUrl = "http://localhost:3000/chat";

const state = {
  step: "Inicio",
  selectedCategory: "",
  selectedProduct: null,
  quantity: 1,
  customerName: "",
  customerContact: "Capturado pelo WhatsApp",
  deliveryMode: "",
  address: "",
  payment: "",
  notes: ""
};

const chatLog = document.querySelector("#chat-log");
const form = document.querySelector("#chat-form");
const input = document.querySelector("#message-input");
const summary = document.querySelector("#order-summary");
const statusStep = document.querySelector("#status-step");
const statusTotal = document.querySelector("#status-total");
const copyButton = document.querySelector("#copy-summary");

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL"
});

function total() {
  return state.selectedProduct ? state.selectedProduct.price * state.quantity : 0;
}

function estimatedDeliveryFee() {
  return state.deliveryMode.toLowerCase() === "entrega" && state.address ? 8 : null;
}

function updateStatus() {
  statusStep.textContent = state.step;
  statusTotal.textContent = money.format(total());
  summary.textContent = buildSummary();
}

function buildSummary() {
  if (!state.selectedProduct && !state.customerName) {
    return "Nenhum pedido montado ainda.";
  }

  const deliveryFee = estimatedDeliveryFee();
  return [
    "Resumo do pedido",
    `Produto: ${state.selectedProduct ? state.selectedProduct.name : "a definir"}`,
    `Categoria: ${state.selectedProduct?.category || state.selectedCategory || "a definir"}`,
    `Quantidade: ${state.quantity}`,
    `Total estimado: ${money.format(total())}`,
    deliveryFee === null ? null : `Total estimado com frete: ${money.format(total() + deliveryFee)}`,
    `Cliente: ${state.customerName || "a informar"}`,
    `Contato: ${state.customerContact || "a informar"}`,
    `Entrega/retirada: ${state.deliveryMode || "a definir"}`,
    `Endereco: ${state.address || "a informar"}`,
    `Pagamento: ${state.payment || "a definir"}`,
    `Observacoes do cliente: ${state.notes || "nenhuma"}`,
    "",
    "Observacao: confirmar estoque, frete, prazo e pagamento antes de finalizar."
  ].filter((line) => line !== null).join("\n");
}

function addMessage(text, sender = "bot", replies = []) {
  const bubble = document.createElement("div");
  bubble.className = `message ${sender}`;
  bubble.innerHTML = text.replace(/\n/g, "<br>");

  if (replies.length > 0) {
    const row = document.createElement("div");
    row.className = "quick-replies";
    replies.forEach((reply) => {
      const button = document.createElement("button");
      button.className = "quick-reply";
      button.type = "button";
      button.textContent = reply;
      button.addEventListener("click", () => handleUserMessage(reply));
      row.appendChild(button);
    });
    bubble.appendChild(row);
  }

  chatLog.appendChild(bubble);
  chatLog.scrollTop = chatLog.scrollHeight;
}

function setStep(step) {
  state.step = step;
  updateStatus();
}

function showMenu() {
  setStep("Menu");
  addMessage("Como posso ajudar agora?", "bot", [
    "Ver produtos",
    "Fazer pedido",
    "Entrega e retirada",
    "Pagamento",
    "Falar com atendente"
  ]);
}

function showProducts() {
  setStep("Catalogo");
  state.selectedCategory = "";
  const categories = [...new Set(catalog.map((item) => item.category).filter(Boolean))];
  if (categories.length > 1) {
    addMessage(
      `Temos estas categorias:\n\n${categories.map((category) => `- ${category}`).join("\n")}\n\nDigite uma categoria ou o numero do produto se ja souber qual quer.`,
      "bot",
      categories.slice(0, 10)
    );
    return;
  }

  showCategoryProducts(categories[0] || "");
}

function showCategoryProducts(category) {
  state.selectedCategory = category;
  setStep("Categoria");
  const products = category
    ? catalog.filter((item) => item.category.toLowerCase() === category.toLowerCase())
    : catalog;
  const lines = products.map((item) => `${item.id}. ${item.name} - ${money.format(item.price)}\n${item.description}`);
  addMessage(
    `Produtos${category ? ` em ${category}` : ""}:\n\n${lines.join("\n\n")}\n\nDigite o numero do produto para escolher ou "categorias" para voltar.`,
    "bot",
    products.slice(0, 10).map((item) => item.id)
  );
}

function startOrder() {
  setStep("Escolher produto");
  showProducts();
}

function askQuantity(product) {
  state.selectedProduct = product;
  state.selectedCategory = product.category || "";
  state.quantity = 1;
  setStep("Quantidade");
  addMessage(`Boa escolha: ${product.name}. Quantas unidades voce quer?`, "bot", ["1", "2", "3"]);
}

function askName() {
  setStep("Dados do cliente");
  addMessage("Perfeito. Qual e o seu nome para colocarmos no pedido?");
}

function askDeliveryMode() {
  setStep("Entrega");
  addMessage("Voce prefere entrega ou retirada?", "bot", ["Entrega", "Retirada"]);
}

function askAddressIfNeeded() {
  if (state.deliveryMode.toLowerCase() === "retirada") {
    askPayment();
    return;
  }
  setStep("Endereco");
  addMessage("Me envie o endereco completo para estimarmos o frete.");
}

function askPayment() {
  setStep("Pagamento");
  addMessage("Qual forma de pagamento voce prefere?", "bot", ["Pix", "Cartao", "Dinheiro"]);
}

function askNotes() {
  setStep("Observacoes");
  addMessage("Alguma observacao para o pedido? Se nao tiver, responda: sem observacao.", "bot", ["Sem observacao"]);
}

function finishOrder() {
  setStep("Revisao");
  addMessage(
    `Confira seu pedido antes de enviar para a loja:\n\n${buildSummary()}\n\nSe estiver tudo certo, confirme para a loja revisar disponibilidade, frete e prazo.`,
    "bot",
    ["Confirmar pedido", "Alterar observacoes", "Cancelar pedido"]
  );
}

function confirmOrder() {
  setStep("Confirmacao");
  addMessage(
    `Pedido enviado para confirmacao da loja:\n\n${buildSummary()}\n\nUm atendente deve revisar disponibilidade, frete e prazo antes de finalizar.`,
    "bot",
    ["Novo atendimento", "Falar com atendente"]
  );
}

function cancelOrder() {
  state.selectedCategory = "";
  state.selectedProduct = null;
  state.quantity = 1;
  state.customerName = "";
  state.deliveryMode = "";
  state.address = "";
  state.payment = "";
  state.notes = "";
  updateStatus();
  showMenu();
}

async function sendToBackend(message) {
  try {
    await fetch(backendUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: "prototype-browser", message })
    });
  } catch {
    // O prototipo visual funciona mesmo sem o backend local iniciado.
  }
}

function handleKnownIntent(message) {
  const normalized = message.toLowerCase();

  if (normalized.includes("produto") || normalized.includes("catalogo") || normalized.includes("catálogo")) {
    showProducts();
    return true;
  }

  if (normalized.includes("pedido") || normalized.includes("comprar")) {
    startOrder();
    return true;
  }

  if (normalized.includes("entrega") || normalized.includes("retirada")) {
    setStep("Entrega");
    addMessage("O MVP deve responder aqui com as regioes atendidas, prazo medio, regra de frete e opcao de retirada.", "bot", ["Fazer pedido", "Menu"]);
    return true;
  }

  if (normalized.includes("pagamento") || normalized.includes("pix") || normalized.includes("cartao") || normalized.includes("cartão")) {
    setStep("Pagamento");
    addMessage("A loja pode aceitar Pix, cartao, dinheiro ou link de pagamento. Dados sensiveis de cartao nunca devem ser coletados no chat.", "bot", ["Fazer pedido", "Menu"]);
    return true;
  }

  if (normalized.includes("atendente") || normalized.includes("humano")) {
    setStep("Atendente");
    addMessage("Vou chamar uma pessoa da loja. Enquanto isso, ja deixei o contexto organizado no resumo lateral.", "bot");
    return true;
  }

  if (normalized.includes("menu") || normalized.includes("novo atendimento")) {
    showMenu();
    return true;
  }

  return false;
}

function handleUserMessage(rawMessage) {
  const message = rawMessage.trim();
  if (!message) return;

  addMessage(message, "user");
  sendToBackend(message);
  input.value = "";

  if (state.step === "Quantidade") {
    const quantity = Number.parseInt(message, 10);
    if (Number.isFinite(quantity) && quantity > 0) {
      state.quantity = quantity;
      updateStatus();
      askName();
    } else {
      addMessage("Me diga a quantidade em numero, por exemplo: 2.");
    }
    return;
  }

  const selectedByNumber = catalog.find((item) => item.id === message);
  if (selectedByNumber) {
    askQuantity(selectedByNumber);
    return;
  }

  if (message.toLowerCase() === "categorias" || message.toLowerCase() === "categoria") {
    showProducts();
    return;
  }

  const selectedCategory = [...new Set(catalog.map((item) => item.category).filter(Boolean))]
    .find((category) => category.toLowerCase() === message.toLowerCase());
  if (selectedCategory) {
    showCategoryProducts(selectedCategory);
    return;
  }

  if (state.step === "Dados do cliente") {
    state.customerName = message;
    updateStatus();
    askDeliveryMode();
    return;
  }

  if (state.step === "Entrega") {
    state.deliveryMode = message;
    updateStatus();
    askAddressIfNeeded();
    return;
  }

  if (state.step === "Endereco") {
    state.address = message;
    updateStatus();
    askPayment();
    return;
  }

  if (state.step === "Pagamento") {
    state.payment = message;
    updateStatus();
    askNotes();
    return;
  }

  if (state.step === "Observacoes") {
    const normalized = message.toLowerCase();
    state.notes = normalized === "sem observacao" || normalized === "sem observações" || normalized === "sem observacoes" ? "" : message;
    updateStatus();
    finishOrder();
    return;
  }

  if (state.step === "Revisao") {
    const normalized = message.toLowerCase();
    if (normalized.includes("confirmar")) {
      confirmOrder();
      return;
    }
    if (normalized.includes("alterar") || normalized.includes("observ")) {
      askNotes();
      return;
    }
    if (normalized.includes("cancelar")) {
      cancelOrder();
      return;
    }
    addMessage("Para enviar o pedido para a loja, escolha uma opcao.", "bot", ["Confirmar pedido", "Alterar observacoes", "Cancelar pedido"]);
    return;
  }

  if (handleKnownIntent(message)) {
    return;
  }

  addMessage("Entendi. Para este MVP, posso te ajudar com produtos, pedido, pagamento, entrega ou atendimento humano.", "bot", [
    "Ver produtos",
    "Fazer pedido",
    "Falar com atendente"
  ]);
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  handleUserMessage(input.value);
});

copyButton.addEventListener("click", async () => {
  const text = buildSummary();
  try {
    await navigator.clipboard.writeText(text);
    copyButton.textContent = "Resumo copiado";
    setTimeout(() => {
      copyButton.textContent = "Copiar resumo";
    }, 1800);
  } catch {
    copyButton.textContent = "Selecione e copie";
  }
});

updateStatus();
addMessage("Oi! Sou o assistente da loja. Posso te ajudar a ver produtos, montar um pedido ou chamar uma pessoa do atendimento.", "bot", [
  "Ver produtos",
  "Fazer pedido",
  "Entrega e retirada",
  "Pagamento",
  "Falar com atendente"
]);
