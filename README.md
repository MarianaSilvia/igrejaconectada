# Igreja Conectada

Sistema de gestao para igreja com Supabase, painel administrativo, area do membro, pre-cadastro publico e suporte inicial a app instalavel PWA.

## Recursos principais

- Painel administrativo com prioridades, atalhos, aniversariantes, mural e agenda da semana.
- Painel inteligente com destaque rotativo do mural ao fundo quando houver banner publicado.
- Blocos de resumo com proximo evento, aniversariantes, pre-cadastros, pendencias e avisos.
- Cadastro de membros, visitantes, novos convertidos, Area Kids e grupos.
- Agenda, comunicados, mural, atendimento pastoral, EBD, Discipulado e chamadas.
- Chamada simplificada para EBD e Discipulado com cards de alunos, botoes grandes e historico separado.
- Comunicacao manual por WhatsApp com modelos prontos e historico de campanhas.
- Relatorios em PDF/CSV para membros, visitantes, Kids, agenda, presenca, faltosos, financeiro e patrimonio.
- Login por Supabase Auth com perfis: administrador, lider, professor, secretario, tesoureiro e membro.
- PWA instalavel no celular, mantendo os dados online via Supabase.
- Painel de saude do sistema com status de salvamento, totais principais e atalho para recarregar dados da base.
- Modo Visual simples para membros, com letras maiores, atalhos grandes e linguagem direta para terceira idade.
- Backup completo em JSON pelo modulo Configuracoes antes de importacoes ou mudancas grandes.

## Dados e seguranca

- A fonte principal ainda e `church_app_state`, acessada apenas por rotas server-side.
- Membros tambem sao espelhados na tabela `members` para busca e preparacao da futura normalizacao.
- `SUPABASE_SERVICE_ROLE_KEY` deve ficar somente no servidor/Vercel e nunca no frontend.
- Membro comum recebe apenas propria ficha, agenda, mural publicado, pedidos proprios, classes, frequencia e devocional publicado.
- Fotos de membros permanecem removidas. Fotos continuam permitidas apenas no Kids.
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

Configure estas variaveis no Vercel em Production:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://bssrgotlvvexvrutshqz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_publica_do_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_privada
```

Sem Supabase, o sistema pode abrir em modo local, mas o uso real com membros deve acontecer com as variaveis configuradas.

## App instalavel

O projeto inclui manifesto, icones e service worker leve para funcionar como PWA. O service worker cacheia apenas arquivos estaticos e nao guarda dados sensiveis, paginas administrativas ou respostas da API.
Quando uma nova versao estiver disponivel, o app mostra um aviso para atualizar a tela e carregar a publicacao mais recente.

Para instalar:

1. Abra o sistema no navegador do celular.
2. No Android/Chrome, toque em "Instalar app" ou "Adicionar a tela inicial".
3. No iPhone/Safari, use compartilhar e depois "Adicionar a Tela de Inicio".

## Backup e migracao futura

Antes de qualquer migracao real no Supabase:

1. Exportar backup pelo modulo Configuracoes.
2. Conferir totais de membros, visitantes, Kids, agenda, mural e auditoria.
3. Testar importacao em ambiente separado.
4. Migrar modulo por modulo, mantendo `church_app_state` como backup temporario.
