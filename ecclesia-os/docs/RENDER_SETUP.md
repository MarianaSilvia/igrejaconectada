# Configuração do piloto no Render

Este guia configura a homologação do EcclesiaOS sem colocar segredos no GitHub.

## 1. Serviço

Use o serviço:

- Nome: `ecclesia-os-api-v2`
- Branch: `ecclesia-os-complete`
- URL: `https://ecclesia-os-api-v2.onrender.com`
- Health check: `/health`

O processo web já usa `0.0.0.0:$PORT`.

## 2. Variáveis públicas

No Render, em **Environment**, configure:

```text
APP_MODE=homologation
MODE=homologation
HOST=0.0.0.0
PUBLIC_ORIGIN=https://ecclesia-os.vercel.app
RUN_INTEGRATION_WORKER=false
```

`APP_MODE` é a variável oficial; `MODE` é aceito como compatibilidade.

## 3. PostgreSQL

No projeto Supabase EcclesiaOS, abra **Connect** e obtenha conexões separadas para:

```text
DATABASE_URL
SERVICE_DATABASE_URL
MIGRATION_DATABASE_URL
```

Use:

- `DATABASE_URL`: runtime da aplicação;
- `SERVICE_DATABASE_URL`: operações internas e relatórios agregados;
- `MIGRATION_DATABASE_URL`: aplicação das migrações.

Não reutilize a mesma senha ou o mesmo usuário entre os três papéis.

## 4. Chaves

Gere duas chaves diferentes de 32 bytes e mantenha-as somente no Render:

```text
DATA_KEY_HEX
MFA_KEY_HEX
```

Nunca coloque essas chaves no GitHub, Vercel, frontend, screenshots ou mensagens.

## 5. Efí

Em homologação, configure:

```text
EFI_CONFIG_PATH
EFI_WEBHOOK_CA_PATH
EFI_TLS_CERT_PATH
EFI_TLS_KEY_PATH
```

O arquivo de contas Efí deve permanecer fora do repositório e conter somente credenciais sandbox.

## 6. Ordem de validação

Depois de salvar as variáveis:

```bash
npm run pilot:preflight:homologation
npm run test:postgres
```

Valide nesta ordem:

1. `GET /health` retorna HTTP 200.
2. `GET /api/health/ready` confirma banco, chaves, origem e Efí.
3. Usuário administrador ativa MFA.
4. Sede cria duas congregações.
5. Cada congregação recebe sua secretária por convite.
6. Uma congregação não acessa dados da outra.
7. O administrador da rede vê somente indicadores autorizados.
8. O operador de plataforma vê apenas dados comerciais.
9. O webhook Efí é testado em sandbox.
10. O backup é restaurado em banco separado.

Não altere para produção nem habilite pagamentos reais antes de todos os testes passarem.
