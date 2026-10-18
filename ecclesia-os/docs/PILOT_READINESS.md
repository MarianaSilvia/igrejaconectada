# Checklist de prontidão do piloto

Atualizado em 18/10/2026. Projeto Supabase: `vsqumzgcbkeiiokpwdzm`.

## Confirmado

- [x] Projeto Supabase `EcclesiaOS` ativo em `sa-east-1`.
- [x] Migrações aplicadas até `086` no projeto atual.
- [x] 134 tabelas públicas com RLS habilitado.
- [x] Papéis `ecclesia_app`, `ecclesia_service` e `ecclesia_migration` separados, sem superusuário e sem `BYPASSRLS`.
- [x] `ecclesia_app` não é membro do papel de serviço.
- [x] Advisor de segurança sem alertas.
- [x] FKs públicas sem cobertura: `0` após as migrações de índices.
- [x] Índices redundantes removidos; avisos restantes de índice não utilizado são esperados no banco vazio.
- [x] 70 testes automatizados aprovados.
- [x] Smoke test do navegador aprovado em `/app`, com login/MFA, áreas administrativas, temas e viewport móvel.
- [x] Build de produção aprovado.
- [x] Auditoria npm sem vulnerabilidades.
- [x] Repositório separado: `MarianaSilvia/ecclesia-os`.

## Pendências externas

- [ ] Copiar o host real do Session pooler em **Supabase → Connect** para testar IPv4.
- [ ] Definir domínio HTTPS de homologação.
- [ ] Configurar `DATA_KEY_HEX` e `MFA_KEY_HEX` no ambiente de execução (as chaves locais já existem no `.env`, sem versionamento).
- [ ] Fornecer credenciais, certificado e CA do Efí para homologação.
- [ ] Escolher o transporte real de e-mail/SMS e seus endpoints HTTPS.
- [ ] Provisionar a primeira rede, igreja sede e administrador com dados definidos pela implantação.
- [ ] Criar duas igrejas fictícias de piloto e executar o smoke test PostgreSQL externo.

## Ordem recomendada

1. Copiar o host do pooler e executar `npm run test:postgres`.
2. Configurar domínio HTTPS e secrets no ambiente de hospedagem.
3. Configurar Efí em homologação e validar webhook, idempotência, tarifas e devoluções.
4. Provisionar rede e duas igrejas fictícias.
5. Executar aceite de isolamento, backup/restauração, acessibilidade e operação comercial.
6. Só depois importar dados reais e habilitar pagamentos reais.

Nenhuma senha, chave ou certificado deve ser colocado neste arquivo, no GitHub ou em variáveis `VITE_*`.
