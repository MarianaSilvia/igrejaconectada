# Plano de estabilizacao dos cadastros

Este documento registra a estrategia atual para preparar o Igreja Conectada para uma quantidade maior de cadastros sem fazer uma migracao arriscada de uma vez.

## Estado atual

- O estado principal continua em `church_app_state`.
- Pre-cadastros publicos ja usam a tabela `registration_requests`.
- `church_app_state` deve ser acessado somente pelas rotas server-side do sistema.
- Fotos de membros continuam removidas.
- Fotos permanecem permitidas apenas no Kids.

## Protecoes aplicadas

- O acesso direto de `anon` e `authenticated` a `church_app_state` foi revogado.
- A fila principal carrega apenas pre-cadastros ativos: `Aguardando aprovacao` e `Em analise`.
- A administracao pode marcar um pre-cadastro como `Em analise` antes de aprovar ou recusar.
- Indices foram adicionados para chaves estrangeiras que apareciam nos avisos de performance.

## Proxima migracao recomendada

1. Criar tabelas normalizadas para membros, usuarios internos, visitantes, grupos, classes e presencas.
2. Fazer um script de leitura do `church_app_state` e gravacao controlada nas tabelas novas.
3. Comparar totais antes e depois da migracao.
4. Manter o `church_app_state` como backup temporario.
5. Trocar primeiro a leitura dos membros para as tabelas novas.
6. Trocar depois escrita, edicao e exclusao.
7. Remover a dependencia do JSON unico somente depois de validacao completa.

## Cuidados

- Nao executar migracao real sem backup conferido.
- Nao expor `SUPABASE_SERVICE_ROLE_KEY` no frontend.
- Nao permitir que membro comum receba dados administrativos pela API.
- Manter bloqueio de conflito por `updated_at` enquanto o JSON unico existir.
