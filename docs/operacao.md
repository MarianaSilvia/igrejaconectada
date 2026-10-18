# Operacao do MVP local

## Iniciar

No terminal, dentro da pasta do projeto:

```bash
node backend/server.js
```

Se quiser usar variaveis de ambiente, copie `.env.example` para `.env` e preencha os valores. O servidor carrega esse arquivo automaticamente.

Em hospedagem com disco persistente, defina `DATA_DIR` para o caminho montado. No Render Blueprint deste projeto, o valor recomendado e `/var/data`.

Depois abra:

```text
http://localhost:3000/admin
```

## Painel protegido

Por padrao, o painel local abre sem login para facilitar testes no computador.

Para proteger, defina `ADMIN_TOKEN` antes de iniciar:

```powershell
$env:ADMIN_TOKEN="$(npm run --silent secret admin)"; node backend\server.js
```

Em producao, use um token unico com pelo menos 32 caracteres. O comando `npm run secret admin` gera um valor forte para copiar para a hospedagem, e `node scripts\setup-env.js` gera um `.env` local completo.

Depois acesse:

```text
http://localhost:3000/admin?token=cole-o-admin-token-aqui
```

Tambem e possivel abrir `http://localhost:3000/admin` e digitar o token na tela de acesso. O painel salva esse token apenas no navegador local para as proximas chamadas, e o botao "Sair" remove esse acesso do navegador.

APIs administrativas tambem aceitam:

```text
Authorization: Bearer cole-o-admin-token-aqui
```

## Painel

O painel permite:

- Ver prontidao para uso local/producao.
- Editar mensagens principais da loja.
- Editar catalogo.
- Editar perguntas frequentes.
- Testar uma conversa.
- Ver pedidos capturados.
- Atualizar status de pedido.
- Exportar pedidos em CSV.
- Ver eventos recentes.
- Ver historico resumido de conversas.
- Exportar transcript de conversa por sessao.
- Acompanhar fila de atendimento humano.
- Enviar resposta manual para uma sessao em atendimento humano.
- Ver caixa de saida WhatsApp.
- Apagar dados de uma sessao especifica.
- Baixar backup completo em JSON.
- Restaurar backup completo em JSON.
- Limpar pedidos de teste.

Acoes destrutivas no painel, como limpar historico, limpar pedidos, apagar dados de sessao e restaurar backup, pedem confirmacao no navegador antes de continuar.

## Catalogo

No painel, cada produto tem `id`, nome, categoria, preco, estoque opcional, descricao e disponibilidade. Produtos indisponiveis continuam salvos para edicao, mas nao aparecem para o cliente no fluxo do bot. Deixe estoque em branco para nao controlar quantidade; use `0` para esconder temporariamente um item esgotado; use um numero positivo para limitar a quantidade que o cliente pode pedir.

Tambem e possivel aplicar configuracao, catalogo e FAQs em lote a partir de um perfil JSON. Use `docs/store-profile.example.json` como modelo e rode:

```powershell
npm run store:apply -- caminho\perfil-da-loja.json --confirm
```

O comando valida os dados, bloqueia perfis que ainda parecem exemplos e salva um backup `pre-store-profile` antes de sobrescrever os arquivos principais.
Para validar sem gravar, troque `--confirm` por `--dry-run`.

## Entrega

As zonas de entrega ficam na configuracao da loja. No painel, use uma linha por zona:

```text
centro | Centro | centro,rua principal | 8 | ate 60 min | 0 | ativo
retirada | Retirada na loja | retirada,buscar | 0 | combinar horario | 0 | ativo
```

O formato e: `id | nome | palavras-chave | taxa | prazo | pedido minimo | status`. Quando o cliente informa um endereco que contem uma palavra-chave da zona, o bot mostra uma estimativa de frete e prazo, sempre avisando que a loja confirma antes de finalizar.

O backend rejeita produtos sem `id`, nome ou categoria, precos negativos, estoque negativo, disponibilidade fora de verdadeiro/falso e IDs duplicados. Isso evita que um catalogo quebrado seja salvo por API ou backup.

Quando um pedido com produto de estoque controlado e confirmado, o sistema baixa a quantidade do estoque. Se esse pedido voltar para `pending_confirmation` ou for cancelado, a quantidade e restaurada. Pedidos finalizados mantem a baixa.

O painel mostra uma metrica de `Estoque alerta` e destaca produtos com estoque `0`, `1` ou `2`. A rota `/ready` tambem exibe um aviso quando ha produtos com estoque baixo ou zerado.

Quando existir mais de uma categoria ativa, o bot mostra primeiro a lista de categorias. Ao escolher uma categoria, o cliente recebe apenas os produtos daquele grupo. Use nomes curtos e claros, como `Mais vendidos`, `Novidades`, `Promocoes` ou o tipo real de produto da loja.

## Perguntas Frequentes

FAQs tambem podem ser desativadas sem remover. Uma FAQ inativa continua salva e editavel no painel, mas nao e usada pelo bot para responder clientes.

Cada FAQ precisa ter `id`, pergunta, resposta e palavras-chave preenchidas. Palavras-chave vazias ou status fora de verdadeiro/falso sao rejeitados antes de salvar.

## Atendimento Humano

Na configuracao da loja, `Regras para atendente` registra os criterios internos de quando a equipe deve assumir a conversa. `Palavras que chamam atendente` define termos que o bot detecta automaticamente, como reclamacao, troca, devolucao, desconto ou comprovante. Quando uma dessas palavras aparece na mensagem do cliente, a conversa entra na fila de atendimento humano.

Essas regras, palavras-chave e mensagens de status de pedido precisam ficar preenchidas com texto valido. O backend rejeita configuracoes com regras vazias ou mensagens de status vazias para evitar aviso quebrado ao cliente.

O horario de atendimento humano fica na configuracao da loja. No painel, use uma linha por dia:

```text
seg=09:00-18:00
ter=09:00-18:00
qua=09:00-18:00
qui=09:00-18:00
sex=09:00-18:00
sab=09:00-13:00
dom=fechado
```

Quando o cliente pergunta por horario ou pede atendente, o bot informa se o atendimento humano esta aberto ou fechado conforme esse cadastro.

## Prontidao

O painel consulta:

```text
GET /ready
```

Essa rota mostra se catalogo, FAQs, configuracao, dados reais da loja, seguranca do painel, URL publica HTTPS, webhook, assinatura, versao da API Graph, envio WhatsApp, limite de mensagens e diretorio persistente estao configurados.
Ela tambem avisa quando os dados ainda parecem exemplos, como nome `Loja`, produtos demonstrativos ou FAQs genericas.

## Status de pedido

- `pending_confirmation`: pedido recebido, aguardando revisao da loja.
- `confirmed`: pedido confirmado pela loja.
- `cancelled`: pedido cancelado.
- `done`: pedido finalizado.

## Cuidados

- Este MVP usa arquivos JSON locais. Para producao, trocar por banco de dados.
- O painel tem protecao opcional por token, mas para producao ainda e melhor usar autenticacao real.
- O bot nao deve prometer estoque, prazo ou frete sem confirmacao.
- Dados sensiveis de cartao nao devem ser coletados no chat.
- Sessoes ficam persistidas em `data/sessions.json`, entao uma conversa nao se perde ao reiniciar o servidor.
- Historicos de conversa ficam em `data/conversations.json`.
- Eventos recentes ficam em `data/events.json`.
- Perguntas frequentes ficam em `data/faqs.json`.
- Pedidos de atendimento humano ficam em `data/handoffs.json`.
- Contadores temporarios de limite de mensagens ficam em `data/rate-limits.json`.
- Mensagens de saida ficam em `data/outbox.json`.

## Limite de mensagens

Por padrao, cada sessao pode enviar ate 30 mensagens a cada 10 minutos.

Configure com:

```powershell
$env:MESSAGE_RATE_LIMIT="30"
$env:MESSAGE_RATE_WINDOW_MS="600000"
node backend\server.js
```

Use `MESSAGE_RATE_LIMIT=0` para desligar esse limite em desenvolvimento.

Em producao, mantenha `MESSAGE_RATE_LIMIT` e `MESSAGE_RATE_WINDOW_MS` como inteiros positivos. O script `npm run check:production` acusa erro quando esses valores estao vazios, zerados ou invalidos.

## Checagem de saude local

Rode:

```powershell
node scripts\doctor.js
```

ou:

```powershell
.\scripts\doctor.ps1
```

O doctor valida JSON, estrutura de catalogo/FAQs/configuracao, sintaxe JavaScript, self-test e integration-test.

Se o ambiente bloquear HTTP local, use:

```powershell
npm run doctor:offline
```

Esse modo roda as validacoes offline e pula apenas o integration-test que precisa abrir servidor local.
Ele tambem exercita backup/restauracao offline em um `DATA_DIR` temporario, validando o bloqueio sem `--confirm`, a criacao de `pre-restore` e a limpeza de arquivos temporarios.
O doctor tambem avisa se houver arquivos `.tmp` orfaos em `data/`, que podem indicar uma queda durante escrita anterior.

Para exercitar somente o fluxo real do bot com catalogo, configuracao e FAQs atuais, sem servidor:

```powershell
npm run smoke:offline
```

Para salvar um relatorio local de prontidao para producao:

```powershell
npm run production:report
```

O relatorio fica em `reports/production-readiness.md` e lista falhas, avisos e itens aprovados sem gravar credenciais.

## Exportacao

Pedidos podem ser baixados em:

```text
http://localhost:3000/orders.csv
```

O CSV inclui identificador, data, status, cliente, contato, entrega, pagamento, endereco, observacoes e resumo.

No painel, cada pedido tambem aceita notas internas da loja. Essas notas servem para separacao, retirada, prioridade, combinados feitos fora do bot ou qualquer informacao operacional que nao precisa aparecer para o cliente. Ao mudar o status ou clicar em "Salvar pedido", a nota fica gravada no pedido e tambem sai na coluna `internalNotes` do CSV.

Use "Salvar e avisar cliente" quando quiser enviar ao cliente uma mensagem sobre o status atual do pedido. O aviso usa a mesma caixa de saida do WhatsApp; em teste local sem credenciais da Meta, ele fica registrado como `skipped` para auditoria, mostrando o que seria enviado.

As mensagens de aviso de pedido ficam na configuracao da loja. Elas aceitam variaveis simples: `{storeName}`, `{orderId}`, `{status}` e `{customerName}`.

Cada pedido mantem um historico de status no painel. Esse historico registra criacao, mudancas de status, aviso ao cliente e ajuste de estoque, e tambem aparece no CSV na coluna `statusHistory`.

Cada atendimento humano tambem mantem um historico simples no painel, com criacao, mudancas de status e marcacao quando notas internas foram salvas.

Quando houver muitos pedidos, use a busca da secao de pedidos para localizar por cliente, numero do pedido, endereco, forma de pagamento, observacao ou nota interna. O filtro de status ajuda a separar pendentes, confirmados, cancelados e finalizados sem alterar o CSV exportado.

Tambem e possivel exportar historico operacional pelo painel ou pelas rotas:

```text
/conversations.json
/events.csv
/handoffs.csv
/outbox.csv
```

## Backup completo

Baixe tudo em:

```text
http://localhost:3000/backup.json
```

O backup inclui configuracao, catalogo, perguntas frequentes, pedidos, sessoes, conversas, eventos, atendimentos, caixa de saida, contadores temporarios de limite e ids de webhooks ja processados. Se `ADMIN_TOKEN` estiver ativo, use o token no painel ou em `?token=...`.

Na caixa de saida do painel, mensagens `failed` ou `skipped` podem ser reenviadas depois que as credenciais do WhatsApp estiverem configuradas ou depois de uma falha temporaria da Meta.

Quando a Meta envia eventos de status, a caixa de saida tambem passa a mostrar o ultimo status do provedor (`providerStatus`) salvo no item.

Respostas do bot com ate 3 opcoes rapidas sao enviadas ao WhatsApp como botoes interativos quando as credenciais da Meta estao configuradas. Menus com mais opcoes usam lista interativa.

Para restaurar, use o botao "Restaurar backup" no painel ou envie:

```text
POST /backup/restore
```

com corpo:

```json
{
  "confirmRestore": true,
  "backup": { "generatedAt": "...", "config": {}, "catalog": [], "orders": [], "sessions": {}, "conversations": {}, "events": [], "handoffs": [], "outbox": [], "rateLimits": {}, "processedWebhooks": {} }
}
```

Tambem existem comandos offline, uteis antes de deploy ou manutencao:

```powershell
npm run backup
node scripts\restore-data.js backups\backup-arquivo.json --confirm
```

Tanto a rota quanto o comando offline exigem confirmacao explicita e validam configuracao, catalogo e FAQs antes de restaurar. Backups com produto invalido, FAQ sem palavra-chave, regra vazia ou mensagem de status ausente sao recusados antes de sobrescrever os arquivos locais.

Antes de qualquer restauracao valida, o sistema salva automaticamente um backup dos dados atuais em `backups/pre-restore-...json` dentro do `DATA_DIR`. Esse arquivo e a volta rapida caso o backup restaurado nao seja o correto.

As gravacoes dos JSONs operacionais usam escrita atomica: o sistema grava primeiro um arquivo temporario no mesmo diretorio e depois renomeia para o arquivo final. Isso reduz o risco de JSON parcial se o processo cair durante uma atualizacao.

## Privacidade

Para apagar dados de uma sessao especifica:

```text
POST /privacy/delete-session
```

com corpo:

```json
{
  "sessionId": "5511999999999"
}
```

A rotina remove sessao, conversa, atendimentos, caixa de saida e rate-limit da sessao. Pedidos ja registrados sao mantidos para controle operacional, mas ficam anonimizados, incluindo observacoes do cliente e notas internas.

## Retencao de dados

Para simular uma limpeza de dados operacionais antigos:

```powershell
npm run retention:purge -- --days 180 --dry-run
```

Para aplicar:

```powershell
npm run retention:purge -- --days 180 --confirm
```

O comando remove conversas antigas e suas sessoes, eventos antigos, caixa de saida antiga, webhooks processados antigos, rate-limits antigos e atendimentos resolvidos/cancelados antigos. Pedidos nao sao apagados por essa rotina. Antes de aplicar, o sistema cria um backup `pre-purge-...json` dentro de `DATA_DIR/backups`.
