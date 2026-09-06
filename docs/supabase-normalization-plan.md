# Plano tecnico de normalizacao do Supabase

Este documento prepara a migracao futura do estado unico `church_app_state` para tabelas normalizadas, sem executar nenhuma alteracao agora. A etapa atual continua usando o JSON principal para evitar risco nos cadastros reais.

## Objetivo

- Reduzir risco de conflito quando varias pessoas usam o sistema.
- Permitir permissoes por tabela com RLS.
- Facilitar relatorios, filtros e auditoria.
- Manter uma migracao reversivel e validada antes de trocar a fonte principal.

## Tabelas candidatas alinhadas ao sistema atual

- `members`: cadastro principal de membros, congregados, visitantes convertidos e dados de acesso vinculados.
- `visitors`: visitantes em acompanhamento antes da integracao.
- `kids`: criancas e responsaveis.
- `ministries`: grupos da igreja, mantendo o nome tecnico existente ate uma migracao completa.
- `events`: agenda e eventos.
- `schedules`: escalas.
- `school_classes`: classes da EBD e do discipulado identificadas por area.
- `attendance_sessions`: chamadas e historico de aula.
- `attendance_records`: presenca, falta, justificativa e precisa de contato por aluno.
- `notices`: avisos.
- `mural_items`: mural com imagens, links e banners.
- `care_requests`: pedidos pastorais e pedidos de oracao.
- `message_templates`: modelos de WhatsApp.
- `message_campaigns`: historico de campanhas.
- `transactions`: financeiro futuro.
- `assets`: patrimonio futuro.
- `devotionals`: palavra do dia.
- `audit_log`: registros de alteracao.

O arquivo `db/schema.ts` deve funcionar como rascunho tecnico do alvo normalizado. Ele nao representa uma migracao aplicada enquanto `church_app_state` continuar sendo a fonte principal.

## Estrategia segura

1. Criar tabelas em paralelo ao `church_app_state`, sem remover o JSON.
2. Executar um importador que leia o JSON atual e grave os registros normalizados.
3. Comparar contagens e amostras entre JSON e tabelas.
4. Publicar uma versao em modo leitura dupla: tela ainda salva no JSON, mas relatorios podem ler tabelas.
5. Migrar modulo por modulo para escrita normalizada.
6. Manter backup do JSON antes de cada virada de modulo.
7. Remover dependencia do JSON somente depois de validar todos os modulos em producao.

## Regras de seguranca esperadas

- `SUPABASE_SERVICE_ROLE_KEY` fica apenas em rotas server-side.
- O frontend usa apenas chave anonima/publicavel quando necessario.
- Membro comum so pode ler a propria ficha, mural, agenda, devocional publicado, propria frequencia e proprios pedidos.
- Professor le apenas classes, chamadas, alunos necessarios para sua turma e avisos de classe.
- Secretario gerencia membros, visitantes, Kids, agenda, comunicados e relatorios.
- Lider gerencia grupos, pastoral, visitantes, agenda, escalas, mural, relatorios e devocional.
- Tesoureiro le relatorios e gerencia financeiro.
- Administrador tem acesso total.

## Validacao antes de migrar

- Conferir que nenhum cadastro perde campo em relacao ao JSON.
- Rodar importacao em ambiente de teste primeiro.
- Testar login e F5 em todos os perfis.
- Testar criacao, edicao e exclusao por perfil.
- Testar relatarios PDF/CSV com as novas tabelas.
- Conferir RLS com usuario comum tentando acessar dados administrativos.

## Observacao

A migracao nao deve ser aplicada junto com uma grande refatoracao visual. O caminho mais seguro e consolidar o codigo primeiro, depois migrar dados modulo por modulo.
