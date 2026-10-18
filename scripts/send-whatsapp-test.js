const { loadEnvFile } = require("../backend/env");
const { sendWhatsAppMessage } = require("../backend/whatsapp-adapter");

loadEnvFile();

const to = process.argv[2] || process.env.WHATSAPP_TEST_TO || "";
const rawArgs = process.argv.slice(3);
const buttonsIndex = rawArgs.indexOf("--buttons");
const textArgs = buttonsIndex >= 0 ? rawArgs.slice(0, buttonsIndex) : rawArgs;
const quickReplies = buttonsIndex >= 0
  ? rawArgs.slice(buttonsIndex + 1).join(" ").split(",").map((item) => item.trim()).filter(Boolean)
  : [];
const text = textArgs.join(" ") || "Teste do chatbot da loja.";

async function run() {
  if (!to) {
    console.error("Uso: node scripts/send-whatsapp-test.js 5511999999999 \"Mensagem de teste\"");
    console.error("Ou defina WHATSAPP_TEST_TO no ambiente.");
    process.exit(1);
    return;
  }

  const result = await sendWhatsAppMessage(to, { text, quickReplies });
  if (result.skipped) {
    console.log("Envio ignorado: credenciais da Meta nao configuradas.");
    console.log(JSON.stringify(result.payload, null, 2));
    return;
  }

  if (!result.ok) {
    console.error(`Envio falhou: HTTP ${result.status}`);
    console.error(JSON.stringify(result.body, null, 2));
    process.exitCode = 1;
    return;
  }

  console.log(`Mensagem enviada: HTTP ${result.status}`);
  console.log(JSON.stringify(result.body, null, 2));
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
