# Integracao com WhatsApp

Este projeto ja deixa uma rota preparada para receber mensagens:

```text
POST /webhooks/whatsapp
```

E uma rota de verificacao de webhook:

```text
GET /webhooks/whatsapp
```

Com o servidor rodando, teste a verificacao e um POST de mensagem simulada:

```powershell
node scripts\verify-whatsapp.js http://localhost:3000
```

Depois de publicar, troque a URL local pela URL publica em HTTPS:

```powershell
node scripts\verify-whatsapp.js https://seu-dominio.com
```

Para validar as variaveis de producao:

```powershell
npm run check:production
```

Essa checagem tambem chama `GET /webhooks/whatsapp` com o `WHATSAPP_VERIFY_TOKEN` configurado e confirma se o desafio da Meta volta corretamente.

## Variaveis

Copie `.env.example` como referencia:

```text
PORT=3000
PUBLIC_BASE_URL=https://seu-dominio.com
DATA_DIR=/var/data
ADMIN_TOKEN=troque-este-token-admin
WHATSAPP_VERIFY_TOKEN=troque-este-token
WHATSAPP_APP_SECRET=segredo-do-app-meta
WHATSAPP_ACCESS_TOKEN=token-da-api-meta
WHATSAPP_PHONE_NUMBER_ID=id-do-numero-na-meta
WHATSAPP_GRAPH_VERSION=v20.0
```

`WHATSAPP_GRAPH_VERSION` deve usar o formato da API Graph da Meta, como `v20.0`.

Para producao, gere `ADMIN_TOKEN` e `WHATSAPP_VERIFY_TOKEN` com pelo menos 32 caracteres:

```powershell
npm run secret admin
npm run secret verify
```

O servidor carrega `.env` automaticamente quando o arquivo existir. Tambem e possivel iniciar pelo PowerShell:

```powershell
$env:WHATSAPP_VERIFY_TOKEN="$(npm run --silent secret verify)"; node backend\server.js
```

Para envio real pela API da Meta, configure tambem:

```powershell
$env:WHATSAPP_ACCESS_TOKEN="token-da-meta"
$env:WHATSAPP_PHONE_NUMBER_ID="id-do-numero"
$env:WHATSAPP_VERIFY_TOKEN="$(npm run --silent secret verify)"
$env:WHATSAPP_APP_SECRET="segredo-do-app-meta"
node backend\server.js
```

Sem essas variaveis de envio, o webhook continua respondendo localmente com um `outbound` marcado como `skipped`, mostrando o payload que seria enviado.

Para testar envio real depois de configurar `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`:

```powershell
node scripts\send-whatsapp-test.js 5511999999999 "Teste do chatbot da loja"
```

Sem credenciais, esse comando nao chama a Meta; ele mostra o payload que seria enviado.

Para testar botoes interativos:

```powershell
node scripts\send-whatsapp-test.js 5511999999999 "Escolha uma opcao" --buttons "Fazer pedido,Pagamento,Atendente"
```

Quando o bot gera ate 3 respostas rapidas, o envio pela Meta usa mensagens interativas com botoes. Quando ha de 4 a 10 opcoes, usa uma lista interativa. Se nao houver respostas rapidas, envia texto simples.

## Assinatura do webhook

Se `WHATSAPP_APP_SECRET` estiver definido, `POST /webhooks/whatsapp` exige o header:

```text
X-Hub-Signature-256: sha256=...
```

O servidor valida a assinatura HMAC SHA-256 usando o corpo bruto da requisicao. Sem `WHATSAPP_APP_SECRET`, essa verificacao fica desligada para facilitar testes locais.

## Auditoria

Cada mensagem recebida e resposta gerada fica registrada em `data/conversations.json`.

Eventos importantes, como pedido criado, status alterado, configuracao salva e webhook processado, ficam em `data/events.json`.

Esses arquivos ajudam a revisar atendimentos durante os testes. Em producao, o ideal e migrar para banco de dados e logs persistentes.

## Payloads aceitos no MVP

A rota aceita formatos simples:

```json
{
  "from": "5511999999999",
  "text": "Fazer pedido"
}
```

Tambem aceita o formato comum de eventos da Meta com `entry`, `changes`, `value` e `messages`, usando texto, botao (`interactive.button_reply`) ou lista (`interactive.list_reply`) quando existir.

Quando o payload da Meta traz `messages[0].id`, o servidor registra esse id em `processed-webhooks.json` para ignorar reentregas do mesmo webhook e evitar pedidos/respostas duplicados.

Payloads de status da Meta (`statuses`) tambem sao aceitos. Eles atualizam a mensagem correspondente em `data/outbox.json` pelo id retornado pela API da Meta, registrando `providerStatus` como `sent`, `delivered`, `read` ou `failed`.

## O que falta para producao

Antes de colocar em producao:

- Publicar o servidor com HTTPS. O `render.yaml` ja deixa um caminho pronto para Render com disco persistente.
- Trocar a protecao opcional por token por autenticacao real no painel.
- Trocar arquivos JSON por banco de dados.
- Para Meta direta, preencher `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.
- Para validar origem dos webhooks da Meta, preencher `WHATSAPP_APP_SECRET`.
- Para outro provedor, criar um adaptador similar a `backend/whatsapp-adapter.js`.
- Validar assinaturas do provedor, quando disponivel.
- Configurar templates aprovados para mensagens iniciadas pela loja.
- Automatizar backup de pedidos e conversas usando `npm run backup`, `/backup.json` ou uma rotina da hospedagem.

## Adaptador por provedor

Cada provedor manda e recebe mensagens com um formato proprio. O caminho recomendado e manter `backend/bot-engine.js` como nucleo da conversa e criar um adaptador pequeno para cada provedor, convertendo:

- Payload recebido -> `{ sessionId, message }`
- Resposta do bot -> chamada HTTP do provedor

Assim o fluxo de atendimento continua igual mesmo se a loja trocar de provedor.
