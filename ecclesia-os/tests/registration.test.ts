import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { Database } from "../src/server/db.js";
import { seed, IDS, DEMO_SECRET } from "../src/server/seed.js";
import { passwordHash } from "../src/server/security.js";
import { createApp } from "../src/server/app.js";
import { Efi } from "../src/server/efi.js";
import {
  defaultProfile,
  defaultAdministration,
  ageOn,
  validCpf,
} from "../src/shared/registration.js";

const db = new Database(undefined),
  key = Buffer.alloc(32, 7),
  secretaryId = "30000000-0000-4000-8000-000000000005";
let server: Server, base: string, photo: string;
const cookies = new Map<string, string>();
async function call(
  path: string,
  {
    user,
    church = IDS.churchA,
    method = "GET",
    body,
  }: { user?: string; church?: string; method?: string; body?: any } = {},
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "x-church-id": church,
      ...(user ? { Cookie: cookies.get(user)! } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, data: await r.json(), headers: r.headers };
}
const example = (name = "Maria") => ({
  ...defaultProfile(name),
  lastName: "Exemplo",
  birthDate: "1990-05-10",
  congregation: "Congregação Jardim das Oliveiras",
  email: `${name.toLowerCase()}@example.invalid`,
  phone: "11999990000",
  phone2: "1133330000",
  cpf: "529.982.247-25",
  rg: "12.345.678-9",
  sex: "Feminino",
  education: "Ensino superior completo",
  maritalStatus: "Casado(a)",
  address: {
    street: "Rua das Flores",
    number: "120",
    neighborhood: "Jardim",
    postalCode: "01001-000",
    city: "São Paulo",
    state: "São Paulo",
    country: "Brasil",
  },
  conversionDate: "2010-01-12",
  baptized: "yes",
});
before(
  async () => {
    await db.migrate();
    await seed(db);
    await db.transaction(async (q) => {
      await q(
        "INSERT INTO users(id,name,email,password_hash,totp_secret) VALUES($1,$2,$3,$4,$5)",
        [
          secretaryId,
          "Secretária de Teste",
          "secretaria@example.invalid",
          passwordHash("Secretaria@Teste2026"),
          DEMO_SECRET,
        ],
      );
      await q(
        "INSERT INTO memberships(user_id,church_id,role) VALUES($1,$2,'secretary')",
        [secretaryId, IDS.churchA],
      );
    });
    server = createApp(db, {
      key,
      mode: "demo",
      efi: new Efi([]),
      origin: "http://localhost",
    }).listen(0, "127.0.0.1");
    await new Promise<void>((r) => server.once("listening", r));
    base = `http://127.0.0.1:${(server.address() as any).port}`;
    for (const [user, email, password] of [
      ["admin", "admin@esperanca.demo", "Demo@Ecclesia2026"],
      ["secretary", "secretaria@example.invalid", "Secretaria@Teste2026"],
      ["adminB", "admin@caminho.demo", "Demo@Ecclesia2026"],
      ["central", "central@rede.demo", "Demo@Ecclesia2026"],
      ["member", "membro@esperanca.demo", "Demo@Ecclesia2026"],
    ]) {
      let r = await call("/auth/login", {
        method: "POST",
        body: { email, password },
      });
      if (r.data.mfaRequired) {
        const info = await call("/demo-info");
        r = await call("/auth/mfa", {
          method: "POST",
          body: { challenge: r.data.challenge, code: info.data.code },
        });
      }
      assert.equal(r.status, 200, JSON.stringify(r.data));
      cookies.set(user, r.headers.get("set-cookie")!.split(";")[0]);
    }
    const image = await sharp({
      create: { width: 1200, height: 900, channels: 3, background: "#8361c5" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    photo = "data:image/jpeg;base64," + image.toString("base64");
  },
  { timeout: 120000 },
);
after(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await db.close();
});

test("member model validates CPF and computes age without storing stale values", () => {
  assert.equal(validCpf("529.982.247-25"), true);
  assert.equal(validCpf("111.111.111-11"), false);
  assert.equal(ageOn("2000-10-17", "2026-10-16"), 25);
  assert.equal(ageOn("2000-10-16", "2026-10-16"), 26);
});

test("secretary manually creates and edits all PDF fields, including a protected normalized photo", async () => {
  const create = await call("/people/profiles", {
    user: "secretary",
    method: "POST",
    body: {
      profile: example(),
      administration: {
        ...defaultAdministration(),
        categories: ["Mulheres"],
        positions: ["Diaconisa"],
        communion: "active",
        groups: "Grupo de oração",
        notes: "Observação administrativa de teste.",
      },
      photo,
    },
  });
  assert.equal(create.status, 201, JSON.stringify(create.data));
  const p = create.data;
  assert.equal(p.profile.congregation, "Congregação Jardim das Oliveiras");
  assert.equal(p.profile.cpf, "52998224725");
  assert.equal(p.administration.positions[0], "Diaconisa");
  assert.equal(p.version, 1);
  assert.ok(p.photoDataUrl.startsWith("data:image/webp;base64,"));
  const metadata = await sharp(
    Buffer.from(p.photoDataUrl.split(",")[1], "base64"),
  ).metadata();
  assert.ok(metadata.width! <= 640 && metadata.height! <= 640);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.orientation, undefined);
  const changed = await call("/people/" + p.id + "/profile", {
    user: "secretary",
    method: "PATCH",
    body: {
      profile: { ...p.profile, phone2: "1188887777" },
      administration: p.administration,
      version: p.version,
    },
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.data));
  assert.equal(changed.data.profile.phone2, "1188887777");
  assert.equal(changed.data.version, 2);
  const history = await call(`/people/${p.id}/history`, { user: "secretary" });
  assert.equal(history.status, 200, JSON.stringify(history.data));
  assert.equal(history.data.length, 1);
  assert.equal(history.data[0].actor_name, "Secretária de Teste");
  assert.ok(history.data[0].changed_fields.includes("profile.phone2"));
  assert.equal(
    (
      await call("/people/" + p.id + "/profile", {
        user: "admin",
        method: "PATCH",
        body: {
          profile: p.profile,
          administration: p.administration,
          version: 1,
        },
      })
    ).status,
    409,
  );
  const [stored] = await db.transaction((q) =>
    q("SELECT encrypted_profile FROM member_profiles WHERE person_id=$1", [
      p.id,
    ]),
  );
  assert.ok(!stored.encrypted_profile.includes("52998224725"));
  assert.ok(!stored.encrypted_profile.includes("Observação"));
  const image = await fetch(
    base + "/api/people/" + p.id + "/photo?church=" + IDS.churchA,
    { headers: { Cookie: cookies.get("secretary")! } },
  );
  assert.equal(image.status, 200);
  assert.equal(image.headers.get("content-type"), "image/webp");
  assert.equal(image.headers.get("cache-control"), "no-store");
  assert.equal(
    (
      await call("/people/" + p.id + "/profile", {
        user: "adminB",
        church: IDS.churchB,
      })
    ).status,
    404,
  );
  const wrongPhoto = await fetch(
    base + "/api/people/" + p.id + "/photo?church=" + IDS.churchB,
    { headers: { Cookie: cookies.get("adminB")! } },
  );
  assert.equal(wrongPhoto.status, 404);
  assert.equal(
    (await call("/people/" + p.id + "/profile", { user: "member" })).status,
    403,
  );
  const remove = await call("/people/" + p.id + "/profile", {
    user: "admin",
    method: "PATCH",
    body: {
      profile: changed.data.profile,
      administration: changed.data.administration,
      version: 2,
      photo: null,
    },
  });
  assert.equal(remove.status, 200);
  assert.equal(remove.data.photoDataUrl, null);
});

test("invalid uploads and document fields are rejected without partial member records", async () => {
  assert.equal(
    (
      await call("/people/profiles", {
        user: "admin",
        method: "POST",
        body: {
          profile: example("Inválida"),
          photo:
            "data:image/png;base64," +
            Buffer.from("not-an-image").toString("base64"),
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/people/profiles", {
        user: "admin",
        method: "POST",
        body: { profile: { ...example("CPF"), cpf: "11111111111" } },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/people/profiles", {
        user: "member",
        method: "POST",
        body: { profile: example("Negada") },
      })
    ).status,
    403,
  );
  assert.equal(
    (
      await call("/people/profiles", {
        method: "POST",
        body: { profile: example("Anônima") },
      })
    ).status,
    401,
  );
  const rows = await db.transaction((q) =>
    q(
      "SELECT 1 FROM people WHERE name IN ('Inválida Exemplo','CPF Exemplo','Negada Exemplo','Anônima Exemplo')",
    ),
  );
  assert.equal(rows.length, 0);
});

let linkId: string, rawToken: string, challenge: string, submissionId: string;
test("secretary prepares local link, anonymous visitors see the form but never internal fields", async () => {
  const r = await call("/registration/links", {
    user: "secretary",
    method: "POST",
    body: { days: 30, photoRequired: true },
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  assert.ok(r.data.url.startsWith("http://localhost/cadastro/"));
  linkId = r.data.id;
  rawToken = r.data.url.split("/").at(-1)!;
  const meta = await call("/public/registration/" + rawToken);
  assert.equal(meta.status, 200);
  assert.equal(meta.data.photoRequired, true);
  assert.equal(meta.data.administration, undefined);
  assert.equal(meta.data.members, undefined);
  challenge = meta.data.challenge;
  assert.equal(
    (await call("/registration/links", { user: "central" })).status,
    403,
  );
  assert.equal(
    (await call("/public/registration/" + "x".repeat(43))).status,
    404,
  );
  await new Promise((r) => setTimeout(r, 1600));
});

test("online submissions are pending, idempotent and cannot inject internal membership status", async () => {
  const submissionKey = randomUUID(),
    body = {
      profile: example("Online"),
      photo,
      acceptedPrivacyNotice: true,
      challenge,
      submissionKey,
    };
  const before = await db.transaction((q) =>
    q("SELECT count(*)::int AS n FROM people"),
  );
  const first = await call("/public/registration/" + rawToken, {
    method: "POST",
    body,
  });
  assert.equal(first.status, 201, JSON.stringify(first.data));
  assert.ok(first.data.protocol.startsWith("EC-"));
  assert.equal(first.data.profile, undefined);
  const repeated = await call("/public/registration/" + rawToken, {
    method: "POST",
    body,
  });
  assert.equal(repeated.data.protocol, first.data.protocol);
  const after = await db.transaction((q) =>
    q("SELECT count(*)::int AS n FROM people"),
  );
  assert.equal(before[0].n, after[0].n);
  assert.equal(
    (
      await call("/public/registration/" + rawToken, {
        method: "POST",
        body: {
          ...body,
          submissionKey: randomUUID(),
          administration: { status: "worker" },
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/public/registration/" + rawToken, {
        method: "POST",
        body: { ...body, submissionKey: randomUUID(), photo: undefined },
      })
    ).status,
    400,
  );
  const queue = await call("/registration/submissions", { user: "secretary" });
  assert.equal(queue.status, 200);
  const pending = queue.data.items.find(
    (s: any) => s.name === "Online Exemplo",
  );
  assert.ok(pending);
  submissionId = pending.id;
  assert.equal(pending.status, "pending");
  assert.equal(pending.congregation, "Congregação Jardim das Oliveiras");
  const [reviewTask] = await db.transaction((q) => q("SELECT source_type,status FROM operational_tasks WHERE source_type='registration_submission' AND source_id=$1", [submissionId]));
  assert.equal(reviewTask.source_type, "registration_submission");
  assert.equal(reviewTask.status, "open");
  assert.equal(
    (
      await call("/registration/submissions/" + submissionId, {
        user: "adminB",
        church: IDS.churchB,
      })
    ).status,
    404,
  );
});

test("approval creates the member and photo once and allows later editing by the secretary", async () => {
  const review = await call("/registration/submissions/" + submissionId, {
    user: "secretary",
  });
  assert.equal(review.status, 200);
  assert.ok(review.data.photoDataUrl);
  assert.ok(review.data.consent.accepted);
  const approve = await call(
    "/registration/submissions/" + submissionId + "/approve",
    {
      user: "secretary",
      method: "POST",
      body: {
        profile: review.data.profile,
        administration: defaultAdministration(),
      },
    },
  );
  assert.equal(approve.status, 200, JSON.stringify(approve.data));
  const [completedTask] = await db.transaction((q) => q("SELECT status FROM operational_tasks WHERE source_type='registration_submission' AND source_id=$1", [submissionId]));
  assert.equal(completedTask.status, "done");
  const member = await call("/people/" + approve.data.id + "/profile", {
    user: "secretary",
  });
  assert.equal(member.data.profile.firstName, "Online");
  assert.ok(member.data.photoDataUrl);
  assert.equal(
    (
      await call("/registration/submissions/" + submissionId + "/approve", {
        user: "admin",
        method: "POST",
        body: { profile: review.data.profile },
      })
    ).status,
    409,
  );
  const edit = await call("/people/" + approve.data.id + "/profile", {
    user: "secretary",
    method: "PATCH",
    body: {
      profile: {
        ...member.data.profile,
        congregation: "Congregação atualizada",
      },
      administration: member.data.administration,
      version: member.data.version,
    },
  });
  assert.equal(edit.status, 200);
  assert.equal(edit.data.profile.congregation, "Congregação atualizada");
});

test("review updates an existing member without duplicates, stale writes or lost administrative scope", async () => {
  const people = await call("/people", { user: "secretary" });
  const existing = people.data.find((p: any) => p.name === "Maria Exemplo");
  assert.ok(existing);
  const directory = await call("/directory", { user: "secretary" });
  let current = (
    await call("/people/" + existing.id + "/profile", { user: "secretary" })
  ).data;
  const assigned = await call("/people/" + existing.id + "/profile", {
    user: "secretary",
    method: "PATCH",
    body: {
      profile: current.profile,
      administration: current.administration,
      version: current.version,
      householdId: directory.data.households[0].id,
      campusId: directory.data.campuses[0].id,
    },
  });
  assert.equal(assigned.status, 200);
  current = assigned.data;
  const countBefore = (
    await db.transaction((q) => q("SELECT count(*)::int AS n FROM people"))
  )[0].n;
  const incoming = {
    ...example(),
    phone2: "1144445555",
    congregation: "Congregação de atualização",
  };
  const sent = await call("/public/registration/" + rawToken, {
    method: "POST",
    body: {
      profile: incoming,
      photo,
      acceptedPrivacyNotice: true,
      challenge,
      submissionKey: randomUUID(),
    },
  });
  assert.equal(sent.status, 201, JSON.stringify(sent.data));
  const queue = await call("/registration/submissions", { user: "secretary" });
  const submission = queue.data.items.find(
    (v: any) => v.name === "Maria Exemplo" && v.status === "pending",
  );
  assert.ok(submission);
  const review = await call("/registration/submissions/" + submission.id, {
    user: "secretary",
  });
  assert.ok(review.data.candidates.some((p: any) => p.id === existing.id));
  const body = {
    profile: review.data.profile,
    administration: current.administration,
    targetPersonId: existing.id,
    householdId: null,
    campusId: null,
    version: 0,
  };
  assert.equal(
    (
      await call("/registration/submissions/" + submission.id + "/approve", {
        user: "secretary",
        method: "POST",
        body,
      })
    ).status,
    409,
  );
  const merged = await call(
    "/registration/submissions/" + submission.id + "/approve",
    {
      user: "secretary",
      method: "POST",
      body: { ...body, version: current.version },
    },
  );
  assert.equal(merged.status, 200, JSON.stringify(merged.data));
  assert.equal(merged.data.id, existing.id);
  const updated = (
    await call("/people/" + existing.id + "/profile", { user: "secretary" })
  ).data;
  assert.equal(updated.householdId, current.householdId);
  assert.equal(updated.campusId, current.campusId);
  assert.deepEqual(
    updated.administration.categories,
    current.administration.categories,
  );
  assert.equal(updated.profile.phone2, "1144445555");
  assert.ok(updated.photoDataUrl);
  assert.equal(
    (await db.transaction((q) => q("SELECT count(*)::int AS n FROM people")))[0]
      .n,
    countBefore,
  );
});

test("online form requires privacy acknowledgement, responsible adult for a minor and signed challenge", async () => {
  const body = {
    profile: example("Menor"),
    photo,
    acceptedPrivacyNotice: true,
    challenge,
    submissionKey: randomUUID(),
  };
  assert.equal(
    (
      await call("/public/registration/" + rawToken, {
        method: "POST",
        body: { ...body, acceptedPrivacyNotice: false },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/public/registration/" + rawToken, {
        method: "POST",
        body: { ...body, challenge: "forged" },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/public/registration/" + rawToken, {
        method: "POST",
        body: {
          ...body,
          profile: {
            ...body.profile,
            birthDate: "2015-01-01",
            conversionDate: "",
          },
        },
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await call("/public/registration/" + rawToken, {
        method: "POST",
        body: { ...body, website: "spam.example" },
      })
    ).status,
    400,
  );
});

test("revoked and expired links stop new registrations while preserving pending records", async () => {
  await call("/registration/links/" + linkId, {
    user: "secretary",
    method: "PATCH",
    body: { active: false },
  });
  assert.equal((await call("/public/registration/" + rawToken)).status, 404);
  assert.equal(
    (
      await call("/public/registration/" + rawToken, {
        method: "POST",
        body: {
          profile: example("Revogada"),
          photo,
          acceptedPrivacyNotice: true,
          challenge,
          submissionKey: randomUUID(),
        },
      })
    ).status,
    404,
  );
  await call("/registration/links/" + linkId, {
    user: "admin",
    method: "PATCH",
    body: { active: true },
  });
  await db.transaction((q) =>
    q(
      "UPDATE registration_links SET expires_at=now()-interval '1 hour' WHERE id=$1",
      [linkId],
    ),
  );
  assert.equal((await call("/public/registration/" + rawToken)).status, 404);
  assert.equal(
    (
      await call("/registration/submissions", { user: "secretary" })
    ).data.items.find((s: any) => s.id === submissionId).status,
    "approved",
  );
});
