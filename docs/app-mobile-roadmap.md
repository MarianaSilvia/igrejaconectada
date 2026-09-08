# Plano para app mobile

Este documento registra a estrategia escolhida para transformar o Igreja Conectada em app sem colocar os dados reais em risco.

## Fase 1: PWA instalavel

- Usar o proprio sistema Next.js publicado na Vercel.
- Incluir manifesto, icones e service worker leve.
- Permitir instalacao pelo navegador no Android/Chrome e iPhone/Safari.
- Manter dados sempre online via Supabase.
- Nao cachear paginas administrativas, respostas de API, dados de membros, Kids ou atendimento pastoral.

## Fase 2: Ajustes de experiencia mobile

- Revisar telas com maior uso no celular: login, painel, membros, agenda, mural, pedidos pastorais, EBD e Discipulado.
- Garantir botoes com area de toque confortavel.
- Reduzir rolagem excessiva em formulários longos.
- Testar visual em telas pequenas antes de publicar.

## Fase 3: Empacotamento Android/iOS

- Avaliar Capacitor para empacotar a PWA como app nativo.
- Reutilizar a mesma URL e a mesma base Supabase.
- Criar icones, splash screen e configuracoes de permissao.
- Publicar em loja somente depois da PWA estar validada em uso real.

## Regras de seguranca

- Nenhum dado sensivel deve ficar salvo offline nesta fase.
- Login, perfis e permissoes continuam controlados pelo Supabase e pelas rotas server-side.
- Qualquer recurso offline futuro deve passar por revisao LGPD antes de ser ativado.
