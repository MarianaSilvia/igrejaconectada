# EcclesiaOS — checklist de homologação comercial

Este checklist deve ser concluído antes de ativar cobrança real ou dados de produção.

## Banco e isolamento

- [ ] Criar PostgreSQL externo separado para homologação.
- [ ] Executar todas as migrações versionadas e registrar `schema_migrations`.
- [ ] Validar `ecclesia_app` sem `BYPASSRLS` e `ecclesia_service` somente em jobs internos.
- [ ] Criar duas igrejas e uma sede com duas congregações.
- [ ] Confirmar que secretaria, tesouraria, documentos, mídia, exportações e relatórios não atravessam `church_id`.
- [ ] Restaurar um backup em banco separado e repetir os testes de isolamento.

## Conta comercial

- [ ] Criar uma `billing_account` para a sede.
- [ ] Vincular congregações sem duplicar contrato ou fatura.
- [ ] Conferir limites de plano, snapshots de uso e alertas de 80%.
- [ ] Testar upgrade, downgrade, suspensão e reativação pelos fluxos autorizados.
- [ ] Conferir histórico de contrato, usuário responsável e data da alteração.
- [ ] Validar exportação CSV somente com papel `platform_admin` ou `platform_billing`.

## PSP e pagamentos

- [ ] Configurar credenciais de homologação do PSP por ambiente.
- [ ] Criar cobrança e guardar a intenção antes da chamada externa.
- [ ] Validar QR Code, Pix Copia e Cola, expiração e consulta de recuperação.
- [ ] Validar assinatura/autenticidade do webhook e conta recebedora.
- [ ] Reenviar o mesmo evento e confirmar idempotência.
- [ ] Enviar evento divergente de valor, cobrança ou igreja e confirmar rejeição.
- [ ] Testar pagamento parcial, tarifa, devolução e falha temporária do provedor.
- [ ] Confirmar que somente pagamento verificado liquida o lançamento.

## Acesso e privacidade

- [ ] Testar convite, MFA, recuperação, expiração e revogação de sessão.
- [ ] Revisar retenção, finalidade e solicitações LGPD.
- [ ] Confirmar que o operador global recebe apenas dados comerciais agregados.
- [ ] Validar auditoria de concessões, alterações e exportações.
- [ ] Verificar rotação e armazenamento dos segredos fora do código.

## Operação e recuperação

- [ ] Configurar TLS na hospedagem real.
- [ ] Monitorar erros, fila de integrações, retries e dead-letter.
- [ ] Executar teste de carga das listagens, webhooks e portal.
- [ ] Simular indisponibilidade do PSP e do banco.
- [ ] Restaurar backup dentro do prazo operacional definido.
- [ ] Registrar evidências, responsáveis, data, ambiente e resultado de cada teste.

## Critério de liberação

A cobrança real só poderá ser ativada quando todos os itens de banco, isolamento, PSP, backup, acessibilidade e recuperação estiverem evidenciados em ambiente separado. O piloto deve começar com uma rede e duas igrejas, sem dados reais de crianças ou notas pastorais.
