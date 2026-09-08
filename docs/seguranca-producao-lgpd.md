# Seguranca de producao e LGPD

Este documento registra as decisoes minimas antes de usar o Igreja Conectada com dados reais de membros, visitantes, criancas e atendimentos pastorais.

## Variaveis de producao

As variaveis abaixo devem existir na Vercel em Production:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

Regras:

- `SUPABASE_SERVICE_ROLE_KEY` fica somente no servidor e nunca deve usar prefixo `NEXT_PUBLIC_`.
- `.env.local` nao deve ser commitado nem copiado sem necessidade.
- `.env.example` deve manter apenas nomes de variaveis e exemplos sem segredo real.

## RLS e acesso por perfil

Todas as tabelas publicas devem manter Row Level Security habilitado.

Tabelas de controle sensivel que hoje sao acessadas apenas por rotas server-side:

- `church_app_state`
- `registration_requests`

Essas tabelas possuem politicas explicitas bloqueando acesso direto de `anon` e `authenticated`. O sistema acessa esses dados por rotas protegidas, validando sessao e perfil antes de devolver ou salvar informacoes.

## Retencao de dados sensiveis

Regras sugeridas:

- Pre-cadastros recusados: revisar e limpar apos 90 dias.
- Atendimentos pastorais concluidos: manter historico resumido por ate 24 meses, salvo se houver necessidade pastoral/documental.
- Dados Kids: revisar semestralmente e remover criancas que nao participam mais, mantendo apenas registro administrativo necessario.
- Campanhas WhatsApp: manter historico por ate 12 meses, sem guardar conversas pessoais.
- Auditoria: manter registros recentes para rastreabilidade operacional; exportar relatorio antes de limpezas grandes.

## Backup

Antes de qualquer limpeza ou migracao:

1. Exportar backup pelo modulo Configuracoes.
2. Conferir total de membros, visitantes, Kids, agenda, mural e auditoria.
3. Salvar copia em local protegido.
4. Testar restauracao em ambiente de teste antes de mexer em producao.

## Senhas e acesso

- Ativar protecao contra senhas vazadas no painel do Supabase Auth.
- Evitar senhas padrao em contas administrativas.
- Bloquear ou excluir acessos que nao sejam mais usados.
- Revisar usuarios administrativos mensalmente.

## App instalavel

- A primeira versao mobile deve ser PWA, sem cache offline de dados sensiveis.
- O service worker pode cachear apenas arquivos estaticos, icones e scripts publicos.
- Dados de membros, Kids e atendimento pastoral devem continuar sendo carregados pela API protegida.

## Vite, Vinext e Sites

O projeto usa Next.js para a Vercel. Os arquivos e dependencias de Vite/Vinext/Cloudflare permanecem porque ainda apoiam o fluxo de Sites/OpenAI e publicacoes alternativas.

Nao remover `vite.config.ts`, `vinext`, `vite`, `wrangler`, `@openai/sites-vite-plugin` ou `@cloudflare/vite-plugin` sem antes confirmar que o fluxo de Sites nao sera mais usado.
