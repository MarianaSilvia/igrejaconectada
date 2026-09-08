# Plano de estabilizacao dos cadastros

Este documento registra a estrategia atual para preparar o Igreja Conectada para uma quantidade maior de cadastros sem fazer uma migracao arriscada de uma vez.

## Estado atual

- O estado principal continua em `church_app_state`.
- Pre-cadastros publicos ja usam a tabela `registration_requests`.
- Membros tambem sao espelhados na tabela `members`, mantendo o JSON como fonte principal nesta fase.
- `church_app_state` deve ser acessado somente pelas rotas server-side do sistema.
- Fotos de membros continuam removidas.
- Fotos permanecem permitidas apenas no Kids.

## Protecoes aplicadas

- As tres variaveis de producao da Vercel foram conferidas: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`.
- O acesso direto de `anon` e `authenticated` a `church_app_state` foi revogado.
- `church_app_state` recebeu uma politica RLS explicita bloqueando acesso direto de `anon` e `authenticated`, mantendo uso somente por rotas server-side.
- `registration_requests` recebeu uma politica RLS explicita bloqueando acesso direto de `anon` e `authenticated`; o cadastro publico continua salvando por rota server-side validada.
- A fila principal carrega apenas pre-cadastros ativos: `Aguardando aprovacao` e `Em analise`.
- A administracao pode marcar um pre-cadastro como `Em analise` antes de aprovar ou recusar.
- Indices foram adicionados para chaves estrangeiras que apareciam nos avisos de performance.
- A tabela `members` recebeu campos auxiliares, indices por CPF/telefone e acesso direto fechado para `anon` e `authenticated`.
- Cada salvamento do estado principal sincroniza um espelho dos membros na tabela `members`.
- O cadastro publico consulta primeiro a tabela `members` para encontrar CPF/telefone duplicado.

## Proxima migracao recomendada

1. Manter a sincronizacao do espelho de membros por alguns ciclos de uso real.
2. Comparar totais entre `church_app_state.payload.members` e `members` antes de qualquer troca de leitura.
3. Criar tabelas normalizadas para usuarios internos, visitantes, grupos, classes e presencas.
4. Trocar primeiro buscas e verificacoes de duplicidade para as tabelas novas.
5. Trocar depois escrita, edicao e exclusao por modulo.
6. Manter o `church_app_state` como backup temporario.
7. Remover a dependencia do JSON unico somente depois de validacao completa.

## Cuidados

- Nao executar migracao real sem backup conferido.
- Nao expor `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Nao permitir que membro comum receba dados administrativos pela API.
- Manter bloqueio de conflito por `updated_at` enquanto o JSON unico existir.
- Ativar a protecao contra senhas vazadas no painel do Supabase Auth antes de liberar uso amplo.
- O modulo Escalas foi retirado da experiencia ativa; manter qualquer dado antigo apenas como backup/compatibilidade.
- Para preparar o app, usar PWA primeiro e manter dados sensiveis sempre online via Supabase.
