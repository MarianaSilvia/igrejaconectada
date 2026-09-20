# Checklist de Deploy

## GitHub

1. Confirme que o projeto esta validado:

```bash
pnpm run build
```

2. Crie o repositorio no GitHub.
3. Conecte o repositorio local ao GitHub:

```bash
git remote add github https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u github main
```

Se o remoto `origin` ja estiver apontando para outro lugar, use o nome `github` como acima para nao apagar o fluxo atual.

## Hospedagem atual

1. Acesse o painel do Vercel.
2. Clique em `Add New Project`.
3. Selecione o repositorio do GitHub.
4. Use as configuracoes do arquivo `vercel.json`.
5. Publique.

Nao desligue a Vercel enquanto as rotas em `app/api` e os dois agendamentos ainda nao tiverem sido transferidos para Supabase Edge Functions. Uma hospedagem estatica simples nao executa essas APIs.

## Variaveis de ambiente

Para conectar ao Supabase em producao, configure no provedor atual:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://bssrgotlvvexvrutshqz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_publica_do_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_privada
NEXT_PUBLIC_VAPID_PUBLIC_KEY=sua_chave_publica_vapid
VAPID_PRIVATE_KEY=sua_chave_privada_vapid
VAPID_SUBJECT=mailto:secretaria@igrejaconectada.app
CRON_SECRET=segredo_forte_para_rotinas_automaticas
NEXT_PUBLIC_TURNSTILE_SITE_KEY=sua_chave_publica_turnstile
TURNSTILE_SECRET_KEY=sua_chave_privada_turnstile
```

Essas variaveis podem ser cadastradas em `Project Settings > Environment Variables`. A `SUPABASE_SERVICE_ROLE_KEY` e secreta, fica somente no servidor e e necessaria para criar usuarios reais pelo modulo de acessos.
`VAPID_PRIVATE_KEY` tambem e secreta e fica somente no servidor; ela permite enviar notificacoes Push Web para aparelhos inscritos.
`TURNSTILE_SECRET_KEY` e `CRON_SECRET` tambem sao segredos exclusivos do backend.

## Supabase Auth

- Cadastre a URL publica oficial em `Authentication > URL Configuration > Site URL`.
- Inclua a URL oficial e os enderecos de preview autorizados em `Redirect URLs`.
- A recuperacao usa a raiz do sistema com `?recuperar=senha`; sem a URL autorizada, o link enviado por e-mail sera recusado.
- O login exige `church_gp_access=approved` e status `Ativo` no `app_metadata`.

## Depois do primeiro deploy

- Cada envio para a branch `main` pode gerar uma nova publicacao.
- Branches separadas podem gerar previews para revisao.
- O sistema ja usa Supabase; nunca publique sem as tres chaves obrigatorias (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`).
- Para uso real, confirme que Supabase Auth, `church_app_state`, `registration_requests` e o espelho `members` estao funcionando antes de cadastrar dados sensiveis.
- A versao atual ja inclui PWA. Depois do deploy, abra a URL no celular e teste "Adicionar a tela inicial" no Android/Chrome e iPhone/Safari.
- O service worker nao salva dados sensiveis offline; ele cacheia apenas arquivos estaticos do app.
