# Operação e homologação

O roteiro executável do piloto está em [PILOTO.md](PILOTO.md). Use-o junto desta referência de configuração e segredos.

## Ambientes

`APP_MODE=demo` usa exclusivamente dados fictícios e PostgreSQL embarcado em memória, persistido por snapshots atômicos após transações de escrita em `.local/postgres.snapshot`. Esse caminho evita depender da recuperação de diretório PGlite após interrupção abrupta no Windows. Só um processo deve operar a instalação local. `APP_MODE=homologation` requer banco, HTTPS e chaves configurados. O piloto usa somente Pix estático; pagamentos automáticos permanecem desativados. `APP_MODE=production` é bloqueado até a conclusão dos requisitos de lançamento.

Copie `.env.example` para `.env` somente dentro deste projeto. Não reutilize a `.env` do chatbot. Segredos nunca devem aparecer no frontend, repositório, screenshots ou logs.

## PostgreSQL externo

1. Crie um banco dedicado. Aplique migrações com `MIGRATION_DATABASE_URL` e `npm run db:migrate`; a conta de migração precisa poder criar funções, tabelas e papéis, incluindo o papel interno de serviço com BYPASSRLS. Ela não é usada no servidor web.
2. Crie dois logins sem superusuário, CREATEROLE ou propriedade das tabelas, sem herança automática (`NOINHERIT`). Autorize `ecclesia_app` somente no login de `ECCLESIA_DATABASE_URL`. Autorize `ecclesia_service` no login separado de `ECCLESIA_SERVICE_DATABASE_URL`. Cada conexão pode executar SET ROLE somente para o papel correspondente. A homologação verifica a separação na inicialização.
3. Configure `ECCLESIA_DATABASE_URL` com o login de runtime. A API seleciona `ecclesia_app` em transações de recursos da igreja, com ator e igreja definidos somente no servidor. Esse papel não ignora RLS.
4. Operações internas de autenticação, relatórios agregados, concessões e eventos verificados usam `ecclesia_service` por ECCLESIA_SERVICE_DATABASE_URL. Esse papel possui acesso amplo e é parte da fronteira confiável do backend; não pode ser entregue ao navegador ou a consultas arbitrárias. O worker pode rodar separado com `npm run worker` e RUN_INTEGRATION_WORKER=false no web. Não usar múltiplos processos com snapshot PGlite.
5. A base demo não deve ser promovida para ambiente real. Provisione uma instalação limpa com `npm run provision -- caminho-privado/perfil.json`.

O perfil privado de provisionamento contém `network`, `region`, `church`, `name`, `email`, `password` (mínimo de 14 caracteres) e `totpSecret` (32 caracteres Base32 A-Z/2-7). Gere segredos únicos e configure o autenticador fora do aplicativo. O script aceita apenas base vazia e não imprime credenciais. Remova o arquivo privado após entrega segura ao responsável. Novos usuários podem ser convidados no painel; a entrega é manual e privada. A inicialização cifra segredos TOTP legados com MFA_KEY_HEX, que deve ser distinta de DATA_KEY_HEX na homologação. Testar o atendimento de recuperação antes do piloto.

Os papéis SQL possuem nomes fixos; use um cluster dedicado ou confira previamente conflito de nomes. A versão externa do PostgreSQL e a política de TLS do provedor devem ser homologadas; os testes atuais utilizam PGlite.

## Pix estático e tesouraria manual

O piloto não usa banco, Efí, contas recebedoras, webhooks ou confirmação automática. Cada igreja cadastra sua chave Pix, tipo da chave, nome, cidade e instruções na Tesouraria. O sistema gera localmente o payload e o QR Code estático, com valor opcional, e oferece cópia da chave no portal.

A exibição do QR Code não cria cobrança nem lançamento. Depois de conferir o extrato, o tesoureiro pode registrar manualmente a contribuição, mantendo referência, valor e auditoria. As rotas antigas de cobrança e webhook respondem como indisponíveis e o histórico legado permanece preservado.

## Backup

Pare o servidor antes de abrir a mesma base PGlite em outro processo. Execute `npm run backup`; a cópia sai em `.local/backups`. Depois use:

```powershell
npm run restore -- .local/backups/arquivo.backup .local/restore-test
```

O destino precisa ser novo e estar dentro de `.local`; a ferramenta não sobrescreve a instalação ativa. Guarde também a chave de criptografia em local separado e protegido. Restaurar o banco sem a chave preserva registros, mas não permite ler os documentos e notas criptografados. Os arquivos de backup e a chave local não são criptografados como pacote: proteja-os com controle de acesso e criptografia do armazenamento.

Para PostgreSQL externo, use `pg_dump`/`pg_restore`, snapshots e recuperação pontual do provedor, com credenciais próprias de backup. Teste a restauração em banco isolado, incluindo dados, RLS, migrações e chave.

Com `ECCLESIA_DATABASE_URL` apontando para o login restrito da aplicação e `ECCLESIA_SERVICE_DATABASE_URL` para o login de serviço, execute `npm run test:postgres`. O smoke test não deixa dados persistidos: verifica a separação dos papéis, encontra duas igrejas, confirma que uma sessão autorizada para a primeira não enxerga pessoas, documentos, pedidos de privacidade ou avisos de comunicação da segunda e bloqueia uma tentativa de gravação cruzada por RLS.

Antes da homologação, execute `npm run pilot:preflight`. O comando imprime em JSON os requisitos de modo, bancos, HTTPS, chaves, Pix estático e comunicação, sem mostrar valores secretos, e retorna código diferente de zero quando falta alguma configuração.

Os testes de navegador usam Edge por padrão. Em ambientes onde ele não inicia, configure `PLAYWRIGHT_MODULE` para o pacote Playwright disponível e `PLAYWRIGHT_EXECUTABLE_PATH` para o executável Chromium/Chrome instalado antes de executar `npm run test:evolution-browser` ou os demais smoke tests.

## Antes do piloto com dados reais

- Concluir avaliação jurídica e contratual de finalidades, bases legais, tratamento de dados sensíveis, papéis da rede e retenções.
- Implantar KMS, rotação de chaves e proteção dos segredos de MFA e PSP. Realizar revisão independente das fronteiras do papel SQL de serviço.
- Homologar convites, recuperação, códigos de segurança e revogação de sessões. O contador de tentativas usa banco compartilhado; a proteção na borda e detecção distribuída continuam necessárias.
- Homologar atribuições explícitas de líderes/supervisores por célula e transições de função/campus. A migração não atribui automaticamente células pelo nome de liderança.
- Concluir formulários das operações disponíveis somente por API, atendimento efetivo às solicitações LGPD e atendimento efetivo às solicitações LGPD. Os comprovantes atuais são arquivos de texto sem identificação nominal do contribuinte; personalização e PDF são evoluções.
- Homologar isolamento e concorrência no PostgreSQL externo, com tesouraria manual e Pix estático.
- Adicionar recuperação de integrações de comunicação, alertas e monitoramento de divergências.
- Executar auditoria WCAG com leitor de tela, teclado, contraste e ampliação; as verificações atuais cobrem comportamento visual básico, não certificação.
- Definir RPO/RTO com o contratante, retenção de cópias, observabilidade, resposta a incidentes e acesso de suporte auditado.
- Validar uma rede e duas igrejas reais, com responsáveis nomeados e treinamento, antes de liberar produção.
