import "../src/server/env.js";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { openDatabase } from "../src/server/db.js";

const CONFIRM = "I_UNDERSTAND";
if (process.env.CONFIRM_DEMO_CLEANUP !== CONFIRM)
  throw new Error(`Operação destrutiva bloqueada. Defina CONFIRM_DEMO_CLEANUP=${CONFIRM} depois de guardar o backup.`);

const demoEmails = [
  "admin@esperanca.demo",
  "central@rede.demo",
  "membro@esperanca.demo",
  "admin@caminho.demo",
];
const demoChurchNames = [
  "DEMO — Igreja Sede",
  "DEMO — Congregação Norte",
  "DEMO — Congregação Sul",
];

function adminApp() {
  if (getApps().length) return getApps()[0];
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (raw) {
    const service = JSON.parse(raw);
    return initializeApp({ credential: cert({
      projectId: service.projectId,
      clientEmail: service.clientEmail,
      privateKey: String(service.privateKey).replace(/\\n/g, "\n"),
    }) });
  }
  if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY)
    return initializeApp({ credential: cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }) });
  throw new Error("Configure as credenciais Firebase Admin antes da limpeza.");
}
const app = adminApp();
const auth = getAuth(app);
const firestore = getFirestore(app);
const firebaseUsers: Array<{ uid: string; email: string }> = [];
let pageToken: string | undefined;
do {
  const page = await auth.listUsers(1000, pageToken);
  for (const u of page.users) {
    const email = u.email?.toLowerCase();
    if (email && demoEmails.includes(email)) firebaseUsers.push({ uid: u.uid, email });
  }
  pageToken = page.pageToken;
} while (pageToken);

const db = await openDatabase();
try {
  await db.transaction(async (q) => {
    const churches = await q("SELECT id FROM churches WHERE name = ANY($1::text[]) FOR UPDATE", [demoChurchNames]);
    const churchIds = churches.map((x) => x.id);
    const users = await q("SELECT id FROM users WHERE lower(email)=ANY($1::text[]) FOR UPDATE", [demoEmails]);
    const userIds = users.map((x) => x.id);
    const networks = churchIds.length
      ? await q("SELECT DISTINCT network_id AS id FROM churches WHERE id=ANY($1::uuid[])", [churchIds])
      : [];

    const tables = await q(`
      SELECT table_name, array_agg(column_name ORDER BY ordinal_position) AS columns
      FROM information_schema.columns
      WHERE table_schema='public'
      GROUP BY table_name
      ORDER BY table_name
    `);

    const churchColumns = new Set(["church_id", "source_church_id", "target_church_id", "owner_church_id"]);
    const userColumns = new Set(["user_id", "actor_id", "author_id", "granted_by", "requested_by", "accepted_by", "created_by", "updated_by"]);
    for (let pass = 0; pass < 4; pass++) {
      let progress = false;
      for (let i = 0; i < tables.length; i++) {
        const table = tables[i].table_name as string;
        if (["schema_migrations"].includes(table)) continue;
        const columns = (tables[i].columns as string[]) ?? [];
        const predicates: string[] = [];
        const params: unknown[] = [];
        if (churchIds.length) {
          for (const col of columns.filter((x) => churchColumns.has(x))) {
            predicates.push(`"${col.replace(/"/g, '""')}" = ANY($${params.length + 1}::uuid[])`);
            params.push(churchIds);
          }
        }
        if (userIds.length) {
          for (const col of columns.filter((x) => userColumns.has(x))) {
            predicates.push(`"${col.replace(/"/g, '""')}" = ANY($${params.length + 1}::uuid[])`);
            params.push(userIds);
          }
        }
        if (columns.includes("network_id") && networks.length) {
          predicates.push(`"network_id" = ANY($${params.length + 1}::uuid[])`);
          params.push(networks.map((x) => x.id));
        }
        if (table === "users" && columns.includes("email")) {
          predicates.push(`lower("email") = ANY($${params.length + 1}::text[])`);
          params.push(demoEmails);
        }
        if (table === "churches" && columns.includes("name")) {
          predicates.push(`"name" = ANY($${params.length + 1}::text[])`);
          params.push(demoChurchNames);
        }
        if (!predicates.length) continue;
        await q(`SAVEPOINT cleanup_${i}`);
        try {
          const removed = await q(`DELETE FROM "${table.replace(/"/g, '""')}" WHERE ${predicates.join(" OR ")} RETURNING 1`, params);
          if (removed.length) progress = true;
          await q(`RELEASE SAVEPOINT cleanup_${i}`);
        } catch {
          await q(`ROLLBACK TO SAVEPOINT cleanup_${i}`);
          await q(`RELEASE SAVEPOINT cleanup_${i}`);
        }
      }
      if (!progress) break;
    }
  });
} finally {
  await db.close();
}

for (const user of firebaseUsers) {
  try { await auth.deleteUser(user.uid); } catch (error) {
    if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
  }
  for (const path of [`users/${user.uid}`, `admins/${user.uid}`]) {
    try { await firestore.recursiveDelete(firestore.doc(path)); } catch { /* absent document */ }
  }
}
for (const churchId of ["00000000-0000-4000-8000-000000000101", "00000000-0000-4000-8000-000000000102", "00000000-0000-4000-8000-000000000103"]) {
  try { await firestore.recursiveDelete(firestore.doc(`churches/${churchId}`)); } catch { /* absent document */ }
}
console.log(`Limpeza concluída: ${demoEmails.length} contas de teste processadas.`);
