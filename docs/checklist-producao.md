# Checklist para deixar em producao

## Antes de publicar

- Preencher catalogo real em `data/catalog.json`.
- Preencher perguntas frequentes reais em `data/faqs.json`.
- Preencher mensagens reais no painel ou em `data/store-config.json`.
- Preencher horario real de atendimento humano na configuracao da loja.
- Preencher zonas reais de entrega, taxa, prazo e pedido minimo quando a loja fizer entrega.
- Opcionalmente, aplicar tudo de uma vez com `npm run store:apply -- caminho\perfil-da-loja.json --confirm`.
- Gerar `ADMIN_TOKEN` com `npm run secret admin` e guardar fora do repositorio.
- Definir `PUBLIC_BASE_URL` com HTTPS publico.
- Definir `DATA_DIR` para um diretorio persistente quando hospedar em servidor.
- Confirmar no painel que `/ready` mostra URL publica, diretorio persistente, API Graph e limite de mensagens como `ok`.
- Gerar `WHATSAPP_VERIFY_TOKEN` com `npm run secret verify` e usar o mesmo valor na Meta.
- Definir `WHATSAPP_APP_SECRET` para validar assinatura dos webhooks.
- Definir `WHATSAPP_ACCESS_TOKEN` para envio pela API da Meta.
- Definir `WHATSAPP_PHONE_NUMBER_ID` com o id do numero conectado.
- Definir `MESSAGE_RATE_LIMIT` e `MESSAGE_RATE_WINDOW_MS` como inteiros positivos conforme volume esperado.
- Usar Meta direta, que ja tem adaptador neste projeto, ou criar um adaptador equivalente para outro provedor.
- Configurar HTTPS publico.
- Rodar `npm run check:production:offline` antes de ter a URL publica final ou enquanto o servidor ainda nao estiver acessivel.
- Rodar `npm run production:report` para salvar um resumo local em `reports/production-readiness.md`.
- Confirmar que a checagem `Dados reais da loja` nao aponta nome, produtos, mensagens ou FAQs de exemplo.
- Rodar `node backend/integration-test.js`.
- Rodar `node scripts/doctor.js`.
- Rodar `npm run check:production` e conferir `/health`, headers de seguranca, `/openapi.json`, prototipo `/prototype`, bloqueio sem token, painel `/admin`, assets do painel, `/ready`, cache administrativo desabilitado, verificacao do webhook, CSVs e backup validado sem falhas.
- Fazer backup dos dados locais.

## Se usar Meta direta

- Criar app no painel da Meta.
- Conectar numero do WhatsApp Business.
- Obter `WHATSAPP_PHONE_NUMBER_ID`.
- Obter `WHATSAPP_ACCESS_TOKEN`.
- Configurar URL do webhook:

```text
https://seu-dominio.com/webhooks/whatsapp
```

- Configurar token de verificacao igual a `WHATSAPP_VERIFY_TOKEN`.
- Assinar eventos de mensagens.
- Rodar `node scripts\verify-whatsapp.js https://seu-dominio.com` antes de salvar o webhook na Meta.
- Testar mensagem recebida e resposta enviada.
- Rodar `node scripts\send-whatsapp-test.js <numero>` para validar envio ativo pela API da Meta.

## Melhorias antes de escala

- Trocar JSON por banco de dados.
- Adicionar login real no painel.
- Adicionar logs persistentes.
- Automatizar backup fora do servidor, usando `npm run backup` ou uma rotina da hospedagem.
- Definir uma rotina de retencao com `npm run retention:purge -- --days 180 --dry-run` antes de aplicar com `--confirm`.
- Revisar `data/conversations.json` e `data/events.json` nos testes.
- Separar ambiente de teste e producao.
- Criar templates aprovados para mensagens ativas.

## Pronto para uso assistido

O projeto esta pronto para uso assistido quando:

- O painel abre.
- Catalogo real esta salvo.
- Configuracao real esta salva.
- `/health` retorna `ok: true`.
- `/ready` mostra todos os itens criticos como `ok`.
- `/webhooks/whatsapp` valida o token.
- Um payload recebido gera resposta.
- Um pedido completo aparece em `/orders`.
- O atendente consegue confirmar ou cancelar o pedido.
- O atendente consegue salvar o pedido e avisar o cliente pela caixa de saida.
- O atendimento aparece em `/conversations`.
- O pedido criado aparece em `/events`.
- Um pedido de atendente aparece em `/handoffs`.
- Uma resposta manual pode ser registrada/enviada por `/messages/send`.
- Mensagens de webhook aparecem em `/outbox`.
- Remocao de dados por sessao funciona em `/privacy/delete-session`.
- `/backup.json` baixa os dados locais.
- Um backup baixado pode ser restaurado pelo painel ou por `/backup/restore`.
