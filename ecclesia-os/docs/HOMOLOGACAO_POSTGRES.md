# Homologação PostgreSQL

O arquivo [homologation.env.example](homologation.env.example) contém um modelo de banco externo, chaves, Firebase e comunicação. O piloto usa Pix estático e não configura Efí ou webhooks bancários. Substitua todos os valores em um gerenciador de segredos; não coloque credenciais reais no repositório.

Use três logins distintos no mesmo banco de homologação:

```dotenv
APP_MODE=homologation
PUBLIC_ORIGIN=https://homologacao.exemplo.org
DATABASE_URL=postgresql://ecclesia_runtime:senha-app@host:5432/ecclesia
SERVICE_DATABASE_URL=postgresql://ecclesia_service:senha-servico@host:5432/ecclesia
MIGRATION_DATABASE_URL=postgresql://ecclesia_migration:senha-migracao@host:5432/ecclesia
DATA_KEY_HEX=64-caracteres-hexadecimais
MFA_KEY_HEX=64-caracteres-hexadecimais-diferentes
RUN_INTEGRATION_WORKER=false
```

O login da aplicação não deve ser proprietário da tabela, superusuário, `BYPASSRLS`, `CREATEROLE` ou membro de `ecclesia_service`. O login de serviço é usado somente pelo worker e pelas operações privilegiadas previstas no backend. O login de migração deve ser reservado às migrações e não pode ser usado pelo web ou pelo worker.

Depois de configurar os segredos:

1. Confirme que `MIGRATION_DATABASE_URL` usa um papel com `CREATE` e ownership controlado; no projeto Supabase atual, o papel `ecclesia_migration` ainda não atende essa condição, então aplique DDL pelo canal administrativo até a criação desse papel.
2. Inicie o web com `RUN_INTEGRATION_WORKER=false`.
3. Inicie o worker em processo separado com `SERVICE_DATABASE_URL`.
4. Execute `npm run pilot:verify:postgres`.
5. Arquive o JSON do preflight e o resultado do smoke test junto ao relatório de homologação.

Para conferir a homologação mesmo antes de configurar o ambiente, use `npm run pilot:preflight:homologation`. O comando força a validação do modo de homologação e lista os checks pendentes; `npm run pilot:preflight` continua sendo o diagnóstico do modo atualmente selecionado.

Se alguma variável estiver ausente, `npm run test:postgres` informa somente os nomes que faltam. Ele nunca imprime as URLs configuradas nem senhas.
Se duas URLs forem iguais, o smoke test encerra antes da conexão com `duplicate_database_urls`.
O smoke test também exige `APP_MODE=homologation` para não testar acidentalmente o snapshot de demonstração.
O endpoint `/api/health/ready` informa apenas estados booleanos e inclui `serviceDatabase`, `migrationDatabase`, `dataKey`, `mfaKey`, `pix: "static"`, `automaticPayments: false` e `communication`; ele não devolve URLs, tokens, certificados ou chaves.

Nunca comite esse arquivo preenchido nem coloque senhas reais no repositório. Chaves de dados e MFA devem ser distintas e guardadas em um gerenciador de segredos.


