import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { Database } from "../src/server/db.js";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { seed, IDS } from "../src/server/seed.js";
import { createApp } from "../src/server/app.js";
import { Efi } from "../src/server/efi.js";
import { cents, settle } from "../src/server/finance.js";
import { encrypt, decrypt } from "../src/server/security.js";
const db = new Database(undefined);
let server: Server, url: string;
const cookies = new Map<string, string>();
async function request(
  route: string,
  options: { user?: string; church?: string; method?: string; body?: any } = {},
) {
  const res = await fetch(url + route, {
    method: options.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      ...(options.user ? { Cookie: cookies.get(options.user)! } : {}),
      ...(options.church ? { "x-church-id": options.church } : {}),
    },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  return { status: res.status, data: await res.json(), headers: res.headers };
}
before(
  async () => {
    await db.migrate();
    await seed(db);
    server = createApp(db, {
      mode: "demo",
      key: Buffer.alloc(32, 1),
      efi: new Efi([]),
      origin: "http://localhost",
    }).listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    url = `http://127.0.0.1:${(server.address() as any).port}`;
    for (const [key, email] of [
      ["admin", "admin@esperanca.demo"],
      ["central", "central@rede.demo"],
      ["member", "membro@esperanca.demo"],
      ["adminB", "admin@caminho.demo"],
    ]) {
      let res = await request("/api/auth/login", {
        method: "POST",
        body: { email, password: "Demo@Ecclesia2026" },
      });
      if (res.data.mfaRequired) {
        const info = await request("/api/demo-info");
        res = await request("/api/auth/mfa", {
          method: "POST",
          body: { challenge: res.data.challenge, code: info.data.code },
        });
      }
      assert.equal(res.status, 200, JSON.stringify(res.data));
      cookies.set(key, res.headers.get("set-cookie")!.split(";")[0]);
    }
  },
  { timeout: 120000 },
);
after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.close();
});
test("money and encrypted notes preserve exact values", () => {
  assert.equal(cents("0.29"), 29);
  assert.equal(cents("125.50"), 12550);
  assert.throws(() => cents("1.001"));
  assert.throws(() => cents("-1"));
  const k = Buffer.alloc(32, 2),
    cipher = encrypt("Informação sigilosa", k);
  assert.equal(decrypt(cipher, k), "Informação sigilosa");
  assert.throws(() => decrypt(cipher, Buffer.alloc(32, 3)));
});
test("authentication and origin checks", async () => {
  assert.equal((await request("/api/context")).status, 401);
  const res = await fetch(url + "/api/people", {
    method: "POST",
    headers: {
      Origin: "https://evil.invalid",
      "Content-Type": "application/json",
      Cookie: cookies.get("admin")!,
      "x-church-id": IDS.churchA,
    },
    body: JSON.stringify({ name: "Ataque" }),
  });
  assert.equal(res.status, 403);
});
test("RLS isolates reads, writes and references between two churches", async () => {
  const a = await request("/api/people", {
    user: "admin",
    church: IDS.churchA,
  });
  assert.equal(a.status, 200);
  assert.equal(a.data.length, 18);
  assert.equal(
    (await request("/api/people", { user: "admin", church: IDS.churchB }))
      .status,
    403,
  );
  await assert.rejects(() =>
    db.transaction(
      (q) =>
        q("INSERT INTO people(church_id,name) VALUES($1,$2)", [
          IDS.churchB,
          "Cross-tenant",
        ]),
      { actor: IDS.admin, church: IDS.churchA },
    ),
  );
  const hidden = await db.transaction(
    (q) => q("SELECT * FROM people WHERE church_id=$1", [IDS.churchB]),
    { actor: IDS.admin, church: IDS.churchA },
  );
  assert.equal(hidden.length, 0);
  const [house] = await db.transaction((q) =>
    q("SELECT id FROM households WHERE church_id=$1", [IDS.churchB]),
  );
  await assert.rejects(() =>
    db.transaction(
      (q) =>
        q("INSERT INTO people(church_id,name,household_id) VALUES($1,$2,$3)", [
          IDS.churchA,
          "Invalid household",
          house.id,
        ]),
      { actor: IDS.admin, church: IDS.churchA },
    ),
  );
});
test("central aggregate report has no person or donor details; revocation is immediate", async () => {
  const opts = { user: "central", church: IDS.churchA };
  const network = await request("/api/network", opts);
  assert.equal(network.data.length, 2);
  assert.equal(network.data[0].email, undefined);
  const subscriptions = await request("/api/network/subscriptions", opts);
  assert.equal(subscriptions.status, 404, JSON.stringify(subscriptions.data));
  assert.equal(subscriptions.data.error, "Área comercial desativada.");
  assert.equal((await request("/api/people", opts)).status, 403);
  const grant = await request("/api/grants", {
    user: "admin",
    church: IDS.churchA,
    method: "POST",
    body: { userId: IDS.central, scope: "people", days: 2 },
  });
  assert.equal(grant.status, 201, JSON.stringify(grant.data));
  assert.equal((await request("/api/people", opts)).status, 200);
  assert.equal(
    (
      await request("/api/people", {
        ...opts,
        method: "POST",
        body: { name: "Unauthorized write" },
      })
    ).status,
    403,
  );
  await request(`/api/grants/${grant.data.id}`, {
    user: "admin",
    church: IDS.churchA,
    method: "DELETE",
  });
  assert.equal((await request("/api/people", opts)).status, 403);
});
test("CSV preview validates and detects duplicates before import", async () => {
  const opts = { user: "admin", church: IDS.churchA, method: "POST" };
  const p = await request("/api/import/preview", {
    ...opts,
    body: {
      csv: "name,email,status\nAna Martins,a@example.invalid,member\nPessoa Nova,nova@example.invalid,member\nErro,nao-email,member",
    },
  });
  assert.equal(p.status, 200);
  assert.equal(p.data.valid.length, 1);
  assert.equal(p.data.issues.length, 2);
  const done = await request("/api/import/confirm", {
    ...opts,
    body: { previewId: p.data.previewId },
  });
  assert.equal(done.data.imported, 1);
  assert.equal(
    (
      await request("/api/import/confirm", {
        ...opts,
        body: { previewId: p.data.previewId },
      })
    ).status,
    400,
  );
});
test("Pix estático não cria cobranças automáticas", async () => {
  const opts = { user: "admin", church: IDS.churchA };
  const configured = await request("/api/pix/settings", {
    ...opts,
    method: "PUT",
    body: {
      pixKey: "123e4567-e89b-12d3-a456-426614174000",
      pixKeyType: "random",
      institutionName: "Igreja Esperança",
      city: "Sao Paulo",
      instructions: "Confira o nome antes de confirmar.",
      enabled: true,
      portalVisible: true,
    },
  });
  assert.equal(configured.status, 200, JSON.stringify(configured.data));
  const qr = await request("/api/pix/static-qr?amount=123.45", opts);
  assert.equal(qr.status, 200, JSON.stringify(qr.data));
  assert.equal(qr.data.automaticPayments, false);
  assert.equal(qr.data.amount, "123.45");
  assert.match(qr.data.payload, /^000201/);
  assert.match(qr.data.qrDataUrl, /^data:image\/png;base64,/);
  const oldChargeRoute = await request("/api/pix/charges", {
    ...opts,
    method: "POST",
    body: { amount: "123.45", fundId: "00000000-0000-4000-8000-000000000001" },
  });
  assert.equal(oldChargeRoute.status, 404);
});

test("member sees only own information and cannot access treasury", async () => {
  assert.equal(
    (await request("/api/finance", { user: "member", church: IDS.churchA }))
      .status,
    403,
  );
  const portal = await request("/api/portal", {
    user: "member",
    church: IDS.churchA,
  });
  assert.equal(portal.data.person.name, "Ana Martins");
  assert.ok(!("charges" in portal.data) || portal.data.charges.length === 0);
  assert.equal(
    (await request("/api/network", { user: "member" })).data.length,
    0,
  );
});
test("closed periods reject backdated entries and reversals preserve the original", async () => {
  const opts = { user: "admin", church: IDS.churchA, method: "POST" };
  const original = await request("/api/finance/entries", {
    ...opts,
    body: { description: "Despesa de teste", amount: "12.34", kind: "expense" },
  });
  assert.equal(original.status, 201);
  const reverse = await request(
    `/api/finance/entries/${original.data.id}/reverse`,
    opts,
  );
  assert.equal(reverse.status, 201);
  assert.equal(reverse.data.reversal_of, original.data.id);
  assert.equal(
    (await request(`/api/finance/entries/${original.data.id}/reverse`, opts))
      .status,
    409,
  );
  const closed = await request("/api/finance/close", {
    ...opts,
    body: { throughDate: "2020-01-01" },
  });
  assert.equal(closed.status, 200);
  assert.equal(
    (
      await request("/api/finance/entries", {
        ...opts,
        body: {
          description: "Retroativo",
          amount: "10",
          kind: "income",
          date: "2019-12-01",
        },
      })
    ).status,
    409,
  );
});

test("posted journals reject later line injection and unbalanced entries roll back", async () => {
  const [entry] = await db.transaction((q) =>
    q("SELECT id FROM journal_entries WHERE church_id=$1 LIMIT 1", [
      IDS.churchA,
    ]),
  );
  const [account] = await db.transaction((q) =>
    q("SELECT id FROM accounts WHERE church_id=$1 LIMIT 1", [IDS.churchA]),
  );
  await assert.rejects(() =>
    db.transaction(
      (q) =>
        q(
          "INSERT INTO journal_lines(church_id,entry_id,account_id,amount_cents) VALUES($1,$2,$3,100)",
          [IDS.churchA, entry.id, account.id],
        ),
      { actor: IDS.admin, church: IDS.churchA },
    ),
  );
  await assert.rejects(() =>
    db.transaction(
      (q) =>
        q(
          "INSERT INTO journal_entries(church_id,description) VALUES($1,'Sem contrapartida')",
          [IDS.churchA],
        ),
      { actor: IDS.admin, church: IDS.churchA },
    ),
  );
});

test("private documents, prayer and pastoral notes never leak to the central", async () => {
  const opts = { user: "admin", church: IDS.churchA };
  const [person] = await db.transaction((q) =>
    q("SELECT id FROM people WHERE church_id=$1 LIMIT 1", [IDS.churchA]),
  );
  const doc = await request("/api/documents", {
    ...opts,
    method: "POST",
    body: {
      name: "teste.txt",
      mediaType: "text/plain",
      content: Buffer.from("Privado").toString("base64"),
    },
  });
  assert.equal(doc.status, 201, JSON.stringify(doc.data));
  const wrong = await fetch(url + "/api/documents/" + doc.data.id, {
    headers: { Cookie: cookies.get("adminB")!, "x-church-id": IDS.churchB },
  });
  assert.equal(wrong.status, 404);
  assert.equal(
    (await request("/api/pastoral-notes/" + person.id, opts)).status,
    403,
  );
  await db.transaction(async (q) => {
    for (const action of ["pastoral.read", "pastoral.write"])
      await q("INSERT INTO action_permissions VALUES($1,$2,$3,true)", [
        IDS.churchA,
        IDS.admin,
        action,
      ]);
  });
  await request("/api/pastoral-notes", {
    ...opts,
    method: "POST",
    body: { personId: person.id, text: "Conteúdo reservado ao autor." },
  });
  assert.equal(
    (await request("/api/pastoral-notes/" + person.id, opts)).data[0].text,
    "Conteúdo reservado ao autor.",
  );
  assert.equal(
    (
      await request("/api/pastoral-notes/" + person.id, {
        user: "central",
        church: IDS.churchA,
      })
    ).status,
    403,
  );
  const [stored] = await db.transaction((q) =>
    q("SELECT ciphertext FROM pastoral_notes WHERE person_id=$1", [person.id]),
  );
  assert.ok(!stored.ciphertext.includes("Conteúdo"));
  assert.equal(
    (
      await request("/api/prayers", {
        user: "member",
        church: IDS.churchA,
        method: "POST",
        body: { text: "Pedido confidencial", confidential: true },
      })
    ).status,
    201,
  );
  assert.equal(
    (await request("/api/prayers", { user: "central", church: IDS.churchA }))
      .status,
    403,
  );
  const prayerPage = await request("/api/prayers?page=1&pageSize=1", opts);
  assert.equal(prayerPage.status, 200, JSON.stringify(prayerPage.data));
  assert.equal(prayerPage.data.pageSize, 1);
  assert.ok(prayerPage.data.total >= 1);
  assert.ok(prayerPage.data.items.length <= 1);
  assert.equal(typeof prayerPage.data.items[0].requesterName, "string");
  assert.equal(prayerPage.data.items[0].text, "Pedido confidencial");
  const prayerId = prayerPage.data.items[0].id;
  const assignedPrayer = await request(`/api/prayers/${prayerId}`, { ...opts, method: "PATCH", body: { status: "in_progress", assignedTo: IDS.admin } });
  assert.equal(assignedPrayer.status, 200, JSON.stringify(assignedPrayer.data));
  const [prayerTask] = await db.transaction((q) => q("SELECT scope,assigned_to,status FROM operational_tasks WHERE source_type='prayer_request' AND source_id=$1", [prayerId]));
  assert.equal(prayerTask.scope, "pastoral");
  assert.equal(prayerTask.assigned_to, IDS.admin);
  const resolvedPrayer = await request(`/api/prayers/${prayerId}`, { ...opts, method: "PATCH", body: { status: "resolved", resolution: "Acompanhamento realizado." } });
  assert.equal(resolvedPrayer.status, 200, JSON.stringify(resolvedPrayer.data));
  assert.equal(resolvedPrayer.data.resolution, "Acompanhamento realizado.");
  const [resolvedPrayerTask] = await db.transaction((q) => q("SELECT status FROM operational_tasks WHERE source_type='prayer_request' AND source_id=$1", [prayerId]));
  assert.equal(resolvedPrayerTask.status, "done");
  const auditPage = await request("/api/audit?page=1&pageSize=1", opts);
  assert.equal(auditPage.status, 200, JSON.stringify(auditPage.data));
  assert.equal(auditPage.data.pageSize, 1);
  assert.ok(auditPage.data.total >= 1);
  const action = auditPage.data.items[0].action;
  const filteredAudit = await request(`/api/audit?page=1&pageSize=10&action=${encodeURIComponent(action)}`, opts);
  assert.equal(filteredAudit.status, 200, JSON.stringify(filteredAudit.data));
  assert.ok(filteredAudit.data.items.every((entry: Record<string, unknown>) => entry.action === action));
});

test("campus-restricted membership cannot read or modify another campus", async () => {
  await db.transaction(async (q) => {
    const [campus] = await q(
      "SELECT id FROM campuses WHERE church_id=$1 LIMIT 1",
      [IDS.churchA],
    );
    await q(
      "INSERT INTO memberships(user_id,church_id,role,campus_id) VALUES($1,$2,'secretary',$3)",
      [IDS.adminB, IDS.churchA, campus.id],
    );
    await q("INSERT INTO people(church_id,campus_id,name) VALUES($1,$2,$3)", [
      IDS.churchA,
      campus.id,
      "Pessoa do campus",
    ]);
  });
  const visible = await db.transaction((q) => q("SELECT name FROM people"), {
    actor: IDS.adminB,
    church: IDS.churchA,
  });
  assert.deepEqual(
    visible.map((v) => v.name),
    ["Pessoa do campus"],
  );
  await assert.rejects(() =>
    db.transaction(
      (q) =>
        q("INSERT INTO people(church_id,name) VALUES($1,'Sem campus')", [
          IDS.churchA,
        ]),
      { actor: IDS.adminB, church: IDS.churchA },
    ),
  );
});

test(
  "local committed data survives a child process shutdown",
  { timeout: 120000 },
  async () => {
    const directory = `.local/tests/${randomUUID()}`;
    const persistent = new Database(directory);
    await persistent.migrate();
    await seed(persistent);
    await persistent.close();
    const code =
      "import {Database} from './src/server/db.ts'; const db=new Database(process.argv[1]);await db.transaction(q=>q(\"UPDATE people SET name='Persistência verificada' WHERE id=(SELECT id FROM people LIMIT 1)\"));await db.close();process.exit(0);";
    await promisify(execFile)(
      process.execPath,
      ["--import", "tsx", "--input-type=module", "--eval", code, directory],
      { timeout: 60000 },
    );
    const reopened = new Database(directory);
    try {
      const rows = await reopened.transaction((q) =>
        q("SELECT 1 FROM people WHERE name='Persistência verificada'"),
      );
      assert.equal(rows.length, 1);
    } finally {
      await reopened.close();
    }
  },
);

test("área comercial e cobranças automáticas permanecem desativadas", async () => {
  const opts = { user: "admin", church: IDS.churchA };
  const f = await request("/api/finance", opts);
  assert.equal(f.status, 200, JSON.stringify(f.data));
  assert.equal(f.data.charges.length, 0);
  const charge = await request("/api/pix/charges", {
    ...opts,
    method: "POST",
    body: { amount: "10.00", fundId: "00000000-0000-4000-8000-000000000001" },
  });
  assert.equal(charge.status, 404);
  const subscriptions = await request("/api/network/subscriptions", {
    user: "central",
    church: IDS.churchA,
  });
  assert.equal(subscriptions.status, 404);
});
test(
  "database backup restores data and RLS policies into a fresh PostgreSQL instance",
  { timeout: 120000 },
  async () => {
    const snapshot = await db.dump();
    const restored = await PGlite.create({ loadDataDir: snapshot });
    try {
      const churches = await restored.query(
        "SELECT count(*)::int AS total FROM churches",
      );
      assert.equal((churches.rows[0] as any).total, 2);
      await restored.exec("BEGIN; SET LOCAL ROLE ecclesia_app;");
      await restored.query(
        "SELECT set_config('app.actor',$1,true),set_config('app.church',$2,true)",
        [IDS.admin, IDS.churchA],
      );
      const hidden = await restored.query(
        "SELECT * FROM people WHERE church_id=$1",
        [IDS.churchB],
      );
      assert.equal(hidden.rows.length, 0);
      await restored.exec("ROLLBACK");
    } finally {
      await restored.close();
    }
  },
);


test("agenda collections stay scoped to the selected church", async () => {
  await db.transaction(
    (q) =>
      q(
        "INSERT INTO church_events(church_id,title,kind,starts_at,ends_at,created_by) VALUES($1,$2,'event',$3,$4,$5)",
        [
          IDS.churchB,
          "Evento exclusivo da Congregação B",
          "2026-11-01T19:00:00Z",
          "2026-11-01T21:00:00Z",
          IDS.adminB,
        ],
      ),
    undefined,
  );
  const a = await request("/api/agenda?eventPage=1&eventPageSize=100", {
    user: "admin",
    church: IDS.churchA,
  });
  assert.equal(a.status, 200);
  assert.equal(
    a.data.events.some((event: any) => event.title === "Evento exclusivo da Congregação B"),
    false,
  );
});
