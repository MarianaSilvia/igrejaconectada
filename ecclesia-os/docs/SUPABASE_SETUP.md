# Conexão do EcclesiaOS ao Supabase

O banco Supabase do EcclesiaOS está no projeto `vsqumzgcbkeiiokpwdzm`, na região `sa-east-1`:

https://supabase.com/dashboard/project/vsqumzgcbkeiiokpwdzm

As migrações foram aplicadas até a estrutura comercial e o endurecimento RLS. O banco está vazio e não contém membros ou dados de piloto.

## Credenciais necessárias

O runtime exige dois usuários PostgreSQL distintos:

- `ecclesia_app`: usado em requisições com `SET LOCAL ROLE ecclesia_app`;
- `ecclesia_service`: usado somente para tarefas internas, migrações operacionais e jobs.

O usuário de aplicação não pode ser superusuário, não pode ter `BYPASSRLS` e não pode ser membro do papel de serviço. A senha do banco deve ser obtida no painel do projeto e mantida somente no ambiente de execução.

Configure no ambiente do servidor:

```env
APP_MODE=homologation
DATABASE_URL=postgresql://<usuario-app>:<senha>@db.vsqumzgcbkeiiokpwdzm.supabase.co:5432/postgres?sslmode=require
SERVICE_DATABASE_URL=postgresql://<usuario-service>:<senha>@db.vsqumzgcbkeiiokpwdzm.supabase.co:5432/postgres?sslmode=require
MIGRATION_DATABASE_URL=postgresql://<usuario-migracao>:<senha>@db.vsqumzgcbkeiiokpwdzm.supabase.co:5432/postgres?sslmode=require
```

Não coloque essas URLs em `VITE_*`, no navegador, no GitHub ou em arquivos `.env` versionados.

## Validação

Depois de configurar as variáveis no servidor, execute na pasta `ecclesia-os`:

```bash
npm run pilot:preflight:homologation
npm run test:postgres
npm run build
npm test
```

O preflight verifica a separação dos papéis, a aplicação das migrações e o isolamento entre igrejas. O teste PostgreSQL valida transações, RLS e integridade com um banco externo.

## Estado de segurança

As tabelas expostas estão com RLS habilitado. As políticas de base usam `app.actor` e `app.church`, definidos pelo backend antes de cada operação. Funções `SECURITY DEFINER` de administração não são executáveis por `anon` ou `authenticated`; o acesso interno é concedido somente a `ecclesia_app` ou `ecclesia_service` conforme a finalidade.

O projeto foi verificado pelo Supabase Database Advisors e não apresenta alertas de segurança no estado atual.

## Próxima operação

Depois que as credenciais forem configuradas, crie a primeira rede, igreja sede e usuário administrador pelo fluxo de provisionamento. Só então faça a importação de membros fictícios e o teste de duas igrejas antes de inserir dados reais.
