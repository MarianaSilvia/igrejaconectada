import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { Database } from "../src/server/db.js";
import { seed, IDS, DEMO_SECRET } from "../src/server/seed.js";
import { createApp } from "../src/server/app.js";
import { Efi } from "../src/server/efi.js";
import {
  encrypt,
  hash,
  passwordHash,
  totp,
  HttpError,
} from "../src/server/security.js";
import { processIntegrationJob } from "../src/server/integration-jobs.js";
import { processCommunicationDeliveryJobs } from "../src/server/communication-jobs.js";
import { shortDate, todayInChurch } from "../src/shared/dates.js";
import { sealTotpSecrets, openTotp } from "../src/server/access.js";
import { settle } from "../src/server/finance.js";
const db = new Database(undefined),
  key = Buffer.alloc(32, 9),
  leader = randomUUID(),
  treasurer = randomUUID();
let server: Server, base: string;
const cookies = new Map<string, string>();
async function call(
  path: string,
  body?: unknown,
  user = IDS.admin,
  method = body === undefined ? "GET" : "POST",
  church = IDS.churchA,
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookies.get(user) ?? "",
      "x-church-id": church,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json() };
}
before(
  async () => {
    await db.migrate();
    await seed(db);
    await db.transaction(async (q) => {
      for (const [id, role] of [
        [leader, "leader"],
        [treasurer, "treasurer"],
      ]) {
        await q(
          "INSERT INTO users(id,email,name,password_hash,totp_secret) VALUES($1,$2,$3,$4,$5)",
          [
            id,
            `${role}@example.invalid`,
            role,
            passwordHash("Teste@Ecclesia2026"),
            DEMO_SECRET,
          ],
        );
        await q(
          "INSERT INTO memberships(user_id,church_id,role) VALUES($1,$2,$3)",
          [id, IDS.churchA, role],
        );
      }
      for (const id of [IDS.admin, IDS.adminB, leader, treasurer, IDS.member]) {
        const raw = randomUUID();
        cookies.set(id, `ecclesia_session=${raw}`);
        await q(
          "INSERT INTO sessions(token_hash,user_id,expires_at,mfa) VALUES($1,$2,now()+interval '1 hour',true)",
          [hash(raw), id],
        );
      }
    });
    server = createApp(db, {
      mode: "demo",
      key,
      efi: new Efi([]),
      origin: "http://localhost",
      communicationCallbackToken: "callback-test-token-2026",
    }).listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
  },
  { timeout: 120000 },
);
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
});

test("calendar dates preserve the day while instants use Brazil timezone", () => {
  for (const tz of ["UTC", "America/Sao_Paulo", "Asia/Tokyo"]) {
    const old = process.env.TZ;
    process.env.TZ = tz;
    try {
      assert.equal(shortDate("2026-10-16"), "16/10/2026");
      assert.equal(shortDate("2026-10-16T01:00:00Z"), "15/10/2026");
      assert.equal(
        todayInChurch(new Date("2026-10-16T01:00:00Z")),
        "2026-10-15",
      );
    } finally {
      if (old === undefined) delete process.env.TZ;
      else process.env.TZ = old;
    }
  }
});
test("database DATE remains a calendar string in API serialization", async () => {
  const [row] = await db.transaction((q) =>
    q("SELECT DATE '2026-10-16' AS civil"),
  );
  assert.equal(row.civil, "2026-10-16");
  assert.equal(shortDate(row.civil), "16/10/2026");
});
test("health readiness reports safe demo dependencies without secrets", async () => {
  const ready = await call("/health/ready", undefined, IDS.admin);
  assert.equal(ready.status, 200, JSON.stringify(ready.data));
  assert.equal(ready.data.ok, true);
  assert.equal(ready.data.checks.database, true);
  assert.equal(ready.data.checks.serviceDatabase, true);
  assert.equal(ready.data.checks.migrationDatabase, true);
  assert.equal(ready.data.checks.efiTls, true);
  assert.equal(ready.data.checks.communication, true);
  assert.equal(ready.data.checks.dataKey, true);
  assert.equal(Object.prototype.hasOwnProperty.call(ready.data, "key"), false);
  const dashboard = await call("/dashboard");
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.data));
  assert.equal(dashboard.data.health.open_education_interests, 0);
});
test("health readiness exposes missing homologation dependencies without secrets", async () => {
  const names = [
    "SERVICE_DATABASE_URL",
    "MIGRATION_DATABASE_URL",
    "EFI_TLS_CERT_PATH",
    "EFI_TLS_KEY_PATH",
    "EFI_WEBHOOK_CA_PATH",
    "COMMUNICATION_TRANSPORT",
    "COMMUNICATION_EMAIL_WEBHOOK",
    "COMMUNICATION_SMS_WEBHOOK",
    "COMMUNICATION_WEBHOOK_TOKEN",
    "COMMUNICATION_CALLBACK_TOKEN",
  ];
  const saved = new Map(names.map((name) => [name, process.env[name]]));
  for (const name of names) delete process.env[name];
  const app = createApp(db, {
    mode: "homologation",
    key,
    mfaKey: Buffer.alloc(32, 8),
    efi: new Efi([]),
    origin: "https://homologacao.invalid",
  });
  const probe = app.listen(0, "127.0.0.1");
  try {
    await new Promise<void>((resolve) => probe.once("listening", resolve));
    const port = (probe.address() as { port: number }).port;
    const response = await fetch(`http://127.0.0.1:${port}/api/health/ready`, {
      headers: {
        Cookie: cookies.get(IDS.admin) ?? "",
        "x-church-id": IDS.churchA,
      },
    });
    const body = await response.json();
    assert.equal(response.status, 503);
    assert.equal(body.ok, false);
    assert.equal(body.checks.serviceDatabase, false);
    assert.equal(body.checks.migrationDatabase, false);
    assert.equal(body.checks.efiTls, false);
    assert.equal(body.checks.communication, true);
    assert.equal(Object.prototype.hasOwnProperty.call(body, "key"), false);
  } finally {
    await new Promise<void>((resolve) => probe.close(() => resolve()));
    for (const [name, value] of saved) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});
test("registration pagination includes old pending submissions beyond the first 200", async () => {
  const link = await call("/registration/links", { days: 1 });
  assert.equal(link.status, 201);
  const payload = encrypt(
    JSON.stringify({
      profile: {
        firstName: "Ficha",
        lastName: "Teste",
        congregation: "Manual",
      },
    }),
    key,
  );
  await db.transaction(async (q) => {
    await q(
      "INSERT INTO registration_submissions(church_id,link_id,submission_key,encrypted_payload,status,created_at) VALUES($1,$2,gen_random_uuid(),$3,'pending',now()-interval '2 days')",
      [IDS.churchA, link.data.id, payload],
    );
    await q(
      "INSERT INTO registration_submissions(church_id,link_id,submission_key,encrypted_payload,status) SELECT $1,$2,gen_random_uuid(),$3,'approved' FROM generate_series(1,220)",
      [IDS.churchA, link.data.id, payload],
    );
  });
  const first = await call("/registration/submissions?pageSize=100"),
    last = await call("/registration/submissions?pageSize=100&page=3"),
    pending = await call("/registration/submissions?status=pending");
  assert.equal(first.data.total, 221);
  assert.equal(first.data.pending, 1);
  assert.equal(first.data.items.length, 100);
  assert.equal(last.data.items.length, 21);
  assert.equal(pending.data.items.length, 1);
  assert.equal(pending.data.filtered, 1);
  const other = await call(
    "/registration/submissions",
    undefined,
    IDS.adminB,
    "GET",
    IDS.churchB,
  );
  assert.equal(other.data.total, 0);
});
test("leaders see only assigned cells and people; removal immediately ends access", async () => {
  const cells = await db.transaction((q) =>
    q("SELECT id FROM cells WHERE church_id=$1 ORDER BY name", [IDS.churchA]),
  );
  const context = { actor: leader, church: IDS.churchA };
  assert.equal(
    (await db.transaction((q) => q("SELECT id FROM cells"), context)).length,
    0,
  );
  assert.equal(
    (
      await call(
        `/access/cells/${cells[0].id}/${leader}`,
        { responsibility: "leader" },
        IDS.admin,
        "PUT",
      )
    ).status,
    200,
  );
  assert.deepEqual(
    (await db.transaction((q) => q("SELECT id FROM cells"), context)).map(
      (c) => c.id,
    ),
    [cells[0].id],
  );
  const people = await db.transaction(
    (q) => q("SELECT id FROM people"),
    context,
  );
  assert.equal(people.length, 4);
  assert.equal(
    (
      await call(
        `/access/cells/${cells[0].id}/${leader}`,
        { responsibility: null },
        IDS.admin,
        "PUT",
      )
    ).status,
    200,
  );
  assert.equal(
    (await db.transaction((q) => q("SELECT id FROM people"), context)).length,
    0,
  );
  assert.equal(
    (
      await call(
        `/access/cells/${cells[1].id}/${IDS.adminB}`,
        { responsibility: "leader" },
        IDS.admin,
        "PUT",
      )
    ).status,
    400,
  );
  await call(
    `/access/cells/${cells[0].id}/${leader}`,
    { responsibility: "leader" },
    IDS.admin,
    "PUT",
  );
  assert.equal(
    (await call("/memberships", { userId: leader, role: "member" })).status,
    200,
  );
  assert.equal(
    (
      await db.transaction((q) =>
        q("SELECT * FROM cell_assignments WHERE user_id=$1", [leader]),
      )
    ).length,
    0,
  );
  assert.equal((await call("/cells", undefined, leader)).status, 401);
});
test("diretório público de grupos recebe interesse com consentimento", async () => {
  const created = await call("/cells", {
    name: "Grupo Esperança",
    leaderName: "Líder público",
    publicDirectory: true,
    publicDescription: "Encontros para famílias.",
    publicContact: "secretaria@example.invalid",
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const pagedCells = await call(
    "/cells?page=1&pageSize=1&q=Esperança",
    undefined,
    IDS.admin,
  );
  assert.equal(pagedCells.status, 200, JSON.stringify(pagedCells.data));
  assert.equal(pagedCells.data.pageSize, 1);
  assert.ok(
    pagedCells.data.items.some((item: any) => item.id === created.data.id),
  );
  const publicList = await fetch(
    `${base}/api/public/groups/${IDS.churchA}`,
  ).then(async (r) => ({ status: r.status, data: await r.json() }));
  assert.equal(publicList.status, 200, JSON.stringify(publicList.data));
  const group = publicList.data.groups.find(
    (g: any) => g.name === "Grupo Esperança",
  );
  assert.ok(group);
  const catalog = await fetch(
    `${base}/api/public/catalog/${IDS.churchA}?page=1&pageSize=10`,
  ).then(async (r) => ({ status: r.status, data: await r.json() }));
  assert.equal(catalog.status, 200, JSON.stringify(catalog.data));
  assert.ok(catalog.data.groups.some((g: any) => g.id === group.id));
  assert.equal(catalog.data.groupPagination.page, 1);
  assert.equal("notes" in (catalog.data.groups[0] ?? {}), false);
  const interest = await fetch(
    `${base}/api/public/groups/${group.id}/interest`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Pessoa interessada",
        email: "grupo@example.invalid",
        consent: true,
      }),
    },
  ).then(async (r) => ({ status: r.status, data: await r.json() }));
  assert.equal(interest.status, 201, JSON.stringify(interest.data));
  const [interestTask] = await db.transaction((q) =>
    q(
      "SELECT source_type,status FROM operational_tasks WHERE source_type='group_interest' AND source_id=$1",
      [interest.data.id],
    ),
  );
  assert.equal(interestTask.source_type, "group_interest");
  assert.equal(interestTask.status, "open");
  const queue = await call(
    "/group-interests?page=1&pageSize=1",
    undefined,
    IDS.admin,
  );
  assert.equal(queue.status, 200, JSON.stringify(queue.data));
  assert.equal(queue.data.pageSize, 1);
  const request = queue.data.items.find((v: any) => v.id === interest.data.id);
  assert.ok(request);
  const updated = await call(
    `/group-interests/${request.id}`,
    { status: "contacted" },
    IDS.admin,
    "PATCH",
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  const contacted = await call(
    "/group-interests?page=1&pageSize=25&status=contacted",
    undefined,
    IDS.admin,
  );
  assert.equal(contacted.status, 200, JSON.stringify(contacted.data));
  assert.ok(contacted.data.items.some((v: any) => v.id === request.id));
  const groupCsv = await fetch(
    `${base}/api/group-interests/export.csv?status=contacted`,
    {
      headers: {
        Cookie: cookies.get(IDS.admin) ?? "",
        "x-church-id": IDS.churchA,
      },
    },
  );
  const groupCsvText = await groupCsv.text();
  assert.equal(groupCsv.status, 200, groupCsvText);
  assert.match(groupCsvText, /name,email,phone,cell_name,status/);
  const closed = await call(
    `/group-interests/${request.id}`,
    { status: "closed" },
    IDS.admin,
    "PATCH",
  );
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  const [closedTask] = await db.transaction((q) =>
    q(
      "SELECT status FROM operational_tasks WHERE source_type='group_interest' AND source_id=$1",
      [interest.data.id],
    ),
  );
  assert.equal(closedTask.status, "done");
});

test("patrimônio mantém inventário e manutenção no módulo habilitado", async () => {
  await db.transaction((q) =>
    q(
      "UPDATE churches SET modules=array_append(modules,'assets') WHERE id=$1 AND NOT ('assets'=ANY(modules))",
      [IDS.churchA],
    ),
  );
  const asset = await call("/assets", {
    assetTag: "EQ-001",
    name: "Projetor do salão",
    kind: "Equipamento",
    location: "Salão principal",
    valueCents: 250000,
  });
  assert.equal(asset.status, 201, JSON.stringify(asset.data));
  const maintenance = await call(`/assets/${asset.data.id}/maintenance`, {
    description: "Limpeza preventiva",
    costCents: 0,
  });
  assert.equal(maintenance.status, 201, JSON.stringify(maintenance.data));
  const list = await call("/assets");
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.equal(list.data.assets[0].status, "maintenance");
  const filteredPage = await call(
    "/assets?assetPage=1&assetPageSize=1&status=maintenance&q=Projetor",
  );
  assert.equal(filteredPage.status, 200, JSON.stringify(filteredPage.data));
  assert.equal(filteredPage.data.assetPagination.total, 1);
  assert.equal(filteredPage.data.assets.length, 1);
  assert.equal(filteredPage.data.maintenancePagination.page, 1);
  const done = await call(
    `/assets/maintenance/${maintenance.data.id}`,
    { status: "completed", completedOn: "2030-10-01" },
    IDS.admin,
    "PATCH",
  );
  assert.equal(done.status, 200, JSON.stringify(done.data));
  const after = await call("/assets");
  assert.equal(after.data.assets[0].status, "available");
});

test("assistência protege descrição e acompanha encaminhamento", async () => {
  await db.transaction((q) =>
    q(
      "UPDATE churches SET modules=array_append(modules,'assistance') WHERE id=$1 AND NOT ('assistance'=ANY(modules))",
      [IDS.churchA],
    ),
  );
  const created = await call("/assistance/cases", {
    requesterName: "Família atendida",
    requesterEmail: "familia@example.invalid",
    category: "Alimentação",
    description: "Solicita apoio emergencial.",
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const [assistanceTask] = await db.transaction((q) =>
    q(
      "SELECT source_type,status FROM operational_tasks WHERE source_type='assistance_case' AND source_id=$1",
      [created.data.id],
    ),
  );
  assert.equal(assistanceTask.source_type, "assistance_case");
  assert.equal(assistanceTask.status, "open");
  assert.equal(created.data.description, "Solicita apoio emergencial.");
  const list = await call("/assistance");
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.equal(
    list.data.cases.items[0].description,
    "Solicita apoio emergencial.",
  );
  assert.ok(
    list.data.assignees.some(
      (u: Record<string, unknown>) => u.id === IDS.admin,
    ),
  );
  const assigned = await call(
    `/assistance/cases/${created.data.id}`,
    { assignedTo: IDS.admin },
    IDS.admin,
    "PATCH",
  );
  assert.equal(assigned.status, 200, JSON.stringify(assigned.data));
  const [assignedTask] = await db.transaction((q) =>
    q(
      "SELECT assigned_to FROM operational_tasks WHERE source_type='assistance_case' AND source_id=$1",
      [created.data.id],
    ),
  );
  assert.equal(assignedTask.assigned_to, IDS.admin);
  const filtered = await call("/assistance?page=1&pageSize=1&status=received");
  assert.equal(filtered.status, 200, JSON.stringify(filtered.data));
  assert.equal(filtered.data.cases.pageSize, 1);
  const assistanceCsv = await fetch(`${base}/api/assistance/export.csv`, {
    headers: {
      Cookie: cookies.get(IDS.admin) ?? "",
      "x-church-id": IDS.churchA,
    },
  });
  const assistanceCsvText = await assistanceCsv.text();
  assert.equal(assistanceCsv.status, 200, assistanceCsvText);
  assert.match(assistanceCsvText, /requester_name,category,status/);
  const updated = await call(
    `/assistance/cases/${created.data.id}`,
    { status: "closed", outcome: "Encaminhada para cesta básica." },
    IDS.admin,
    "PATCH",
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  const [closedAssistanceTask] = await db.transaction((q) =>
    q(
      "SELECT status FROM operational_tasks WHERE source_type='assistance_case' AND source_id=$1",
      [created.data.id],
    ),
  );
  assert.equal(closedAssistanceTask.status, "done");
  const action = await call(`/assistance/cases/${created.data.id}/actions`, {
    action: "Contato realizado",
    note: "Retorno agendado.",
  });
  assert.equal(action.status, 201, JSON.stringify(action.data));
  const actionPage = await call("/assistance?actionPage=1&actionPageSize=1");
  assert.equal(actionPage.status, 200, JSON.stringify(actionPage.data));
  assert.equal(actionPage.data.actions.pageSize, 1);
  assert.equal(actionPage.data.actions.items[0].note, "Retorno agendado.");
});

test("painel de saúde operacional consolida pendências por igreja", async () => {
  const dashboard = await call("/dashboard");
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.data));
  assert.equal(typeof dashboard.data.health.pending_registrations, "number");
  assert.equal(typeof dashboard.data.health.overdue_tasks, "number");
  assert.equal(typeof dashboard.data.health.upcoming_events, "number");
  assert.equal(typeof dashboard.data.health.open_privacy, "number");
  assert.equal(typeof dashboard.data.health.pending_scales, "number");
  assert.equal(typeof dashboard.data.health.failed_integrations, "number");
  assert.equal(typeof dashboard.data.health.failed_communications, "number");
  assert.equal(typeof dashboard.data.health.failed_kids_prints, "number");
  assert.equal(typeof dashboard.data.health.open_prayers, "number");
  const memberDashboard = await call("/dashboard", undefined, IDS.member);
  assert.equal(
    memberDashboard.status,
    200,
    JSON.stringify(memberDashboard.data),
  );
  assert.equal(typeof memberDashboard.data.health.open_prayers, "number");
});

test("listagem de pessoas pagina e filtra no servidor", async () => {
  const result = await call(
    "/people/paged?page=1&pageSize=1&status=member&q=Admin",
  );
  assert.equal(result.status, 200, JSON.stringify(result.data));
  assert.equal(result.data.page, 1);
  assert.equal(result.data.pageSize, 1);
  assert.ok(Array.isArray(result.data.items));
  assert.ok(Number.isInteger(result.data.total));
  assert.ok(Number.isInteger(result.data.pages));
  assert.ok(
    result.data.items.every(
      (p: Record<string, unknown>) =>
        p.status === "member" && String(p.name).toLowerCase().includes("admin"),
    ),
  );
  const [campus] = await db.transaction((q) =>
    q("SELECT id FROM campuses WHERE church_id=$1 LIMIT 1", [IDS.churchA]),
  );
  if (campus) {
    const campusResult = await call(
      `/people/paged?page=1&pageSize=10&campusId=${campus.id}`,
    );
    assert.equal(campusResult.status, 200, JSON.stringify(campusResult.data));
    assert.ok(
      campusResult.data.items.every(
        (p: Record<string, unknown>) => p.campus_id === campus.id,
      ),
    );
  }
});

test("busca operacional interpreta consultas sem expor dados restritos", async () => {
  const visitors = await call(
    "/search?q=visitantes%20sem%20contato",
    undefined,
    IDS.admin,
  );
  assert.equal(visitors.status, 200, JSON.stringify(visitors.data));
  assert.equal(visitors.data.type, "visitors_without_contact");
  assert.ok(Array.isArray(visitors.data.items));
  assert.ok(!("description" in (visitors.data.items[0] ?? {})));
  const volunteers = await call(
    "/search?q=voluntários%20disponíveis",
    undefined,
    IDS.admin,
  );
  assert.equal(volunteers.status, 200, JSON.stringify(volunteers.data));
  assert.equal(volunteers.data.type, "available_volunteers");
  assert.ok(Array.isArray(volunteers.data.items));
  const events = await call(
    "/search?q=eventos%20próximos",
    undefined,
    IDS.admin,
  );
  assert.equal(events.status, 200, JSON.stringify(events.data));
  assert.equal(events.data.type, "upcoming_events");
  assert.ok(Array.isArray(events.data.items));
  const courseInterests = await call(
    "/search?q=interesses%20em%20cursos",
    undefined,
    IDS.admin,
  );
  assert.equal(
    courseInterests.status,
    200,
    JSON.stringify(courseInterests.data),
  );
  assert.equal(courseInterests.data.type, "education_interests");
  assert.ok(Array.isArray(courseInterests.data.items));
  const peopleSearch = await call("/search?q=Admin", undefined, IDS.admin);
  assert.equal(peopleSearch.status, 200, JSON.stringify(peopleSearch.data));
  assert.equal(peopleSearch.data.type, "people");
  const forbidden = await call("/search?q=Ana", undefined, IDS.member);
  assert.equal(forbidden.status, 403);
});

test("biblioteca controla catálogo, empréstimo e devolução", async () => {
  await db.transaction((q) =>
    q(
      "UPDATE churches SET modules=array_append(modules,'library') WHERE id=$1 AND NOT ('library'=ANY(modules))",
      [IDS.churchA],
    ),
  );
  const item = await call("/library/items", {
    itemCode: "LIV-001",
    title: "Fundamentos da fé",
    author: "Editora Demo",
    totalCopies: 1,
  });
  assert.equal(item.status, 201, JSON.stringify(item.data));
  const [person] = await db.transaction((q) =>
    q("SELECT id FROM people WHERE church_id=$1 LIMIT 1", [IDS.churchA]),
  );
  const loan = await call("/library/loans", {
    itemId: item.data.id,
    personId: person.id,
    dueOn: "2030-12-01",
  });
  assert.equal(loan.status, 201, JSON.stringify(loan.data));
  const list = await call("/library");
  assert.equal(list.status, 200, JSON.stringify(list.data));
  assert.equal(list.data.items[0].available_copies, 0);
  const filteredPage = await call(
    "/library?itemPage=1&itemPageSize=1&loanPage=1&loanPageSize=1&q=Fundamentos&loanStatus=open",
  );
  assert.equal(filteredPage.status, 200, JSON.stringify(filteredPage.data));
  assert.equal(filteredPage.data.itemPagination.total, 1);
  assert.equal(filteredPage.data.items.length, 1);
  assert.equal(filteredPage.data.loanPagination.total, 1);
  assert.equal(filteredPage.data.loanableItems.length, 0);
  const returned = await call(
    `/library/loans/${loan.data.id}`,
    { status: "returned", returnedOn: "2030-11-20" },
    IDS.admin,
    "PATCH",
  );
  assert.equal(returned.status, 200, JSON.stringify(returned.data));
  const after = await call("/library");
  assert.equal(after.data.items[0].available_copies, 1);
});

test("membro controla preferências de comunicação pelo portal", async () => {
  const before = await call(
    "/communication/preferences/me",
    undefined,
    IDS.member,
  );
  assert.equal(before.status, 200, JSON.stringify(before.data));
  if (before.data.email_opt_in) {
    const disabled = await call(
      "/communication/preferences/me",
      {
        emailOptIn: false,
        portalOptIn: before.data.portal_opt_in,
        smsOptIn: before.data.sms_opt_in,
      },
      IDS.member,
      "PUT",
    );
    assert.equal(disabled.status, 200, JSON.stringify(disabled.data));
  }
  const rejectedReOptIn = await call(
    "/communication/preferences/me",
    { emailOptIn: true, portalOptIn: false, smsOptIn: false },
    IDS.member,
    "PUT",
  );
  assert.equal(rejectedReOptIn.status, 400);
  const updated = await call(
    "/communication/preferences/me",
    {
      emailOptIn: true,
      portalOptIn: false,
      smsOptIn: false,
      confirmReOptIn: true,
    },
    IDS.member,
    "PUT",
  );
  assert.equal(updated.status, 200, JSON.stringify(updated.data));
  assert.equal(updated.data.portal_opt_in, false);
  const after = await call(
    "/communication/preferences/me",
    undefined,
    IDS.member,
  );
  assert.equal(after.data.email_opt_in, true);
  const [unconfiguredPerson] = await db.transaction((q) =>
    q(
      "INSERT INTO people(church_id,name,email,status) VALUES($1,$2,$3,'member') RETURNING id",
      [
        IDS.churchA,
        `Sem preferência ${randomUUID()}`,
        "sem-preferencia@example.invalid",
      ],
    ),
  );
  const preferencePage = await call(
    "/communication?preferencePage=1&preferencePageSize=100",
  );
  assert.equal(preferencePage.status, 200, JSON.stringify(preferencePage.data));
  assert.equal(preferencePage.data.preferencePagination.pageSize, 100);
  assert.ok(
    preferencePage.data.preferencePagination.total >=
      preferencePage.data.preferences.length,
  );
  const managedPreference = preferencePage.data.preferences.find(
    (row: Record<string, unknown>) => row.person_id === unconfiguredPerson.id,
  );
  assert.equal(managedPreference.email_opt_in, false);
  assert.equal(managedPreference.portal_opt_in, true);
  const managedPreferenceUpdate = await call(
    `/communication/preferences/${managedPreference.person_id}`,
    { emailOptIn: false, portalOptIn: true, smsOptIn: false },
    IDS.admin,
    "PUT",
  );
  assert.equal(
    managedPreferenceUpdate.status,
    200,
    JSON.stringify(managedPreferenceUpdate.data),
  );
  assert.equal(after.data.portal_opt_in, false);
});

test("comunicação externa respeita consentimento e fila de entrega", async () => {
  const template = await call("/communication/templates", {
    name: `Boas-vindas ${randomUUID()}`,
    channel: "portal",
    subject: "Boas-vindas",
    body: "Mensagem de boas-vindas.",
    audienceFilter: {
      status: "visitor",
      campusId: null,
      cellId: null,
      teamId: null,
    },
  });
  assert.equal(template.status, 201, JSON.stringify(template.data));
  const templates = await call("/communication/templates");
  assert.equal(templates.status, 200, JSON.stringify(templates.data));
  assert.ok(
    templates.data.some(
      (row: Record<string, unknown>) => row.id === template.data.id,
    ),
  );
  const updatedTemplate = await call(
    `/communication/templates/${template.data.id}`,
    {
      name: template.data.name,
      channel: "portal",
      subject: "Boas-vindas atualizadas",
      body: "Mensagem atualizada.",
      audienceFilter: {
        status: "member",
        campusId: null,
        cellId: null,
        teamId: null,
      },
    },
    IDS.admin,
    "PATCH",
  );
  assert.equal(
    updatedTemplate.status,
    200,
    JSON.stringify(updatedTemplate.data),
  );
  assert.equal(updatedTemplate.data.subject, "Boas-vindas atualizadas");
  const deletedTemplate = await call(
    `/communication/templates/${template.data.id}`,
    undefined,
    IDS.admin,
    "DELETE",
  );
  assert.equal(
    deletedTemplate.status,
    200,
    JSON.stringify(deletedTemplate.data),
  );
  const [person] = await db.transaction((q) =>
    q(
      "SELECT id FROM people WHERE church_id=$1 AND email IS NOT NULL LIMIT 1",
      [IDS.churchA],
    ),
  );
  await db.transaction((q) =>
    q(
      "INSERT INTO communication_preferences(church_id,person_id,email_opt_in,portal_opt_in,sms_opt_in,updated_by) VALUES($1,$2,true,true,false,$3) ON CONFLICT(church_id,person_id) DO UPDATE SET email_opt_in=true",
      [IDS.churchA, person.id, IDS.admin],
    ),
  );
  const preview = await call("/communication/preview", {
    channel: "email",
    filter: { status: "all", campusId: null, cellId: null, teamId: null },
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.data));
  assert.ok(Number(preview.data.recipientCount) >= 1);
  assert.ok(Array.isArray(preview.data.sample));
  const created = await call("/communication/messages", {
    channel: "email",
    subject: "Aviso de teste",
    body: "Mensagem de teste",
    filter: { status: "all", campusId: null },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.status, "queued");
  const pending = await db.transaction((q) =>
    q(
      "SELECT id,status,attempts FROM communication_deliveries WHERE message_id=$1",
      [created.data.id],
    ),
  );
  assert.ok(pending.length >= 1);
  assert.equal(pending[0].status, "queued");
  assert.equal(
    await processCommunicationDeliveryJobs(db, "demo"),
    pending.length,
  );
  const [sent] = await db.transaction((q) =>
    q(
      "SELECT status,provider_message_id FROM communication_deliveries WHERE id=$1",
      [pending[0].id],
    ),
  );
  assert.equal(sent.status, "sent");
  assert.match(sent.provider_message_id, /^demo-/);
  const callback = await fetch(`${base}/api/webhooks/communication`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-communication-callback-token": "callback-test-token-2026",
    },
    body: JSON.stringify({
      deliveryId: pending[0].id,
      providerMessageId: "provider-bounce-1",
      status: "bounced",
      reason: "Mailbox inexistente",
    }),
  });
  assert.equal(callback.status, 200, await callback.text());
  const [bounced] = await db.transaction((q) =>
    q(
      "SELECT status,provider_message_id,last_error FROM communication_deliveries WHERE id=$1",
      [pending[0].id],
    ),
  );
  assert.equal(bounced.status, "failed");
  assert.equal(bounced.provider_message_id, "provider-bounce-1");
  assert.equal(bounced.last_error, "Mailbox inexistente");
  const [disabled] = await db.transaction((q) =>
    q("SELECT email_opt_in FROM communication_preferences WHERE person_id=$1", [
      person.id,
    ]),
  );
  assert.equal(disabled.email_opt_in, false);
  const blockedRetry = await call(
    `/communication/deliveries/${pending[0].id}/retry`,
    {},
    IDS.admin,
  );
  assert.equal(blockedRetry.status, 409, JSON.stringify(blockedRetry.data));
  await db.transaction((q) =>
    q(
      "UPDATE communication_preferences SET email_opt_in=true WHERE person_id=$1",
      [person.id],
    ),
  );
});

test("comunicação agendada aguarda o horário e portal continua imediato", async () => {
  const future = await call("/communication/messages", {
    channel: "email",
    subject: "Aviso agendado",
    body: "Entrega futura",
    sendAt: "2099-01-01T12:00:00.000Z",
    filter: { status: "all", campusId: null },
  });
  assert.equal(future.status, 201, JSON.stringify(future.data));
  assert.equal(
    new Date(future.data.send_at).toISOString(),
    "2099-01-01T12:00:00.000Z",
  );
  assert.equal(await processCommunicationDeliveryJobs(db, "demo"), 0);
  const cancelled = await call(
    `/communication/messages/${future.data.id}/cancel`,
    {},
    IDS.admin,
  );
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  const [skipped] = await db.transaction((q) =>
    q(
      "SELECT status FROM communication_deliveries WHERE message_id=$1 LIMIT 1",
      [future.data.id],
    ),
  );
  assert.equal(skipped.status, "skipped");
  const portal = await call("/communication/messages", {
    channel: "portal",
    subject: "Portal agendado",
    body: "Não permitido",
    sendAt: "2099-01-01T12:00:00.000Z",
    filter: { status: "all", campusId: null },
  });
  assert.equal(portal.status, 400);
});

test("transporte webhook envia somente o endereço autorizado", async () => {
  const created = await call("/communication/messages", {
    channel: "email",
    subject: "Webhook",
    body: "Entrega",
    filter: { status: "all", campusId: null },
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  let received: any = null;
  const webhook = createServer((req, res) => {
    let raw = "";
    req.on("data", (chunk) => {
      raw += chunk;
    });
    req.on("end", () => {
      received = {
        authorization: req.headers.authorization,
        body: JSON.parse(raw),
      };
      res.setHeader("x-provider-message-id", "provider-123");
      res.statusCode = 202;
      res.end("ok");
    });
  });
  await new Promise<void>((resolve) =>
    webhook.listen(0, "127.0.0.1", () => resolve()),
  );
  const address = webhook.address();
  assert.ok(address && typeof address !== "string");
  try {
    const [delivery] = await db.transaction((q) =>
      q(
        "SELECT id FROM communication_deliveries WHERE message_id=$1 AND status='queued' LIMIT 1",
        [created.data.id],
      ),
    );
    await processCommunicationDeliveryJobs(db, "webhook", 1, {
      emailUrl: `http://127.0.0.1:${address.port}`,
      token: "secret-token",
    });
    assert.equal(received.authorization, "Bearer secret-token");
    assert.equal(received.body.deliveryId, delivery.id);
    const [sent] = await db.transaction((q) =>
      q(
        "SELECT status,provider_message_id FROM communication_deliveries WHERE id=$1",
        [delivery.id],
      ),
    );
    assert.equal(sent.status, "sent");
    assert.equal(sent.provider_message_id, "provider-123");
  } finally {
    await new Promise<void>((resolve, reject) =>
      webhook.close((error) => (error ? reject(error) : resolve())),
    );
  }
});

test("Pix intent survives an ambiguous provider timeout and resumes the same txid", async () => {
  let created: any,
    creates = 0,
    queries = 0;
  const efi = new Efi([
    {
      churchId: IDS.churchA,
      accountId: "efi-test",
      clientId: "fake",
      clientSecret: "fake",
      pixKey: "fake",
      certificatePath: "unused",
    },
  ]);
  efi.create = async (church, txid, amount) => {
    creates++;
    created = {
      txid,
      valor: { original: (amount / 100).toFixed(2) },
      pixCopiaECola: "QR-HOMOLOGACAO",
      calendario: { criacao: new Date().toISOString(), expiracao: 3600 },
    };
    throw new Error("timeout after provider committed");
  };
  efi.query = async () => {
    queries++;
    if (!created) throw new HttpError(404, "missing");
    return created;
  };
  const app = createApp(db, {
      mode: "homologation",
      key,
      efi,
      origin: "http://localhost",
    }),
    other = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => other.once("listening", r));
  try {
    const [fund] = await db.transaction((q) =>
      q("SELECT id FROM funds WHERE church_id=$1", [IDS.churchA]),
    );
    const body = { amount: "12.34", fundId: fund.id, requestKey: randomUUID() },
      url = `http://127.0.0.1:${(other.address() as any).port}/api/pix/charges`;
    const send = async () => {
      const r = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Cookie: cookies.get(IDS.admin)!,
          "x-church-id": IDS.churchA,
        },
        body: JSON.stringify(body),
      });
      return { status: r.status, data: await r.json() };
    };
    const first = await send(),
      repeat = await send();
    assert.equal(first.status, 202);
    assert.equal(repeat.data.id, first.data.id);
    assert.equal(creates, 1);
    await db.transaction((q) =>
      q("UPDATE integration_jobs SET available_at=now() WHERE resource_id=$1", [
        first.data.id,
      ]),
    );
    await processIntegrationJob(db, efi, first.data.id);
    const [row] = await db.transaction((q) =>
      q("SELECT * FROM pix_charges WHERE id=$1", [first.data.id]),
    );
    assert.equal(row.status, "active");
    assert.equal(row.txid, created.txid);
    assert.equal(creates, 1);
    assert.equal(queries, 1);
  } finally {
    await new Promise<void>((r) => other.close(() => r()));
  }
});
test("treasury requires independent approval, supports partial idempotent payments and reversals", async () => {
  const before = await call("/finance/treasury");
  assert.equal(before.status, 200);
  assert.ok(before.data.integrationPagination);
  const integrationPage = await call(
    "/finance/treasury?integrationPage=1&integrationPageSize=1",
  );
  assert.equal(
    integrationPage.status,
    200,
    JSON.stringify(integrationPage.data),
  );
  assert.equal(integrationPage.data.integrationPagination.pageSize, 1);
  assert.ok(integrationPage.data.jobs.length <= 1);
  const bill = await call(
    "/finance/bills",
    {
      kind: "payable",
      description: "Aluguel teste",
      amount: "100.00",
      dueOn: "2026-11-10",
    },
    treasurer,
  );
  assert.equal(bill.status, 201, JSON.stringify(bill.data));
  const self = await call("/finance/bills", {
    kind: "payable",
    description: "Própria solicitação",
    amount: "20.00",
    dueOn: "2026-11-10",
  });
  assert.equal(
    (
      await call(`/finance/bills/${self.data.id}/decision`, {
        status: "approved",
        reason: "Aprovação de teste",
      })
    ).status,
    403,
  );
  const payment = {
    amount: "40.00",
    accountId: before.data.accounts[0].id,
    date: "2026-10-16",
    requestKey: randomUUID(),
  };
  assert.equal(
    (await call(`/finance/bills/${bill.data.id}/payments`, payment, treasurer))
      .status,
    409,
  );
  assert.equal(
    (
      await call(`/finance/bills/${bill.data.id}/decision`, {
        status: "approved",
        reason: "Contrato conferido",
      })
    ).status,
    200,
  );
  const paid = await call(
      `/finance/bills/${bill.data.id}/payments`,
      payment,
      treasurer,
    ),
    repeated = await call(
      `/finance/bills/${bill.data.id}/payments`,
      payment,
      treasurer,
    );
  assert.equal(paid.status, 201, JSON.stringify(paid.data));
  assert.equal(repeated.status, 201, JSON.stringify(repeated.data));
  assert.equal(paid.data.id, repeated.data.id);
  const attachmentPayload = {
    name: "comprovante.pdf",
    mediaType: "application/pdf",
    content: Buffer.from("%PDF-1.4 comprovante").toString("base64"),
  };
  const billAttachment = await call(
    `/finance/bills/${bill.data.id}/attachments`,
    attachmentPayload,
    treasurer,
  );
  assert.equal(billAttachment.status, 201, JSON.stringify(billAttachment.data));
  const paymentAttachment = await call(
    `/finance/payments/${paid.data.id}/attachments`,
    { ...attachmentPayload, name: "baixa.pdf" },
    treasurer,
  );
  assert.equal(
    paymentAttachment.status,
    201,
    JSON.stringify(paymentAttachment.data),
  );
  const statementCsv = [
    "external_id,date,description,amount",
    `extrato-${randomUUID()},2026-10-16,Pagamento aluguel,-40.00`,
  ].join("\n");
  const imported = await call(
    `/finance/bank-accounts/${payment.accountId}/statements/import`,
    { fileName: "extrato-outubro.csv", csv: statementCsv },
    treasurer,
  );
  assert.equal(imported.status, 201, JSON.stringify(imported.data));
  const importedAgain = await call(
    `/finance/bank-accounts/${payment.accountId}/statements/import`,
    { fileName: "extrato-outubro.csv", csv: statementCsv },
    treasurer,
  );
  assert.equal(importedAgain.status, 200);
  assert.equal(importedAgain.data.duplicate, true);
  const statementLines = (await call("/finance/treasury", undefined, treasurer))
    .data.statementLines;
  const line = statementLines.find(
    (row: Record<string, unknown>) => row.import_id === imported.data.import.id,
  );
  assert.ok(line);
  const statementPage = await call(
    "/finance/treasury?statementPage=1&statementPageSize=1&statementStatus=unmatched",
    undefined,
    treasurer,
  );
  assert.equal(statementPage.status, 200, JSON.stringify(statementPage.data));
  assert.equal(statementPage.data.statementPagination.pageSize, 1);
  assert.ok(statementPage.data.statementPagination.total >= 1);
  assert.ok(statementPage.data.statementLines.length <= 1);
  const matching = await call(
    `/finance/statement-lines/${line.id}/match`,
    { paymentId: paid.data.id },
    treasurer,
  );
  assert.equal(matching.status, 200, JSON.stringify(matching.data));
  const matched = (
    await call("/finance/treasury", undefined, treasurer)
  ).data.statementLines.find(
    (row: Record<string, unknown>) => row.id === line.id,
  );
  assert.equal(matched.status, "matched");
  const managementReport = await call(
    "/finance/reports?from=2026-10-01&to=2026-10-31",
    undefined,
    treasurer,
  );
  assert.equal(
    managementReport.status,
    200,
    JSON.stringify(managementReport.data),
  );
  assert.equal(managementReport.data.from, "2026-10-01");
  assert.ok(Array.isArray(managementReport.data.monthly));
  assert.ok(Array.isArray(managementReport.data.byCostCenter));
  const financialReportCsv = await fetch(
    `${base}/api/finance/reports.csv?from=2026-10-01&to=2026-10-31`,
    {
      headers: {
        Cookie: cookies.get(treasurer) ?? "",
        "x-church-id": IDS.churchA,
      },
    },
  );
  const financialReportCsvText = await financialReportCsv.text();
  assert.equal(financialReportCsv.status, 200, financialReportCsvText);
  assert.match(
    financialReportCsvText,
    /cost_center,income_cents,expense_cents,net_cents/,
  );
  assert.ok("overdue_cents" in managementReport.data.openBills);
  const attachmentDownload = await fetch(
    `${base}/api/finance/attachments/${billAttachment.data.id}`,
    {
      headers: {
        Cookie: cookies.get(treasurer) ?? "",
        "x-church-id": IDS.churchA,
      },
    },
  );
  assert.equal(attachmentDownload.status, 200);
  assert.equal(
    Buffer.from(await attachmentDownload.arrayBuffer()).toString(),
    "%PDF-1.4 comprovante",
  );
  const crossChurchAttachment = await call(
    `/finance/attachments/${billAttachment.data.id}`,
    undefined,
    IDS.adminB,
    "GET",
    IDS.churchB,
  );
  assert.equal(crossChurchAttachment.status, 404);
  assert.equal(
    (
      await call(
        `/finance/bills/${bill.data.id}/payments`,
        { ...payment, amount: "61.00", requestKey: randomUUID() },
        treasurer,
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `/finance/entries/${paid.data.entry_id}/reverse`,
        {},
        treasurer,
      )
    ).status,
    409,
  );
  assert.equal(
    (await call(`/finance/payments/${paid.data.id}/reverse`, {}, treasurer))
      .status,
    200,
  );
  const [row] = await db.transaction((q) =>
    q("SELECT paid_cents FROM treasury_bills WHERE id=$1", [bill.data.id]),
  );
  assert.equal(Number(row.paid_cents), 0);
  const billHistory = await call(
    `/finance/history/bill/${bill.data.id}`,
    undefined,
    treasurer,
  );
  assert.equal(billHistory.status, 200, JSON.stringify(billHistory.data));
  assert.ok(
    billHistory.data.items.some(
      (entry: Record<string, unknown>) => entry.action === "approved",
    ),
  );
  const paymentHistory = await call(
    `/finance/history/payment/${paid.data.id}`,
    undefined,
    treasurer,
  );
  assert.equal(paymentHistory.status, 200, JSON.stringify(paymentHistory.data));
  assert.ok(
    paymentHistory.data.items.some(
      (entry: Record<string, unknown>) => entry.action === "reversed",
    ),
  );
  const hidden = await call(
    "/finance/treasury",
    undefined,
    IDS.adminB,
    "GET",
    IDS.churchB,
  );
  assert.equal(hidden.data.bills.length, 0);
});
test("agenda rejects overlapping resources, rolls back recurrences and checks volunteer availability", async () => {
  const resource = await call("/agenda/resources", {
    name: "Sala 1",
    kind: "room",
  });
  assert.equal(resource.status, 201);
  const body = {
    title: "Reunião de equipe",
    kind: "meeting",
    startsAt: "2026-11-10T10:00:00-03:00",
    endsAt: "2026-11-10T11:00:00-03:00",
    resourceIds: [resource.data.id],
  };
  const event = await call("/agenda/events", body);
  assert.equal(event.status, 201, JSON.stringify(event.data));
  assert.equal(
    (
      await call("/agenda/events", {
        ...body,
        startsAt: "2026-11-10T10:30:00-03:00",
        endsAt: "2026-11-10T12:00:00-03:00",
      })
    ).status,
    409,
  );
  assert.equal(
    (
      await call("/agenda/events", {
        ...body,
        startsAt: "2026-11-03T10:00:00-03:00",
        endsAt: "2026-11-03T11:00:00-03:00",
        weeklyCount: 2,
      })
    ).status,
    409,
  );
  const [n] = await db.transaction((q) =>
    q("SELECT count(*)::int AS n FROM church_events"),
  );
  assert.equal(n.n, 1);
  const team = await call("/agenda/teams", { name: "Recepção" });
  assert.equal(
    (
      await call(`/agenda/teams/${team.data.id}/members`, {
        userId: IDS.member,
        role: "Recepcionista",
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        "/agenda/unavailability",
        { startsAt: body.startsAt, endsAt: body.endsAt },
        IDS.member,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call("/agenda/schedules", {
        userId: IDS.member,
        teamId: team.data.id,
        eventId: event.data[0].id,
      })
    ).status,
    409,
  );
  assert.equal(
    (await call(`/agenda/events/${event.data[0].id}/cancel`, {})).status,
    200,
  );
  assert.equal((await call("/agenda/events", body)).status, 201);
});
test("tasks keep pastoral content restricted and reject stale updates", async () => {
  assert.equal(
    (
      await call("/tasks", {
        scope: "pastoral",
        title: "Cuidado reservado",
        dueOn: "2026-11-01",
      })
    ).status,
    403,
  );
  const task = await call("/tasks", {
    scope: "people",
    title: "Conferir transferência",
    dueOn: "2026-11-01",
  });
  assert.equal(task.status, 201);
  const agenda = await call("/agenda");
  assert.equal(agenda.status, 200, JSON.stringify(agenda.data));
  assert.ok(agenda.data.eventPagination);
  assert.ok(agenda.data.eventPagination.total >= agenda.data.events.length);
  const pagedEvents = await call("/agenda?eventPage=1&eventPageSize=1");
  assert.equal(pagedEvents.status, 200, JSON.stringify(pagedEvents.data));
  assert.equal(pagedEvents.data.eventPagination.pageSize, 1);
  assert.ok(pagedEvents.data.events.length <= 1);
  assert.equal(
    agenda.data.queue.some(
      (item: Record<string, unknown>) =>
        item.kind === "task" && item.id === task.data.id,
    ),
    true,
  );
  const filteredAgenda = await call(
    "/agenda?page=1&pageSize=1&status=open&scope=people",
  );
  assert.equal(filteredAgenda.status, 200, JSON.stringify(filteredAgenda.data));
  assert.equal(filteredAgenda.data.taskPagination.pageSize, 1);
  assert.ok(filteredAgenda.data.taskPagination.total >= 1);
  assert.ok(filteredAgenda.data.tasks.length <= 1);
  assert.ok(
    filteredAgenda.data.tasks.every(
      (item: Record<string, unknown>) =>
        item.status === "open" && item.scope === "people",
    ),
  );
  const assignedAgenda = await call(
    `/agenda?page=1&pageSize=25&assignedTo=${IDS.admin}&due=overdue`,
    undefined,
    IDS.admin,
  );
  assert.equal(assignedAgenda.status, 200, JSON.stringify(assignedAgenda.data));
  assert.ok(
    assignedAgenda.data.tasks.every(
      (item: Record<string, unknown>) =>
        item.assigned_to === IDS.admin &&
        ["open", "in_progress"].includes(String(item.status)),
    ),
  );
  const reassigned = await call(
    `/tasks/${task.data.id}`,
    { status: "open", assignedTo: IDS.admin, version: 1 },
    IDS.admin,
    "PATCH",
  );
  assert.equal(reassigned.status, 200, JSON.stringify(reassigned.data));
  assert.equal(
    (
      await call(
        `/tasks/${task.data.id}`,
        { status: "done", version: 2 },
        IDS.admin,
        "PATCH",
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await call(
        `/tasks/${task.data.id}`,
        { status: "open", version: 1 },
        IDS.admin,
        "PATCH",
      )
    ).status,
    409,
  );
  assert.equal(
    (
      await call(
        `/tasks/${task.data.id}`,
        { status: "open", version: 2 },
        IDS.adminB,
        "PATCH",
        IDS.churchB,
      )
    ).status,
    404,
  );
});
test("solicitações de privacidade entram e saem da fila operacional", async () => {
  const beforeExport = await fetch(`${base}/api/privacy/export`, {
    headers: {
      Cookie: cookies.get(IDS.member) ?? "",
      "x-church-id": IDS.churchA,
    },
  });
  assert.equal(beforeExport.status, 409);
  const request = await call(
    "/privacy",
    { kind: "access", detail: "Solicito uma cópia dos meus dados cadastrais." },
    IDS.member,
  );
  assert.equal(request.status, 201, JSON.stringify(request.data));
  const [task] = await db.transaction((q) =>
    q(
      "SELECT source_type,status FROM operational_tasks WHERE source_type='privacy' AND source_id=$1",
      [request.data.id],
    ),
  );
  assert.equal(task.source_type, "privacy");
  assert.equal(task.status, "open");
  const privacyCsv = await fetch(`${base}/api/privacy/admin/export.csv`, {
    headers: {
      Cookie: cookies.get(IDS.admin) ?? "",
      "x-church-id": IDS.churchA,
    },
  });
  const privacyCsvText = await privacyCsv.text();
  assert.equal(privacyCsv.status, 200, privacyCsvText);
  assert.match(privacyCsvText, /id,kind,status,created_at,updated_at/);
  const retention = await call("/privacy/retention", undefined, IDS.admin);
  assert.equal(retention.status, 200);
  assert.equal(retention.data.items.length, 12);
  const retentionUpdate = await call(
    "/privacy/retention/pastoral_notes",
    {
      retentionDays: 730,
      legalBasis: "Execução de política interna",
      purpose: "Cuidado pastoral",
      responsible: "Liderança pastoral",
      notes: "Revisão anual",
    },
    IDS.admin,
    "PATCH",
  );
  assert.equal(retentionUpdate.status, 200);
  const retentionAgain = await call("/privacy/retention", undefined, IDS.admin);
  assert.equal(
    retentionAgain.data.items.find((v: any) => v.category === "pastoral_notes")
      .retention_days,
    730,
  );
  const resolved = await call(
    `/privacy/admin/${request.data.id}`,
    { status: "fulfilled", reason: "Cópia preparada e entregue ao titular." },
    IDS.admin,
    "PATCH",
  );
  assert.equal(resolved.status, 200, JSON.stringify(resolved.data));
  const [closed] = await db.transaction((q) =>
    q(
      "SELECT status FROM operational_tasks WHERE source_type='privacy' AND source_id=$1",
      [request.data.id],
    ),
  );
  assert.equal(closed.status, "done");
  const exportResponse = await fetch(`${base}/api/privacy/export`, {
    headers: {
      Cookie: cookies.get(IDS.member) ?? "",
      "x-church-id": IDS.churchA,
    },
  });
  assert.equal(exportResponse.status, 200);
  const exported = await exportResponse.json();
  assert.equal(exported.person.name, "Ana Martins");
  assert.equal(typeof exported.person.has_photo, "boolean");
  assert.equal("password_hash" in exported.user, false);
  assert.equal("pastoralNotes" in exported, false);
  const adminExport = await fetch(
    `${base}/api/privacy/admin/${request.data.id}/export`,
    {
      headers: {
        Cookie: cookies.get(IDS.admin) ?? "",
        "x-church-id": IDS.churchA,
      },
    },
  );
  assert.equal(adminExport.status, 200);
  const deletionUser = randomUUID(),
    deletionPerson = randomUUID(),
    deletionToken = randomUUID();
  await db.transaction(async (q) => {
    await q(
      "INSERT INTO users(id,email,name,password_hash,totp_secret) VALUES($1,$2,$3,$4,$5)",
      [
        deletionUser,
        "titular.exclusao@example.invalid",
        "Titular antes da exclusão",
        passwordHash("Teste@Ecclesia2026"),
        DEMO_SECRET,
      ],
    );
    await q(
      "INSERT INTO memberships(user_id,church_id,role) VALUES($1,$2,'member')",
      [deletionUser, IDS.churchA],
    );
    await q(
      "INSERT INTO people(id,church_id,user_id,name,email,status) VALUES($1,$2,$3,$4,$5,'member')",
      [
        deletionPerson,
        IDS.churchA,
        deletionUser,
        "Titular antes da exclusão",
        "titular.exclusao@example.invalid",
      ],
    );
    await q(
      "INSERT INTO sessions(token_hash,user_id,expires_at,mfa) VALUES($1,$2,now()+interval '1 hour',true)",
      [hash(deletionToken), deletionUser],
    );
  });
  cookies.set(deletionUser, `ecclesia_session=${deletionToken}`);
  const deletion = await call(
    "/privacy",
    { kind: "deletion", detail: "Solicito a exclusão dos meus dados." },
    deletionUser,
  );
  assert.equal(deletion.status, 201, JSON.stringify(deletion.data));
  const deletionRejected = await call(
    `/privacy/admin/${deletion.data.id}`,
    {
      status: "fulfilled",
      reason: "Anonimização concluída, mantendo retenções legais.",
    },
    IDS.admin,
    "PATCH",
  );
  assert.equal(deletionRejected.status, 400);
  const deletionResolved = await call(
    `/privacy/admin/${deletion.data.id}`,
    {
      status: "fulfilled",
      reason: "Anonimização concluída, mantendo retenções legais.",
      confirmDeletion: true,
    },
    IDS.admin,
    "PATCH",
  );
  assert.equal(
    deletionResolved.status,
    200,
    JSON.stringify(deletionResolved.data),
  );
  const [anonymized] = await db.transaction((q) =>
    q("SELECT name,email,status,anonymized_at FROM people WHERE id=$1", [
      deletionPerson,
    ]),
  );
  assert.equal(anonymized.name, "Titular removido");
  assert.equal(anonymized.email, null);
  assert.equal(anonymized.status, "inactive");
  assert.ok(anonymized.anonymized_at);
});
test("invitations are one-use, invalid TOTP attempts persist and existing identities are protected", async () => {
  const invite = await call("/access/invites", {
    name: "Secretária Nova",
    email: "nova@example.invalid",
    role: "secretary",
  });
  assert.equal(invite.status, 201, JSON.stringify(invite.data));
  const raw = invite.data.url.split("/").at(-1),
    metadata = await call(`/auth/invites/${raw}`);
  assert.equal(metadata.data.existing, false);
  let wrong = "000000";
  if (totp(metadata.data.secret) === wrong) wrong = "999999";
  assert.equal(
    (
      await call(`/auth/invites/${raw}`, {
        password: "NovaSenha@2026longa",
        code: wrong,
      })
    ).status,
    400,
  );
  const [attempt] = await db.transaction((q) =>
    q("SELECT attempts FROM account_invites WHERE token_hash=$1", [hash(raw)]),
  );
  assert.equal(attempt.attempts, 1);
  assert.equal(
    (
      await call(`/auth/invites/${raw}`, {
        password: "NovaSenha@2026longa",
        code: totp(metadata.data.secret),
      })
    ).status,
    201,
  );
  assert.equal(
    (
      await call(`/auth/invites/${raw}`, {
        password: "NovaSenha@2026longa",
        code: totp(metadata.data.secret),
      })
    ).status,
    404,
  );
  const existing = await call("/access/invites", {
      name: "Administrador B",
      email: "admin@caminho.demo",
      role: "member",
    }),
    existingRaw = existing.data.url.split("/").at(-1);
  assert.equal(
    (await call(`/auth/invites/${existingRaw}`, {}, IDS.member)).status,
    403,
  );
});
test("offboarding revokes sessions and returns tasks for authorized handoff", async () => {
  const task = await call(
    "/tasks",
    {
      scope: "finance",
      title: "Conferir fechamento pendente",
      dueOn: "2026-11-01",
    },
    treasurer,
  );
  assert.equal(task.status, 201);
  assert.equal(
    (await call(`/access/users/${treasurer}`, undefined, IDS.admin, "DELETE"))
      .status,
    200,
  );
  assert.equal(
    (await call("/finance/treasury", undefined, treasurer)).status,
    401,
  );
  const [pending] = await db.transaction((q) =>
    q("SELECT assigned_to,version FROM operational_tasks WHERE id=$1", [
      task.data.id,
    ]),
  );
  assert.equal(pending.assigned_to, null);
  assert.equal(
    (await call(`/tasks/${task.data.id}/claim`, { version: pending.version }))
      .status,
    200,
  );
  assert.equal(
    (await call(`/tasks/${task.data.id}/claim`, { version: pending.version }))
      .status,
    409,
  );
});
test("MFA secrets are sealed and backup codes are consumed once", async () => {
  await sealTotpSecrets(db, key);
  const [u] = await db.transaction((q) =>
    q("SELECT totp_secret FROM users WHERE id=$1", [IDS.admin]),
  );
  assert.ok(u.totp_secret.startsWith("enc:v1:"));
  assert.equal(openTotp(u.totp_secret, key), DEMO_SECRET);
  const setup = await call(
    "/account/mfa/setup",
    { password: "Demo@Ecclesia2026" },
    IDS.member,
  );
  assert.equal(setup.status, 200);
  const confirmed = await call(
    "/auth/mfa-confirm",
    { challenge: setup.data.challenge, code: totp(setup.data.secret) },
    IDS.member,
  );
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  assert.equal(confirmed.data.backupCodes.length, 10);
  assert.equal((await call("/portal", undefined, IDS.member)).status, 401);
  const recover = {
    email: "membro@esperanca.demo",
    password: "Demo@Ecclesia2026",
    backupCode: confirmed.data.backupCodes[0],
  };
  assert.equal((await call("/auth/mfa-recovery", recover)).status, 200);
  assert.equal((await call("/auth/mfa-recovery", recover)).status, 403);
});

test("event registrations enforce capacity and workflows keep an auditable process", async () => {
  const communication = await call("/communication", undefined, IDS.admin);
  assert.equal(communication.status, 200, JSON.stringify(communication.data));
  const communicationPage = await call(
    "/communication?page=1&pageSize=1",
    undefined,
    IDS.admin,
  );
  assert.equal(
    communicationPage.status,
    200,
    JSON.stringify(communicationPage.data),
  );
  assert.equal(communicationPage.data.messagePagination.pageSize, 1);
  assert.ok(
    communicationPage.data.messagePagination.total >=
      communicationPage.data.messages.length,
  );
  const [failedMessage] = await db.transaction((q) =>
    q(
      "SELECT id FROM communication_messages WHERE church_id=$1 ORDER BY created_at DESC LIMIT 1",
      [IDS.churchA],
    ),
  );
  const [failedPerson] = await db.transaction((q) =>
    q(
      "SELECT id,email FROM people WHERE church_id=$1 AND email IS NOT NULL LIMIT 1",
      [IDS.churchA],
    ),
  );
  const [failedDelivery] = await db.transaction((q) =>
    q(
      "INSERT INTO communication_deliveries(church_id,message_id,person_id,channel,status,consent_snapshot,address_snapshot,last_error) VALUES($1,$2,$3,'email','failed',true,$4,'Falha de teste') RETURNING id",
      [IDS.churchA, failedMessage.id, failedPerson.id, failedPerson.email],
    ),
  );
  const failedQueue = await call("/communication", undefined, IDS.admin);
  assert.ok(
    failedQueue.data.failedDeliveries.some(
      (row: Record<string, unknown>) => row.id === failedDelivery.id,
    ),
  );
  const failedPage = await call(
    "/communication?failedPage=1&failedPageSize=1",
    undefined,
    IDS.admin,
  );
  assert.equal(failedPage.status, 200, JSON.stringify(failedPage.data));
  assert.equal(failedPage.data.failedDeliveriesPagination.pageSize, 1);
  const communicationCsv = await fetch(`${base}/api/communication/export.csv`, {
    headers: {
      Cookie: cookies.get(IDS.admin) ?? "",
      "x-church-id": IDS.churchA,
    },
  });
  assert.equal(communicationCsv.status, 200);
  assert.match(await communicationCsv.text(), /subject,channel,status/);
  const retried = await call(
    `/communication/deliveries/${failedDelivery.id}/retry`,
    {},
    IDS.admin,
  );
  assert.equal(retried.status, 200, JSON.stringify(retried.data));
  await db.transaction((q) =>
    q(
      "INSERT INTO communication_preferences(church_id,person_id,portal_opt_in,updated_by) VALUES($1,(SELECT id FROM people WHERE church_id=$1 AND user_id=$2),true,$2) ON CONFLICT(church_id,person_id) DO UPDATE SET portal_opt_in=true",
      [IDS.churchA, IDS.member],
    ),
  );
  const noticeSubject = `Aviso de teste ${randomUUID()}`;
  const announcement = await call(
    "/communication/messages",
    {
      channel: "portal",
      subject: noticeSubject,
      body: "Mensagem de demonstração.",
      filter: { status: "all", campusId: null, cellId: null, teamId: null },
    },
    IDS.admin,
  );
  assert.equal(announcement.status, 201, JSON.stringify(announcement.data));
  assert.equal(announcement.data.status, "sent");
  assert.ok(
    Number(announcement.data.recipientCount) > 0,
    JSON.stringify(announcement.data),
  );
  const [memberPerson] = await db.transaction((q) =>
    q("SELECT id FROM people WHERE church_id=$1 AND user_id=$2", [
      IDS.churchA,
      IDS.member,
    ]),
  );
  const memberDelivery = await db.transaction((q) =>
    q(
      "SELECT id,status,read_at FROM communication_deliveries WHERE message_id=$1 AND person_id=$2",
      [announcement.data.id, memberPerson.id],
    ),
  );
  assert.equal(memberDelivery.length, 1, JSON.stringify(memberDelivery));
  const memberSession = randomUUID();
  cookies.set(IDS.member, `ecclesia_session=${memberSession}`);
  await db.transaction((q) =>
    q(
      "INSERT INTO sessions(token_hash,user_id,expires_at,mfa) VALUES($1,$2,now()+interval '1 hour',true)",
      [hash(memberSession), IDS.member],
    ),
  );
  const inbox = await call("/communication/inbox", undefined, IDS.member);
  assert.equal(inbox.status, 200, JSON.stringify(inbox.data));
  assert.ok(
    inbox.data.items.some(
      (message: Record<string, unknown>) => message.subject === noticeSubject,
    ),
    JSON.stringify(inbox.data.items.slice(0, 5)),
  );
  assert.ok(
    inbox.data.items.every(
      (message: Record<string, unknown>) => message.subject === noticeSubject,
    ),
  );
  const unread = inbox.data.items.find(
    (message: Record<string, unknown>) => message.subject === noticeSubject,
  );
  assert.ok(unread && !unread.read_at);
  const marked = await call(
    `/communication/inbox/${unread.delivery_id}/read`,
    {},
    IDS.member,
    "PATCH",
  );
  assert.equal(marked.status, 200, JSON.stringify(marked.data));
  const readInbox = await call("/communication/inbox", undefined, IDS.member);
  assert.ok(
    readInbox.data.items.find(
      (message: Record<string, unknown>) => message.id === unread.id,
    )?.read_at,
  );
  const inboxPage = await call(
    "/communication/inbox?page=1&pageSize=1",
    undefined,
    IDS.member,
  );
  assert.equal(inboxPage.status, 200, JSON.stringify(inboxPage.data));
  assert.equal(inboxPage.data.pageSize, 1);

  const [campus] = await db.transaction((q) =>
    q(
      "SELECT c.id,count(p.id)::int AS people FROM campuses c LEFT JOIN people p ON p.campus_id=c.id AND p.church_id=$1 WHERE c.church_id=$1 GROUP BY c.id ORDER BY people DESC,c.id LIMIT 1",
      [IDS.churchA],
    ),
  );
  assert.ok(
    campus,
    "A igreja de teste precisa ter um campus para segmentação.",
  );
  await db.transaction((q) =>
    q("UPDATE people SET campus_id=$1 WHERE id=$2", [
      campus.id,
      memberPerson.id,
    ]),
  );
  const campusNotice = await call(
    "/communication/messages",
    {
      channel: "portal",
      subject: `Aviso de campus ${randomUUID()}`,
      body: "Mensagem segmentada.",
      filter: { status: "all", campusId: campus.id },
    },
    IDS.admin,
  );
  assert.equal(campusNotice.status, 201, JSON.stringify(campusNotice.data));
  const campusDeliveries = await db.transaction((q) =>
    q(
      "SELECT p.campus_id FROM communication_deliveries d JOIN people p ON p.id=d.person_id WHERE d.message_id=$1",
      [campusNotice.data.id],
    ),
  );
  assert.ok(campusDeliveries.length > 0, JSON.stringify(campusNotice.data));
  assert.ok(
    campusDeliveries.every(
      (row: Record<string, unknown>) => row.campus_id === campus.id,
    ),
  );
  await db.transaction((q) =>
    q("UPDATE people SET campus_id=NULL WHERE id=$1", [memberPerson.id]),
  );

  const [cell] = await db.transaction((q) =>
    q("SELECT id FROM cells WHERE church_id=$1 ORDER BY name LIMIT 1", [
      IDS.churchA,
    ]),
  );
  assert.ok(cell, "A igreja de teste precisa ter uma célula para segmentação.");
  await db.transaction((q) =>
    q(
      "INSERT INTO cell_members(church_id,cell_id,person_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [IDS.churchA, cell.id, memberPerson.id],
    ),
  );
  const cellNotice = await call(
    "/communication/messages",
    {
      channel: "portal",
      subject: `Aviso de célula ${randomUUID()}`,
      body: "Mensagem para o grupo.",
      filter: { status: "all", campusId: null, cellId: cell.id },
    },
    IDS.admin,
  );
  assert.equal(cellNotice.status, 201, JSON.stringify(cellNotice.data));
  const cellDeliveries = await db.transaction((q) =>
    q(
      "SELECT cm.person_id FROM communication_deliveries cm WHERE cm.message_id=$1",
      [cellNotice.data.id],
    ),
  );
  assert.ok(
    cellDeliveries.some(
      (row: Record<string, unknown>) => row.person_id === memberPerson.id,
    ),
  );

  const [team] = await db.transaction((q) =>
    q(
      "SELECT id FROM ministry_teams WHERE church_id=$1 ORDER BY name LIMIT 1",
      [IDS.churchA],
    ),
  );
  assert.ok(team, "A igreja de teste precisa ter uma equipe para segmentação.");
  const [memberUser] = await db.transaction((q) =>
    q("SELECT user_id FROM people WHERE id=$1", [memberPerson.id]),
  );
  await db.transaction((q) =>
    q(
      "INSERT INTO ministry_members(church_id,team_id,user_id,role) VALUES($1,$2,$3,'member') ON CONFLICT DO NOTHING",
      [IDS.churchA, team.id, memberUser.user_id],
    ),
  );
  const teamNotice = await call(
    "/communication/messages",
    {
      channel: "portal",
      subject: `Aviso de equipe ${randomUUID()}`,
      body: "Mensagem para o ministério.",
      filter: { status: "all", campusId: null, cellId: null, teamId: team.id },
    },
    IDS.admin,
  );
  assert.equal(teamNotice.status, 201, JSON.stringify(teamNotice.data));
  const teamDeliveries = await db.transaction((q) =>
    q("SELECT person_id FROM communication_deliveries WHERE message_id=$1", [
      teamNotice.data.id,
    ]),
  );
  assert.ok(
    teamDeliveries.some(
      (row: Record<string, unknown>) => row.person_id === memberPerson.id,
    ),
  );

  const saved = await call(
    "/saved-views",
    {
      name: "Visitantes recentes",
      kind: "people",
      filters: { q: "", status: "visitor", campusId: null },
      shared: true,
    },
    IDS.admin,
  );
  assert.equal(saved.status, 201, JSON.stringify(saved.data));
  const savedList = await call(
    "/saved-views?kind=people",
    undefined,
    IDS.admin,
  );
  assert.equal(savedList.status, 200);
  assert.ok(
    savedList.data.some((v: Record<string, unknown>) => v.id === saved.data.id),
  );
  const communicationView = await call(
    "/saved-views",
    {
      name: "Avisos por e-mail aos visitantes",
      kind: "communication",
      filters: {
        channel: "email",
        status: "visitor",
        campusId: null,
        cellId: null,
        teamId: null,
      },
      shared: true,
    },
    IDS.admin,
  );
  assert.equal(
    communicationView.status,
    201,
    JSON.stringify(communicationView.data),
  );
  const communicationViews = await call(
    "/saved-views?kind=communication",
    undefined,
    IDS.admin,
  );
  assert.equal(communicationViews.status, 200);
  assert.ok(
    communicationViews.data.some(
      (v: Record<string, unknown>) => v.id === communicationView.data.id,
    ),
  );
  const updatedSaved = await call(
    `/saved-views/${saved.data.id}`,
    {
      name: "Visitantes para contato",
      filters: { q: "visitante", status: "visitor", campusId: null },
      shared: false,
    },
    IDS.admin,
    "PATCH",
  );
  assert.equal(updatedSaved.status, 200, JSON.stringify(updatedSaved.data));
  assert.equal(updatedSaved.data.name, "Visitantes para contato");
  assert.equal(updatedSaved.data.shared, false);
  const smart = await call("/smart-lists", undefined, IDS.admin);
  assert.equal(smart.status, 200, JSON.stringify(smart.data));
  assert.ok(Array.isArray(smart.data.visitorsWithoutContact));
  assert.ok(smart.data.visitorsWithoutContactPagination);
  assert.equal(smart.data.visitorsWithoutContactPagination.page, 1);
  assert.ok(Array.isArray(smart.data.availableVolunteers));
  assert.ok(Array.isArray(smart.data.visitorContactTasks));
  const noContactVisitor = await call(
    "/people",
    { name: "Visitante aguardando contato", status: "visitor" },
    IDS.admin,
  );
  assert.equal(
    noContactVisitor.status,
    201,
    JSON.stringify(noContactVisitor.data),
  );
  await db.transaction(async (q) => {
    const [existing] = await q(
      "SELECT id FROM people WHERE church_id=$1 AND user_id=$2",
      [IDS.churchA, IDS.admin],
    );
    if (!existing)
      await q(
        "INSERT INTO people(church_id,user_id,name,status) VALUES($1,$2,'Administrador local','member')",
        [IDS.churchA, IDS.admin],
      );
  });
  const contactTasks = await call(
    "/smart-lists/visitors-without-contact/tasks",
    {
      personIds: [noContactVisitor.data.id],
      dueOn: "2030-12-20",
      assignedTo: IDS.admin,
    },
    IDS.admin,
  );
  assert.equal(contactTasks.status, 201, JSON.stringify(contactTasks.data));
  assert.equal(contactTasks.data.created.length, 1);
  const taskInbox = await call(
    "/communication/inbox?page=1&pageSize=50",
    undefined,
    IDS.admin,
  );
  assert.equal(taskInbox.status, 200, JSON.stringify(taskInbox.data));
  assert.ok(
    taskInbox.data.items.some(
      (item: Record<string, unknown>) =>
        item.subject === "Nova tarefa atribuída",
    ),
  );
  const taskPortal = await call("/portal", undefined, IDS.admin);
  assert.equal(taskPortal.status, 200, JSON.stringify(taskPortal.data));
  assert.ok(
    taskPortal.data.tasks.some(
      (task: Record<string, unknown>) =>
        task.id === contactTasks.data.created[0],
    ),
  );
  assert.equal(taskPortal.data.taskPagination.page, 1);
  assert.ok(
    taskPortal.data.taskPagination.total >= taskPortal.data.tasks.length,
  );
  const portalTask = taskPortal.data.tasks.find(
    (task: Record<string, unknown>) => task.id === contactTasks.data.created[0],
  );
  const portalDone = await call(
    `/portal/tasks/${portalTask.id}`,
    { status: "done", version: portalTask.version },
    IDS.admin,
    "PATCH",
  );
  assert.equal(portalDone.status, 200, JSON.stringify(portalDone.data));
  const smartAfterContact = await call("/smart-lists", undefined, IDS.admin);
  assert.equal(smartAfterContact.data.visitorContactTasks[0].done >= 1, true);
  assert.equal(smartAfterContact.data.visitorContactTasks[0].unassigned, 0);
  assert.equal(
    smartAfterContact.data.visitorContactPerformance[0].total >= 1,
    true,
  );
  const performanceCsv = await fetch(
    `${base}/api/smart-lists/visitor-contact-performance.csv`,
    {
      headers: {
        Cookie: cookies.get(IDS.admin) ?? "",
        "x-church-id": IDS.churchA,
      },
    },
  );
  assert.equal(performanceCsv.status, 200);
  assert.match(
    await performanceCsv.text(),
    /assigned_to,responsible,total,open,overdue,done,average_days/,
  );
  const contactTasksAgain = await call(
    "/smart-lists/visitors-without-contact/tasks",
    {
      personIds: [noContactVisitor.data.id],
      dueOn: "2030-12-20",
      assignedTo: IDS.admin,
    },
    IDS.admin,
  );
  assert.equal(
    contactTasksAgain.status,
    201,
    JSON.stringify(contactTasksAgain.data),
  );
  assert.equal(contactTasksAgain.data.created.length, 0);
  assert.equal(contactTasksAgain.data.skipped, 1);
  const [contactTask] = await db.transaction((q) =>
    q(
      "SELECT id,version FROM operational_tasks WHERE source_type='visitor_contact' AND person_id=$1",
      [noContactVisitor.data.id],
    ),
  );
  const completedContact = await call(
    `/tasks/${contactTask.id}`,
    { status: "done", version: contactTask.version },
    IDS.admin,
    "PATCH",
  );
  assert.equal(
    completedContact.status,
    200,
    JSON.stringify(completedContact.data),
  );
  const [completedTimestamp] = await db.transaction((q) =>
    q("SELECT completed_at FROM operational_tasks WHERE id=$1", [
      contactTask.id,
    ]),
  );
  assert.ok(completedTimestamp.completed_at);
  assert.equal(saved.data.shared, true);
  const taskView = await call(
    "/saved-views",
    {
      name: "Pendências da secretaria",
      kind: "tasks",
      filters: {
        q: "",
        status: "open",
        scope: "people",
        due: "all",
        campusId: null,
      },
      shared: true,
    },
    IDS.admin,
  );
  assert.equal(taskView.status, 201, JSON.stringify(taskView.data));
  const taskViews = await call("/saved-views?kind=tasks", undefined, IDS.admin);
  assert.equal(taskViews.status, 200);
  assert.ok(
    taskViews.data.some(
      (v: Record<string, unknown>) => v.id === taskView.data.id,
    ),
  );
  const deletedTaskView = await call(
    `/saved-views/${taskView.data.id}`,
    undefined,
    IDS.admin,
    "DELETE",
  );
  assert.equal(
    deletedTaskView.status,
    200,
    JSON.stringify(deletedTaskView.data),
  );
  const deletedSaved = await call(
    `/saved-views/${saved.data.id}`,
    undefined,
    IDS.admin,
    "DELETE",
  );
  assert.equal(deletedSaved.status, 200, JSON.stringify(deletedSaved.data));
  const deletedCommunicationView = await call(
    `/saved-views/${communicationView.data.id}`,
    undefined,
    IDS.admin,
    "DELETE",
  );
  assert.equal(
    deletedCommunicationView.status,
    200,
    JSON.stringify(deletedCommunicationView.data),
  );

  const event = await call(
    "/agenda/events",
    {
      title: "Encontro de integração",
      kind: "event",
      startsAt: "2030-06-01T14:00:00.000Z",
      endsAt: "2030-06-01T16:00:00.000Z",
      weeklyCount: 1,
      resourceIds: [],
      registrationFields: [
        {
          key: "how",
          label: "Como conheceu?",
          type: "select",
          required: true,
          options: ["Instagram", "Indicação"],
        },
      ],
    },
    IDS.admin,
  );
  assert.equal(event.status, 201, JSON.stringify(event.data));
  const eventId = event.data[0].id;
  const editedEvent = await call(
    `/agenda/events/${eventId}`,
    {
      title: "Encontro de integração atualizado",
      capacity: 10,
      publicRegistration: true,
      certificateEnabled: true,
      waitlistEnabled: true,
      registrationFields: [
        {
          key: "how",
          label: "Como conheceu?",
          type: "select",
          required: true,
          options: ["Instagram", "Indicação"],
        },
      ],
    },
    IDS.admin,
    "PATCH",
  );
  assert.equal(editedEvent.status, 200, JSON.stringify(editedEvent.data));
  const eventHistory = await call(
    `/agenda/events/${eventId}/history`,
    undefined,
    IDS.admin,
  );
  assert.equal(eventHistory.status, 200, JSON.stringify(eventHistory.data));
  assert.equal(eventHistory.data.items.length, 1);
  assert.equal(eventHistory.data.items[0].actor_name, "Mariana Costa");
  assert.equal(eventHistory.data.pages, 1);
  assert.equal(
    (
      await call(
        `/agenda/events/${eventId}`,
        { capacity: 0 },
        IDS.admin,
        "PATCH",
      )
    ).status,
    400,
  );
  await db.transaction((q) =>
    q(
      "UPDATE church_events SET capacity=1,waitlist_enabled=true,public_registration=true WHERE id=$1",
      [eventId],
    ),
  );
  const register = (email: string, formData: Record<string, string> = {}) =>
    fetch(`${base}/api/public/events/${eventId}/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestName: email.split("@")[0],
        guestEmail: email,
        formData,
      }),
    }).then(async (r) => ({ status: r.status, data: await r.json() }));
  assert.equal((await register("incompleto@example.invalid")).status, 400);
  assert.equal(
    (await register("um@example.invalid", { how: "Instagram" })).data.status,
    "registered",
  );
  assert.equal(
    (await register("dois@example.invalid", { how: "Indicação" })).data.status,
    "waitlisted",
  );
  const list = await call(
    `/events/${eventId}/registrations`,
    undefined,
    IDS.admin,
  );
  assert.equal(list.status, 200);
  assert.equal(list.data.total, 2);
  assert.equal(list.data.items.length, 2);
  assert.deepEqual(list.data.items[0].form_data, { how: "Instagram" });
  const exportResponse = await fetch(
    `${base}/api/events/${eventId}/registrations.csv?status=registered`,
    {
      headers: {
        Cookie: cookies.get(IDS.admin) ?? "",
        "x-church-id": IDS.churchA,
      },
    },
  );
  const exportText = await exportResponse.text();
  assert.equal(exportResponse.status, 200);
  assert.match(
    exportText,
    /id,name,email,phone,status,payment_status,created_at/,
  );
  assert.match(exportText, /um@example\.invalid/);
  assert.doesNotMatch(exportText, /dois@example\.invalid/);
  const [registrationTask] = await db.transaction((q) =>
    q(
      "SELECT source_type,status FROM operational_tasks WHERE source_type='event_registration' AND source_id=$1",
      [list.data.items[0].id],
    ),
  );
  assert.equal(registrationTask.source_type, "event_registration");
  assert.equal(registrationTask.status, "open");
  const [person] = await db.transaction((q) =>
    q("SELECT id FROM people WHERE church_id=$1 LIMIT 1", [IDS.churchA]),
  );
  const linked = await call(
    `/events/${eventId}/registrations/${list.data.items[0].id}/person`,
    { personId: person.id },
    IDS.admin,
    "PATCH",
  );
  assert.equal(linked.status, 200, JSON.stringify(linked.data));
  const [linkedTask] = await db.transaction((q) =>
    q(
      "SELECT person_id FROM operational_tasks WHERE source_type='event_registration' AND source_id=$1",
      [list.data.items[0].id],
    ),
  );
  assert.equal(linkedTask.person_id, person.id);
  const cancelled = await call(
    `/registrations/${list.data.items[0].id}/cancel`,
    {},
    IDS.admin,
  );
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  const promoted = await call(
    `/events/${eventId}/registrations?status=registered`,
    undefined,
    IDS.admin,
  );
  assert.equal(promoted.status, 200, JSON.stringify(promoted.data));
  assert.equal(promoted.data.total, 1);
  assert.equal(promoted.data.items[0].guest_email, "dois@example.invalid");

  const workflow = await call(
    "/workflows",
    {
      name: "Acolhimento de visitantes",
      trigger: "visitor",
      steps: [
        { title: "Fazer primeiro contato", dueDays: 1 },
        { title: "Agendar conversa", dueDays: 7 },
      ],
    },
    IDS.admin,
  );
  assert.equal(workflow.status, 201, JSON.stringify(workflow.data));
  const updatedWorkflow = await call(
    `/workflows/${workflow.data.id}`,
    {
      name: "Acolhimento de visitantes atualizado",
      trigger: "visitor",
      steps: [
        { title: "Fazer contato inicial", dueDays: 1 },
        { title: "Agendar conversa", dueDays: 4 },
        { title: "Registrar próximo passo", dueDays: 8 },
      ],
    },
    IDS.admin,
    "PUT",
  );
  assert.equal(
    updatedWorkflow.status,
    200,
    JSON.stringify(updatedWorkflow.data),
  );
  assert.equal(
    updatedWorkflow.data.name,
    "Acolhimento de visitantes atualizado",
  );
  const pausedWorkflow = await call(
    `/workflows/${workflow.data.id}`,
    { active: false },
    IDS.admin,
    "PATCH",
  );
  assert.equal(pausedWorkflow.status, 200, JSON.stringify(pausedWorkflow.data));
  const blockedStart = await call(
    `/workflows/${workflow.data.id}/start`,
    { personId: person.id },
    IDS.admin,
  );
  assert.equal(blockedStart.status, 404, JSON.stringify(blockedStart.data));
  const activeWorkflow = await call(
    `/workflows/${workflow.data.id}`,
    { active: true },
    IDS.admin,
    "PATCH",
  );
  assert.equal(activeWorkflow.status, 200, JSON.stringify(activeWorkflow.data));
  const createdVisitor = await call(
    "/people",
    {
      name: "Visitante com automação",
      email: "visitante@example.invalid",
      status: "visitor",
    },
    IDS.admin,
  );
  assert.equal(createdVisitor.status, 201, JSON.stringify(createdVisitor.data));
  const [triggered] = await db.transaction((q) =>
    q("SELECT wi.id FROM workflow_instances wi WHERE wi.person_id=$1", [
      createdVisitor.data.id,
    ]),
  );
  assert.ok(
    triggered,
    "o workflow de visitante deveria iniciar automaticamente",
  );
  const [workflowTask] = await db.transaction((q) =>
    q(
      "SELECT workflow_instance_id,status FROM operational_tasks WHERE workflow_instance_id=$1",
      [triggered.id],
    ),
  );
  assert.equal(workflowTask?.workflow_instance_id, triggered.id);
  assert.equal(workflowTask?.status, "open");
  const [triggerJob] = await db.transaction((q) =>
    q(
      "SELECT status,attempts FROM workflow_trigger_jobs WHERE person_id=$1 AND trigger='visitor'",
      [createdVisitor.data.id],
    ),
  );
  assert.equal(triggerJob?.status, "done");
  const started = await call(
    `/workflows/${workflow.data.id}/start`,
    { personId: person.id },
    IDS.admin,
  );
  assert.equal(started.status, 201, JSON.stringify(started.data));
  const memberWorkflow = await call(
    `/workflows/${workflow.data.id}/start`,
    { personId: memberPerson.id },
    IDS.admin,
  );
  assert.equal(memberWorkflow.status, 201, JSON.stringify(memberWorkflow.data));
  const unifiedOverview = await call(
    `/people/${memberPerson.id}/overview`,
    undefined,
    IDS.admin,
  );
  assert.equal(
    unifiedOverview.status,
    200,
    JSON.stringify(unifiedOverview.data),
  );
  assert.equal(unifiedOverview.data.person.id, memberPerson.id);
  assert.ok(Array.isArray(unifiedOverview.data.household));
  assert.ok(Array.isArray(unifiedOverview.data.cells));
  assert.ok(Array.isArray(unifiedOverview.data.events));
  assert.ok(Array.isArray(unifiedOverview.data.education));
  assert.ok(Array.isArray(unifiedOverview.data.teams));
  assert.ok(Array.isArray(unifiedOverview.data.workflows));
  assert.ok(
    unifiedOverview.data.workflows.some(
      (item: Record<string, unknown>) => item.id === memberWorkflow.data.id,
    ),
  );
  assert.ok(Array.isArray(unifiedOverview.data.tasks));
  assert.equal("amount_cents" in (unifiedOverview.data.events[0] ?? {}), false);
  assert.equal("pastoralNotes" in unifiedOverview.data, false);
  assert.equal("financial" in unifiedOverview.data, false);
  const foreignOverview = await call(
    `/people/${memberPerson.id}/overview`,
    undefined,
    IDS.adminB,
    "GET",
    IDS.churchB,
  );
  assert.ok(
    [403, 404].includes(foreignOverview.status),
    JSON.stringify(foreignOverview.data),
  );
  const memberPortal = await call("/portal", undefined, IDS.member);
  assert.equal(memberPortal.status, 200, JSON.stringify(memberPortal.data));
  assert.ok(
    memberPortal.data.workflows.some(
      (item: Record<string, unknown>) => item.id === memberWorkflow.data.id,
    ),
  );
  const [alternateOwner] = await db.transaction((q) =>
    q(
      "SELECT user_id FROM memberships WHERE church_id=$1 AND user_id<>$2 ORDER BY user_id LIMIT 1",
      [IDS.churchA, IDS.admin],
    ),
  );
  assert.ok(alternateOwner, "a igreja de teste precisa de outro responsável");
  const reassigned = await call(
    `/workflow-instances/${started.data.id}`,
    {
      currentStep: 0,
      status: "open",
      version: started.data.version,
      ownerId: alternateOwner.user_id,
      note: "Reatribuição de teste.",
    },
    IDS.admin,
    "PATCH",
  );
  assert.equal(reassigned.status, 200, JSON.stringify(reassigned.data));
  assert.equal(reassigned.data.owner_id, alternateOwner.user_id);
  const workflowHistory = await call(
    `/workflow-instances/${started.data.id}/history`,
    undefined,
    IDS.admin,
  );
  assert.equal(
    workflowHistory.status,
    200,
    JSON.stringify(workflowHistory.data),
  );
  assert.ok(
    workflowHistory.data.items.some(
      (entry: Record<string, unknown>) =>
        entry.note === "Reatribuição de teste.",
    ),
  );
  assert.equal(workflowHistory.data.pages, 1);
  const [reassignedTask] = await db.transaction((q) =>
    q(
      "SELECT assigned_to FROM operational_tasks WHERE workflow_instance_id=$1 AND status IN ('open','in_progress') ORDER BY created_at DESC LIMIT 1",
      [started.data.id],
    ),
  );
  assert.equal(reassignedTask?.assigned_to, alternateOwner.user_id);
  const filteredWorkflows = await call(
    "/workflows?status=open&page=1&pageSize=1",
    undefined,
    IDS.admin,
  );
  assert.equal(
    filteredWorkflows.status,
    200,
    JSON.stringify(filteredWorkflows.data),
  );
  assert.equal(filteredWorkflows.data.instances.pageSize, 1);
  assert.ok(
    filteredWorkflows.data.instances.items.every(
      (item: Record<string, unknown>) => item.status === "open",
    ),
  );
  const overdueWorkflows = await call(
    "/workflows?due=overdue",
    undefined,
    IDS.admin,
  );
  assert.equal(
    overdueWorkflows.status,
    200,
    JSON.stringify(overdueWorkflows.data),
  );
  assert.ok(
    overdueWorkflows.data.instances.items.every(
      (item: Record<string, unknown>) => item.status === "open",
    ),
  );
  const moved = await call(
    `/workflow-instances/${started.data.id}`,
    { currentStep: 1, status: "open", version: reassigned.data.version },
    IDS.admin,
    "PATCH",
  );
  assert.equal(moved.status, 200, JSON.stringify(moved.data));
  const workflowCancelled = await call(
    `/workflow-instances/${started.data.id}`,
    {
      currentStep: 1,
      status: "cancelled",
      version: moved.data.version,
      note: "Cancelamento de teste.",
    },
    IDS.admin,
    "PATCH",
  );
  assert.equal(
    workflowCancelled.status,
    200,
    JSON.stringify(workflowCancelled.data),
  );
  const [cancelledTask] = await db.transaction((q) =>
    q(
      "SELECT status FROM operational_tasks WHERE workflow_instance_id=$1 ORDER BY created_at DESC LIMIT 1",
      [started.data.id],
    ),
  );
  assert.equal(cancelledTask?.status, "cancelled");
});

test("cupons de evento aplicam desconto, limite de uso e valor Pix", async () => {
  const event = await call(
    "/agenda/events",
    {
      title: "Conferência com cupom",
      kind: "event",
      startsAt: "2030-10-01T14:00:00.000Z",
      endsAt: "2030-10-01T17:00:00.000Z",
      publicRegistration: true,
      priceCents: 1000,
    },
    IDS.admin,
  );
  assert.equal(event.status, 201, JSON.stringify(event.data));
  const eventId = event.data[0].id;
  const coupon = await call(
    `/events/${eventId}/coupons`,
    { code: "BETA25", discountKind: "percent", value: 25, maxUses: 1 },
    IDS.admin,
  );
  assert.equal(coupon.status, 201, JSON.stringify(coupon.data));
  const invalid = await fetch(`${base}/api/public/events/${eventId}/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      guestName: "Cupom inválido",
      guestEmail: "cupom-invalido@example.invalid",
      couponCode: "NOPE",
    }),
  });
  assert.equal(invalid.status, 400);
  const registered = await fetch(
    `${base}/api/public/events/${eventId}/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestName: "Cupom válido",
        guestEmail: "cupom-valido@example.invalid",
        couponCode: "beta25",
      }),
    },
  );
  const registeredData = await registered.json();
  assert.equal(registered.status, 201, JSON.stringify(registeredData));
  assert.equal(registeredData.payment.amount_cents, 750);
  await processIntegrationJob(db, new Efi([]), registeredData.payment.id);
  const [saved] = await db.transaction((q) =>
    q(
      "SELECT amount_cents,discount_cents,coupon_id FROM event_registrations WHERE event_id=$1 AND guest_email=$2",
      [eventId, "cupom-valido@example.invalid"],
    ),
  );
  assert.equal(Number(saved.amount_cents), 750);
  assert.equal(Number(saved.discount_cents), 250);
  const [used] = await db.transaction((q) =>
    q("SELECT used_count FROM event_coupons WHERE id=$1", [coupon.data.id]),
  );
  assert.equal(Number(used.used_count), 1);
  const exhausted = await fetch(
    `${base}/api/public/events/${eventId}/register`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        guestName: "Cupom esgotado",
        guestEmail: "cupom-esgotado@example.invalid",
        couponCode: "BETA25",
      }),
    },
  );
  assert.equal(exhausted.status, 400);
});

test("evento registra presença e emite certificado idempotente", async () => {
  const event = await call("/agenda/events", {
    title: "Seminário de liderança",
    kind: "event",
    startsAt: "2030-09-01T14:00:00.000Z",
    endsAt: "2030-09-01T17:00:00.000Z",
    certificateEnabled: true,
    priceCents: 2500,
    publicRegistration: false,
  });
  assert.equal(event.status, 201, JSON.stringify(event.data));
  const [person] = await db.transaction((q) =>
    q("SELECT id FROM people WHERE church_id=$1 LIMIT 1", [IDS.churchA]),
  );
  const registration = await call(`/events/${event.data[0].id}/registrations`, {
    personId: person.id,
  });
  assert.equal(registration.status, 201, JSON.stringify(registration.data));
  assert.equal(registration.data.payment_status, "pending");
  await processIntegrationJob(db, new Efi([]));
  await settle(db, {
    provider: "demo",
    account: "demo",
    txid: registration.data.payment.txid,
    endToEndId: `event-${registration.data.id}`,
    amount: 2500,
  });
  const [paid] = await db.transaction((q) =>
    q("SELECT payment_status FROM event_registrations WHERE id=$1", [
      registration.data.id,
    ]),
  );
  assert.equal(paid.payment_status, "paid");
  const [secondPerson] = await db.transaction((q) =>
    q("SELECT id FROM people WHERE church_id=$1 AND id<>$2 LIMIT 1", [
      IDS.churchA,
      person.id,
    ]),
  );
  const secondRegistration = await call(
    `/events/${event.data[0].id}/registrations`,
    { personId: secondPerson.id },
  );
  assert.equal(
    secondRegistration.status,
    201,
    JSON.stringify(secondRegistration.data),
  );
  await processIntegrationJob(
    db,
    new Efi([]),
    secondRegistration.data.payment.id,
  );
  await settle(db, {
    provider: "demo",
    account: "demo",
    txid: secondRegistration.data.payment.txid,
    endToEndId: `event-${secondRegistration.data.id}`,
    amount: 2500,
  });
  const cancelledPaid = await call(
    `/registrations/${secondRegistration.data.id}/cancel`,
    {},
    IDS.admin,
    "POST",
  );
  assert.equal(cancelledPaid.status, 200, JSON.stringify(cancelledPaid.data));
  assert.equal(cancelledPaid.data.refundRequired, true);
  const [refundTask] = await db.transaction((q) =>
    q(
      "SELECT status FROM operational_tasks WHERE source_type='event_refund' AND source_id=$1",
      [secondRegistration.data.id],
    ),
  );
  assert.equal(refundTask.status, "open");
  const refund = await call(
    `/demo/refund/${secondRegistration.data.payment.id}`,
    {},
    IDS.admin,
    "POST",
  );
  assert.equal(refund.status, 200, JSON.stringify(refund.data));
  const [refundedRegistration, refundedTask] = await db.transaction(
    async (q) => {
      const [r] = await q(
        "SELECT payment_status FROM event_registrations WHERE id=$1",
        [secondRegistration.data.id],
      );
      const [t] = await q(
        "SELECT status FROM operational_tasks WHERE source_type='event_refund' AND source_id=$1",
        [secondRegistration.data.id],
      );
      return [r, t];
    },
  );
  assert.equal(refundedRegistration.payment_status, "refunded");
  assert.equal(refundedTask.status, "done");
  const attended = await call(
    `/events/${event.data[0].id}/registrations/${registration.data.id}/attendance`,
    { attended: true },
  );
  assert.equal(attended.status, 200, JSON.stringify(attended.data));
  assert.equal(attended.data.registration.status, "attended");
  assert.match(attended.data.certificate.code, /^ECL-EVT-/);
  const repeated = await call(
    `/events/${event.data[0].id}/registrations/${registration.data.id}/attendance`,
    { attended: true },
  );
  assert.equal(repeated.status, 200, JSON.stringify(repeated.data));
  const certificates = await call(
    `/events/${event.data[0].id}/certificates?page=1&pageSize=1`,
    undefined,
    IDS.admin,
  );
  assert.equal(certificates.status, 200, JSON.stringify(certificates.data));
  assert.equal(certificates.data.items.length, 1);
  assert.equal(certificates.data.pageSize, 1);
  const certificateCsv = await fetch(
    `${base}/api/events/${event.data[0].id}/certificates.csv`,
    {
      headers: {
        Cookie: cookies.get(IDS.admin) ?? "",
        "x-church-id": IDS.churchA,
      },
    },
  );
  assert.equal(certificateCsv.status, 200);
  assert.match(await certificateCsv.text(), /recipient_name/);
});

test("ensino conecta curso, turma, frequência e certificado", async () => {
  const course = await call("/education/courses", {
    name: "Escola de discipulado",
    description: "Fundamentos da fé e da vida comunitária.",
    completionPercent: 75,
  });
  assert.equal(course.status, 201, JSON.stringify(course.data));
  const [person] = await db.transaction((q) =>
    q("SELECT id FROM people WHERE church_id=$1 LIMIT 1", [IDS.churchA]),
  );
  const clazz = await call("/education/classes", {
    courseId: course.data.id,
    name: "Turma de domingo",
    startsOn: "2030-07-01",
    capacity: 20,
    publicCatalog: true,
  });
  assert.equal(clazz.status, 201, JSON.stringify(clazz.data));
  const publicCatalog = await fetch(
    `${base}/api/public/catalog/${IDS.churchA}?kind=courses&page=1&pageSize=10`,
  );
  const publicCatalogData = await publicCatalog.json();
  assert.equal(publicCatalog.status, 200, JSON.stringify(publicCatalogData));
  assert.ok(
    publicCatalogData.courses.some((item: any) => item.id === clazz.data.id),
  );
  const unpublished = await call(
    `/education/classes/${clazz.data.id}`,
    { publicCatalog: false },
    IDS.admin,
    "PATCH",
  );
  assert.equal(unpublished.status, 200, JSON.stringify(unpublished.data));
  const hiddenCatalog = await fetch(
    `${base}/api/public/catalog/${IDS.churchA}?kind=courses&page=1&pageSize=10`,
  ).then((r) => r.json());
  assert.equal(
    hiddenCatalog.courses.some((item: any) => item.id === clazz.data.id),
    false,
  );
  const unauthorizedPublication = await call(
    `/education/classes/${clazz.data.id}`,
    { publicCatalog: true },
    IDS.member,
    "PATCH",
  );
  assert.equal(unauthorizedPublication.status, 403);
  const republished = await call(
    `/education/classes/${clazz.data.id}`,
    { publicCatalog: true },
    IDS.admin,
    "PATCH",
  );
  assert.equal(republished.status, 200, JSON.stringify(republished.data));
  const interestResponse = await fetch(
    `${base}/api/public/education/classes/${clazz.data.id}/interest`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Visitante do curso",
        email: "curso.visitante@example.invalid",
        phone: "11999990000",
        message: "Gostaria de receber informações.",
        consent: true,
      }),
    },
  );
  const interest = await interestResponse.json();
  assert.equal(interestResponse.status, 201, JSON.stringify(interest));
  const duplicateInterestResponse = await fetch(
    `${base}/api/public/education/classes/${clazz.data.id}/interest`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Visitante do curso",
        email: "CURSO.VISITANTE@example.invalid",
        consent: true,
      }),
    },
  );
  const duplicateInterest = await duplicateInterestResponse.json();
  assert.equal(
    duplicateInterestResponse.status,
    201,
    JSON.stringify(duplicateInterest),
  );
  assert.equal(duplicateInterest.id, interest.id);
  const interestQueue = await call("/education/interests?page=1&pageSize=10");
  assert.equal(interestQueue.status, 200, JSON.stringify(interestQueue.data));
  assert.ok(
    interestQueue.data.items.some((item: any) => item.id === interest.id),
  );
  const interestCsv = await fetch(
    `${base}/api/education/interests/export.csv?status=pending`,
    {
      headers: {
        Cookie: cookies.get(IDS.admin) ?? "",
        "x-church-id": IDS.churchA,
      },
    },
  );
  assert.equal(interestCsv.status, 200);
  assert.match(await interestCsv.text(), /course_name,class_name,status/);
  const [interestTask] = await db.transaction((q) =>
    q(
      "SELECT id,status,source_type FROM operational_tasks WHERE source_type=$1 AND source_id=$2",
      ["education_interest", interest.id],
    ),
  );
  assert.equal(interestTask.source_type, "education_interest");
  assert.equal(interestTask.status, "open");
  const markedContacted = await call(
    `/education/interests/${interest.id}`,
    { status: "contacted" },
    IDS.admin,
    "PATCH",
  );
  assert.equal(
    markedContacted.status,
    200,
    JSON.stringify(markedContacted.data),
  );
  assert.equal(markedContacted.data.status, "contacted");
  const closedInterest = await call(
    `/education/interests/${interest.id}`,
    { status: "closed" },
    IDS.admin,
    "PATCH",
  );
  assert.equal(closedInterest.status, 200, JSON.stringify(closedInterest.data));
  const [closedTask] = await db.transaction((q) =>
    q("SELECT status FROM operational_tasks WHERE id=$1", [interestTask.id]),
  );
  assert.equal(closedTask.status, "done");
  const material = await call(
    `/education/courses/${course.data.id}/materials`,
    {
      title: "Apostila de fundamentos",
      kind: "link",
      location: "https://example.invalid/apostila",
    },
  );
  assert.equal(material.status, 201, JSON.stringify(material.data));
  const invalidMaterial = await call(
    `/education/courses/${course.data.id}/materials`,
    {
      title: "Link inválido",
      kind: "link",
      location: "javascript:alert(1)",
    },
  );
  assert.equal(
    invalidMaterial.status,
    400,
    JSON.stringify(invalidMaterial.data),
  );
  const assessment = await call(
    `/education/classes/${clazz.data.id}/assessments`,
    {
      title: "Avaliação de fundamentos",
      maxScore: 10,
      published: true,
    },
  );
  assert.equal(assessment.status, 201, JSON.stringify(assessment.data));
  const assessmentRoster = await call(
    `/education/assessments/${assessment.data.id}/enrollments`,
  );
  assert.equal(
    assessmentRoster.status,
    200,
    JSON.stringify(assessmentRoster.data),
  );
  const enrollment = await call(`/education/classes/${clazz.data.id}/enroll`, {
    personId: person.id,
  });
  assert.equal(enrollment.status, 201, JSON.stringify(enrollment.data));
  const populatedAssessmentRoster = await call(
    `/education/assessments/${assessment.data.id}/enrollments`,
  );
  assert.ok(
    populatedAssessmentRoster.data.some(
      (item: any) => item.id === enrollment.data.id,
    ),
  );
  const classRoster = await call(
    `/education/classes/${clazz.data.id}/enrollments`,
  );
  assert.equal(classRoster.status, 200, JSON.stringify(classRoster.data));
  assert.ok(
    classRoster.data.some((item: any) => item.id === enrollment.data.id),
  );
  const session = await call(`/education/classes/${clazz.data.id}/sessions`, {
    heldOn: "2030-07-07",
    topic: "Fundamentos",
    attendance: [{ enrollmentId: enrollment.data.id, present: true }],
  });
  assert.equal(session.status, 201, JSON.stringify(session.data));
  const graded = await call(
    `/education/assessments/${assessment.data.id}/results`,
    {
      enrollmentId: enrollment.data.id,
      score: 9,
      feedback: "Excelente compreensão.",
    },
  );
  assert.equal(graded.status, 201, JSON.stringify(graded.data));
  const education = await call("/education");
  assert.equal(education.status, 200, JSON.stringify(education.data));
  const educationPage = await call(
    "/education?coursePage=1&coursePageSize=1&classPage=1&classPageSize=1&materialPage=1&materialPageSize=1&assessmentPage=1&assessmentPageSize=1",
  );
  assert.equal(educationPage.status, 200, JSON.stringify(educationPage.data));
  assert.equal(educationPage.data.coursesPagination.total, 1);
  assert.equal(educationPage.data.classesPagination.total, 1);
  assert.equal(educationPage.data.materialsPagination.total, 1);
  assert.equal(educationPage.data.assessmentsPagination.total, 1);
  assert.equal(educationPage.data.courses.length, 1);
  const instructors = await call("/education/instructors");
  assert.equal(instructors.status, 200, JSON.stringify(instructors.data));
  assert.ok(instructors.data.some((item: any) => item.id === IDS.admin));
  const enrollmentPage = await call("/education/enrollments?page=1&pageSize=1");
  assert.equal(enrollmentPage.status, 200, JSON.stringify(enrollmentPage.data));
  assert.equal(enrollmentPage.data.pageSize, 1);
  assert.ok(enrollmentPage.data.total >= enrollmentPage.data.items.length);
  const sessionPage = await call("/education/sessions?page=1&pageSize=1");
  assert.equal(sessionPage.status, 200, JSON.stringify(sessionPage.data));
  assert.equal(sessionPage.data.pageSize, 1);
  assert.ok(
    sessionPage.data.items.some((item: any) => item.id === session.data.id),
  );
  const resultsPage = await call("/education/results?page=1&pageSize=1");
  assert.equal(resultsPage.status, 200, JSON.stringify(resultsPage.data));
  assert.equal(resultsPage.data.pageSize, 1);
  assert.ok(
    resultsPage.data.items.some((item: any) => item.id === graded.data.id),
  );
  const certificatesPage = await call(
    "/education/certificates?page=1&pageSize=1",
  );
  assert.equal(
    certificatesPage.status,
    200,
    JSON.stringify(certificatesPage.data),
  );
  assert.equal(
    education.data.enrollments.find((e: any) => e.id === enrollment.data.id)
      .status,
    "completed",
  );
  const [certificate] = await db.transaction((q) =>
    q(
      "SELECT code FROM education_certificates WHERE class_id=$1 AND person_id=$2",
      [clazz.data.id, person.id],
    ),
  );
  assert.match(certificate.code, /^ECL-/);
});

test("ministério registra treinamento e substituição auditada de escala", async () => {
  const leaderToken = randomUUID();
  cookies.set(leader, `ecclesia_session=${leaderToken}`);
  await db.transaction((q) =>
    q(
      "INSERT INTO sessions(token_hash,user_id,expires_at,mfa) VALUES($1,$2,now()+interval '1 hour',true)",
      [hash(leaderToken), leader],
    ),
  );
  const team = await call("/agenda/teams", { name: "Recepção dominical" });
  assert.equal(team.status, 201, JSON.stringify(team.data));
  for (const userId of [leader, IDS.admin]) {
    const member = await call(`/agenda/teams/${team.data.id}/members`, {
      userId,
      role: userId === leader ? "Recepção" : "Coordenador",
    });
    assert.equal(member.status, 200, JSON.stringify(member.data));
  }
  const training = await call("/agenda/training", {
    userId: leader,
    teamId: team.data.id,
    name: "Acolhimento e segurança",
    completedAt: "2030-08-01",
    expiresAt: "2031-08-01",
  });
  assert.equal(training.status, 201, JSON.stringify(training.data));
  const event = await call("/agenda/events", {
    title: "Culto de treinamento",
    kind: "service",
    startsAt: "2030-08-10T13:00:00.000Z",
    endsAt: "2030-08-10T15:00:00.000Z",
    weeklyCount: 1,
    resourceIds: [],
  });
  assert.equal(event.status, 201, JSON.stringify(event.data));
  const requirement = await call("/agenda/training-requirements", {
    teamId: team.data.id,
    name: "Proteção infantil",
  });
  assert.equal(requirement.status, 201, JSON.stringify(requirement.data));
  const schedule = await call("/agenda/schedules", {
    eventId: event.data[0].id,
    teamId: team.data.id,
    userId: leader,
  });
  assert.equal(schedule.status, 409);
  const scheduledWithException = await call("/agenda/schedules", {
    eventId: event.data[0].id,
    teamId: team.data.id,
    userId: leader,
    overrideReason: "Exceção autorizada pelo coordenador da equipe.",
  });
  assert.equal(
    scheduledWithException.status,
    201,
    JSON.stringify(scheduledWithException.data),
  );
  const request = await call(
    `/agenda/schedules/${scheduledWithException.data.id}/substitutions`,
    { substituteUserId: IDS.admin, reason: "Compromisso familiar" },
    leader,
  );
  assert.equal(request.status, 201, JSON.stringify(request.data));
  const accepted = await call(
    `/agenda/substitutions/${request.data.id}`,
    { status: "accepted" },
    IDS.admin,
    "PATCH",
  );
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const [updated] = await db.transaction((q) =>
    q("SELECT user_id,response FROM schedules WHERE id=$1", [
      scheduledWithException.data.id,
    ]),
  );
  assert.equal(updated.user_id, IDS.admin);
  assert.equal(updated.response, "accepted");
});

test("planejamento de culto mantém ordem, ensaio e materiais por celebração", async () => {
  const team = await call("/agenda/teams", { name: "Banda do culto" });
  assert.equal(team.status, 201, JSON.stringify(team.data));
  const teamMember = await call(`/agenda/teams/${team.data.id}/members`, {
    userId: IDS.member,
    role: "Músico",
  });
  assert.equal(teamMember.status, 200, JSON.stringify(teamMember.data));
  const event = await call("/agenda/events", {
    title: "Culto com escala",
    kind: "service",
    startsAt: "2030-09-08T13:00:00.000Z",
    endsAt: "2030-09-08T15:00:00.000Z",
    resourceIds: [],
  });
  assert.equal(event.status, 201, JSON.stringify(event.data));
  const schedule = await call("/agenda/schedules", {
    eventId: event.data[0].id,
    teamId: team.data.id,
    userId: IDS.member,
  });
  assert.equal(schedule.status, 201, JSON.stringify(schedule.data));
  const linked = await call("/worship/services", {
    title: "Culto com equipe",
    scheduledOn: "2030-09-08",
    eventId: event.data[0].id,
  });
  assert.equal(linked.status, 201, JSON.stringify(linked.data));
  const unscheduled = await call(`/worship/services/${linked.data.id}/items`, {
    position: 1,
    kind: "song",
    title: "Canção sem escala",
    leaderId: IDS.admin,
  });
  assert.equal(unscheduled.status, 409, JSON.stringify(unscheduled.data));
  const scheduled = await call(`/worship/services/${linked.data.id}/items`, {
    position: 1,
    kind: "song",
    title: "Canção escalada",
    leaderId: IDS.member,
  });
  assert.equal(scheduled.status, 201, JSON.stringify(scheduled.data));

  const service = await call("/worship/services", {
    title: "Culto de gratidão",
    scheduledOn: "2030-09-01",
    startsAt: "2030-09-01T13:00:00.000Z",
    endsAt: "2030-09-01T15:00:00.000Z",
  });
  assert.equal(service.status, 201, JSON.stringify(service.data));
  const item = await call(`/worship/services/${service.data.id}/items`, {
    position: 1,
    kind: "song",
    title: "Canção de abertura",
    leaderId: IDS.admin,
    durationMinutes: 5,
  });
  assert.equal(item.status, 201, JSON.stringify(item.data));
  const rehearsal = await call(
    `/worship/services/${service.data.id}/rehearsals`,
    {
      startsAt: "2030-08-31T13:00:00.000Z",
      endsAt: "2030-08-31T14:30:00.000Z",
      location: "Salão principal",
    },
  );
  assert.equal(rehearsal.status, 201, JSON.stringify(rehearsal.data));
  const file = await call(`/worship/services/${service.data.id}/files`, {
    name: "Roteiro do culto",
    url: "/documentos/roteiro-culto.pdf",
    kind: "material",
  });
  assert.equal(file.status, 201, JSON.stringify(file.data));
  const plan = await call("/worship");
  assert.equal(plan.status, 200, JSON.stringify(plan.data));
  assert.ok(plan.data.servicePagination);
  const pagedPlan = await call("/worship?page=1&pageSize=1");
  assert.equal(pagedPlan.status, 200, JSON.stringify(pagedPlan.data));
  assert.equal(pagedPlan.data.servicePagination.pageSize, 1);
  assert.ok(pagedPlan.data.services.length <= 1);
  assert.equal(
    plan.data.items.some(
      (v: Record<string, unknown>) => v.title === "Canção de abertura",
    ),
    true,
  );
  assert.equal(plan.data.rehearsals[0].location, "Salão principal");
  assert.equal(plan.data.files[0].name, "Roteiro do culto");
  assert.equal(
    plan.data.schedules.some(
      (v: Record<string, unknown>) =>
        v.event_id === event.data[0].id && v.user_id === IDS.member,
    ),
    true,
  );
});

test("Kids exige responsável autorizado e token único para retirada", async () => {
  const people = await db.transaction((q) =>
    q("SELECT id FROM people WHERE church_id=$1 ORDER BY name LIMIT 2", [
      IDS.churchA,
    ]),
  );
  const child = await call("/kids/children", {
    personId: people[0].id,
    birthDate: "2020-05-10",
    medicalNotes: "Alergia a amendoim",
  });
  assert.equal(child.status, 201, JSON.stringify(child.data));
  const guardian = await call(`/kids/children/${child.data.id}/guardians`, {
    guardianPersonId: people[1].id,
    relationship: "Responsável",
  });
  assert.equal(guardian.status, 201, JSON.stringify(guardian.data));
  const authorized = await call(
    `/kids/guardians/${guardian.data.id}`,
    { authorized: true },
    IDS.admin,
    "PATCH",
  );
  assert.equal(authorized.status, 200, JSON.stringify(authorized.data));
  const session = await call("/kids/sessions", {
    name: "Kids · culto especial",
    startsAt: "2030-10-06T13:00:00.000Z",
    endsAt: "2030-10-06T15:00:00.000Z",
    room: "Sala azul",
    capacity: 20,
  });
  assert.equal(session.status, 201, JSON.stringify(session.data));
  const conflictingSession = await call("/kids/sessions", {
    name: "Kids · conflito de sala",
    startsAt: "2030-10-06T14:00:00.000Z",
    endsAt: "2030-10-06T16:00:00.000Z",
    room: "Sala azul",
    capacity: 20,
  });
  assert.equal(
    conflictingSession.status,
    409,
    JSON.stringify(conflictingSession.data),
  );
  const checkin = await call(`/kids/sessions/${session.data.id}/check-in`, {
    childId: child.data.id,
    guardianId: guardian.data.id,
  });
  assert.equal(checkin.status, 201, JSON.stringify(checkin.data));
  assert.ok(checkin.data.pickupToken);
  const activeKids = await call("/kids");
  assert.equal(activeKids.status, 200, JSON.stringify(activeKids.data));
  assert.ok(
    activeKids.data.checkins.some((item: any) => item.id === checkin.data.id),
  );
  assert.ok(
    activeKids.data.sessions.some((item: any) => item.id === session.data.id),
  );
  const printer = await call("/kids/printers", {
    name: "Zebra recepção",
    brand: "zebra",
    model: "ZD421",
    connection: "worker",
  });
  assert.equal(printer.status, 201, JSON.stringify(printer.data));
  const print = await call(`/kids/checkins/${checkin.data.id}/print`, {
    printerId: printer.data.id,
  });
  assert.equal(print.status, 201, JSON.stringify(print.data));
  assert.equal(print.data.format, "zpl");
  const printQueue = await call("/kids/print-jobs?page=1&pageSize=1");
  assert.equal(printQueue.status, 200, JSON.stringify(printQueue.data));
  assert.equal(printQueue.data.pageSize, 1);
  assert.ok(
    printQueue.data.items.some(
      (job: Record<string, unknown>) => job.id === print.data.id,
    ),
  );
  const queuedPrints = await call(
    "/kids/print-jobs?page=1&pageSize=25&status=queued",
  );
  assert.equal(queuedPrints.status, 200, JSON.stringify(queuedPrints.data));
  assert.ok(
    queuedPrints.data.items.some(
      (job: Record<string, unknown>) => job.id === print.data.id,
    ),
  );
  const invalid = await call(`/kids/checkouts/${checkin.data.id}`, {
    pickupToken: "token-invalido",
  });
  assert.equal(invalid.status, 403, JSON.stringify(invalid.data));
  const checkout = await call(`/kids/checkouts/${checkin.data.id}`, {
    pickupToken: checkin.data.pickupToken,
    pickupGuardianId: guardian.data.id,
  });
  assert.equal(checkout.status, 200, JSON.stringify(checkout.data));
  const reused = await call(`/kids/checkouts/${checkin.data.id}`, {
    pickupToken: checkin.data.pickupToken,
  });
  assert.equal(reused.status, 404, JSON.stringify(reused.data));
  const [stored] = await db.transaction((q) =>
    q("SELECT medical_notes_encrypted FROM kids_children WHERE id=$1", [
      child.data.id,
    ]),
  );
  assert.ok(stored.medical_notes_encrypted);
  assert.notEqual(stored.medical_notes_encrypted, "Alergia a amendoim");
  const checkinHistory = await call("/kids/checkins?page=1&pageSize=1");
  assert.equal(checkinHistory.status, 200, JSON.stringify(checkinHistory.data));
  assert.equal(checkinHistory.data.pageSize, 1);
  assert.ok(checkinHistory.data.total >= 1);
  const sessionHistory = await call("/kids/sessions?page=1&pageSize=1");
  assert.equal(sessionHistory.status, 200, JSON.stringify(sessionHistory.data));
  assert.equal(sessionHistory.data.pageSize, 1);
  assert.ok(
    sessionHistory.data.items.some((item: any) => item.id === session.data.id),
  );
  const closed = await call(
    `/kids/sessions/${session.data.id}`,
    { status: "closed" },
    IDS.admin,
    "PATCH",
  );
  assert.equal(closed.status, 200, JSON.stringify(closed.data));
  const afterClose = await call(`/kids/sessions/${session.data.id}/check-in`, {
    childId: child.data.id,
    guardianId: guardian.data.id,
  });
  assert.equal(afterClose.status, 404, JSON.stringify(afterClose.data));
});

test("governança institucional separa filiação, credencial e anuidade", async () => {
  const people = await db.transaction((q) =>
    q("SELECT id FROM people WHERE church_id=$1 ORDER BY name LIMIT 1", [
      IDS.churchA,
    ]),
  );
  const affiliation = await call(
    "/institutional/affiliation",
    {
      officialNumber: "CONV-2040",
      status: "active",
      joinedOn: "2030-01-15",
      notes: "Filiação aprovada em assembleia.",
    },
    IDS.admin,
    "PUT",
  );
  assert.equal(affiliation.status, 200, JSON.stringify(affiliation.data));
  const ministry = await call("/institutional/ministries", {
    personId: people[0].id,
    ministryRole: "Ministro credenciado",
    startsOn: "2030-02-01",
    status: "active",
  });
  assert.equal(ministry.status, 201, JSON.stringify(ministry.data));
  const credential = await call("/institutional/credentials", {
    personId: people[0].id,
    credentialType: "Ministro",
    credentialNumber: "M-2030-001",
    issuedOn: "2030-02-01",
    expiresOn: "2032-02-01",
  });
  assert.equal(credential.status, 201, JSON.stringify(credential.data));
  const due = await call("/institutional/dues", {
    referenceYear: 2030,
    amountCents: 125000,
    dueOn: "2030-03-10",
  });
  assert.equal(due.status, 201, JSON.stringify(due.data));
  const listing = await call("/institutional");
  assert.equal(listing.status, 200, JSON.stringify(listing.data));
  assert.equal(listing.data.affiliation.official_number, "CONV-2040");
  assert.equal(listing.data.credentials[0].credential_number, "M-2030-001");
  assert.equal(Number(listing.data.dues[0].amount_cents), 125000);
  const paged = await call(
    "/institutional?ministryPage=1&ministryPageSize=1&credentialPage=1&credentialPageSize=1&duesPage=1&duesPageSize=1",
  );
  assert.equal(paged.status, 200, JSON.stringify(paged.data));
  assert.equal(paged.data.ministriesPagination.total, 1);
  assert.equal(paged.data.credentialsPagination.total, 1);
  assert.equal(paged.data.duesPagination.total, 1);
  assert.equal(paged.data.ministries.length, 1);
});

test("assembleia permite convocação central e confirmação de delegado da igreja", async () => {
  const centralToken = randomUUID();
  cookies.set(IDS.central, `ecclesia_session=${centralToken}`);
  await db.transaction((q) =>
    q(
      "INSERT INTO sessions(token_hash,user_id,expires_at,mfa) VALUES($1,$2,now()+interval '1 hour',true)",
      [hash(centralToken), IDS.central],
    ),
  );
  const assembly = await call(
    "/assemblies",
    {
      title: "Assembleia ordinária da rede",
      scheduledOn: "2030-11-15",
      location: "Auditório da rede",
      status: "confirmed",
      quorumRequired: 2,
    },
    IDS.central,
  );
  assert.equal(assembly.status, 201, JSON.stringify(assembly.data));
  const [person] = await db.transaction((q) =>
    q("SELECT id FROM people WHERE church_id=$1 ORDER BY name LIMIT 1", [
      IDS.churchA,
    ]),
  );
  const delegate = await call(
    `/assemblies/${assembly.data.id}/delegates`,
    { churchId: IDS.churchA, personId: person.id },
    IDS.admin,
  );
  assert.equal(delegate.status, 201, JSON.stringify(delegate.data));
  const confirmed = await call(
    `/assemblies/delegates/${delegate.data.id}`,
    { status: "confirmed", checkedIn: true },
    IDS.central,
    "PATCH",
  );
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.data));
  const listing = await call("/assemblies", undefined, IDS.central);
  assert.equal(listing.status, 200, JSON.stringify(listing.data));
  assert.ok(listing.data.assemblyPagination);
  const pagedListing = await call(
    "/assemblies?page=1&pageSize=1",
    undefined,
    IDS.central,
  );
  assert.equal(pagedListing.status, 200, JSON.stringify(pagedListing.data));
  assert.equal(pagedListing.data.assemblyPagination.pageSize, 1);
  assert.ok(
    pagedListing.data.assemblies.some(
      (item: any) => item.id === assembly.data.id,
    ),
  );
  assert.equal(listing.data.delegates[0].status, "confirmed");
  assert.ok(listing.data.delegates[0].checked_in_at);
});

test("transferências mantêm histórico visível para origem e destino", async () => {
  const [person] = await db.transaction((q) =>
    q(
      "SELECT id FROM people WHERE church_id=$1 AND status<>'inactive' ORDER BY name LIMIT 1",
      [IDS.churchA],
    ),
  );
  const transfer = await call(
    "/transfers",
    { personId: person.id, targetChurchId: IDS.churchB },
    IDS.admin,
  );
  assert.equal(transfer.status, 201, JSON.stringify(transfer.data));
  const sourceHistory = await call(
    `/transfers/${transfer.data.id}/history`,
    undefined,
    IDS.admin,
  );
  assert.equal(sourceHistory.status, 200, JSON.stringify(sourceHistory.data));
  assert.equal(sourceHistory.data.items.length, 1);
  assert.equal(sourceHistory.data.pages, 1);
  const accepted = await call(
    `/transfers/${transfer.data.id}/accept`,
    undefined,
    IDS.adminB,
    "POST",
    IDS.churchB,
  );
  assert.equal(accepted.status, 200, JSON.stringify(accepted.data));
  const targetHistory = await call(
    `/transfers/${transfer.data.id}/history`,
    undefined,
    IDS.adminB,
    "GET",
    IDS.churchB,
  );
  assert.equal(targetHistory.status, 200, JSON.stringify(targetHistory.data));
  assert.equal(targetHistory.data.items[0].status, "accepted");
});

test("histórico de segurança registra permissões e convites sem segredos", async () => {
  const permission = await call(
    `/access/permissions/${leader}`,
    { action: "people.read", allowed: true },
    IDS.admin,
    "PUT",
  );
  assert.equal(permission.status, 200, JSON.stringify(permission.data));
  const invite = await call(
    "/access/invites",
    {
      name: "Histórico Segurança",
      email: `historico-${randomUUID()}@example.invalid`,
      role: "leader",
    },
    IDS.admin,
  );
  assert.equal(invite.status, 201, JSON.stringify(invite.data));
  const access = await call("/access", undefined, IDS.admin);
  const history = access.data.history;
  assert.equal(access.status, 200, JSON.stringify(access.data));
  assert.ok(
    history.some(
      (row: Record<string, unknown>) => row.action === "permission-updated",
    ),
  );
  assert.ok(
    history.some(
      (row: Record<string, unknown>) => row.action === "invite-created",
    ),
  );
  assert.ok(
    !history.some((row: Record<string, unknown>) =>
      String(row.reason).includes("token"),
    ),
  );
  assert.ok(access.data.historyPagination);
  const pagedAccess = await call(
    "/access?page=1&pageSize=1",
    undefined,
    IDS.admin,
  );
  assert.equal(pagedAccess.status, 200, JSON.stringify(pagedAccess.data));
  assert.equal(pagedAccess.data.historyPagination.pageSize, 1);
  assert.ok(pagedAccess.data.history.length <= 1);
});

test("portal permite inscrição e cancelamento do próprio membro", async () => {
  const starts = new Date(Date.now() + 3 * 86400000).toISOString();
  const ends = new Date(Date.now() + 3 * 86400000 + 2 * 3600000).toISOString();
  const created = await call(
    "/agenda/events",
    {
      title: "Encontro do portal",
      kind: "event",
      startsAt: starts,
      endsAt: ends,
      capacity: 10,
      publicRegistration: true,
      certificateEnabled: true,
      waitlistEnabled: true,
      priceCents: 0,
      registrationFields: [
        {
          key: "shirt",
          label: "Tamanho",
          type: "select",
          required: true,
          options: ["M", "G"],
        },
      ],
    },
    IDS.admin,
  );
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const eventId = created.data[0].id;
  const eventPage = await call(
    "/participation?page=1&pageSize=1",
    undefined,
    IDS.admin,
  );
  assert.equal(eventPage.status, 200, JSON.stringify(eventPage.data));
  assert.equal(eventPage.data.events.pageSize, 1);
  assert.ok(eventPage.data.events.total >= 1);
  assert.ok(eventPage.data.events.items.length <= 1);
  const before = await call("/portal/events", undefined, IDS.member);
  assert.equal(before.status, 200, JSON.stringify(before.data));
  assert.ok(
    before.data.items.some(
      (event: Record<string, unknown>) => event.id === eventId,
    ),
  );
  const registered = await call(
    `/portal/events/${eventId}/register`,
    { formData: { shirt: "G" } },
    IDS.member,
  );
  assert.equal(registered.status, 201, JSON.stringify(registered.data));
  const after = await call("/portal/events", undefined, IDS.member);
  const own = after.data.items.find(
    (event: Record<string, unknown>) => event.id === eventId,
  );
  assert.equal(own.registration_status, "registered");
  const attended = await call(
    `/events/${eventId}/registrations/${own.registration_id}/attendance`,
    { attended: true },
    IDS.admin,
    "POST",
  );
  assert.equal(attended.status, 200, JSON.stringify(attended.data));
  const memberEventCertificates = await call(
    "/portal/events/certificates?page=1&pageSize=1",
    undefined,
    IDS.member,
  );
  assert.equal(
    memberEventCertificates.status,
    200,
    JSON.stringify(memberEventCertificates.data),
  );
  assert.ok(
    memberEventCertificates.data.items.some(
      (item: Record<string, unknown>) => item.event_id === eventId,
    ),
  );
  const cancelled = await call(
    `/portal/events/${own.registration_id}/cancel`,
    {},
    IDS.member,
  );
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  const page = await call(
    "/portal/events?page=1&pageSize=1",
    undefined,
    IDS.member,
  );
  assert.equal(page.status, 200, JSON.stringify(page.data));
  assert.equal(page.data.pageSize, 1);
  const history = await call(
    "/portal/events/history?page=1&pageSize=1",
    undefined,
    IDS.member,
  );
  assert.equal(history.status, 200, JSON.stringify(history.data));
  assert.equal(history.data.pageSize, 1);
});

test("portal permite matrícula do próprio membro em turma aberta", async () => {
  const course = await call(
    "/education/courses",
    {
      name: "Formação do Portal",
      description: "Curso para teste",
      completionPercent: 75,
    },
    IDS.admin,
  );
  assert.equal(course.status, 201, JSON.stringify(course.data));
  const starts = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);
  const clazz = await call(
    "/education/classes",
    {
      courseId: course.data.id,
      name: "Turma Aberta",
      startsOn: starts,
      endsOn: null,
      capacity: 10,
    },
    IDS.admin,
  );
  assert.equal(clazz.status, 201, JSON.stringify(clazz.data));
  const listing = await call("/portal/education", undefined, IDS.member);
  assert.equal(listing.status, 200, JSON.stringify(listing.data));
  assert.ok(
    listing.data.classes.some(
      (row: Record<string, unknown>) => row.id === clazz.data.id,
    ),
  );
  const enrolled = await call(
    `/portal/education/classes/${clazz.data.id}/enroll`,
    {},
    IDS.member,
  );
  assert.equal(enrolled.status, 201, JSON.stringify(enrolled.data));
  const after = await call("/portal/education", undefined, IDS.member);
  const own = after.data.classes.find(
    (row: Record<string, unknown>) => row.id === clazz.data.id,
  );
  assert.equal(own.enrollment_status, "active");
  const hiddenAssessment = await call(
    `/education/classes/${clazz.data.id}/assessments`,
    { title: "Rascunho privado", maxScore: 10, published: false },
    IDS.admin,
  );
  assert.equal(
    hiddenAssessment.status,
    201,
    JSON.stringify(hiddenAssessment.data),
  );
  const hiddenResult = await call(
    `/education/assessments/${hiddenAssessment.data.id}/results`,
    { enrollmentId: enrolled.data.id, score: 8, feedback: "Ainda em revisão." },
    IDS.admin,
  );
  assert.equal(hiddenResult.status, 201, JSON.stringify(hiddenResult.data));
  const educationPage = await call(
    "/portal/education?page=1&pageSize=1",
    undefined,
    IDS.member,
  );
  assert.equal(educationPage.status, 200, JSON.stringify(educationPage.data));
  assert.equal(educationPage.data.pageSize, 1);
  const openClass =
    educationPage.data.items?.find(
      (row: Record<string, unknown>) => row.id === clazz.data.id,
    ) ??
    educationPage.data.classes?.find(
      (row: Record<string, unknown>) => row.id === clazz.data.id,
    );
  if (openClass) assert.deepEqual(openClass.materials ?? [], []);
  const memberResults = await call(
    "/portal/education/results?page=1&pageSize=1",
    undefined,
    IDS.member,
  );
  assert.equal(memberResults.status, 200, JSON.stringify(memberResults.data));
  assert.equal(memberResults.data.pageSize, 1);
  assert.ok(
    !memberResults.data.items.some(
      (item: Record<string, unknown>) => item.id === hiddenResult.data.id,
    ),
  );
  const published = await call(
    `/education/assessments/${hiddenAssessment.data.id}`,
    { published: true },
    IDS.admin,
    "PATCH",
  );
  assert.equal(published.status, 200, JSON.stringify(published.data));
  const visibleResults = await call(
    "/portal/education/results?page=1&pageSize=100",
    undefined,
    IDS.member,
  );
  assert.equal(visibleResults.status, 200, JSON.stringify(visibleResults.data));
  assert.ok(
    visibleResults.data.items.some(
      (item: Record<string, unknown>) => item.id === hiddenResult.data.id,
    ),
  );
  const memberCertificates = await call(
    "/portal/education/certificates?page=1&pageSize=1",
    undefined,
    IDS.member,
  );
  assert.equal(
    memberCertificates.status,
    200,
    JSON.stringify(memberCertificates.data),
  );
});

test("ensino promove lista de espera após cancelamento da matrícula", async () => {
  const course = await call(
    "/education/courses",
    {
      name: "Turma com espera",
      description: "Teste de capacidade",
      completionPercent: 75,
    },
    IDS.admin,
  );
  assert.equal(course.status, 201, JSON.stringify(course.data));
  const clazz = await call(
    "/education/classes",
    {
      courseId: course.data.id,
      name: "Vagas limitadas",
      startsOn: "2031-01-10",
      capacity: 1,
    },
    IDS.admin,
  );
  assert.equal(clazz.status, 201, JSON.stringify(clazz.data));
  const first = await call(
    `/portal/education/classes/${clazz.data.id}/enroll`,
    {},
    IDS.member,
  );
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.equal(first.data.status, "active");
  const [secondPerson] = await db.transaction((q) =>
    q(
      "SELECT id FROM people WHERE church_id=$1 AND user_id<>$2 ORDER BY id LIMIT 1",
      [IDS.churchA, IDS.member],
    ),
  );
  const waiting = await call(
    `/education/classes/${clazz.data.id}/enroll`,
    { personId: secondPerson.id },
    IDS.admin,
  );
  assert.equal(waiting.status, 201, JSON.stringify(waiting.data));
  assert.equal(waiting.data.status, "waitlisted");
  const blockedAttendance = await call(
    `/education/classes/${clazz.data.id}/sessions`,
    {
      heldOn: "2031-01-11",
      topic: "Fila",
      attendance: [{ enrollmentId: waiting.data.id, present: true }],
    },
    IDS.admin,
  );
  assert.equal(
    blockedAttendance.status,
    400,
    JSON.stringify(blockedAttendance.data),
  );
  const cancelled = await call(
    `/portal/education/enrollments/${first.data.id}/cancel`,
    {},
    IDS.member,
  );
  assert.equal(cancelled.status, 200, JSON.stringify(cancelled.data));
  const [promoted] = await db.transaction((q) =>
    q("SELECT status FROM education_enrollments WHERE id=$1", [
      waiting.data.id,
    ]),
  );
  assert.equal(promoted.status, "active");
});

test("atualização cadastral do portal exige revisão da secretaria", async () => {
  const profile = await call("/portal", undefined, IDS.member);
  assert.equal(profile.status, 200, JSON.stringify(profile.data));
  const requested = await call(
    "/portal/profile-change",
    {
      name: "Ana Martins Atualizada",
      email: "ana.atualizada@example.invalid",
      phone: "11999990000",
    },
    IDS.member,
  );
  assert.equal(requested.status, 201, JSON.stringify(requested.data));
  const queue = await call("/privacy/admin", undefined, IDS.admin);
  assert.equal(queue.status, 200, JSON.stringify(queue.data));
  assert.ok(queue.data.total >= 1);
  const item = queue.data.items.find(
    (row: Record<string, unknown>) => row.id === requested.data.id,
  );
  assert.ok(item);
  const approved = await call(
    `/privacy/admin/${item.id}`,
    { status: "fulfilled", reason: "Dados conferidos com o titular." },
    IDS.admin,
    "PATCH",
  );
  assert.equal(approved.status, 200, JSON.stringify(approved.data));
  const [person] = await db.transaction((q) =>
    q("SELECT name,email,phone FROM people WHERE user_id=$1 AND church_id=$2", [
      IDS.member,
      IDS.churchA,
    ]),
  );
  assert.equal(person.name, "Ana Martins Atualizada");
  assert.equal(person.email, "ana.atualizada@example.invalid");
  assert.equal(person.phone, "11999990000");
});

test("secretaria compartilha documento e o membro acessa somente o arquivo autorizado", async () => {
  const uploaded = await call(
    "/documents",
    {
      name: "Comprovante.pdf",
      mediaType: "application/pdf",
      content: Buffer.from("%PDF-1.4 documento").toString("base64"),
    },
    IDS.admin,
  );
  assert.equal(uploaded.status, 201, JSON.stringify(uploaded.data));
  const documentPage = await call(
    "/documents?page=1&pageSize=1",
    undefined,
    IDS.admin,
  );
  assert.equal(documentPage.status, 200, JSON.stringify(documentPage.data));
  assert.equal(documentPage.data.pageSize, 1);
  assert.ok(documentPage.data.total >= 1);
  assert.ok(
    documentPage.data.items.some(
      (row: Record<string, unknown>) => row.id === uploaded.data.id,
    ),
  );
  const shared = await call(
    `/documents/${uploaded.data.id}/share`,
    {
      personId: (
        await db.transaction((q) =>
          q("SELECT id FROM people WHERE user_id=$1 AND church_id=$2", [
            IDS.member,
            IDS.churchA,
          ]),
        )
      )[0].id,
    },
    IDS.admin,
  );
  assert.equal(shared.status, 201, JSON.stringify(shared.data));
  const listing = await call("/portal/documents", undefined, IDS.member);
  assert.equal(listing.status, 200, JSON.stringify(listing.data));
  assert.ok(
    listing.data.some(
      (row: Record<string, unknown>) => row.id === uploaded.data.id,
    ),
  );
  const download = await fetch(`${base}/api/documents/${uploaded.data.id}`, {
    headers: {
      Cookie: cookies.get(IDS.member) ?? "",
      "x-church-id": IDS.churchA,
    },
  });
  assert.equal(download.status, 200);
  assert.match(download.headers.get("content-type") ?? "", /application\/pdf/);
  const revoked = await call(
    `/documents/${uploaded.data.id}/share/${(await db.transaction((q) => q("SELECT id FROM people WHERE user_id=$1 AND church_id=$2", [IDS.member, IDS.churchA])))[0].id}`,
    undefined,
    IDS.admin,
    "DELETE",
  );
  assert.equal(revoked.status, 200, JSON.stringify(revoked.data));
  const after = await call("/portal/documents", undefined, IDS.member);
  assert.ok(
    !after.data.some(
      (row: Record<string, unknown>) => row.id === uploaded.data.id,
    ),
  );
});

test("central administra concessão regional com leitura temporária e revogação", async () => {
  const listed = await call(
    "/regional-grants",
    undefined,
    IDS.central,
    "GET",
    IDS.churchA,
  );
  assert.equal(listed.status, 200, JSON.stringify(listed.data));
  assert.ok(
    listed.data.regions.some(
      (row: Record<string, unknown>) => row.id === IDS.region,
    ),
  );
  const created = await call(
    "/regional-grants",
    { regionId: IDS.region, userId: IDS.central, scope: "people", days: 5 },
    IDS.central,
    "POST",
    IDS.churchA,
  );
  assert.equal(created.status, 201, JSON.stringify(created.data));
  const detail = await call(
    "/people/paged?page=1&pageSize=5",
    undefined,
    IDS.central,
    "GET",
    IDS.churchA,
  );
  assert.equal(detail.status, 200, JSON.stringify(detail.data));
  const revoked = await call(
    `/regional-grants/${created.data.id}`,
    undefined,
    IDS.central,
    "DELETE",
    IDS.churchA,
  );
  assert.equal(revoked.status, 200, JSON.stringify(revoked.data));
  const after = await call(
    "/people/paged?page=1&pageSize=5",
    undefined,
    IDS.central,
    "GET",
    IDS.churchA,
  );
  assert.equal(after.status, 403);
});

test("relatório operacional consolida células, eventos, ensino e escalas sem dados financeiros", async () => {
  const report = await call(
    "/participation/reports?from=2026-01-01&to=2026-12-31",
    undefined,
    IDS.admin,
  );
  assert.equal(report.status, 200, JSON.stringify(report.data));
  assert.equal(report.data.from, "2026-01-01");
  assert.ok(Number.isInteger(report.data.people.active_people));
  assert.ok("attendance_rate" in report.data.cells);
  assert.ok("registrations" in report.data.events);
  assert.ok("attendance_rate" in report.data.education);
  assert.ok("pending" in report.data.ministry);
  assert.ok(Array.isArray(report.data.meetingsByMonth));
  assert.ok(!Object.hasOwn(report.data, "income_cents"));
  const reportCsv = await fetch(
    `${base}/api/participation/reports.csv?from=2026-01-01&to=2026-12-31`,
    {
      headers: {
        Cookie: cookies.get(IDS.admin) ?? "",
        "x-church-id": IDS.churchA,
      },
    },
  );
  assert.equal(reportCsv.status, 200);
  const csvText = await reportCsv.text();
  assert.match(csvText, /indicator,value/);
  assert.match(csvText, /active_people/);
  assert.doesNotMatch(csvText, /amount_cents|pastoral/);
  const other = await call(
    "/participation/reports?from=2026-01-01&to=2026-12-31",
    undefined,
    IDS.adminB,
    "GET",
    IDS.churchB,
  );
  assert.equal(other.status, 200, JSON.stringify(other.data));
  const [churchBPeople] = await db.transaction((q) =>
    q(
      "SELECT count(*) FILTER(WHERE status<>'inactive')::int AS total FROM people WHERE church_id=$1",
      [IDS.churchB],
    ),
  );
  assert.equal(other.data.people.active_people, churchBPeople.total);
});
test("ensino cria trilha de discipulado e turma com discipulador", async () => {
  const course = await call("/education/courses", {
    name: "Fundamentos do Discipulado",
    description: "Turma piloto de discipulado",
    completionPercent: 80,
    track: "discipulado",
    level: "inicial",
    certificateEnabled: true,
    publicCatalog: false,
  });
  assert.equal(course.status, 201, JSON.stringify(course.data));
  assert.equal(course.data.track, "discipulado");
  const clazz = await call("/education/classes", {
    courseId: course.data.id,
    name: "Discipulado — turma de terça",
    startsOn: "2026-11-01",
    endsOn: "2027-02-01",
    instructorId: IDS.admin,
    disciplerId: IDS.admin,
    meetingFrequency: "weekly",
    location: "Sala 2",
    deliveryMode: "presencial",
    capacity: 20,
    publicCatalog: false,
  });
  assert.equal(clazz.status, 201, JSON.stringify(clazz.data));
  assert.equal(clazz.data.discipler_id, IDS.admin);
  assert.equal(clazz.data.delivery_mode, "presencial");
});

test("igreja sede cria congregação com conta comercial compartilhada e mantém isolamento", async () => {
  const created = await call("/churches/children", {
    name: "Congregação Esperança Norte",
    administratorUserId: IDS.admin,
  });
  assert.equal(created.status, 201, JSON.stringify(created.data));
  assert.equal(created.data.unit_type, "congregacao");
  assert.equal(created.data.parent_church_id, IDS.churchA);
  const children = await call("/churches/children");
  assert.equal(children.status, 200);
  assert.ok(children.data.some((v: any) => v.id === created.data.id));
  const other = await call("/churches/children", undefined, IDS.adminB, "GET", IDS.churchB);
  assert.equal(other.status, 200);
  assert.ok(!other.data.some((v: any) => v.id === created.data.id));
});


test("operador da plataforma acessa apenas o painel comercial agregado", async () => {
  await db.transaction((q) => q("INSERT INTO platform_memberships(user_id,role) VALUES($1,'platform_admin') ON CONFLICT(user_id) DO UPDATE SET role=excluded.role", [IDS.admin]));
  try {
    const accounts = await call("/platform/billing/accounts", undefined, IDS.admin, "GET", IDS.churchA);
    assert.equal(accounts.status, 200, JSON.stringify(accounts.data));
    assert.ok(Array.isArray(accounts.data));
    const usage = await call("/platform/usage", undefined, IDS.admin, "GET", IDS.churchA);
    assert.equal(usage.status, 200, JSON.stringify(usage.data));
    const history = await call("/platform/billing/history", undefined, IDS.admin, "GET", IDS.churchA);
    assert.equal(history.status, 200, JSON.stringify(history.data));
    const csv = await fetch(`${base}/api/platform/billing/export.csv?status=all`, { headers: { Cookie: cookies.get(IDS.admin) ?? "", "x-church-id": IDS.churchA } });
    assert.equal(csv.status, 200, await csv.clone().text());
    assert.match(csv.headers.get("content-type") ?? "", /text\/csv/);
    const denied = await call("/platform/billing/accounts", undefined, IDS.adminB, "GET", IDS.churchB);
    assert.equal(denied.status, 403);
  } finally {
    await db.transaction((q) => q("DELETE FROM platform_memberships WHERE user_id=$1", [IDS.admin]));
  }
});
