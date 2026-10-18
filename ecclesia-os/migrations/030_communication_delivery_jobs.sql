ALTER TABLE communication_deliveries
  ADD COLUMN attempts int NOT NULL DEFAULT 0,
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN lease_token uuid,
  ADD COLUMN provider_message_id text,
  ADD COLUMN last_error text;
CREATE INDEX communication_deliveries_ready ON communication_deliveries(channel,status,available_at)
  WHERE status='queued' AND channel IN ('email','sms');
