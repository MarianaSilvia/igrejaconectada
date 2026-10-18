function buildWhatsAppTextPayload(to, text) {
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: {
      preview_url: false,
      body: text
    }
  };
}

function normalizeButtonTitle(title) {
  const value = String(title || "").trim();
  return value.length > 20 ? value.slice(0, 20) : value;
}

function normalizeRowTitle(title) {
  const value = String(title || "").trim();
  return value.length > 24 ? value.slice(0, 24) : value;
}

function replyId(prefix, index, title) {
  return `${prefix}_${index + 1}_${title.toLowerCase().replace(/[^a-z0-9]+/g, "_").slice(0, 40)}`;
}

function buildWhatsAppInteractivePayload(to, text, quickReplies = []) {
  const replies = quickReplies
    .map((item) => String(item || "").trim())
    .filter(Boolean)
    .slice(0, 10);

  if (replies.length === 0) {
    return buildWhatsAppTextPayload(to, text);
  }

  if (replies.length <= 3) {
    const buttons = replies.map(normalizeButtonTitle).map((title, index) => ({
      type: "reply",
      reply: {
        id: replyId("reply", index, title),
        title
      }
    }));

    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: {
          text
        },
        action: {
          buttons
        }
      }
    };
  }

  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: {
        text
      },
      action: {
        button: "Ver opcoes",
        sections: [
          {
            title: "Opcoes",
            rows: replies.map(normalizeRowTitle).map((title, index) => ({
              id: replyId("row", index, title),
              title
            }))
          }
        ]
      }
    }
  };
}

function buildWhatsAppMessagePayload(to, message) {
  if (typeof message === "string") {
    return buildWhatsAppTextPayload(to, message);
  }

  return buildWhatsAppInteractivePayload(to, message.text || "", message.quickReplies || []);
}

function getWhatsAppConfig(env = process.env) {
  return {
    accessToken: env.WHATSAPP_ACCESS_TOKEN || "",
    phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID || "",
    graphVersion: env.WHATSAPP_GRAPH_VERSION || "v20.0"
  };
}

function canSendWhatsApp(env = process.env) {
  const config = getWhatsAppConfig(env);
  return Boolean(config.accessToken && config.phoneNumberId);
}

async function sendWhatsAppText(to, text, options = {}) {
  return sendWhatsAppMessage(to, { text }, options);
}

async function sendWhatsAppMessage(to, message, options = {}) {
  const config = {
    ...getWhatsAppConfig(),
    ...options
  };
  const payload = buildWhatsAppMessagePayload(to, message);

  if (!config.accessToken || !config.phoneNumberId) {
    return {
      skipped: true,
      reason: "WHATSAPP_ACCESS_TOKEN e WHATSAPP_PHONE_NUMBER_ID nao configurados.",
      payload
    };
  }

  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${config.accessToken}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      body
    };
  }

  return {
    ok: true,
    status: response.status,
    body
  };
}

module.exports = {
  buildWhatsAppInteractivePayload,
  buildWhatsAppMessagePayload,
  buildWhatsAppTextPayload,
  canSendWhatsApp,
  sendWhatsAppMessage,
  sendWhatsAppText
};
