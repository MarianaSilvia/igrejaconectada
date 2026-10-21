# Recriar o Supabase do Igreja Conectada

Este roteiro prepara um projeto Supabase novo sem depender do projeto antigo. O banco novo começa vazio: o código e o SQL não recuperam automaticamente os 50 membros antigos.

## 1. Criar o projeto

1. Entre na conta Supabase correta e crie um projeto novo.
2. Anote o `Project URL` e a chave pública `anon` ou `publishable` em `Project Settings > API`.
3. Em `Authentication > URL Configuration`, depois do deploy, cadastre:
   - a URL principal do sistema;
   - a URL `/sistema`;
   - a URL de recuperação com `?recuperar=senha`.

## 2. Criar as tabelas mínimas

Abra `SQL Editor > New query`, cole o conteúdo completo de `db/supabase-bootstrap.sql` e execute. Ele cria o estado principal, membros, pré-cadastros, notificações, Kids, comunicação, exclusão de conta e o bucket privado de fotos.

Depois execute, nesta ordem, se os módulos correspondentes forem usados:

1. `db/supabase-congregation-scope.sql`
2. `db/supabase-contact-leadership.sql`
3. `db/supabase-security-mobile-readiness.sql`
4. `db/supabase-storage-hardening.sql`
5. `db/supabase-congregation-rls-aliases.sql`

O arquivo `db/supabase-remove-legacy-chat.sql` só deve ser executado se o chat coletivo antigo tiver sido validado e não for mais necessário.

## 3. Criar o primeiro administrador

1. Em `Authentication > Users`, crie o usuário administrador e confirme o e-mail.
2. O perfil precisa receber `app_metadata` compatível com o app:

```json
{
  "church_gp_role": "ADMIN",
  "church_gp_access": "approved",
  "status": "Ativo",
  "church_gp_congregation_scope": "Todas"
}
```

Não use `user_metadata` para autorização. Se o painel não permitir editar `app_metadata`, faça isso por uma rota administrativa segura ou pelo procedimento oficial do projeto, nunca expondo a `service_role` no navegador.

## 4. Configurar o provedor

Cadastre no Vercel/Render as variáveis de `.env.example`:

- `NEXT_PUBLIC_SUPABASE_URL`: URL do projeto novo.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`: chave pública do projeto novo.
- `SUPABASE_SERVICE_ROLE_KEY`: chave secreta do projeto novo, somente no servidor.
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`: opcionais para push.
- `CRON_SECRET`: segredo longo e exclusivo para rotinas.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` e `TURNSTILE_SECRET_KEY`: opcionais para cadastro público.

Depois de salvar as variáveis, faça um novo deploy. Variáveis de build do Next.js só chegam ao navegador em uma nova compilação.

## 5. Teste mínimo antes de importar dados

1. Abra `/` e `/sistema`.
2. Faça login com o administrador novo.
3. Confirme que o painel carrega sem `Supabase administrativo não configurado`.
4. Crie um backup vazio pelo módulo Configurações.
5. Faça um pré-cadastro de teste.
6. Crie um membro de teste, uma agenda e um mural.
7. Remova os dados de teste depois da validação.

## 6. Importar dados antigos

O backup antigo precisa ser um JSON exportado pelo módulo Configurações ou um arquivo confiável. Não importe CSVs de teste nem invente registros. Antes de importar, faça um backup do projeto novo e valide os totais.

## 7. Checklist de segurança

- Nunca coloque `SUPABASE_SERVICE_ROLE_KEY` em `NEXT_PUBLIC_*`.
- Nunca comite `.env.local`.
- Mantenha `member-photos` privado.
- Use HTTPS e configure URLs de recuperação.
- Faça primeiro um teste com dados fictícios.
