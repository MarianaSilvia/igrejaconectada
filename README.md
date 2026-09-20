# Igreja Conectada

Sistema de gestao para igreja com Supabase, painel administrativo, area do membro, pre-cadastro publico e suporte inicial a app instalavel PWA.

## Recursos principais

- Painel administrativo com prioridades, atalhos, aniversariantes, mural e agenda da semana.
- Painel inteligente com destaque rotativo do mural ao fundo quando houver banner publicado.
- Blocos de resumo com proximo evento, aniversariantes, pre-cadastros, pendencias e avisos.
- Cadastro de membros, visitantes, novos convertidos, Area Kids e grupos.
- Agenda, comunicados, mural, atendimento pastoral, EBD, Discipulado, chamadas e chat por congregação.
- Chamada simplificada para EBD e Discipulado com cards de alunos, botoes grandes e historico separado.
- Comunicacao manual por WhatsApp com modelos prontos e historico de campanhas.
- Relatorios em PDF/CSV para membros, visitantes, Kids, agenda, presenca, faltosos, financeiro e patrimonio.
- Login obrigatório por Supabase Auth, usando e-mail ou código `CDG`, com perfis: administrador, líder, professor, secretário, tesoureiro e membro.
- PWA instalavel no celular, mantendo os dados online via Supabase.
- Notificacoes Push Web para aparelhos/navegadores inscritos, com fallback pela central de acoes interna.
- Chat por congregação com mensagens em tempo real, denúncia, moderação, bloqueio de usuário e retenção de 90 dias.
- Devocionais semanais automáticos a partir de um banco interno de textos aprovados.
- Painel de saude do sistema com status de salvamento, totais principais e atalho para recarregar dados da base.
- Modo Visual simples para membros, com letras maiores, atalhos grandes e linguagem direta para terceira idade.
- Backup completo em JSON pelo modulo Configuracoes antes de importacoes ou mudancas grandes.

## Dados e seguranca

- A fonte principal ainda e `church_app_state`, acessada apenas por rotas server-side.
- Membros tambem sao espelhados na tabela `members` para busca e preparacao da futura normalizacao.
- `SUPABASE_SERVICE_ROLE_KEY` deve ficar somente no servidor/Vercel e nunca no frontend.
- Membro comum recebe apenas propria ficha, agenda, mural publicado, pedidos proprios, classes, frequencia e devocional publicado.
- Fotos de membros usam bucket privado no Supabase Storage, com URL assinada temporária.
- O navegador não mantém uma cópia local dos cadastros; ao sair, os dados privados dependem de nova autenticação.
- Cadastro público registra o consentimento LGPD e pode usar Cloudflare Turnstile para proteção antispam.
- Fotos Kids e imagens do Mural ainda devem migrar futuramente para Supabase Storage para reduzir peso do JSON.
- O modulo Escalas foi retirado da experiencia ativa e do modelo principal do app.

## Como rodar localmente

```bash
pnpm install
pnpm run dev
```

Abra `http://localhost:3000`.

## Como validar antes de publicar

```bash
pnpm lint
pnpm build
```

## Variaveis de ambiente

Configure estas variaveis no ambiente de producao do provedor atual:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://bssrgotlvvexvrutshqz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_publica_do_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_privada
NEXT_PUBLIC_VAPID_PUBLIC_KEY=sua_chave_publica_vapid
VAPID_PRIVATE_KEY=sua_chave_privada_vapid
VAPID_SUBJECT=mailto:secretaria@igrejaconectada.app
CRON_SECRET=segredo_forte_para_rotinas_automaticas
NEXT_PUBLIC_TURNSTILE_SITE_KEY=sua_chave_publica_turnstile
TURNSTILE_SECRET_KEY=sua_chave_privada_turnstile
```

Sem Supabase, o sistema abre apenas a tela pública e bloqueia o login. Não existe acesso administrativo local em produção.
Sem VAPID, o app continua funcionando, mas notificacoes em segundo plano ficam indisponiveis.
Sem Turnstile, o cadastro público continua protegido por limite básico de requisições, mas a proteção completa exige as duas chaves.

## Chat por congregação

Antes de liberar o Chat para os membros, execute no Supabase SQL Editor:

```sql
-- arquivo do projeto
db/supabase-chat.sql
```

O chat usa tabelas próprias (`chat_rooms`, `chat_messages`, `chat_moderation` e `chat_blocks`) e não grava mensagens dentro do `church_app_state`.
As mensagens com mais de 90 dias são removidas pela rota `/api/chat/cleanup`, protegida por `CRON_SECRET`.

## Rotinas automaticas

Enquanto o backend ainda estiver na Vercel, o projeto usa Vercel Cron para:

- `/api/chat/cleanup`: limpeza diaria de mensagens antigas do chat.
- `/api/cron/devotionals-weekly`: preparacao semanal dos devocionais publicados, usando apenas textos com status `Aprovado` no Banco de devocionais.

No plano Hobby da Vercel, o limite e de 2 cron jobs. Se novas rotinas forem criadas, consolide em uma unica rota orquestradora antes de adicionar outro item ao `vercel.json`.
Na retirada da Vercel, essas duas rotinas devem ser transferidas para Supabase Edge Functions e Supabase Cron antes de desligar a hospedagem atual.

## App instalavel

O projeto inclui manifesto, icones e service worker leve para funcionar como PWA. O service worker cacheia apenas arquivos estaticos e nao guarda dados sensiveis, paginas administrativas ou respostas da API.
Quando uma nova versao estiver disponivel, o app mostra um aviso para atualizar a tela e carregar a publicacao mais recente.

Para instalar:

1. Abra o sistema no navegador do celular.
2. No Android/Chrome, toque em "Instalar app" ou "Adicionar a tela inicial".
3. No iPhone/Safari, use compartilhar e depois "Adicionar a Tela de Inicio".

## Preparação Android e iOS

Antes de gerar projetos Capacitor, conclua a retirada das APIs do Next/Vercel para Supabase Edge Functions e gere uma exportação estática do frontend. O pacote nativo deve conter os arquivos web no `webDir`; não use `server.url` em produção. A publicação exige ainda exclusão de conta, política de privacidade, regras da comunidade, bloqueio no Chat e notificações nativas FCM/APNs.

## Backup e migracao futura

Antes de qualquer migracao real no Supabase:

1. Exportar backup pelo modulo Configuracoes.
2. Conferir totais de membros, visitantes, Kids, agenda, mural e auditoria.
3. Testar importacao em ambiente separado.
4. Migrar modulo por modulo, mantendo `church_app_state` como backup temporario.
