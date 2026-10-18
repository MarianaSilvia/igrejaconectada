# API v1

Todas as rotas usam `/api`. Recursos de igreja exigem sessão em cookie HttpOnly/SameSite e cabeçalho `x-church-id` UUID. A igreja enviada pelo cliente é somente um contexto: permissões e RLS continuam obrigatórias. Escritas de outra origem são rejeitadas. Respostas API não são cacheadas.

Respostas de erro: `400` dados inválidos, `401` sessão ou MFA inválido, `403` permissão insuficiente, `404` recurso invisível/inexistente, `409` conflito ou período fechado, `429` excesso de tentativas e `502/503` integração indisponível.

## Autenticação e organização

| Método | Rota | Comportamento |
|---|---|---|
| POST | /auth/login | `{email,password}`; retorna `{mfaRequired,challenge}` para privilegiados |
| POST | /auth/mfa | `{challenge,code}`; sessão de oito horas; desafio de cinco minutos e cinco tentativas |
| POST | /auth/logout | Invalida a sessão atual |
| GET | /context | Perfil e igrejas acessíveis, sem dados de membros |
| GET | /network | Indicadores por igreja somente da rede autorizada |
| GET | /organizations | Redes e regionais visíveis |
| POST | /organizations/regions | Supervisor MFA: `{networkId,name}` |
| POST | /organizations/churches | Supervisor MFA: `{networkId,regionId,name,administratorId}`; administrador existente com MFA |
| POST | /campuses | Admin local: `{name}` |
| GET/POST | /memberships | Admin local; POST `{userId,role,campusId}` para usuário já provisionado |

## Secretaria e cuidado

| Método | Rota | Entrada/saída |
|---|---|---|
| GET/POST | /people | Listar/criar; `{name,email?,phone?,status,householdId?,campusId?}` |
| PATCH | /people/:id | Nome, contato e vínculo |
| GET | /directory | Famílias, mandatos e campi |
| POST | /households | `{name}` |
| POST | /terms | `{personId,title,startsOn,endsOn}` |
| POST | /import/preview | `{csv}`; devolve `previewId`, `valid`, `issues`; prévia de dez minutos vinculada ao ator e igreja |
| POST | /import/confirm | `{previewId}`; importa somente linhas válidas revisadas; revalida duplicidade |
| GET | /people/export | CSV autorizado |
| GET/POST | /cells | Criar `{name,leaderName,parentId?}` |
| GET/POST | /cells/:id/members | Vincular `{personId}` ou listar participantes |
| POST | /cells/:id/meetings | `{heldOn,visitors,attendance:[{personId,present}]}` |
| PATCH | /workflows/:id | `{stage:0..3}` |
| GET/POST | /transfers | Admin local; criar `{personId,targetChurchId}` na mesma rede |
| POST | /transfers/:id/accept | Admin do destino confirma cópia de dados básicos e inativação na origem; não transfere notas ou doações |
| POST | /credentials | `{personId}`; token opaco de 24h, QR e nome |
| GET | /credentials/:token | Valida estado, sem expor nome publicamente; exige leitor autorizado da igreja |
| POST | /credentials/:id/revoke | Admin local revoga |
| GET | /documents?page=1&pageSize=25 | Lista documentos privados com `{items,total,page,pageSize,pages}` |
| POST | /documents | Cria documento privado com `{name,mediaType,content}` em Base64, até 250 KB |
| GET | /documents/:id | Download com autorização, criptografia e auditoria |
| POST | /pastoral-notes | Admin local: `{personId,text}` |
| GET | /pastoral-notes/:person | Somente notas escritas pelo próprio autor admin |

## Financeiro e Pix

| Método | Rota | Entrada/saída |
|---|---|---|
| GET | /finance | Contas, fundos, centros, lançamentos, fechamentos e cobranças sem identificação de contribuinte |
| POST | /finance/entries | `{description,amount:"150.00",kind:"income" ou "expense",fundId?,costCenterId?,date?}` |
| POST | /finance/entries/:id/reverse | Reversão em período aberto; original permanece; Pix exige fluxo próprio |
| POST | /finance/close | `{throughDate:"2026-09-30"}` |
| POST | /pix/charges | `{amount:"150.00",fundId}`; cria cobrança para membro local autenticado |
| GET | /pix/charges/:id | Consulta somente com escopo autorizado ou como titular |
| POST | /pix/reconcile/:id | Tesouraria consulta Efí e recupera recebimentos confirmados |
| POST | /webhooks/efi/:account/pix | Callback exclusivo de mTLS e homologação; consulta canônica à Efí |
| POST | /demo/settle/:id | Admin local, somente demo; evento fictício idempotente |
| POST | /demo/refund/:id | Admin local, somente demo; reversão de contribuição fictícia conciliada |
| POST | /finance/bank-accounts/:id/statements/import | `{fileName,csv}` com colunas `external_id,date,description,amount`; importa uma vez por hash e retorna a contagem de linhas |
| POST | /finance/statement-lines/:id/match | `{paymentId}`; concilia somente com a mesma conta e valor da baixa |
| POST | /finance/statement-lines/:id/ignore | `{reason}`; marca uma linha como ignorada com auditoria |
| GET | /finance/attachments/:id | Download autorizado de anexo financeiro criptografado |
| GET | /events/:id/registrations?page=1&pageSize=25&status=all | Inscrições do evento paginadas; retorna `{items,total,page,pageSize,pages,status}` |
| PATCH | /workflows/:id | Pausar ou reativar uma definição com `{active:boolean}`; a alteração é auditada |
| PUT | /workflows/:id | Reconfigura `{name,trigger,steps:[{title,dueDays}]}`; preserva histórico e impede reduzir etapas com acompanhamentos abertos |
| GET | /participation?page=1&pageSize=25 | Eventos agendados paginados e contagem de inscrições; retorna `events` com total e páginas |
| GET | /finance/treasury?statementPage=1&statementPageSize=50&statementStatus=unmatched | Tesouraria; linhas de extrato retornam `statementPagination` com total, página e filtro aplicado |
| POST | /communication/preview | `{channel,filter:{status,campusId,cellId,teamId}}`; retorna quantidade e até dez nomes elegíveis, sem criar ou enviar mensagem |

Valores na API de entrada são strings decimais; valores internos e de saída usam centavos inteiros. O payload Efí vem do PSP. A simulação usa texto explicitamente não pagável. Não existe rota para o cliente marcar uma cobrança como paga.

## Governança e portal

| Método | Rota | Comportamento |
|---|---|---|
| GET | /grant-candidates | Admin local lista supervisores da mesma rede |
| GET/POST | /grants | Admin MFA; criar `{userId,scope:"people"/"finance"/"cells",days:1..90}` |
| DELETE | /grants/:id | Revogação imediata |
| GET | /regional-grants | Central da rede lista regionais, candidatos e concessões da rede atual |
| POST | /regional-grants | Central da rede: `{regionId,userId,scope,days}`; leitura temporária e somente leitura |
| DELETE | /regional-grants/:id | Revogação imediata da concessão regional |
| PATCH | /branding | Admin local: `{name,primaryColor}`; cores permitidas #7062db, #317b68, #386fa4 |
| GET | /audit?page=1&pageSize=50&action= | Admin local; retorna `{items,total,page,pageSize,pages,action}` e permite filtrar por ação exata |
| GET | /portal | Cadastro próprio, fundos, contribuições próprias, escalas e privacidade |
| GET | /agenda?page=1&pageSize=25&status=all&scope=all | Agenda, equipes e tarefas; tarefas retornam `taskPagination` com total, página e filtros aplicados |
| PATCH | /schedules/:id | Titular: `{response:"accepted" ou "declined"}` |
| POST | /prayers | `{text,confidential:true}`; texto criptografado |
| GET | /prayers | Administração local lê pedidos; nenhuma concessão à central habilita essa rota |
| GET | /prayers?page=1&pageSize=25 | Pedidos pastorais paginados; retorna `{items,total,page,pageSize,pages}` e descriptografa somente após autorização pastoral |
| POST | /privacy | `{kind:"access"/"correction"/"deletion",detail}` |
| GET | /privacy/admin?page=1&pageSize=25&status=all | Administração local atende solicitações; retorna `{items,total,page,pageSize,pages,status}` |
| PATCH | /privacy/admin/:id | `{status:"reviewing"/"fulfilled"/"retained",reason}`; registrar atendimento não apaga dados automaticamente |
| GET | /privacy/export | Titular baixa JSON dos próprios dados após solicitação de acesso atendida; registra auditoria |
| GET | /privacy/admin/:id/export | Administração local baixa a exportação da solicitação de acesso atendida; registra auditoria |

As APIs de demonstração só existem em `APP_MODE=demo`. `GET/PATCH /subscription` permite ao administrador configurar os módulos do piloto (`{modules:["people","cells","finance"]}`); as rotas desses módulos verificam a habilitação no backend. Essa configuração manual não representa contratação ou cobrança SaaS. `GET /pix/charges/:id/receipt` baixa um comprovante textual somente após conciliação, respeitando RLS e sem nome do contribuinte.
