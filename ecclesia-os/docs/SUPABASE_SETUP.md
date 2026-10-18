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

Na verificação de 18/10/2026, o projeto estava `ACTIVE_HEALTHY`, com 134 tabelas públicas e os papéis `ecclesia_app`, `ecclesia_service` e `ecclesia_migration` configurados como usuários sem superusuário e sem `BYPASSRLS`. O banco permanece vazio para evitar a criação de dados fictícios sem uma decisão de implantação.

O smoke test local alcança o endpoint direto somente quando o ambiente possui rota IPv6 para o host `db.<project-ref>.supabase.co`. Nesta máquina, o DNS retorna apenas IPv6 e a rede local não possui rota para esse endereço (`ENETUNREACH`). Isso é uma limitação de conectividade do ambiente de execução; não indica falha de migração ou de RLS. Em um servidor com IPv6, use o endpoint direto acima. Em uma rede somente IPv4, configure o pooler IPv4 do painel do Supabase com uma credencial/tenant compatível e repita `npm run test:postgres`.

A verificação efetiva de privilégios também confirmou que os três papéis conseguem conectar ao banco e usar o schema `public`; `ecclesia_app` não é membro de `ecclesia_service`, enquanto o próprio `ecclesia_service` é membro de si mesmo para as rotinas internas. Nenhum dos três é superusuário ou possui `BYPASSRLS`.

Para o pooler IPv4 compartilhado, a documentação atual do Supabase exige copiar o host completo do diálogo **Connect**; o índice `aws-<n>` não pode ser deduzido apenas pela região. Para papéis personalizados, o usuário segue o formato `<papel>.<project-ref>`. A tentativa local usou `aws-0-sa-east-1.pooler.supabase.com`, um host presumido, por isso não deve ser reutilizada como configuração definitiva. Referência: https://supabase.com/docs/guides/database/connecting-to-postgres.
