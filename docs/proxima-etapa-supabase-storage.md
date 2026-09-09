# Proxima etapa segura: Supabase Storage e normalizacao

Este documento registra a preparacao para deixar o Igreja Conectada mais leve antes de aumentar muito a quantidade de cadastros e imagens.

## Decisao

- Manter `church_app_state` como fonte principal por enquanto.
- Nao executar migracao real sem backup validado.
- Migrar primeiro imagens do Kids e do Mural para Supabase Storage.
- Depois migrar dados por modulo para tabelas PostgreSQL com RLS.

## Storage recomendado

- Bucket `kids-photos`: privado, para fotos da Area Kids.
- Bucket `mural-images`: publico ou assinado, conforme o tipo de aviso publicado.
- Salvar no estado apenas a URL ou `fileKey`, nao a imagem em base64.
- Upload e exclusao devem passar por rota server-side, mantendo a chave secreta fora do navegador.

## Ordem de normalizacao

1. Membros e visitantes.
2. Kids e imagens.
3. Agenda e mural.
4. Atendimento pastoral.
5. EBD, Discipulado e chamadas.
6. Financeiro e patrimonio.

## Regras de seguranca

- Ativar RLS em cada tabela nova.
- Criar politicas por perfil antes de liberar leitura pelo frontend.
- Membro comum deve ler apenas propria ficha, agenda, mural publicado, pedidos proprios, classes, frequencia e devocional.
- Professor deve acessar somente classes, chamadas e alunos necessarios.
- Tesoureiro deve acessar financeiro e relatorios, sem dados pastorais ou Kids.
- Fazer backup JSON antes de cada virada de modulo.

## Validacao antes de publicar uma migracao real

- Comparar totais entre JSON e tabelas novas.
- Testar login e F5 em todos os perfis.
- Testar cadastro, edicao e exclusao por perfil.
- Testar Storage com imagem Kids e imagem do mural.
- Rodar `pnpm lint` e `pnpm build`.
