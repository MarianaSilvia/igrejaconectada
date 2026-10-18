# Arquitetura sugerida

## Fase 1: Prototipo local

Objetivo: validar texto, fluxo e regras da conversa antes de pagar ou configurar uma API de WhatsApp.

Componentes:

- Simulador em HTML/JS.
- Catalogo simples em arquivo local.
- Resumo manual do pedido.

## Fase 2: Backend do bot

Objetivo: receber mensagens reais e responder com regras consistentes.

Componentes:

- API em Node.js.
- Webhook para receber eventos do provedor de WhatsApp.
- Catalogo e configuracao editaveis em `data/`.
- Perguntas frequentes editaveis em `data/faqs.json`.
- Armazenamento inicial de pedidos em `data/orders.json`.
- Sessoes persistidas em `data/sessions.json`.
- Historico de mensagens em `data/conversations.json`.
- Eventos de auditoria em `data/events.json`.
- Fila de atendimento humano em `data/handoffs.json`.
- Historico de mensagens de saida em `data/outbox.json`.
- Envio WhatsApp isolado em `backend/whatsapp-adapter.js`.
- Painel administrativo simples para acompanhar pedidos.

Rotas locais ja preparadas:

- `GET /`: redireciona para o painel local.
- `GET /admin`: painel operacional local.
- `GET /prototype`: simulador visual do WhatsApp.
- `GET /health`: checagem de saude.
- `GET /ready`: checagem de prontidao local/producao.
- `GET /config`: le configuracao da loja.
- `POST /config`: salva configuracao da loja.
- `GET /catalog`: lista produtos disponiveis.
- `POST /catalog`: salva catalogo editado.
- `GET /faqs`: lista perguntas frequentes cadastradas para administracao.
- `POST /faqs`: salva perguntas frequentes.
- `GET /orders`: lista pedidos capturados.
- `GET /orders.csv`: exporta pedidos em CSV.
- `POST /orders/status`: atualiza status e notas internas de pedido.
- `POST /orders/clear`: limpa pedidos de teste.
- `GET /conversations`: lista conversas registradas.
- `GET /conversations/export?sessionId=...`: exporta transcript de uma conversa em texto.
- `POST /conversations/clear`: limpa historico de conversas.
- `GET /events`: lista eventos recentes.
- `POST /events/clear`: limpa eventos.
- `GET /handoffs`: lista atendimentos humanos.
- `GET /handoffs.csv`: exporta atendimentos humanos em CSV.
- `POST /handoffs/status`: atualiza status e notas de atendimento humano.
- `POST /messages/send`: registra/envia resposta manual de atendente para uma sessao, com texto obrigatorio e limite de 2000 caracteres.
- `GET /outbox`: lista mensagens de saida.
- `POST /outbox/clear`: limpa historico de saida.
- `POST /outbox/retry`: tenta reenviar uma mensagem de saida com status `failed` ou `skipped`.
- `POST /rate-limits/clear`: limpa contadores temporarios de limite de mensagens.
- `POST /processed-webhooks/clear`: limpa ids de webhooks ja processados durante testes.
- `POST /privacy/delete-session`: remove dados pessoais de uma sessao e anonimiza pedidos relacionados.
- `GET /backup.json`: exporta backup completo dos dados locais.
- `POST /backup/restore`: restaura backup completo dos dados locais, exigindo `confirmRestore: true`.
- `POST /sessions/reset`: reinicia uma sessao ou todas as sessoes em memoria; `sessionId` vazio e rejeitado quando informado.
- `GET /webhooks/whatsapp`: verificacao de webhook por token.
- `POST /chat`: simula uma conversa por sessao.
- `POST /webhooks/whatsapp`: recebe payload, roda o bot e tenta enviar respostas pela API da Meta quando credenciais existem.

Seguranca local:

- `ADMIN_TOKEN` protege painel e rotas administrativas quando configurado.
- Sem `ADMIN_TOKEN`, o projeto roda aberto para facilitar desenvolvimento local.

## Fase 3: WhatsApp real

Opcoes comuns:

- WhatsApp Business Platform da Meta.
- Provedores como Twilio, Zenvia, Take Blip ou 360dialog.

Fluxo tecnico:

1. Cliente envia mensagem no WhatsApp.
2. Provedor chama o webhook do backend.
3. Backend identifica intencao e estado da conversa.
4. Backend consulta catalogo, regras e pedidos.
5. Backend envia resposta pelo provedor.
6. Pedido confirmado aparece no painel ou em uma planilha.

## Fase 4: IA com controle

A IA entra melhor quando existe uma base confiavel:

- Catalogo.
- Politicas de entrega.
- Formas de pagamento.
- Perguntas frequentes.
- Regras de transferencia para humano.

Recomendacao: usar IA para perguntas abertas, mas manter pedidos, valores, pagamento e prazos em regras deterministicas.
