# Próximas etapas do EcclesiaOS

Este roteiro começa depois da validação local do piloto. A sequência preserva o ambiente de demonstração e exige evidência antes de liberar cada integração.

Antes de avançar uma etapa local, executar `npm run pilot:verify`; o comando reúne build, testes e preflight em um único gate repetível.
Quando o Chrome e o Playwright estiverem disponíveis, executar `npm run pilot:verify:browser` para incluir o fluxo visual, MFA e verificação de layout móvel.

## 1. Preparar homologação isolada

- Criar um PostgreSQL externo separado do snapshot local.
- Seguir o modelo de papéis e variáveis em [HOMOLOGACAO_POSTGRES.md](HOMOLOGACAO_POSTGRES.md).
- Configurar `DATABASE_URL`, `SERVICE_DATABASE_URL` e `MIGRATION_DATABASE_URL`, além de `DATA_KEY_HEX` e `MFA_KEY_HEX`, por segredo, com logins e chaves distintos.
- Executar todas as migrações até a `063` e restaurar um backup em um banco de teste vazio.
- Iniciar o web sem worker integrado (`RUN_INTEGRATION_WORKER=false`) e o worker em processo separado.
- Registrar versão, migrações aplicadas, origem permitida, TLS e resultado do health check.

Executar `npm run pilot:preflight` antes de cada tentativa de homologação e arquivar o JSON gerado junto ao relatório.
Para validar especificamente a homologação sem aceitar o modo demo, executar `npm run pilot:preflight:homologation`.
Em homologação, o preflight também valida o JSON de `EFI_CONFIG_PATH` e a existência dos certificados referenciados, sem imprimir credenciais ou conteúdo de chaves.
Quando o transporte de comunicação for `webhook`, ele exige endpoints HTTPS para e-mail e SMS e tokens de saída e callback distintos.
Com as três URLs configuradas, executar `npm run pilot:verify:postgres` para validar separação de papéis, RLS e bloqueio de escrita entre igrejas.

**Liberação:** restauração reproduz as duas igrejas de demonstração, RLS continua isolando os dados e `/api/health/ready` retorna pronto sem expor segredos.

## 2. Homologar Pix e eventos pagos

- Criar uma conta Efí de homologação para cada igreja de teste.
- Configurar webhook HTTPS com autenticação exigida pelo provedor.
- Testar criação, repetição com a mesma chave, expiração, notificação duplicada, tarifa, pagamento parcial e devolução.
- Conferir conta recebedora, valor bruto, tarifa, líquido e lançamentos balanceados.
- Testar inscrição paga de evento e cancelamento com tarefa de devolução.

**Liberação:** cada cobrança tem uma única liquidação, eventos inválidos não liquidam nada e uma devolução verificada encerra a tarefa correspondente.

## 3. Homologar comunicação

- Contratar ou configurar o provedor de e-mail e SMS.
- Definir URLs HTTPS, token de envio e token de callback separados.
- Testar entrega, falha, bounce, descadastro, repetição e novo opt-in.
- Confirmar que o histórico registra destinatário, consentimento, estado e identificador do provedor.

**Liberação:** nenhum canal envia sem consentimento ativo e todo callback repetido permanece idempotente.

## 4. Homologar Kids presencial

- Testar Zebra com ZPL e Brother com o adaptador próprio em cada modelo real.
- Simular entrada, saída, token reutilizado, responsável não autorizado, exceção e queda de rede.
- Verificar capacidade da sala, alertas textuais e acesso restrito às notas médicas.
- Registrar modelo, firmware, resolução, tempo de impressão e falhas observadas.

**Liberação:** nenhuma criança sai sem responsável autorizado e token válido; os dois adaptadores imprimem o comprovante correto.

## 5. Segurança e acessibilidade antes do piloto

- Fazer revisão independente das políticas RLS, papéis privilegiados e armazenamento de notas sensíveis.
- Configurar rotação de chaves com procedimento de migração e recuperação testado.
- Executar teste de carga das listagens paginadas, webhooks e worker.
- Revisar teclado, foco, contraste, zoom, leitor de tela e redução de movimento conforme WCAG 2.2 AA.
- Restaurar backup em ambiente separado e guardar o relatório do teste.

**Liberação:** não há acesso cruzado entre igrejas, a recuperação de chave é documentada e os fluxos principais passam pela revisão de acessibilidade.

## 6. Piloto com uma rede e duas igrejas

Medir implantação, conclusão das tarefas, divergências financeiras, chamados, tempo de resposta e intenção de contratação. Usar dados fictícios ou consentidos e manter pagamentos reais desabilitados até a aprovação dos passos anteriores.

Ao final, arquivar os relatórios de homologação, as decisões de escopo e os itens que permanecem posteriores: WhatsApp, votação eletrônica, contabilidade fiscal, aplicativo nativo e offline amplo.
