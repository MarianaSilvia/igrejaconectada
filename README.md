# EcclesiaOS

Plataforma de gestão para igrejas, congregações e redes, com cadastro de pessoas, grupos, ensino, tesouraria manual, agenda, comunicação, mural e portal do membro.

O aplicativo está em [ecclesia-os/](./ecclesia-os). Este repositório contém a implementação principal em React + TypeScript, API Node/Express, PostgreSQL e integração opcional com Firebase Authentication/Firestore para identidade e metadados não sensíveis.

## Estado atual

- Ambiente publicado: homologação.
- Unidade de isolamento: igreja/congregação.
- Cadastro compartilhado entre secretaria, grupos, ensino, eventos e portal.
- Tesouraria sem recebimento bancário automático; Pix é informativo/estático.
- Cobrança comercial e pagamentos reais permanecem desativados.
- Dados ministeriais e financeiros permanecem no backend protegido; o Firestore não é fonte de verdade.

## Desenvolvimento

Consulte [`ecclesia-os/README.md`](./ecclesia-os/README.md) para variáveis, migrações, testes, provisionamento e publicação.

Comandos principais dentro de `ecclesia-os/`:

```bash
npm install
npm run build
npm test
```

Nunca coloque senhas, chaves, tokens, URLs privadas ou arquivos `.env` no Git.