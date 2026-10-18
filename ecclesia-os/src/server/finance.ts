import { randomUUID } from "node:crypto";
import type { Database, Query, Row } from "./db.js";
import { requireThat } from "./security.js";
import { audit } from "./seed.js";
export function cents(value: string) {
  requireThat(
    /^\d{1,9}(\.\d{1,2})?$/.test(value),
    400,
    "Informe um valor em reais com até duas casas decimais.",
  );
  const [a, b = ""] = value.split(".");
  const n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  requireThat(Number.isSafeInteger(n) && n > 0, 400, "Valor inválido.");
  return n;
}
export function decimal(n: number) {
  return `${Math.floor(n / 100)}.${(n % 100).toString().padStart(2, "0")}`;
}
export async function postEntry(
  q: Query,
  church: string,
  description: string,
  lines: { account: string; amount: number }[],
  opts: {
    fund?: string;
    costCenter?: string;
    date?: string;
    reversal?: string;
  } = {},
) {
  await q("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [church]);
  requireThat(
    lines.length >= 2 &&
      lines.reduce((n, l) => n + l.amount, 0) === 0 &&
      lines.every((l) => Number.isSafeInteger(l.amount) && l.amount !== 0),
    400,
    "Lançamento não balanceado.",
  );
  const [entry] = await q(
    "INSERT INTO journal_entries(church_id,description,fund_id,cost_center_id,occurred_on,reversal_of) VALUES($1,$2,$3,$4,COALESCE($5::date,CURRENT_DATE),$6) RETURNING *",
    [
      church,
      description,
      opts.fund ?? null,
      opts.costCenter ?? null,
      opts.date ?? null,
      opts.reversal ?? null,
    ],
  );
  for (const line of lines)
    await q(
      "INSERT INTO journal_lines(church_id,entry_id,account_id,amount_cents) VALUES($1,$2,$3,$4)",
      [church, entry.id, line.account, line.amount],
    );
  return entry;
}
export async function settle(
  db: Database,
  event: {
    provider: string;
    account: string;
    txid: string;
    endToEndId: string;
    amount: number;
    fee?: number;
  },
) {
  return db.transaction(async (q) => {
    const [charge] = await q(
      "SELECT * FROM pix_charges WHERE txid=$1 FOR UPDATE",
      [event.txid],
    );
    requireThat(
      charge &&
        charge.provider === event.provider &&
        charge.provider_account === event.account,
      400,
      "Cobrança ou conta recebedora divergente.",
    );
    const prior = await q(
      "SELECT 1 FROM pix_events WHERE provider=$1 AND provider_account=$2 AND end_to_end_id=$3",
      [event.provider, event.account, event.endToEndId],
    );
    if (prior.length) return { duplicate: true };
    requireThat(
      Number(charge.amount_cents) === event.amount,
      409,
      "Valor recebido divergente.",
    );
    requireThat(
      charge.status === "active" || charge.status === "expired",
      409,
      "Cobrança já processada.",
    );
    const fee = event.fee ?? 0;
    requireThat(
      Number.isSafeInteger(fee) && fee >= 0 && fee < event.amount,
      400,
      "Tarifa inválida.",
    );
    const accounts = await q(
      "SELECT id,code FROM accounts WHERE church_id=$1",
      [charge.church_id],
    );
    const id = (code: string) => accounts.find((a) => a.code === code)?.id;
    requireThat(
      id("bank") && id("giving") && id("fees"),
      409,
      "Plano de contas incompleto.",
    );
    const lines = [
      { account: id("bank"), amount: event.amount - fee },
      { account: id("giving"), amount: -event.amount },
    ];
    if (fee) lines.push({ account: id("fees"), amount: fee });
    const entry = await postEntry(
      q,
      charge.church_id,
      `Pix conciliado · ${charge.txid}`,
      lines,
      { fund: charge.fund_id },
    );
    await q(
      "INSERT INTO pix_events(provider,provider_account,end_to_end_id,church_id,txid) VALUES($1,$2,$3,$4,$5)",
      [
        event.provider,
        event.account,
        event.endToEndId,
        charge.church_id,
        event.txid,
      ],
    );
    await q(
      "UPDATE pix_charges SET status='settled',entry_id=$1,fee_cents=$2 WHERE id=$3",
      [entry.id, fee, charge.id],
    );
    await q(
      "UPDATE event_registrations SET payment_status='paid' WHERE pix_charge_id=$1 AND payment_status='pending'",
      [charge.id],
    );
    await audit(q, null, charge.church_id, "pix.settled", charge.id);
    return { duplicate: false, entryId: entry.id };
  });
}
export const newTxid = () => randomUUID().replaceAll("-", "");
