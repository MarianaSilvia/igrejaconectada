ALTER TABLE communication_messages ADD COLUMN IF NOT EXISTS send_at timestamptz;
CREATE INDEX IF NOT EXISTS communication_messages_send_at ON communication_messages(church_id,send_at,status);
