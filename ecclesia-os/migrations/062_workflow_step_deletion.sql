-- Edição de workflows pode remover etapas somente quando não há instâncias abertas.
-- A rota continua protegendo o histórico e a integridade antes de executar DELETE.
GRANT DELETE ON workflow_steps TO ecclesia_app;
