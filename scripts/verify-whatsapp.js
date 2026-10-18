const crypto = require("node:crypto");
const { loadEnvFile } = require("../backend/env");

loadEnvFile();

const baseUrl = (process.argv[2] || process.env.PUBLIC_BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN || "dev-token";
const appSecret = process.env.WHATSAPP_APP_SECRET || "";
const webhookUrl = `${baseUrl}/webhooks/whatsapp`;

async function request(url, options = {}) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body = text;
  try {
    body = text ? JSON.parse(text) : "";
  } catch {
    body = text;
  }
  return { response, body };
}

function signature(payload) {
  if (!appSecret) {
    return "";
  }
  return `sha256=${crypto.createHmac("sha256", appSecret).update(payload).digest("hex")}`;
}

async function run() {
  console.log(`Testando webhook: ${webhookUrl}`);

  const challengeUrl = `${webhookUrl}?hub.mode=subscribe&hub.verify_token=${encodeURIComponent(verifyToken)}&hub.challenge=chatbot-ok`;
  const challenge = await request(challengeUrl);
  if (!challenge.response.ok || challenge.body !== "chatbot-ok") {
    throw new Error(`Verificacao falhou: HTTP ${challenge.response.status} ${JSON.stringify(challenge.body)}`);
  }
  console.log("OK - verificacao de webhook");

  const payload = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from: "5511999999999",
                  id: "wamid.local-test",
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: "Fazer pedido" }
                }
              ]
            },
            field: "messages"
          }
        ]
      }
    ]
  });

  const headers = { "content-type": "application/json" };
  const webhookSignature = signature(payload);
  if (webhookSignature) {
    headers["x-hub-signature-256"] = webhookSignature;
  }

  const result = await request(webhookUrl, {
    method: "POST",
    headers,
    body: payload
  });

  if (!result.response.ok) {
    throw new Error(`POST falhou: HTTP ${result.response.status} ${JSON.stringify(result.body)}`);
  }

  console.log("OK - POST de mensagem WhatsApp");
  console.log(`Resposta: ${JSON.stringify(result.body.messages || result.body, null, 2)}`);

  if (!appSecret) {
    console.log("Aviso: WHATSAPP_APP_SECRET vazio; assinatura HMAC nao foi enviada.");
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
