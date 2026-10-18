# Operação e homologação

O roteiro executável do piloto está em [PILOTO.md](PILOTO.md). Use-o junto desta referência de configuração e segredos.

## Ambientes

`APP_MODE=demo` usa exclusivamente dados fictícios e PostgreSQL embarcado em memória, persistido por snapshots atômicos após transações de escrita em `.local/postgres.snapshot`. Esse caminho evita depender da recuperação de diretório PGlite após interrupção abrupta no Windows. Só um processo deve operar a instalação local. `APP_MODE=homologation` requer banco configurado e credenciais Efí de homologação. `APP_MODE=production` é bloqueado até a conclusão dos requisitos de lançamento.

Copie `.env.example` para `.env` somente dentro deste projeto. Não reutilize a `.env` do chatbot. Segredos nunca devem aparecer no frontend, repositório, screenshots ou logs.

## PostgreSQL externo

1. Crie um banco dedicado. Aplique migrações com `MIGRATION_DATABASE_URL` e `npm run db:migrate`; a conta de migração precisa poder criar funções, tabelas e papéis, incluindo o papel interno de serviço com BYPASSRLS. Ela não é usada no servidor web.
2. Crie dois logins sem superusuário, CREATEROLE ou propriedade das tabelas, sem herança automática (`NOINHERIT`). Autorize `ecclesia_app` somente no login de `DATABASE_URL`. Autorize `ecclesia_service` no login separado de `SERVICE_DATABASE_URL`. Cada conexão pode executar SET ROLE somente para o papel correspondente. A homologação verifica a separação na inicialização.
3. Configure `DATABASE_URL` com o login de runtime. A API seleciona `ecclesia_app` em transações de recursos da igreja, com ator e igreja definidos somente no servidor. Esse papel não ignora RLS.
4. Operações internas de autenticação, relatórios agregados, concessões e eventos verificados usam `ecclesia_service` por SERVICE_DATABASE_URL. Esse papel possui acesso amplo e é parte da fronteira confiável do backend; não pode ser entregue ao navegador ou a consultas arbitrárias. O worker pode rodar separado com `npm run worker` e RUN_INTEGRATION_WORKER=false no web. Não usar múltiplos processos com snapshot PGlite.
5. A base demo não deve ser promovida para ambiente real. Provisione uma instalação limpa com `npm run provision -- caminho-privado/perfil.json`.

O perfil privado de provisionamento contém `network`, `region`, `church`, `name`, `email`, `password` (mínimo de 14 caracteres) e `totpSecret` (32 caracteres Base32 A-Z/2-7). Gere segredos únicos e configure o autenticador fora do aplicativo. O script aceita apenas base vazia e não imprime credenciais. Remova o arquivo privado após entrega segura ao responsável. Novos usuários podem ser convidados no painel; a entrega é manual e privada. A inicialização cifra segredos TOTP legados com MFA_KEY_HEX, que deve ser distinta de DATA_KEY_HEX na homologação. Testar o atendimento de recuperação antes do piloto.

Os papéis SQL possuem nomes fixos; use um cluster dedicado ou confira previamente conflito de nomes. A versão externa do PostgreSQL e a política de TLS do provedor devem ser homologadas; os testes atuais utilizam PGlite.

## Efí em homologação

`EFI_CONFIG_PATH` aponta para um arquivo privado, fora da pasta pública e do repositório, contendo um array:

```json
[
  {
    "churchId": "UUID da igreja",
    "accountId": "identificador interno único da conta",
    "clientId": "credencial de homologação",
    "clientSecret": "segredo de homologação",
    "pixKey": "chave associada à conta autenticada",
    "certificatePath": "caminho absoluto do arquivo P12",
    "certificatePassword": "senha do certificado, se aplicável"
  }
]
```

O adaptador usa exclusivamente `pix-h.api.efipay.com.br`. Não possui alternância silenciosa para produção. Confirme os escopos `cob.write`, `cob.read` e os necessários à configuração do webhook na conta.

Configure `DATA_KEY_HEX` com 32 bytes aleatórios em hexadecimal, `PUBLIC_ORIGIN` HTTPS, `EFI_TLS_CERT_PATH`, `EFI_TLS_KEY_PATH` e `EFI_WEBHOOK_CA_PATH` com a CA de homologação fornecida pela Efí. O servidor permite clientes comuns sem certificado para o portal, mas a rota de webhook exige socket TLS autenticado contra essa CA. Não confia em cabeçalhos enviados por proxy. Se houver proxy terminando TLS, a solução de mTLS precisa ser reprojetada e testada antes do uso.

Registre no PSP a URL base `https://host/api/webhooks/efi/identificador-da-conta`. A entrega Pix acontece em `/api/webhooks/efi/identificador-da-conta/pix`. O método `Efi.registerWebhook` implementa o registro; a aplicação não executa registro externo automaticamente. O operador deve registrar e testar o callback na conta Efí.

A documentação Efí informa que cobranças de R$ 0,01 a R$ 10,00 são confirmadas no simulador, enquanto valores superiores permanecem ativos. Use esses casos para homologar sucesso e espera. Não envie dados pessoais reais ao simulador sem necessidade.

Criar cobrança não confirma pagamento. A API valida o certificado recebido e consulta a cobrança pela credencial da igreja, verificando txid, identificador do recebimento e valor antes de lançar. Intenção e fila são persistidas antes da chamada ao provedor, com consulta automática e recuperação manual pelo painel. Homologar esse worker com credenciais e PostgreSQL reais. Devolução Efí real e identificação de tarifas pelo extrato continuam pendentes; somente devolução fictícia é executável nesta versão, com lançamento reverso.

## Backup

Pare o servidor antes de abrir a mesma base PGlite em outro processo. Execute `npm run backup`; a cópia sai em `.local/backups`. Depois use:

```powershell
npm run restore -- .local/backups/arquivo.backup .local/restore-test
```

O destino precisa ser novo e estar dentro de `.local`; a ferramenta não sobrescreve a instalação ativa. Guarde também a chave de criptografia em local separado e protegido. Restaurar o banco sem a chave preserva registros, mas não permite ler os documentos e notas criptografados. Os arquivos de backup e a chave local não são criptografados como pacote: proteja-os com controle de acesso e criptografia do armazenamento.

Para PostgreSQL externo, use `pg_dump`/`pg_restore`, snapshots e recuperação pontual do provedor, com credenciais próprias de backup. Teste a restauração em banco isolado, incluindo dados, RLS, migrações e chave.

Com `DATABASE_URL` apontando para o login restrito da aplicação e `SERVICE_DATABASE_URL` para o login de serviço, execute `npm run test:postgres`. O smoke test não deixa dados persistidos: verifica a separação dos papéis, encontra duas igrejas, confirma que uma sessão autorizada para a primeira não enxerga pessoas, documentos, pedidos de privacidade ou avisos de comunicação da segunda e bloqueia uma tentativa de gravação cruzada por RLS.

Antes da homologação, execute `npm run pilot:preflight`. O comando imprime em JSON os requisitos de modo, bancos, HTTPS, chaves, Efí e comunicação, sem mostrar valores secretos, e retorna código diferente de zero quando falta alguma configuração.

Os testes de navegador usam Edge por padrão. Em ambientes onde ele não inicia, configure `PLAYWRIGHT_MODULE` para o pacote Playwright disponível e `PLAYWRIGHT_EXECUTABLE_PATH` para o executável Chromium/Chrome instalado antes de executar `npm run test:evolution-browser` ou os demais smoke tests.

## Antes do piloto com dados reais

- Concluir avaliação jurídica e contratual de finalidades, bases legais, tratamento de dados sensíveis, papéis da rede e retenções.
- Implantar KMS, rotação de chaves e proteção dos segredos de MFA e PSP. Realizar revisão independente das fronteiras do papel SQL de serviço.
- Homologar convites, recuperação, códigos de segurança e revogação de sessões. O contador de tentativas usa banco compartilhado; a proteção na borda e detecção distribuída continuam necessárias.
- Homologar atribuições explícitas de líderes/supervisores por célula e transições de função/campus. A migração não atribui automaticamente células pelo nome de liderança.
- Concluir formulários das operações disponíveis somente por API, atendimento efetivo às solicitações LGPD e processamento de devoluções Efí. Os comprovantes atuais são arquivos de texto sem identificação nominal do contribuinte; personalização e PDF são evoluções.
- Homologar isolamento e concorrência no PostgreSQL externo e concluir testes contratuais com a Efí.
- Adicionar recuperação automática de eventos, conciliação de tarifas, alertas e monitoramento de divergências.
- Executar auditoria WCAG com leitor de tela, teclado, contraste e ampliação; as verificações atuais cobrem comportamento visual básico, não certificação.
- Definir RPO/RTO com o contratante, retenção de cópias, observabilidade, resposta a incidentes e acesso de suporte auditado.
- Validar uma rede e duas igrejas reais, com responsáveis nomeados e treinamento, antes de liberar produção.

## Checklist de publicação atual

A implantação de homologação usa o serviço Render `ecclesia-os-api-v2` e o frontend Vercel `ecclesia-os`.

1. No Render, configurar o health check para `/health` e confirmar resposta HTTP 200.
2. Criar secrets no painel do Render; nunca commitá-los no GitHub ou no Vercel.
3. Preencher `DATABASE_URL`, `SERVICE_DATABASE_URL`, `MIGRATION_DATABASE_URL`, `DATA_KEY_HEX`, `MFA_KEY_HEX` e `PUBLIC_ORIGIN`.
4. Manter `RUN_INTEGRATION_WORKER=false` no web e executar o worker em serviço separado quando houver fila real.
5. Executar `npm run pilot:preflight:homologation` e `npm run test:postgres`.
6. Cadastrar a sede e duas congregações, convidar secretárias e ativar MFA.
7. Testar o isolamento entre as três unidades e revisar a auditoria.
8. Configurar a conexão Vercel para permitir a verificação protegida de `/`, `/app` e `/api/health`.
9. Somente depois da homologação, considerar Efí em produção e retirar o modo demo.

O deploy atual está live, mas permanece em modo demo até que os secrets e o PostgreSQL externo sejam configurados.
