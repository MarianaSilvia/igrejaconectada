# Checklist de prontidão do piloto

Atualizado em 21/10/2026. Projeto Supabase: `vsqumzgcbkeiiokpwdzm`.

## Estado atual do preflight

`npm run pilot:preflight:homologation` confirma modo, três URLs, papéis distintos, chaves distintas, callbacks de comunicação, Pix estático e migrações. Permanecem pendentes o preenchimento dos segredos do ambiente externo e o domínio HTTPS de homologação.

## Confirmado

- [x] Projeto Supabase `EcclesiaOS` ativo em `sa-east-1`.
- [x] Migrações aplicadas até `086` no projeto atual.
- [x] Tabelas públicas com RLS habilitado.
- [x] Papéis `ecclesia_app`, `ecclesia_service` e `ecclesia_migration` separados, sem superusuário e sem `BYPASSRLS`.
- [x] `ecclesia_app` não é membro do papel de serviço.
- [x] Advisor de segurança sem alertas.
- [x] FKs públicas sem cobertura: `0` após as migrações de índices.
- [x] Índices redundantes removidos; avisos restantes de índice não utilizado são esperados no banco vazio.
- [x] 72 testes automatizados aprovados em execução independente.
- [x] Smoke test do navegador aprovado em `/app`, com login/MFA, áreas administrativas, temas e viewport móvel.
- [x] Build de produção aprovado.
- [x] Auditoria npm sem vulnerabilidades.
- [x] Repositório separado: `MarianaSilvia/ecclesia-os`.

## Pendências externas

- [ ] Copiar o host real do Session pooler em **Supabase → Connect** para testar IPv4.
- [ ] Revisar as políticas permissivas sobrepostas apontadas pelo advisor de performance; não há duplicatas idênticas, mas a consolidação deve ser validada por testes de autorização antes da produção.
- [ ] Definir domínio HTTPS de homologação.
- [ ] Configurar `DATA_KEY_HEX` e `MFA_KEY_HEX` no ambiente de execução (as chaves locais já existem no `.env`, sem versionamento).
- [x] Recebimento bancário automático desativado; o piloto usa Pix estático.
- [ ] Escolher o transporte real de e-mail/SMS e seus endpoints HTTPS.
- [ ] Provisionar a primeira rede, igreja sede e administrador com dados definidos pela implantação.
- [ ] Criar duas igrejas fictícias de piloto e executar o smoke test PostgreSQL externo.

## Ordem recomendada

1. Copiar o host do pooler e executar `npm run test:postgres`.
2. Configurar domínio HTTPS e secrets no ambiente de hospedagem.
3. Configurar comunicação real e validar entrega, falha, descadastro e recuperação.
4. Provisionar rede e duas igrejas fictícias.
5. Executar aceite de isolamento, backup/restauração e acessibilidade.
6. Só depois importar dados reais; pagamentos automáticos permanecem fora do piloto.

Nenhuma senha, chave ou certificado deve ser colocado neste arquivo, no GitHub ou em variáveis `VITE_*`.
