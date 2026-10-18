# Inventário inicial de privacidade

Documento de engenharia para revisão pelos responsáveis pela implantação. Não define automaticamente a base legal de cada igreja nem substitui avaliação jurídica.

| Categoria | Finalidade prevista | Acesso implementado | Retenção a definir no contrato |
|---|---|---|---|
| Pessoas e vínculos religiosos | Secretaria e integração | Secretaria/admin local; central por concessão de pessoas | Durante a relação e pelo prazo necessário após término |
| Famílias e dirigentes | Organização comunitária e mandatos | Pessoas da igreja e leitores autorizados | Vigência e histórico justificado |
| Presença e células | Organização de encontros e cuidado | Líderes/secretaria/admin no escopo; central com concessão | Janela operacional e histórico aprovado |
| Contribuições | Conciliação e comprovação financeira | Tesouraria/admin; titular no portal | Obrigações e necessidades contábeis validadas |
| Notas pastorais | Acompanhamento confidencial | Somente autor admin da igreja | Prazo mínimo necessário, definido por finalidade |
| Pedidos de oração | Acolhimento confidencial | Administração local; sem acesso central | Prazo curto definido pela igreja |
| Documentos | Evidências administrativas | Secretaria/admin e concessão de pessoas | Por tipo documental, evitando coleta excessiva |
| Logs de auditoria | Segurança e responsabilização | Administração local | Prazo contratado e procedimento de incidentes |
| Sessões e desafios | Autenticação | Backend | Sessão de 8h, desafio de 5min; limpeza operacional a automatizar |
| Solicitações de direitos | Atendimento do titular | Titular e administração local | Prova do atendimento conforme política aprovada |
| Ficha detalhada e foto | Cadastro e identificação pela secretaria | Administração/secretaria locais; foto somente com autorização de leitura | Definir prazo operacional e retenção de cadastros |
| Fichas online pendentes | Conferência antes de incorporar ao cadastro | Administração/secretaria da igreja/campus de destino | Definir prazo para analisar e descartar fichas não aprovadas |

O novo modelo de ficha registra o aceite do aviso e sua versão junto ao envio; isso não determina, por si só, todas as bases legais do tratamento. O link não permite ao visitante atribuir cargos ou situação interna. A congregação é informada em texto livre. Fotos e dados detalhados são criptografados, sem publicação de imagens; versões reduzidas são regravadas sem os metadados originais. O formulário público fica somente em prévia local até configuração futura de hospedagem.

Religião e filiação religiosa são dados pessoais sensíveis na LGPD, assim como saúde. Consentimento não é uma resposta universal: registre a hipótese aplicável, a finalidade e a necessidade de cada tratamento, com atenção às regras próprias para dados sensíveis.

A rede não deve assumir autorização irrestrita sobre cada igreja. Formalize quem decide finalidades e meios, quem opera em nome de quem, compartilhamentos, suboperadores e atendimento dos titulares. Os papéis de controlador e operador dependem da operação e do contrato, não do nome comercial “SaaS”.

Esta versão registra solicitações de acesso, correção e exclusão e permite acompanhar seu atendimento pela API. Exclusão não é automática: o responsável precisa verificar titularidade, retenções e executar o procedimento aplicável. O status `fulfilled` só pode ser marcado após atendimento efetivo; `retained` exige justificativa armazenada. A administração também pode documentar a política de retenção por categoria, com finalidade, base legal, prazo e responsável. Não existe expurgo automático.

Pedidos de oração e documentos são cifrados com AES-256-GCM. Isso protege conteúdo, mas não substitui controle de acesso, armazenamento seguro de chaves, segregação do serviço e governança. O modo demo guarda a chave junto à instalação para facilitar execução; não é arquitetura de chaves para dados reais.

Na fase Kids, realizar avaliação específica do melhor interesse da criança, responsáveis autorizados, minimização de dados médicos, exposição das etiquetas, guarda e descarte. Não inserir diagnóstico em QR público. Não desenvolver perfil comportamental infantil ou pontuação espiritual.

Fontes para revisão: [LGPD](https://planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm) e [orientação ANPD sobre crianças e adolescentes](https://www.gov.br/anpd/pt-br/assuntos/noticias/anpd-divulga-enunciado-sobre-o-tratamento-de-dados-pessoais-de-criancas-e-adolescentes).
