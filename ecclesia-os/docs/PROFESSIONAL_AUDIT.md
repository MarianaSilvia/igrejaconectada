# EcclesiaOS — auditoria profissional (homologação)

Data da revisão: 2026-10-19.

## Estado verificado

- O projeto principal está em `ecclesia-os/` e usa React + TypeScript, Vite, Express e PostgreSQL.
- O build local existente conclui com `tsc --noEmit && vite build`.
- O Firebase `possible-zephyr-zxctm` fornece autenticação e um Firestore auxiliar.
- O PostgreSQL/backend continua sendo a fonte de verdade para membros, grupos, ensino, tesouraria, permissões e auditoria.
- O Pix permanece informativo/estático; recebimento bancário automático e cobrança comercial continuam desativados.

## Correções aplicadas

1. O handler serverless separa liveness (`/api/health`) de readiness (`/api/health/ready`). Falhas de configuração retornam 503 estruturado, sem segredo, em vez de transformar toda a função em erro genérico.
2. Cadastro público cria apenas membro. O campo de papel enviado pelo navegador é ignorado e não pode criar um documento em `admins`.
3. Usuário sem perfil não cai mais em administração por padrão; o fallback é membro, salvo o proprietário verificado.
4. Erros do Firestore não devolvem UID, e-mail, provedor ou outros dados de identidade na mensagem exibida.
5. A sincronização do frontend não envia membros, grupos ou transações para o Firestore. Metadados não sensíveis de igreja podem ser espelhados; dados ministeriais e financeiros permanecem no backend protegido.
6. Regras do Firestore foram restringidas e versionadas em `firestore.rules`: perfis próprios, administração somente pelo proprietário verificado, logs somente para auditoria, e nenhuma leitura pública de membros, grupos ou transações.
7. O README raiz passou a apontar para o EcclesiaOS e explicar a separação entre Firebase auxiliar e backend principal.

## Pendências antes de produção

- Publicar o novo commit no Vercel e confirmar `READY` e `/api/health/ready`; o conector Vercel precisa estar autorizado para consultar logs e deployment.
- Configurar no Vercel as variáveis obrigatórias de homologação, sem valores de demonstração ou chaves aleatórias.
- Validar `ECCLESIA_DATABASE_URL`, `ECCLESIA_SERVICE_DATABASE_URL` e `MIGRATION_DATABASE_URL` com papéis PostgreSQL distintos e sem `BYPASSRLS` na aplicação.
- Testar login com Firebase e a troca do token de identidade por sessão backend; o backend deve verificar o ID token, nunca confiar apenas em UID enviado pelo navegador.
- Executar testes de isolamento entre sede, congregação Norte, congregação Sul e membro para telas, exportações, documentos, mídia e relatórios.
- Criar convites para funções administrativas; nenhum usuário deve receber administrador por cadastro público.
- Habilitar MFA para administradores e supervisão antes do piloto.
- Rodar `npm test`, `npm run build`, teste de restauração de backup e smoke test no domínio público.

## Decisão de arquitetura

O sistema não deve duplicar o cadastro ministerial no Firebase. Firebase Authentication identifica a pessoa; o backend autoriza por igreja, campus, grupo e papel. O Firestore é auxiliar e deve conter somente perfis mínimos, metadados e auditoria explicitamente permitida. Essa divisão evita que uma regra de cliente contorne o RLS do PostgreSQL.

## Critério para seguir ao AI Studio

Somente após o deployment responder em `/api/health`, a prontidão indicar dependências configuradas, os testes de isolamento passarem e o login funcionar com pelo menos um administrador e um membro.