# Prompt mestre revisado — EcclesiaOS

Este material substitui as instruções técnicas incorretas do prompt original. O código do projeto é a fonte de verdade do que já existe; não regenere o aplicativo inteiro a cada pedido.

## Contexto permanente

```text
Você está evoluindo o EcclesiaOS, um SaaS brasileiro para redes e convenções.
Leia README.md, docs/API.md, docs/OPERACAO.md e as migrações existentes antes de editar.

Preserve React/TypeScript, backend Node.js/TypeScript e PostgreSQL. As migrações SQL são a fonte de verdade para tabelas, políticas RLS e integridade financeira. Não mantenha um schema ORM paralelo que suprima funções, políticas ou triggers.

Rede/convenção, regional, igreja e campus são conceitos distintos. Igreja é o tenant. Um usuário pode ter vínculos diferentes em várias igrejas. A central recebe indicadores e precisa de concessão explícita e revogável para detalhes. Nenhum acesso da central autoriza notas pastorais ou pedidos sigilosos.

Todas as operações de dados devem ser autorizadas no backend. Use o papel SQL ecclesia_app sem BYPASSRLS nas transações de tenant e contexto definido pelo servidor. ecclesia_service é um papel interno privilegiado: nunca o exponha ao frontend nem permita SQL arbitrário. Não aceite tenant_id como prova de autorização.

Use valores financeiros exatos em centavos, lançamentos balanceados e reversões em lugar de editar registros publicados. Criar cobrança ou clicar no aplicativo não confirma pagamento. Confirmação depende de PSP, autenticidade e consulta canônica. Duplicações e recuperação de eventos precisam ser idempotentes.

Efí está restrita à homologação. Use o payload Pix retornado pelo PSP. Não simule integração direta com o Banco Central, não misture chave estática com localização dinâmica e não gere cobranças pagáveis no modo demo. Não fixe tarifa operacional ou prometa dedução fiscal.

Segredos permanecem no servidor. Trate o cadastro religioso como sensível, além das informações de saúde e notas pastorais. Não envie notas, pedidos ou nomes de doadores a uma IA externa sem finalidade, base legal e avaliação aprovadas.

Mantenha Cosmos, Alvorada, A+, teclado, foco visível, contraste verificável, redução de movimento e layout móvel. A PWA pode guardar recursos públicos; não cacheie APIs autenticadas, documentos ou dados pessoais.

Implemente por módulo, teste comportamento e registre limitações reais. Não apresente simulação como integração concluída, nem testes de navegador como auditoria completa de acessibilidade. Produção permanece bloqueada até atender ao checklist operacional.
```

## Comandos de evolução

1. **Fundação:** “Execute os testes atuais. Revise todas as políticas de tenant/campus, acesso de serviço e concessões temporárias. Adicione convite, recuperação e rotação de MFA com sessões revogáveis, sem alterar a experiência demonstrativa.”
2. **Secretaria:** “Complete os formulários administrativos para transferências, campi, vínculos, documentos privados e atendimento LGPD usando as APIs existentes. Preserve a prévia de importação e a separação de dados na transferência.”
3. **Cuidado:** “Acrescente atribuição individual de líderes a células, indisponibilidade de voluntários e gestão de escalas. Teste que líderes só operam seus grupos e que alertas explicam as presenças consideradas.”
4. **Financeiro:** “Homologue a Efí com credenciais por igreja, configure callback mTLS e adicione worker de recuperação com fila durável, devoluções verificadas, conciliação de tarifas e comprovante digital. Teste duplicações, atraso, divergência, estorno e períodos fechados.”
5. **Operação SaaS:** “Implemente assinatura por igreja e módulos com controle de habilitação no backend, sem misturar receita da plataforma e contribuições da igreja. Adicione monitoramento, KMS e runbooks de recuperação.”
6. **Piloto:** “Valide uma rede e duas igrejas, registre métricas de implantação, tarefas concluídas, suporte, divergências e disposição de contratar. Não use dados pessoais nas evidências públicas.”
7. **Kids:** “Implemente responsáveis autorizados, token por sessão, retirada de uso único e auditoria. Crie drivers independentes Zebra ZPL e Brother raster/SDK, respeitando resolução, mídia e capacidade física. Homologue impressão em hardware antes de prometer tempo de atendimento.”

## Contrato de entrega de cada comando

```text
Entregue a alteração completa do módulo solicitado, migração quando necessária, testes dos riscos materiais, comandos reproduzíveis e evidências de verificação. Informe o que depende de conta, hardware ou configuração externa. Não substitua funcionalidades existentes por placeholders. Nunca declare que uma funcionalidade não testada está pronta para produção.
```
