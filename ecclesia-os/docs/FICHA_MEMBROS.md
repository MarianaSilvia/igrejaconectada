# Ficha de cadastro de membros

Modelo implementado a partir das três páginas do PDF de referência enviado pelo usuário em 16 de outubro de 2026. A publicação em domínio público foi adiada por solicitação do usuário. O nome da igreja/congregação é escrito manualmente em cada ficha; isso não muda a igreja responsável por receber os dados.

## Campos

| Seção | Informações |
|---|---|
| Foto | Upload JPG, PNG ou WebP de até 3 MB; prévia, troca e remoção |
| Dados pessoais | Nome, sobrenome, nascimento, idade e faixa etária calculadas, sexo, escolaridade, estado civil, CPF e RG |
| Contatos | Telefone 1/WhatsApp, telefone 2 e e-mail |
| Endereço | Logradouro, número, bairro, CEP, cidade, estado e país |
| Igreja e vida cristã | Igreja/congregação em texto livre, data de conversão e informação sobre batismo |
| Responsável | Nome, contato e declaração do responsável quando o nascimento informado indicar menor de 18 anos |
| Secretaria | Vínculo, situação de comunhão, categorias, cargos, grupos/ministérios, família, campus e anotações administrativas |

ID e data de criação são gerados pelo sistema. A idade não é gravada como um número que fica desatualizado. Ensino, acompanhamento pastoral e financeiro aparecem como painéis no PDF, não como perguntas de cadastro; seus registros permanecem nos módulos correspondentes. Anotações administrativas não substituem o prontuário pastoral sigiloso.

## Cadastro e edição manuais

Na tela **Pessoas e famílias**, administração e secretaria podem clicar em **Cadastrar membro** e preencher a ficha completa. O botão **Editar** na linha de cada pessoa abre o mesmo modelo, com todos os dados e a foto existentes. É possível trocar/remover foto e atualizar os campos. Alterações concorrentes são detectadas: uma ficha desatualizada deve ser reaberta antes de salvar.

Membros comuns e supervisores centrais não recebem permissão de editar fichas. Mesmo uma concessão de leitura de pessoas à central não libera os campos internos da nova ficha. Fotos são servidas somente com sessão e autorização da igreja/campus; não ficam em URLs públicas de armazenamento.

## Prévia do link e conferência

1. Em **Pessoas e famílias**, abra **Fichas e link** → **Link da ficha**.
2. Use **Gerar link de prévia** para definir título, validade, campus responsável e se a foto será obrigatória. O padrão permite foto opcional.
3. Abra o endereço local para conferir o formulário em computador ou celular. Ele não exige conta de membro.
4. Quem preenche informa manualmente sua congregação, um contato e a confirmação de leitura do aviso.
5. O envio recebe um protocolo e entra em **Fichas recebidas**, sem alterar automaticamente o cadastro de membros.
6. A secretaria confere os dados, corrige o que for necessário e aprova um novo cadastro ou escolhe explicitamente um possível perfil existente para atualizar. Também pode não aprovar, registrando o motivo.

O CPF e o RG são opcionais. Nome e congregação são obrigatórios no formulário online, assim como pelo menos um telefone/e-mail. A foto pode ser configurada como obrigatória por link. Os campos administrativos não são aceitos pelo endpoint público.

Links podem ser desativados e expiram automaticamente. Repetir o mesmo envio com a mesma chave não duplica a ficha. São utilizados desafio assinado, campo antirrobô e limite de envios; esses mecanismos não equivalem a verificação de identidade ou a um serviço antispam de produção.

## Armazenamento e proteção

As novas fichas detalhadas, os envios pendentes e as fotos são criptografados com a chave do ambiente. As fotos são decodificadas, limitadas em pixels, reduzidas para até 640 × 640, convertidas em WebP e regravadas sem os metadados originais. As tabelas possuem RLS por igreja e respeitam o escopo de campus do usuário.

O campo “Igreja / congregação” é descritivo. O destino administrativo de um envio é fixado pelo link, não pelo texto escrito pelo visitante. O frontend e o endpoint público não permitem selecionar tenant, cargos, disciplina ou situação de membro.

Na demonstração local, utilize apenas dados fictícios. A publicação para redes sociais exigirá configurar uma origem HTTPS pública, infraestrutura persistente e os requisitos operacionais já descritos em OPERACAO.md. Esta alteração não publica o sistema nem libera produção.

## API

| Método | Rota | Finalidade |
|---|---|---|
| GET | /api/registration/config | Permissões locais, versão do modelo e campus padrão |
| POST | /api/people/profiles | Cadastro manual completo |
| GET/PATCH | /api/people/:id/profile | Leitura/edição completa pela secretaria/admin, com versão de concorrência |
| GET | /api/people/:id/photo | Imagem privada, com igreja no cabeçalho ou na query e autorização da sessão |
| GET/POST | /api/registration/links | Listar ou gerar link de prévia |
| PATCH | /api/registration/links/:id | Ativar/desativar |
| GET | /api/public/registration/:token | Modelo público e desafio de envio |
| POST | /api/public/registration/:token | Receber ficha pendente, sem login |
| GET | /api/registration/submissions | Fila de fichas da igreja |
| GET | /api/registration/submissions/:id | Conferência e possíveis duplicidades |
| POST | /api/registration/submissions/:id/approve | Aprovar criação ou atualização explícita de perfil existente |
| POST | /api/registration/submissions/:id/reject | Registrar não aprovação e motivo |

## Testes

`npm test` cobre o cadastro anterior e os novos cenários de ficha, fotos, permissões, campos, revisão e expiração. `npm run test:registration-browser` executa um fluxo completo no Edge com banco temporário em memória, sem alterar os dados da instalação local: criação de link, envio anônimo com foto, congregação livre, layout de 390 px, aprovação, edição posterior e cadastro manual.
