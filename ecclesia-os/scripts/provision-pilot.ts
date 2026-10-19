import "../src/server/env.js";
import { openDatabase } from "../src/server/db.js";
import { passwordHash } from "../src/server/security.js";
import { audit } from "../src/server/seed.js";

const password = process.env.PILOT_TEMP_PASSWORD;
if (!password || password.length < 14)
  throw new Error("PILOT_TEMP_PASSWORD deve ter pelo menos 14 caracteres e ser fornecida somente fora do repositório.");

const accounts = [
  { email: "admin@esperanca.demo", name: "Administração local", role: "admin", church: "DEMO — Igreja Sede", network: false, mfa: true },
  { email: "central@rede.demo", name: "Supervisão da rede", role: null, church: null, network: true, mfa: true },
  { email: "membro@esperanca.demo", name: "Portal do membro", role: "member", church: "DEMO — Igreja Sede", network: false, mfa: false },
  { email: "admin@caminho.demo", name: "Administração Congregação Norte", role: "admin", church: "DEMO — Congregação Norte", network: false, mfa: true },
] as const;

const db = await openDatabase();
try {
  await db.transaction(async (q) => {
    const churches = await q("SELECT id,name,network_id FROM churches WHERE name = ANY($1::text[]) FOR UPDATE", [[...new Set(accounts.flatMap((a) => a.church ? [a.church] : []))]]);
    const byName = new Map(churches.map((c) => [c.name, c]));
    for (const account of accounts) {
      const church = account.church ? byName.get(account.church) : null;
      if (account.church && !church) throw new Error(`Igreja não encontrada: ${account.church}`);
      const existing = (await q("SELECT id,totp_secret FROM users WHERE lower(email)=lower($1) FOR UPDATE", [account.email]))[0];
      const user = existing ?? (await q(
        "INSERT INTO users(email,name,password_hash,password_must_change,mfa_enrollment_required) VALUES($1,$2,$3,true,$4) RETURNING id,totp_secret",
        [account.email.toLowerCase(), account.name, passwordHash(password), account.mfa],
      ))[0];
      if (existing) {
        await q("UPDATE users SET disabled_at=NULL WHERE id=$1", [user.id]);
      }
      if (account.role && church) {
        await q(
          "INSERT INTO memberships(user_id,church_id,role) VALUES($1,$2,$3) ON CONFLICT(user_id,church_id) DO UPDATE SET role=excluded.role",
          [user.id, church.id, account.role],
        );
      }
      if (account.network) {
        const networkId = churches[0]?.network_id;
        if (!networkId) throw new Error("Rede não encontrada.");
        await q(
          "INSERT INTO network_members(user_id,network_id,role) VALUES($1,$2,'network_admin') ON CONFLICT(user_id,network_id) DO UPDATE SET role='network_admin',revoked_at=NULL",
          [user.id, networkId],
        );
      }
      if (account.email === "membro@esperanca.demo" && church) {
        const [person] = await q(
          "INSERT INTO people(church_id,name,email,status,user_id) VALUES($1,$2,$3,'member',$4) ON CONFLICT DO NOTHING RETURNING id",
          [church.id, account.name, account.email, user.id],
        );
        if (person) await q("UPDATE users SET person_id=$2 WHERE id=$1", [user.id, person.id]);
      }
      await audit(q, user.id, church?.id ?? null, "account.provisioned");
    }
  });
  console.log(`Provisionamento concluído: ${accounts.length} contas processadas. Nenhuma credencial foi exibida.`);
} finally {
  await db.close();
}
