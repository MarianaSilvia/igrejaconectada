# API

Especificacao OpenAPI:

```text
docs/openapi.json
```

Com o servidor rodando, tambem fica disponivel em:

```text
http://localhost:3000/openapi.json
```

## Autenticacao administrativa

Quando `ADMIN_TOKEN` esta definido, rotas administrativas exigem:

```text
Authorization: Bearer <ADMIN_TOKEN>
```

ou `?token=<ADMIN_TOKEN>` para links de download.

Respostas JSON e preflight `OPTIONS` anunciam CORS com `authorization` e `content-type`, permitindo chamadas administrativas com Bearer token a partir de ferramentas ou paineis externos autorizados.

Requisicoes JSON aceitam corpo de ate 1 MB. Acima desse limite, a API retorna `413` com erro `Payload muito grande.`.

## Rotas principais

- `GET /health`: saude simples.
- `GET /ready`: prontidao local/producao.
- `POST /chat`: simula conversa local. `sessionId` e aparado, usa `demo` quando vazio e aceita ate 200 caracteres; `message` e aparada e aceita ate 4000 caracteres.
- `GET /conversations`: lista conversas em JSON para o painel.
- `GET /conversations.json`: exporta todas as conversas em JSON.
- `GET /conversations/export?sessionId=...`: transcript de conversa. `sessionId` e aparado, obrigatorio e limitado a 200 caracteres.
- `POST /conversations/clear`: limpa conversas.
- `GET /webhooks/whatsapp`: verificacao do webhook.
- `POST /webhooks/whatsapp`: entrada de mensagens do WhatsApp. O identificador da sessao e a mensagem recebida usam os mesmos limites de `/chat`.
- `GET/POST /catalog`: catalogo.
- `GET/POST /faqs`: perguntas frequentes.
- `GET/POST /config`: configuracao da loja.
  A configuracao aceita mensagens principais, instrucao de retirada, horario de atendimento, zonas de entrega e `paymentMethods` com `id`, `label`, `keywords`, `instructions` e `active`.
- `GET /store-profile.json`: baixa configuracao, catalogo e FAQs como perfil da loja.
- `POST /store-profile/validate`: valida um perfil da loja e retorna `issues` quando ainda parece exemplo.
- `POST /store-profile/apply`: aplica um perfil da loja. Exige `confirmApply: true`; antes de sobrescrever configuracao, catalogo e FAQs, cria um snapshot `pre-store-profile` no `DATA_DIR/backups` e retorna `preStoreProfileBackup`.
- `GET /orders`: pedidos.
- `GET /orders.csv`: exporta pedidos em CSV.
- `POST /orders/clear`: limpa pedidos.
- `GET /events`: lista eventos recentes.
- `GET /events.csv`: exporta eventos em CSV.
- `POST /events/clear`: limpa eventos.
- `GET /outbox`: lista caixa de saida.
- `GET /outbox.csv`: exporta caixa de saida em CSV.
- `POST /outbox/clear`: limpa caixa de saida.
- `POST /orders/status`: status, notas internas e aviso opcional ao cliente. `id` e obrigatorio, aparado e limitado a 200 caracteres. Status aceitos: `pending_confirmation`, `confirmed`, `cancelled`, `done`.
- `GET /handoffs`: atendimentos humanos.
- `GET /handoffs.csv`: exporta atendimentos humanos em CSV.
- `POST /handoffs/status`: status/notas de atendimento. `id` e obrigatorio, aparado e limitado a 200 caracteres. Status aceitos: `open`, `in_progress`, `resolved`, `cancelled`.
- `POST /messages/send`: resposta manual do atendente. `sessionId` e `text` sao obrigatorios; o texto e aparado e limitado a 2000 caracteres.
- `POST /outbox/retry`: reenvia uma mensagem failed/skipped da caixa de saida. `id` e obrigatorio, aparado e limitado a 200 caracteres.
- `POST /rate-limits/clear`: limpa contadores temporarios de limite.
- `POST /processed-webhooks/clear`: limpa controle de webhooks ja processados.
- `GET /backup.json`: backup.
- `POST /backup/restore`: restauracao. Exige `confirmRestore: true`; antes de sobrescrever os dados, cria um snapshot `pre-restore` no `DATA_DIR/backups` e retorna o caminho em `preRestoreBackup`.
- `POST /sessions/reset`: reinicia todas as sessoes quando `sessionId` nao e enviado, ou uma sessao especifica quando informado. `sessionId` e aparado e limitado a 200 caracteres.
- `POST /privacy/delete-session`: remocao/anonimizacao por sessao. `sessionId` e obrigatorio, aparado e limitado a 200 caracteres.

## Exemplo local

```powershell
Invoke-RestMethod -Method Post `
  -Uri http://localhost:3000/chat `
  -ContentType 'application/json' `
  -Body '{"sessionId":"cliente-1","message":"Fazer pedido"}'
```
