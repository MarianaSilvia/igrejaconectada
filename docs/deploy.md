# Deploy

Este projeto nao depende de pacotes externos. Ele pode rodar em qualquer ambiente com Node.js 18+.

## Variaveis recomendadas

Use `.env.example` para desenvolvimento local e `.env.production.example` como referencia de producao.

```text
PORT=3000
PUBLIC_BASE_URL=https://seu-dominio.com
DATA_DIR=/var/data
ADMIN_TOKEN=admin_valor_gerado_com_npm_run_secret_admin
WHATSAPP_VERIFY_TOKEN=verify_valor_gerado_com_npm_run_secret_verify
WHATSAPP_APP_SECRET=segredo-do-app-meta
WHATSAPP_ACCESS_TOKEN=token-da-meta
WHATSAPP_PHONE_NUMBER_ID=id-do-numero
WHATSAPP_GRAPH_VERSION=v20.0
MESSAGE_RATE_LIMIT=30
MESSAGE_RATE_WINDOW_MS=600000
```

`MESSAGE_RATE_LIMIT` e `MESSAGE_RATE_WINDOW_MS` precisam ser inteiros positivos em producao; o `production-check` falha quando algum deles esta vazio, zerado ou invalido.

`ADMIN_TOKEN` e `WHATSAPP_VERIFY_TOKEN` precisam ter pelo menos 32 caracteres e nao podem ser placeholders em producao.

`WHATSAPP_GRAPH_VERSION` deve seguir o formato usado pela API Graph da Meta, por exemplo `v20.0`.

Para gerar tokens fortes:

```powershell
npm run secret admin
npm run secret verify
```

Use o primeiro valor em `ADMIN_TOKEN` e o segundo em `WHATSAPP_VERIFY_TOKEN`. Guarde esses valores fora do repositorio.

## Rodar localmente

Gere um `.env` local com tokens fortes:

```powershell
node scripts\setup-env.js
```

Se precisar recriar o arquivo:

```powershell
node scripts\setup-env.js --force
```

Depois preencha as variaveis `WHATSAPP_*` da Meta quando for usar WhatsApp real e rode:

```powershell
node backend\server.js
```

Tambem e possivel copiar `.env.example` para `.env` e preencher tudo manualmente.

Tambem e possivel definir variaveis direto no terminal:

```powershell
$env:ADMIN_TOKEN="$(npm run --silent secret admin)"
node backend\server.js
```

Ou:

```powershell
.\scripts\start-local.ps1
```

## Docker

Build:

```bash
docker build -t chatbot-whatsapp-loja .
```

Run:

```bash
docker run --rm -p 3000:3000 \
  -v chatbot-whatsapp-data:/data \
  -e ADMIN_TOKEN=admin_valor_gerado_com_npm_run_secret_admin \
  -e WHATSAPP_VERIFY_TOKEN=verify_valor_gerado_com_npm_run_secret_verify \
  chatbot-whatsapp-loja
```

A imagem usa `DATA_DIR=/data` por padrao e declara esse caminho como volume. Monte um volume nomeado ou diretorio do host para preservar pedidos, sessoes, conversas, eventos, caixa de saida e backups entre recriacoes do container.

## Render Blueprint

O arquivo `render.yaml` cria um Web Service Node com health check em `/health` e disco persistente em `/var/data`.

1. Envie esta pasta para um repositorio Git.
2. No Render, crie um Blueprint usando o repositorio.
3. Gere valores para `ADMIN_TOKEN` e `WHATSAPP_VERIFY_TOKEN` com `npm run secret admin` e `npm run secret verify`.
4. Preencha `ADMIN_TOKEN`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_ACCESS_TOKEN` e `WHATSAPP_PHONE_NUMBER_ID`.
5. Depois do primeiro deploy, copie a URL publica do Render para `PUBLIC_BASE_URL`.
6. Rode `npm run check:production:offline` para validar variaveis e dados antes das chamadas HTTP.
7. Rode `node scripts\verify-whatsapp.js https://sua-url.onrender.com`.

O `DATA_DIR=/var/data` faz o backend gravar pedidos, sessoes, conversas, eventos e backups operacionais, incluindo snapshots `pre-restore`, no disco persistente, em vez de depender dos arquivos empacotados no deploy.

## Hospedagem

Para usar WhatsApp real, a rota abaixo precisa estar publica em HTTPS:

```text
https://seu-dominio.com/webhooks/whatsapp
```

Antes de cadastrar a URL na Meta, valide a publicacao:

```powershell
node scripts\verify-whatsapp.js https://seu-dominio.com
```

Depois de configurar credenciais de envio, valide tambem o envio ativo:

```powershell
node scripts\send-whatsapp-test.js 5511999999999 "Teste do chatbot da loja"
```

Rode tambem a checagem de producao:

```powershell
npm run check:production
```

Ela valida variaveis de ambiente, estrutura dos dados locais, `/health`, headers HTTP basicos de seguranca com CSP, `/openapi.json`, prototipo `/prototype`, bloqueio de rotas administrativas sem token, CORS com `authorization`, painel `/admin`, assets do painel, `/ready`, cache desabilitado em rotas administrativas, verificacao do webhook WhatsApp, CSVs, perfil da loja, estrutura do backup HTTP e bloqueio de restauracao sem `confirmRestore` usando `ADMIN_TOKEN`.
Ela tambem reprova dados de exemplo, como nome `Loja`, produtos demonstrativos e FAQs genericas, quando estiver em modo producao.

Antes de ter uma URL publica, rode a parte offline:

```powershell
npm run check:production:offline
```

Esse modo valida variaveis e dados locais, mas pula as chamadas HTTP. Ele nao substitui o `npm run check:production` final com `PUBLIC_BASE_URL` em HTTPS.

Para compartilhar o estado de prontidao sem copiar a saida do terminal, gere um relatorio local:

```powershell
npm run production:report
```

O relatorio fica em `reports/production-readiness.md`, com falhas, avisos e itens aprovados. Ele nao inclui segredos, mas ainda assim deve ser tratado como artefato operacional local.

Para persistencia real, substitua os arquivos JSON em `data/` por banco de dados antes de colocar alto volume.

Enquanto usar JSONs, planeje uma rotina de retencao para reduzir historico operacional antigo:

```powershell
npm run retention:purge -- --days 180 --dry-run
```
