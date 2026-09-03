# Checklist de Deploy

## GitHub

1. Confirme que o projeto esta validado:

```bash
pnpm run build
```

2. Crie o repositorio no GitHub.
3. Conecte o repositorio local ao GitHub:

```bash
git remote add github https://github.com/SEU-USUARIO/SEU-REPOSITORIO.git
git push -u github main
```

Se o remoto `origin` ja estiver apontando para outro lugar, use o nome `github` como acima para nao apagar o fluxo atual.

## Vercel

1. Acesse o painel do Vercel.
2. Clique em `Add New Project`.
3. Selecione o repositorio do GitHub.
4. Use as configuracoes do arquivo `vercel.json`.
5. Publique.

## Variaveis de ambiente

Esta versao nao exige variaveis obrigatorias para subir no Vercel.

## Depois do primeiro deploy

- Cada envio para a branch `main` pode gerar uma nova publicacao.
- Branches separadas podem gerar previews para revisao.
- Quando o sistema passar a usar banco de dados, cadastre as variaveis no painel do Vercel antes de publicar.
