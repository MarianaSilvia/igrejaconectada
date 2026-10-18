CREATE OR REPLACE FUNCTION record_saas_contract_change() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND (OLD.plan IS DISTINCT FROM NEW.plan OR OLD.status IS DISTINCT FROM NEW.status) THEN
    INSERT INTO saas_contract_events(billing_account_id,contract_id,previous_plan,new_plan,previous_status,new_status,reason,changed_by)
    VALUES(NEW.billing_account_id,NEW.id,OLD.plan,NEW.plan,OLD.status,NEW.status,COALESCE(NULLIF(current_setting('app.contract_reason',true),''),''),actor_id());
  END IF;
  RETURN NEW;
END $$;
