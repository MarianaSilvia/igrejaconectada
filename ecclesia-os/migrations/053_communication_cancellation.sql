ALTER TABLE communication_messages DROP CONSTRAINT IF EXISTS communication_messages_status_check;
ALTER TABLE communication_messages ADD CONSTRAINT communication_messages_status_check CHECK(status IN ('draft','queued','sent','failed','cancelled'));
