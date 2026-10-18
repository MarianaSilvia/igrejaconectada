CREATE OR REPLACE FUNCTION platform_invoice_export_view(p_status text DEFAULT 'all') RETURNS TABLE(billing_account text,period_start date,period_end date,due_on date,amount_cents bigint,status text,paid_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT b.name,i.period_start,i.period_end,i.due_on,i.amount_cents,i.status,i.paid_at
  FROM saas_invoices i JOIN billing_accounts b ON b.id=i.billing_account_id
  WHERE EXISTS(SELECT 1 FROM platform_memberships p WHERE p.user_id=actor_id()) AND (p_status='all' OR i.status=p_status)
  ORDER BY i.due_on DESC,i.created_at DESC LIMIT 5000
$$;
GRANT EXECUTE ON FUNCTION platform_invoice_export_view(text) TO ecclesia_app;
