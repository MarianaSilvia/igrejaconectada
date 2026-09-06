# Igreja Conectada

Sistema administrativo para igreja com painel local, cadastro de membros e visitantes, Area Kids, EBD, ministerios, agenda, mural, comunicacao por WhatsApp e aniversariantes.

## Recursos principais

- Painel administrativo com prioridades e atalhos.
- Cadastro completo de membros, visitantes e novos convertidos.
- Area Kids com cadastro da crianca, responsavel e autorizacoes.
- Modulos de agenda, ministerios, comunicados, mural e atendimento pastoral.
- EBD com avisos por classe.
- Comunicacao por WhatsApp com modelos prontos, aniversariantes, EBD, ministerios e responsaveis Kids.
- Backup local dos dados cadastrados no navegador.

## Como rodar localmente

```bash
pnpm install
pnpm run dev
```

Abra `http://localhost:3000`.

## Como validar antes de publicar

```bash
pnpm run build
```

## Configurar Supabase

Crie estas variaveis no Vercel antes de usar o banco em producao:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://bssrgotlvvexvrutshqz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_publica_do_supabase
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role_privada
```

Sem as variaveis publicas, o sistema continua funcionando em modo local no navegador. A `SUPABASE_SERVICE_ROLE_KEY` e privada e deve ficar apenas no servidor/Vercel; ela permite criar usuarios reais no Supabase Auth pelo painel administrativo.

## Deploy via GitHub e Vercel

1. Crie um repositorio no GitHub.
2. Envie este projeto para o repositorio.
3. No Vercel, escolha `Add New Project`.
4. Importe o repositorio do GitHub.
5. Confirme as configuracoes:
   - Framework Preset: `Next.js`
   - Install Command: `pnpm install --frozen-lockfile`
   - Build Command: `pnpm run build`
   - Development Command: `pnpm run dev`
6. Clique em `Deploy`.

## Observacao sobre dados

Nesta versao, os dados ficam salvos no navegador do aparelho. Para varios usuarios acessarem os mesmos dados em tempo real, o proximo passo e conectar banco de dados, autenticacao real e armazenamento de fotos.

## Publicacao antiga pelo Sites

O projeto ainda preserva comandos separados para o fluxo anterior:

```bash
pnpm run dev:sites
pnpm run build:sites
pnpm run start:sites
```
