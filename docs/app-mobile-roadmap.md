# Preparacao para app mobile

Este documento registra o estado real da transicao do Igreja Conectada para Android e iOS sem colocar os dados dos membros em risco.

## Estado atual concluido

- PWA com manifesto, icones, service worker e aviso de nova versao.
- Login obrigatorio pelo Supabase, sem acesso administrativo local alternativo.
- Nenhum cadastro completo e mantido no `localStorage`.
- Politica de privacidade, termos, regras da comunidade e solicitacao de exclusao de conta.
- Bloqueio e denuncia no Chat.
- Fotos de membros em bucket privado, entregues por URL assinada.
- Cabecalhos de seguranca e politicas de congregacao reforcados.

## Antes de gerar o Capacitor

- Migrar APIs administrativas, Push Web e rotinas agendadas para Supabase Edge Functions.
- Mover os agendamentos para Supabase Cron.
- Normalizar primeiro membros, visitantes, Kids, agenda, mural e pastoral.
- Migrar imagens de Kids e Mural para Storage.
- Tornar o frontend exportavel estaticamente e validar a PWA fora da Vercel.
- Configurar Turnstile e os URLs de redirecionamento de recuperacao no ambiente de producao.
- Criar contas de demonstracao sem dados reais para os seis perfis e as tres congregacoes.

## Empacotamento Android/iOS

- Usar Capacitor 8 com identificador `br.com.igrejaconectada`.
- Empacotar a exportacao local pelo `webDir`; nao usar `server.url` em producao.
- Armazenar credenciais de sessao no Keychain do iOS e Keystore do Android.
- Configurar links universais, compartilhamento e selecao de fotos nativos.
- Usar FCM no Android e APNs no iOS; manter Web Push apenas na PWA.
- Validar primeiro no Google Play Internal Testing e no TestFlight.
- A etapa iOS exige Mac com Xcode e conta Apple Developer.

## Regras de seguranca

- Nenhum dado sensivel deve ficar salvo offline nesta fase.
- Login, perfis e permissoes continuam controlados pelo Supabase e pelo backend protegido.
- Qualquer recurso offline futuro deve passar por revisao LGPD antes de ser ativado.
