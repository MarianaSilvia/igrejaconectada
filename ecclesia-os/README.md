# EcclesiaOS

Implementação inicial executável para redes e convenções: React 19 + TypeScript, API Node.js, PostgreSQL, isolamento RLS e financeiro com partidas balanceadas. O projeto é independente do chatbot na pasta superior.

A evolução acrescenta permissões por ação/célula, convites e recuperação de MFA, fila Pix persistente, contas a pagar/receber com aprovação independente, agenda com reservas, equipes e tarefas. Consulte [o estado de cada entrega e suas pendências](docs/EVOLUCAO.md). O plano ampliado ainda não está integralmente concluído; a versão continua sendo de demonstração/homologação.

## Executar

Requer Node.js 22 ou superior. Na pasta `ecclesia-os`:

```powershell
npm ci
npm run build
npm start
```

Abra **http://localhost:3100**. O primeiro início cria PostgreSQL embarcado com snapshot em `.local/postgres.snapshot`, uma chave local de demonstração e dados fictícios de uma rede com duas igrejas. Não é necessário instalar PostgreSQL para conhecer o produto. Cada transação local de escrita grava um snapshot por substituição atômica antes de responder; a base persiste entre reinícios. Esse modo prioriza segurança da demonstração e não substitui PostgreSQL externo para escala de produção.

Escolha um perfil na tela de entrada. A senha demonstrativa é `Demo@Ecclesia2026`. Perfis privilegiados pedem uma segunda etapa; o código é preenchido exclusivamente no modo demonstrativo. Esses acessos não servem como autenticação de produção.

| Perfil | E-mail | Experiência |
|---|---|---|
| Administração local | admin@esperanca.demo | Secretaria, células, financeiro e permissões |
| Administração de outra igreja | admin@caminho.demo | Mesmas funções, dados isolados |
| Supervisão da rede | central@rede.demo | Indicadores agregados; detalhes somente com concessão |
| Membro | membro@esperanca.demo | Escalas, contribuições, credencial, oração e privacidade |

`npm run dev` serve o frontend pelo Vite se não existir `dist/index.html`; após uma compilação, execute novamente `npm run build` para atualizar a versão servida.

## Entregue nesta versão

- Painel administrativo com indicadores reais da base, gráfico financeiro e alertas explicáveis de ausência.
- Hierarquia rede → regional → igreja → campus; usuários com vínculos e funções diferentes por igreja.
- Central com agregados, concessões de leitura temporárias e revogação imediata. Nenhuma concessão habilita prontuário pastoral.
- Pessoas, famílias, mandatos, credenciais QR com expiração e validação autenticada; transferências entre igrejas com aceite do destino pela API.
- Importação CSV com prévia, erros, possíveis duplicidades, confirmação e exportação protegida contra fórmulas.
- Células, vinculação de pessoas, reuniões, presença, consolidação em quatro etapas e escalas.
- Plano de contas, fundos, centros de custo, entradas, saídas, fechamento e reversões. A base rejeita lançamentos sem contrapartida e alterações tardias nas linhas de lançamentos publicados.
- Cobranças Pix demonstrativas e adaptador Efí **apenas em homologação**, com OAuth, certificado de cliente, validação mTLS do webhook e consulta de confirmação ao provedor.
- Portal do membro com histórico pessoal, comprovantes textuais de contribuições conciliadas, resposta a escalas, pedido de oração criptografado e solicitações LGPD.
- Habilitação manual de módulos no piloto, verificada no backend; sem contratação ou faturamento automático.
- Documentos privados criptografados na base, limitados a 250 KB; upload/download pela API. Notas pastorais acessíveis somente ao autor local.
- Cosmos, Alvorada, modo A+, identidade visual por igreja, layout responsivo e PWA com cache restrito a recursos públicos.
- Scripts de backup e restauração em destino novo, migrações versionadas, provisionamento inicial e testes automatizados.

As operações de organização, vínculos, documentos, transferências, notas pastorais e atendimento LGPD possuem API; algumas ainda não têm formulário administrativo. Veja [API](docs/API.md).

## Validação

```powershell
npm test
npm run build
```

Os testes executam PostgreSQL real em WebAssembly, verificando RLS, isolamento por igreja/campus, permissões, revogação, importação, integridade financeira, Pix idempotente, criptografia e restauração de backup. A execução de integração precisa permitir conexões HTTP ao próprio computador.

O teste visual opcional usa Playwright e Edge já instalados. Instale Playwright no ambiente de desenvolvimento ou defina `PLAYWRIGHT_MODULE` com o caminho do módulo existente e execute `npm run test:browser` com o aplicativo aberto. Capturas ficam em `.local/qa`.

## Limites de lançamento

**Esta versão é para demonstração e homologação, ainda não está liberada para produção.** O processo bloqueia `APP_MODE=production` deliberadamente. A demonstração não emite QR Pix pagável e somente o administrador local pode simular o evento financeiro.

O adaptador Efí foi implementado conforme a documentação, mas não foi homologado com credenciais de uma conta real. Recebimentos dependem da configuração de certificados, conta por igreja, callback HTTPS público e testes do provedor. Não existem pagamentos reais, cobrança automática SaaS, envio de WhatsApp, pontuação preditiva ou promessa de benefício fiscal.

Homologação física de Kids e impressão Zebra/Brother, eleições, Pix Automático, gestão de chaves em KMS, antivírus de documentos, monitoramento externo e validação WCAG completa ainda precisam ser concluídos antes do lançamento público. Eventos e assembleias já possuem base funcional, mas continuam sujeitos aos testes e regras institucionais descritos no roteiro do piloto.

- [Operação, homologação e requisitos para lançamento](docs/OPERACAO.md)
- [Roteiro executável do piloto](docs/PILOTO.md)
- [Contratos e exemplos de API](docs/API.md)
- [Prompt mestre e sequência revisada para AI Studio](docs/AI_STUDIO.md)
- [Privacidade e inventário de tratamento](docs/PRIVACIDADE.md)
- [Pesquisa, estratégia e evolução](docs/PRODUTO.md)
- [Resultados da verificação e limites dos testes](docs/VALIDACAO.md)
- [Nova ficha de membros, foto, secretaria e prévia online](docs/FICHA_MEMBROS.md)
