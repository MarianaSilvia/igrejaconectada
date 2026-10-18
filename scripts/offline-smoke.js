const assert = require("node:assert/strict");
const {
  createConversationState,
  handleMessage,
  loadCatalog,
  loadConfig,
  loadFaqs
} = require("../backend/bot-engine");
const { ensureDataFiles } = require("../backend/data-paths");
const { validateCatalog, validateConfig, validateFaqs } = require("../backend/data-validators");
const { loadEnvFile } = require("../backend/env");

loadEnvFile();
ensureDataFiles();

const catalog = loadCatalog();
const config = loadConfig();
const faqs = loadFaqs();

validateCatalog(catalog);
validateConfig(config);
validateFaqs(faqs);

assert.ok(catalog.length > 0, "Catalogo precisa ter pelo menos um produto ativo.");
assert.ok(config.openingMessage, "Configuracao precisa ter openingMessage.");

function send(state, message) {
  const result = handleMessage(message, state, { catalog, config, faqs });
  assert.ok(Array.isArray(result.messages), `Mensagem "${message}" nao retornou lista de respostas.`);
  assert.ok(result.messages.length > 0, `Mensagem "${message}" nao gerou resposta.`);
  return result;
}

let state = createConversationState();
let result = send(state, "Ver produtos");
assert.equal(result.state.step, catalog.some((item) => item.category) ? "catalog" : "catalog_category");
assert.match(result.messages[0].text, /produto|categoria|catalogo/i);

const firstProduct = catalog[0];
const categories = [...new Set(catalog.map((item) => item.category).filter(Boolean))];
state = result.state;
if (categories.length > 1) {
  result = send(state, firstProduct.category);
  state = result.state;
  assert.equal(state.step, "catalog_category");
  assert.equal(state.selectedCategory, firstProduct.category);
}

result = send(state, firstProduct.id);
state = result.state;
assert.equal(state.selectedProductId, firstProduct.id);

result = send(state, "1");
state = result.state;
assert.equal(state.quantity, 1);
assert.equal(state.step, "customer_name");

result = send(state, "Cliente Teste");
state = result.state;
assert.equal(state.customerName, "Cliente Teste");

result = send(state, "Retirada");
state = result.state;
assert.equal(state.deliveryMode, "Retirada");
assert.equal(state.step, "payment");

const deliveryZone = (config.deliveryZones || []).find((zone) => zone.active !== false && zone.keywords?.length > 0);
if (deliveryZone) {
  let deliveryState = createConversationState();
  let deliveryResult = send(deliveryState, "Fazer pedido");
  deliveryState = deliveryResult.state;
  deliveryResult = send(deliveryState, firstProduct.id);
  deliveryState = deliveryResult.state;
  deliveryResult = send(deliveryState, "1");
  deliveryState = deliveryResult.state;
  deliveryResult = send(deliveryState, "Cliente Entrega");
  deliveryState = deliveryResult.state;
  deliveryResult = send(deliveryState, "Entrega");
  deliveryState = deliveryResult.state;
  deliveryResult = send(deliveryState, `Rua Teste, ${deliveryZone.keywords[0]}`);
  assert.equal(deliveryResult.state.deliveryZoneId, deliveryZone.id);
  assert.match(deliveryResult.messages[0].text, /frete|Estimativa/i);
  deliveryState = deliveryResult.state;
  deliveryResult = send(deliveryState, "Pix");
  deliveryState = deliveryResult.state;
  deliveryResult = send(deliveryState, "Sem observacao");
  assert.match(deliveryResult.messages[0].text, /Total estimado com frete/i);
}

result = send(state, "Pix");
state = result.state;
assert.equal(state.payment, "Pix");
assert.equal(state.step, "notes");

result = send(state, "Sem observacao");
state = result.state;
assert.equal(state.completed, false);
assert.equal(state.step, "review");
assert.match(result.messages[0].text, /Resumo do pedido/);
assert.match(result.messages[0].text, new RegExp(firstProduct.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));

result = send(state, "Confirmar pedido");
state = result.state;
assert.equal(state.completed, true);
assert.equal(state.step, "confirmation");

const faqCandidate = faqs
  .flatMap((faq) => (faq.keywords || []).map((keyword) => ({ faq, keyword })))
  .find(({ keyword }) => !/horario|abre|fecha|funcionamento|troca|devolucao|devolver|atendente|humano/i.test(keyword));

if (faqCandidate) {
  result = send(createConversationState(), faqCandidate.keyword);
  assert.equal(result.state.step, "faq");
  assert.match(result.messages[0].text, new RegExp(faqCandidate.faq.answer.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
}

result = send(createConversationState(), "Qual e o horario?");
assert.equal(result.state.step, "business_hours");

result = send(createConversationState(), "Falar com atendente");
assert.equal(result.state.needsHuman, true);
assert.equal(result.state.step, "human_handoff");

console.log("Offline smoke passou.");
