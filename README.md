# Chatbot de WhatsApp para loja

Base inicial para planejar e prototipar um chatbot de atendimento e vendas pelo WhatsApp.

## Objetivo do MVP

Criar um assistente que responda ao primeiro contato do cliente, apresente categorias de produtos, colete dados do pedido e entregue um resumo pronto para confirmação manual pela loja.

## Entregas nesta pasta

- `docs/briefing.md`: perguntas para fechar o escopo da loja.
- `docs/fluxo-atendimento.md`: fluxo inicial da conversa.
- `docs/arquitetura.md`: sugestao de arquitetura para sair do prototipo e chegar no WhatsApp real.
- `docs/operacao.md`: como usar o painel local no dia a dia.
- `docs/integracao-whatsapp.md`: caminho para conectar com provedor de WhatsApp.
- `data/catalog.json`: catalogo editavel usado pelo backend.
- `data/faqs.json`: perguntas frequentes editaveis usadas pelo bot.
- `data/store-config.json`: mensagens e regras basicas da loja.
- `data/sessions.json`: sessoes persistidas entre reinicios.
- `data/conversations.json`: historico de mensagens.
- `data/events.json`: eventos de auditoria.
- `data/handoffs.json`: fila de atendimento humano.
- `data/outbox.json`: historico de mensagens de saida WhatsApp.
- `backend/server.js`: servidor local com rotas de chat, catalogo, pedidos e webhook.
- `backend/env.js`: carregamento local de `.env` sem dependencias externas.
- `backend/data-validators.js`: validacoes compartilhadas de catalogo, FAQs, configuracao, backup e status.
- `backend/whatsapp-adapter.js`: adaptador de envio pela API da Meta.
- `backend/integration-test.js`: teste de integracao do servidor local.
- `scripts/setup-env.js`: gera `.env` local com tokens fortes para iniciar com seguranca.
- `scripts/generate-secret.js`: gera tokens fortes para producao.
- `scripts/apply-store-profile.js`: aplica dados reais da loja a partir de um perfil JSON validado.
- `scripts/purge-data.js`: simula ou aplica limpeza de dados operacionais antigos com backup.
- `scripts/verify-whatsapp.js`: testa token, assinatura e payload do webhook em URL local ou publicada.
- `scripts/send-whatsapp-test.js`: envia uma mensagem real de teste pela API da Meta quando credenciais existem.
- `scripts/production-check.js`: verifica ambiente local/producao antes de conectar a Meta.
- `scripts/backup-data.js` e `scripts/restore-data.js`: backup/restauracao offline dos dados locais.
- `scripts/doctor.js`: checagem completa de saude do projeto.
- `admin/index.html`: painel local para operar o MVP.
- `prototype/index.html`: simulador local do chatbot.
- `Dockerfile`: empacotamento opcional em container.
- `render.yaml`: Blueprint para publicar em HTTPS no Render com disco persistente.
- `docs/deploy.md`: instrucoes de publicacao.
- `docs/api.md` e `docs/openapi.json`: documentacao da API.

## Como testar o prototipo

Abra o arquivo `prototype/index.html` no navegador. Ele funciona localmente, sem servidor e sem instalar dependencias.

## Como testar o backend local

Com Node.js 18 ou superior, gere a configuracao local:

```bash
npm run setup
```

Ou, sem npm:

```bash
node scripts/setup-env.js
```

Depois inicie:

```bash
node backend/server.js
```

Para proteger o painel:

```powershell
$env:ADMIN_TOKEN="$(npm run --silent secret admin)"; node backend\server.js
```

Depois abra `http://localhost:3000/admin` e digite o token gerado, ou use `http://localhost:3000/admin?token=cole-o-admin-token-aqui`.

Tambem da para copiar `.env.example` para `.env`, preencher os valores manualmente e rodar apenas:

```powershell
node backend\server.js
```

Rotas principais:

- `GET http://localhost:3000/`
- `GET http://localhost:3000/admin`
- `GET http://localhost:3000/prototype`
- `GET http://localhost:3000/health`
- `GET http://localhost:3000/openapi.json`
- `GET http://localhost:3000/ready`
- `GET http://localhost:3000/catalog`
- `POST http://localhost:3000/catalog`
- `GET http://localhost:3000/faqs`
- `POST http://localhost:3000/faqs`
- `GET http://localhost:3000/config`
- `POST http://localhost:3000/config`
- `GET http://localhost:3000/orders`
- `GET http://localhost:3000/orders.csv`
- `POST http://localhost:3000/orders/status`
- `POST http://localhost:3000/orders/clear`
- `GET http://localhost:3000/conversations`
- `GET http://localhost:3000/conversations.json`
- `GET http://localhost:3000/conversations/export?sessionId=...`
- `POST http://localhost:3000/conversations/clear`
- `GET http://localhost:3000/events`
- `GET http://localhost:3000/events.csv`
- `POST http://localhost:3000/events/clear`
- `GET http://localhost:3000/handoffs`
- `GET http://localhost:3000/handoffs.csv`
- `POST http://localhost:3000/handoffs/status`
- `POST http://localhost:3000/messages/send`
- `GET http://localhost:3000/outbox`
- `GET http://localhost:3000/outbox.csv`
- `POST http://localhost:3000/outbox/clear`
- `POST http://localhost:3000/outbox/retry`
- `POST http://localhost:3000/rate-limits/clear`
- `POST http://localhost:3000/processed-webhooks/clear`
- `POST http://localhost:3000/privacy/delete-session`
- `GET http://localhost:3000/backup.json`
- `POST http://localhost:3000/backup/restore`
- `POST http://localhost:3000/chat`
- `POST http://localhost:3000/sessions/reset`
- `GET http://localhost:3000/webhooks/whatsapp`
- `POST http://localhost:3000/webhooks/whatsapp`

Se `WHATSAPP_APP_SECRET` estiver configurado, `POST /webhooks/whatsapp` exige assinatura `X-Hub-Signature-256`.

O servidor tambem aplica limite por sessao com `MESSAGE_RATE_LIMIT` e `MESSAGE_RATE_WINDOW_MS`.

Se `npm` estiver disponivel no computador, tambem da para usar:

```bash
npm start
```

## Painel local

Depois de iniciar o servidor, abra:

```text
http://localhost:3000/admin
```

O painel permite:

- Ver metricas basicas.
- Editar o catalogo com categorias, estoque opcional e disponibilidade.
- Ver pedidos capturados.
- Buscar, filtrar, anotar, mudar status e avisar cliente sobre pedido.
- Personalizar mensagens de aviso para pedidos pendentes, confirmados, cancelados e finalizados.
- Configurar horario de atendimento humano.
- Configurar instrucoes de retirada na loja.
- Configurar zonas de entrega com taxa e prazo estimados.
- Configurar formas de pagamento com instrucoes exibidas durante o pedido.
- Configurar regras e palavras que abrem atendimento humano.
- Acompanhar atendimentos humanos e enviar resposta manual.
- Exportar pedidos, conversas, eventos, caixa de saida e backup.
- Testar mensagens direto contra o backend.

## Verificacao local

```bash
npm run check
node backend/self-test.js
node backend/integration-test.js
```

Ou rode a verificacao completa, incluindo JSONs, estrutura dos dados, sintaxe e testes:

```bash
node scripts/doctor.js
```

Se o ambiente nao permitir abrir servidor local para o teste de integracao, rode a checagem offline:

```bash
npm run doctor:offline
```

Para testar apenas o fluxo real do bot com os dados atuais, sem servidor:

```bash
npm run smoke:offline
```

Para testar o webhook como a Meta faria, com o servidor rodando:

```bash
node scripts/verify-whatsapp.js http://localhost:3000
```

Para testar uma mensagem ativa com botoes:

```bash
node scripts/send-whatsapp-test.js 5511999999999 "Escolha uma opcao" --buttons "Fazer pedido,Pagamento,Atendente"
```

Para checar se o ambiente esta pronto para producao:

```bash
npm run check:production
```

Antes de ter URL publica em HTTPS, tambem existe a checagem parcial offline:

```bash
npm run check:production:offline
```

Para gerar um relatorio local com falhas, avisos e itens aprovados:

```bash
npm run production:report
```

O arquivo sai em `reports/production-readiness.md` e nao deve guardar credenciais.

Para gerar tokens fortes para `ADMIN_TOKEN` e `WHATSAPP_VERIFY_TOKEN`:

```bash
npm run secret admin
npm run secret verify
```

Para aplicar dados reais da loja em lote, copie [docs/store-profile.example.json](C:/Users/maria/Downloads/projesto%20em%20mente/docs/store-profile.example.json), troque pelos dados reais e rode:

```bash
npm run store:apply -- caminho/do/perfil.json --confirm
```

No Docker, monte um volume em `/data` para preservar os JSONs operacionais entre recriacoes do container.

O backup offline tambem valida configuracao, catalogo, FAQs e formato basico do backup antes de gravar o arquivo. Para restaurar offline, use `--confirm`:

```bash
npm run backup
node scripts/restore-data.js backups/backup-arquivo.json --confirm
```

Para revisar ou aplicar retencao de dados antigos:

```bash
npm run retention:purge -- --days 180 --dry-run
npm run retention:purge -- --days 180 --confirm
```

Exemplo de corpo para `/chat`:

```json
{
  "sessionId": "cliente-1",
  "message": "Fazer pedido"
}
```

## Proximo passo recomendado

Preencher `data/catalog.json`, `data/store-config.json` e o briefing com os dados reais da loja. Depois disso, o fluxo pode ser conectado a um provedor de WhatsApp Business.
