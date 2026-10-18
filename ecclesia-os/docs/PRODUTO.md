# Pesquisa aplicada e evolução do produto

Referências consultadas em 16 de outubro de 2026. Páginas de fornecedores descrevem seus próprios produtos; não comprovam satisfação, qualidade ou participação de mercado. Preços e alegações quantitativas não foram usados como premissas financeiras.

| Referência primária | Observação | Decisão de produto |
|---|---|---|
| [InPeace](https://inpeaceapp.com/) | Apresenta painel, app, células, comunicação, doações e gestão hierárquica | Plataforma integrada é requisito esperado |
| [Atos6](https://home.atos6.com/) | Apresenta gestão de células, membros e financeiro | Validar diferenciação pela governança e operação |
| [Planning Center Check-Ins](https://www.planningcenter.com/check-ins) | Integra famílias, eventos e check-in | Kids deve nascer conectado ao cadastro e aos responsáveis |
| [Permissões Planning Center](https://help.planningcenter.com/en/136858-permissions-in-check-ins.html) | Diferencia funções e acesso aos contatos | Preservar escopo e mínimo acesso por tarefa |
| [API Pix BCB](https://github.com/bacen/pix-api) | Especificação do arranjo; notificações do PSP recebedor | Integrar PSP e validar estado no servidor |
| [Efí cobranças](https://dev.efipay.com.br/docs/api-pix/cobrancas-imediatas/) | Criação, consulta e payload da cobrança | Usar payload do provedor e homologar casos distintos de valor |
| [Efí webhooks](https://dev.efipay.com.br/docs/api-pix/webhooks/) | Autenticação e callback | Exigir certificado e consulta de confirmação |
| [Brother Raster](https://download.brother.com/welcome/docp100278/cv_ql800_eng_raster_101.pdf) | Protocolo e impressão bicolor específicos | Drivers Zebra e Brother separados |
| [PostgreSQL RLS](https://www.postgresql.org/docs/current/ddl-rowsecurity.html) | Proprietários e BYPASSRLS podem ignorar políticas | Separar papel de requests do papel interno de serviço |
| [WCAG 2.2](https://www.w3.org/TR/WCAG22/) | Requisitos verificáveis de acesso | Testar teclado, foco, contraste, toque e ampliação |
| [Google AI Studio](https://ai.google.dev/gemini-api/docs/aistudio-fullstack) | Runtime servidor e segredos | Integrar serviços no backend, sem chaves no cliente |

## Hipótese comercial

Autonomia por igreja com visão de rede, privacidade pastoral e financeiro auditável podem diferenciar o EcclesiaOS. É uma hipótese para entrevistas e piloto, não uma vantagem comprovada sobre os fornecedores consultados.

Modelo inicial: assinatura por igreja vinculada, painel da rede incluído, implantação/importação assistidas e módulos adicionais. O piloto não tem faturamento automático. Não fixar preços sem custos de infraestrutura, PSP, suporte e disposição de pagamento. Receita SaaS e contribuições religiosas precisam de fluxos financeiros separados.

## Sequência de evolução

1. **Base demonstrável (esta versão):** secretaria, células, tesouraria, Pix fictício, adaptação Efí de homologação, concessões, portal, RLS e testes.
2. **Piloto homologado:** completar tarefas administrativas sem interface, autenticação de ciclo completo, líder por grupo, comprovantes, recuperação de eventos, devoluções, auditoria de acessibilidade, operação e contratos.
3. **Venda com operação validada:** planos e cobrança SaaS, habilitação de módulos, importação assistida, treinamento, métricas de saúde e suporte.
4. **Expansão:** Kids, hardware homologado, eventos/cursos, assembleias, eleições, anuidades, WhatsApp e Pix Automático. Cada expansão exige critérios próprios de privacidade e testes.

O Pix Automático depende do PSP e de autorização do pagador; não é equivalente a repetir um QR ou marcar uma oferta como recorrente. [Banco Central](https://www.bcb.gov.br/meubc/faqs/p/diferenca-entre-pix-automatico-e-pix-agendado-recorrente).

## Critérios do piloto

Uma rede e duas igrejas, com administrador local e supervisor central separados. Registrar tempo para importar dados, taxa de conclusão de cadastro e relatório de célula, erros de conciliação, número de chamados e disposição de contratar. Os responsáveis devem aprovar o entendimento dos acessos antes de usar dados reais.

Metas quantitativas comerciais, prazo de implantação e SLA serão definidos a partir da capacidade da equipe e da infraestrutura homologada. A calculadora de ROI futura deve usar entradas editáveis, mostrar fórmulas e nunca apresentar horas economizadas como fato observado sem medição.
