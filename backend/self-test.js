const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { businessHoursStatus, createConversationState, handleMessage } = require("./bot-engine");
const { isValidHandoffStatus, isValidOrderStatus, storeDataIssues, validateBackup, validateCatalog, validateConfig, validateFaqs } = require("./data-validators");
const { dataFile, ensureDataFiles, getDataDir, writeJsonFile } = require("./data-paths");
const { parseEnvLine } = require("./env");
const { buildWhatsAppInteractivePayload, buildWhatsAppMessagePayload, buildWhatsAppTextPayload, canSendWhatsApp } = require("./whatsapp-adapter");

const catalog = [
  {
    id: "1",
    name: "Produto teste",
    price: 10,
    description: "Produto usado no teste.",
    available: true
  }
];

const config = {
  storeName: "Loja Teste",
  currency: "BRL",
  openingMessage: "Oi!",
  deliveryInfo: "Entrega de teste.",
  pickupInfo: "Retirada no balcao da loja teste.",
  paymentInfo: "Pagamento de teste.",
  paymentMethods: [
    {
      id: "pix",
      label: "Pix",
      keywords: ["pix"],
      instructions: "Use a chave Pix enviada pela loja.",
      active: true
    },
    {
      id: "cartao",
      label: "Cartao",
      keywords: ["cartao"],
      instructions: "Cartao em link seguro.",
      active: true
    }
  ],
  humanHandoffMessage: "Chamando atendente.",
  businessHours: {
    timezone: "America/Sao_Paulo",
    weekly: [
      { day: 1, open: "09:00", close: "18:00" },
      { day: 2, open: "09:00", close: "18:00" }
    ]
  },
  deliveryZones: [
    {
      id: "centro",
      name: "Centro",
      keywords: ["centro"],
      fee: 8,
      eta: "ate 60 min",
      minOrder: 0,
      active: true
    }
  ],
  handoffRules: [],
  handoffKeywords: ["reclamar", "cancelar"]
};

const faqs = [
  {
    id: "atendimento",
    question: "Garantia",
    answer: "A garantia depende do produto e da data da compra.",
    keywords: ["garantia"],
    active: true
  }
];

const validCatalog = [
  {
    id: "produto-1",
    category: "Teste",
    name: "Produto teste",
    price: 10,
    stock: 2,
    available: true
  }
];

validateCatalog(validCatalog);
validateConfig(config);
validateFaqs(faqs);
validateBackup({
  config,
  catalog: validCatalog,
  faqs,
  orders: [],
  sessions: {},
  conversations: {},
  events: []
});
assert.equal(isValidOrderStatus("confirmed"), true);
assert.equal(isValidOrderStatus("enviado"), false);
assert.equal(isValidHandoffStatus("in_progress"), true);
assert.equal(isValidHandoffStatus("waiting"), false);
assert.throws(() => validateCatalog([{ ...validCatalog[0], id: "" }]), /Produto invalido/);
assert.throws(() => validateConfig({ ...config, handoffRules: "atendente" }), /handoffRules/);
assert.throws(() => validateConfig({ ...config, businessHours: { timezone: "America/Sao_Paulo", weekly: [{ day: 1, open: "9", close: "18:00" }] } }), /Horario invalido/);
assert.throws(() => validateConfig({ ...config, deliveryZones: [{ id: "x", name: "Zona", keywords: [], fee: 0 }] }), /Zona de entrega invalida/);
assert.throws(() => validateConfig({ ...config, paymentMethods: [{ id: "pix", label: "Pix", keywords: [] }] }), /Forma de pagamento invalida/);
assert.throws(() => validateFaqs([{ ...faqs[0], keywords: [""] }]), /Palavra-chave invalida/);
assert.deepEqual(storeDataIssues(config, validCatalog, faqs), []);
assert.equal(businessHoursStatus(config, new Date("2026-10-12T13:00:00Z")).open, true);
assert.equal(businessHoursStatus(config, new Date("2026-10-12T22:00:00Z")).open, false);
assert.ok(storeDataIssues(
  {
    ...config,
    storeName: "Loja",
    openingMessage: "Oi! Sou o assistente da loja. Posso te ajudar a ver produtos, montar um pedido ou chamar uma pessoa do atendimento."
  },
  [
    { ...validCatalog[0], name: "Produto destaque" },
    { ...validCatalog[0], id: "produto-2", name: "Kit presente" }
  ],
  [
    { ...faqs[0], id: "horario" },
    { ...faqs[0], id: "troca", question: "Troca" }
  ]
).length >= 4);

function send(state, message) {
  const result = handleMessage(message, state, { catalog, config, faqs });
  return result;
}

const categorizedCatalog = [
  {
    id: "1",
    category: "Mais vendidos",
    name: "Produto teste",
    price: 10,
    description: "Produto usado no teste.",
    available: true
  },
  {
    id: "2",
    category: "Novidades",
    name: "Produto novo",
    price: 15,
    description: "Produto novo usado no teste.",
    stock: 1,
    available: true
  },
  {
    id: "3",
    category: "Novidades",
    name: "Produto esgotado",
    price: 20,
    description: "Produto sem estoque usado no teste.",
    stock: 0,
    available: true
  }
];

let state = createConversationState();
let result = handleMessage("Ver produtos", state, { catalog: categorizedCatalog, config, faqs });
assert.equal(result.state.step, "catalog");
assert.deepEqual(result.messages[0].quickReplies, ["Mais vendidos", "Novidades"]);

state = result.state;
result = handleMessage("Novidades", state, { catalog: categorizedCatalog, config, faqs });
assert.equal(result.state.step, "catalog_category");
assert.equal(result.state.selectedCategory, "Novidades");
assert.match(result.messages[0].text, /Produto novo/);
assert.doesNotMatch(result.messages[0].text, /Produto teste/);
assert.doesNotMatch(result.messages[0].text, /Produto esgotado/);

state = result.state;
result = handleMessage("2", state, { catalog: categorizedCatalog, config, faqs });
assert.equal(result.state.selectedCategory, "Novidades");
assert.equal(result.state.selectedProductId, "2");

state = result.state;
result = handleMessage("2", state, { catalog: categorizedCatalog, config, faqs });
assert.equal(result.state.step, "quantity");
assert.match(result.messages[0].text, /1 unidade/);

state = createConversationState();
result = send(state, "Fazer pedido");
assert.equal(result.state.step, "catalog");

state = result.state;
result = send(state, "1");
assert.equal(result.state.step, "quantity");
assert.equal(result.state.selectedProductId, "1");

state = result.state;
result = send(state, "2");
assert.equal(result.state.step, "customer_name");
assert.equal(result.state.quantity, 2);

state = result.state;
result = send(state, "Maria");
assert.equal(result.state.step, "delivery_mode");
assert.equal(result.state.customerName, "Maria");

state = result.state;
result = send(state, "Retirada");
assert.equal(result.state.step, "payment");
assert.match(result.messages[0].text, /Retirada no balcao/);

state = createConversationState();
result = send(state, "Fazer pedido");
state = result.state;
result = send(state, "1");
state = result.state;
result = send(state, "2");
state = result.state;
result = send(state, "Joao");
state = result.state;
result = send(state, "Entrega");
state = result.state;
result = send(state, "Rua Central, Centro");
assert.equal(result.state.deliveryZoneId, "centro");
assert.equal(result.state.deliveryFee, 8);
assert.match(result.messages[0].text, /frete R\$\s?8,00/);

state = result.state;
result = send(state, "Pix");
assert.equal(result.state.step, "notes");
assert.equal(result.state.payment, "Pix");
assert.match(result.messages[0].text, /chave Pix/);

state = result.state;
result = send(state, "Presente");
assert.equal(result.state.step, "review");
assert.equal(result.state.completed, false);
assert.match(result.messages[0].text, /Total estimado: R\$\s?20,00/);
assert.match(result.messages[0].text, /Total estimado com frete: R\$\s?28,00/);
assert.match(result.messages[0].text, /Presente/);
assert.match(result.messages[0].text, /Contato: a informar/);

state = result.state;
result = send(state, "Confirmar pedido");
assert.equal(result.state.step, "confirmation");
assert.equal(result.state.completed, true);

state = createConversationState();
result = send(state, "Fazer pedido");
state = result.state;
result = send(state, "1");
state = result.state;
result = send(state, "1");
state = result.state;
result = send(state, "Ana");
state = result.state;
result = send(state, "Retirada");
state = result.state;
result = send(state, "Pix");
state = result.state;
result = send(state, "Sem observacao");
state = result.state;
result = send(state, "Alterar observacoes");
assert.equal(result.state.step, "notes");
state = result.state;
result = send(state, "Retirar as 17h");
state = result.state;
assert.equal(result.state.step, "review");
assert.match(result.messages[0].text, /Retirar as 17h/);

state = createConversationState();
result = send(state, "Falar com atendente");
assert.equal(result.state.needsHuman, true);
assert.equal(result.state.step, "human_handoff");

state = createConversationState();
result = send(state, "Quero reclamar do pedido");
assert.equal(result.state.needsHuman, true);
assert.equal(result.state.step, "human_handoff");

state = createConversationState();
result = send(state, "Tem garantia?");
assert.equal(result.state.step, "faq");
assert.match(result.messages[0].text, /garantia depende/);

state = createConversationState();
result = send(state, "Qual o horario?");
assert.equal(result.state.step, "business_hours");
assert.match(result.messages[0].text, /Atendimento humano/);

state = createConversationState();
result = send(state, "Entrega e retirada");
assert.equal(result.state.step, "delivery_info");
assert.match(result.messages[0].text, /Retirada no balcao/);

state = createConversationState();
result = send(state, "Pagamento");
assert.equal(result.state.step, "payment_info");
assert.match(result.messages[0].text, /Formas cadastradas/);
assert.match(result.messages[0].text, /Cartao em link seguro/);

const payload = buildWhatsAppTextPayload("5511999999999", "Oi");
assert.equal(payload.messaging_product, "whatsapp");
assert.equal(payload.to, "5511999999999");
assert.equal(payload.text.body, "Oi");
const interactivePayload = buildWhatsAppInteractivePayload("5511999999999", "Escolha", ["Comprar", "Pagamento", "Atendente"]);
assert.equal(interactivePayload.type, "interactive");
assert.equal(interactivePayload.interactive.type, "button");
assert.equal(interactivePayload.interactive.action.buttons.length, 3);
assert.equal(interactivePayload.interactive.action.buttons[0].reply.title, "Comprar");
const listPayload = buildWhatsAppInteractivePayload("5511999999999", "Menu", ["Produtos", "Pedido", "Entrega", "Pagamento", "Atendente"]);
assert.equal(listPayload.interactive.type, "list");
assert.equal(listPayload.interactive.action.sections[0].rows.length, 5);
assert.equal(buildWhatsAppMessagePayload("5511999999999", { text: "Oi", quickReplies: [] }).type, "text");
assert.equal(canSendWhatsApp({}), false);
assert.equal(canSendWhatsApp({
  WHATSAPP_ACCESS_TOKEN: "token",
  WHATSAPP_PHONE_NUMBER_ID: "123"
}), true);
assert.deepEqual(parseEnvLine('ADMIN_TOKEN="abc123"'), { key: "ADMIN_TOKEN", value: "abc123" });
assert.equal(parseEnvLine("# comentario"), null);

const originalDataDir = process.env.DATA_DIR;
const tempDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "chatbot-data-"));
process.env.DATA_DIR = tempDataDir;
ensureDataFiles(["catalog.json", "orders.json"]);
assert.equal(getDataDir(), tempDataDir);
assert.ok(fs.existsSync(dataFile("catalog.json")));
assert.deepEqual(JSON.parse(fs.readFileSync(dataFile("orders.json"), "utf8")), []);
const atomicTarget = path.join(tempDataDir, "atomic.json");
writeJsonFile(atomicTarget, { ok: true, count: 2 });
assert.deepEqual(JSON.parse(fs.readFileSync(atomicTarget, "utf8")), { ok: true, count: 2 });
assert.deepEqual(fs.readdirSync(tempDataDir).filter((file) => file.endsWith(".tmp")), []);
if (originalDataDir === undefined) {
  delete process.env.DATA_DIR;
} else {
  process.env.DATA_DIR = originalDataDir;
}

console.log("Self-test passou.");
