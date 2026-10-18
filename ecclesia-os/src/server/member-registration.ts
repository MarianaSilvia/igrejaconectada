import type { Express, Request, Response, NextFunction } from "express";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import sharp from "sharp";
import { z } from "zod";
import type { Database, Query, Row } from "./db.js";
import {
  encrypt,
  decrypt,
  hash,
  token,
  requireThat,
  HttpError,
} from "./security.js";
import { audit } from "./seed.js";
import {
  profileWriteSchema,
  publicSubmissionSchema,
  memberProfileSchema,
  administrativeSchema,
  defaultProfile,
  defaultAdministration,
  REGISTRATION_VERSION,
  ageOn,
  ageGroup,
  type MemberProfile,
} from "../shared/registration.js";

type AuthRequest = Request & { actor: Row; church: string };
type Options = { key: Buffer; origin: string; mode: string };
type Write = z.infer<typeof profileWriteSchema>;
const route =
  (fn: (r: any, s: Response) => Promise<any>) =>
  (r: Request, s: Response, n: NextFunction) =>
    Promise.resolve(fn(r, s)).catch(n);
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export async function normalizeMemberPhoto(
  value: string | null | undefined,
): Promise<string | null | undefined> {
  if (value === undefined || value === null) return value;
  const match =
    /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  requireThat(match, 400, "Envie uma foto JPG, PNG ou WebP.");
  const bytes = Buffer.from(match[2], "base64");
  requireThat(
    bytes.length > 0 && bytes.length <= 3 * 1024 * 1024,
    400,
    "A foto deve ter até 3 MB.",
  );
  try {
    const img = sharp(bytes, {
      limitInputPixels: 16_000_000,
      animated: false,
      failOn: "error",
    });
    const meta = await img.metadata();
    requireThat(
      ["jpeg", "png", "webp"].includes(meta.format ?? "") &&
        (!meta.pages || meta.pages === 1),
      400,
      "Foto inválida. Envie uma imagem estática.",
    );
    return (
      await img
        .rotate()
        .resize(640, 640, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer()
    ).toString("base64");
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError(
      400,
      "Não foi possível ler a foto. Escolha outro arquivo JPG, PNG ou WebP.",
    );
  }
}
function legacyProfile(p: Row): MemberProfile {
  const [first, ...last] = p.name.split(" ");
  return {
    ...defaultProfile(first),
    lastName: last.join(" "),
    email: p.email ?? "",
    phone: p.phone ?? "",
  };
}
async function loadProfile(q: Query, id: string, key: Buffer) {
  const [p] = await q("SELECT * FROM people WHERE id=$1", [id]);
  requireThat(p, 404, "Membro não encontrado.");
  const [stored] = await q("SELECT * FROM member_profiles WHERE person_id=$1", [
    id,
  ]);
  const payload = stored
    ? JSON.parse(decrypt(stored.encrypted_profile, key))
    : {
        profile: legacyProfile(p),
        administration: defaultAdministration(p.status),
      };
  const [photo] = await q(
    "SELECT encrypted_data FROM member_photos WHERE person_id=$1",
    [id],
  );
  return {
    id: p.id,
    profile: payload.profile,
    administration: { ...payload.administration, status: p.status },
    version: stored?.version ?? 0,
    householdId: p.household_id,
    campusId: p.campus_id,
    createdAt: p.created_at,
    updatedAt: stored?.updated_at ?? p.created_at,
    photoDataUrl: photo
      ? "data:image/webp;base64," + decrypt(photo.encrypted_data, key)
      : null,
    age: ageOn(payload.profile.birthDate),
    ageGroup: ageGroup(payload.profile.birthDate),
  };
}
async function saveProfile(
  q: Query,
  actor: string,
  actorName: string,
  church: string,
  b: Write,
  key: Buffer,
  photo: string | null | undefined,
  id?: string,
) {
  const profile = b.profile,
    administration = b.administration;
  let personId = id;
  const changedFields = new Set<string>();
  if (id) {
    const [person] = await q("SELECT id FROM people WHERE id=$1 FOR UPDATE", [
      id,
    ]);
    requireThat(person, 404, "Membro não encontrado.");
    const [current] = await q(
      "SELECT version,encrypted_profile FROM member_profiles WHERE person_id=$1",
      [id],
    );
    requireThat(
      b.version !== undefined && b.version === (current?.version ?? 0),
      409,
      "Este cadastro foi alterado. Reabra a ficha antes de salvar.",
    );
    if (current?.encrypted_profile) {
      const previous = JSON.parse(decrypt(current.encrypted_profile, key));
      for (const [section, value] of Object.entries({ profile, administration })) {
        const oldSection = previous[section] ?? {};
        for (const field of new Set([...Object.keys(oldSection), ...Object.keys(value as Record<string, unknown>)]))
          if (JSON.stringify(oldSection[field]) !== JSON.stringify((value as Record<string, unknown>)[field])) changedFields.add(`${section}.${field}`);
      }
    } else {
      changedFields.add("profile");
      changedFields.add("administration");
    }
    if (photo !== undefined) changedFields.add("photo");
    await q(
      "UPDATE people SET name=$1,email=$2,phone=$3,status=$4,household_id=CASE WHEN $5::boolean THEN $6::uuid ELSE household_id END,campus_id=CASE WHEN $7::boolean THEN $8::uuid ELSE campus_id END WHERE id=$9",
      [
        [profile.firstName, profile.lastName].filter(Boolean).join(" "),
        profile.email || null,
        profile.phone || null,
        administration.status,
        b.householdId !== undefined,
        b.householdId ?? null,
        b.campusId !== undefined,
        b.campusId ?? null,
        id,
      ],
    );
  } else {
    const [p] = await q(
      "INSERT INTO people(church_id,name,email,phone,status,household_id,campus_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id",
      [
        church,
        [profile.firstName, profile.lastName].filter(Boolean).join(" "),
        profile.email || null,
        profile.phone || null,
        administration.status,
        b.householdId ?? null,
        b.campusId ?? null,
      ],
    );
    personId = p.id;
  }
  await q(
    "INSERT INTO member_profiles(church_id,person_id,encrypted_profile) VALUES($1,$2,$3) ON CONFLICT(person_id) DO UPDATE SET encrypted_profile=excluded.encrypted_profile,version=member_profiles.version+1,updated_at=now()",
    [
      church,
      personId,
      encrypt(
        JSON.stringify({
          profile,
          administration,
          formVersion: REGISTRATION_VERSION,
        }),
        key,
      ),
    ],
  );
  if (photo === null)
    await q("DELETE FROM member_photos WHERE person_id=$1", [personId]);
  else if (photo !== undefined)
    await q(
      "INSERT INTO member_photos(church_id,person_id,encrypted_data) VALUES($1,$2,$3) ON CONFLICT(person_id) DO UPDATE SET encrypted_data=excluded.encrypted_data,updated_at=now()",
      [church, personId, encrypt(photo, key)],
    );
  if (
    administration.status === "visitor" &&
    !(await q("SELECT 1 FROM workflow_cards WHERE person_id=$1", [personId]))
      .length
  )
    await q(
      "INSERT INTO workflow_cards(church_id,person_id,stage) VALUES($1,$2,0)",
      [church, personId],
    );
  if (id && changedFields.size)
    await q(
      "INSERT INTO member_change_log(church_id,person_id,actor_id,actor_name,changed_fields) VALUES($1,$2,$3,$4,$5)",
      [church, personId, actor, actorName, JSON.stringify([...changedFields])],
    );
  await audit(
    q,
    actor,
    church,
    id ? "member-profile.updated" : "member-profile.created",
    personId,
  );
  return loadProfile(q, personId!, key);
}
export async function syncLegacyMemberProfile(q: Query, p: Row, key: Buffer) {
  const [stored] = await q(
    "SELECT encrypted_profile FROM member_profiles WHERE person_id=$1",
    [p.id],
  );
  if (!stored) return;
  const data = JSON.parse(decrypt(stored.encrypted_profile, key));
  const legacy = legacyProfile(p);
  data.profile = {
    ...data.profile,
    firstName: legacy.firstName,
    lastName: legacy.lastName,
    email: legacy.email,
    phone: legacy.phone,
  };
  data.administration.status = p.status;
  await q(
    "UPDATE member_profiles SET encrypted_profile=$1,version=version+1,updated_at=now() WHERE person_id=$2",
    [encrypt(JSON.stringify(data), key), p.id],
  );
}
function linkUrl(origin: string, raw: string) {
  return `${origin.replace(/\/$/, "")}/cadastro/${raw}`;
}
function signChallenge(raw: string, key: Buffer) {
  const data = `${Date.now()}.${token()}`;
  return (
    data +
    "." +
    createHmac("sha256", key)
      .update(raw + ":" + data)
      .digest("hex")
  );
}
function verifyChallenge(raw: string, challenge: string, key: Buffer) {
  const [time, nonce, signature] = challenge.split(".");
  requireThat(
    /^\d+$/.test(time ?? "") &&
      nonce?.length === 43 &&
      /^[a-f0-9]{64}$/.test(signature ?? ""),
    400,
    "Atualize a ficha e tente novamente.",
  );
  const expected = createHmac("sha256", key)
    .update(raw + ":" + time + "." + nonce)
    .digest("hex");
  const age = Date.now() - Number(time);
  requireThat(
    timingSafeEqual(Buffer.from(signature), Buffer.from(expected)) &&
      age >= 1500 &&
      age < 2 * 3600000,
    400,
    "Aguarde um instante ou atualize a ficha antes de enviar.",
  );
}
export function registrationPublicRoutes(
  app: Express,
  db: Database,
  options: Options,
) {
  const limits = new Map<string, { count: number; expires: number }>();
  const limit = (r: Request) => {
    const now = Date.now();
    for (const [k, v] of limits) if (v.expires < now) limits.delete(k);
    requireThat(limits.size < 10000, 429, "Tente novamente mais tarde.");
    const k = hash(r.ip ?? "unknown");
    const entry = limits.get(k) ?? { count: 0, expires: now + 30 * 60000 };
    entry.count++;
    limits.set(k, entry);
    requireThat(
      entry.count <= 20,
      429,
      "Muitos envios neste período. Tente novamente mais tarde.",
    );
  };
  const findLink = async (q: Query, raw: string, lock = false) => {
    const [l] = await q(
      `SELECT l.*,c.modules,c.name AS church_name FROM registration_links l JOIN churches c ON c.id=l.church_id WHERE l.token_hash=$1 AND l.active AND l.expires_at>now() ${lock ? "FOR UPDATE OF l" : ""}`,
      [hash(raw)],
    );
    requireThat(
      l && l.modules.includes("people"),
      404,
      "Esta ficha está indisponível ou o link expirou. Peça um novo link à secretaria.",
    );
    return l;
  };
  app.get(
    "/api/public/registration/:token",
    route(async (r: Request, s) => {
      const raw = tokenSchema.parse(r.params.token);
      const l = await db.transaction((q) => findLink(q, raw));
      s.json({
        title: l.title,
        photoRequired: l.photo_required,
        formVersion: REGISTRATION_VERSION,
        challenge: signChallenge(raw, options.key),
        demo: options.mode === "demo",
        privacyNotice:
          "Esta ficha será encaminhada à secretaria da igreja para cadastro e conferência. CPF, RG e foto são opcionais, salvo indicação no formulário. Seus dados e sua foto não serão exibidos publicamente. Para consultar, corrigir ou solicitar exclusão, procure a secretaria. Preencha somente as informações necessárias.",
      });
    }),
  );
  app.post(
    "/api/public/registration/:token",
    route(async (r: Request, s) => {
      limit(r);
      const raw = tokenSchema.parse(r.params.token);
      const b = publicSubmissionSchema.parse(r.body);
      requireThat(!b.website, 400, "Não foi possível enviar a ficha.");
      verifyChallenge(raw, b.challenge, options.key);
      const photo = await normalizeMemberPhoto(b.photo);
      const response = await db.transaction(async (q) => {
        const l = await findLink(q, raw, true);
        requireThat(
          !l.photo_required || photo,
          400,
          "Adicione uma foto para enviar esta ficha.",
        );
        const [existing] = await q(
          "SELECT id FROM registration_submissions WHERE link_id=$1 AND submission_key=$2",
          [l.id, b.submissionKey],
        );
        if (existing)
          return {
            protocol:
              "EC-" +
              existing.id.slice(0, 13).replaceAll("-", "").toUpperCase(),
          };
        const payload = {
          profile: b.profile,
          formVersion: REGISTRATION_VERSION,
          consent: {
            accepted: true,
            noticeVersion: 1,
            acceptedAt: new Date().toISOString(),
          },
          source: "online",
        };
        const [v] = await q(
          "INSERT INTO registration_submissions(church_id,link_id,submission_key,encrypted_payload,encrypted_photo) VALUES($1,$2,$3,$4,$5) RETURNING id",
          [
            l.church_id,
            l.id,
            b.submissionKey,
            encrypt(JSON.stringify(payload), options.key),
            photo ? encrypt(photo, options.key) : null,
          ],
        );
        await q(
          "INSERT INTO operational_tasks(church_id,scope,encrypted_title,due_on,assigned_to,created_by,source_type,source_id) VALUES($1,'people',$2,CURRENT_DATE+2,$3,$3,'registration_submission',$4) ON CONFLICT DO NOTHING",
          [l.church_id, encrypt(`Conferir ficha · ${[b.profile.firstName,b.profile.lastName].filter(Boolean).join(" ")}`, options.key), l.created_by, v.id],
        );
        await audit(q, null, l.church_id, "registration.received", v.id);
        return {
          protocol: "EC-" + v.id.slice(0, 13).replaceAll("-", "").toUpperCase(),
        };
      });
      s.status(201).json({
        ...response,
        message: "Ficha recebida. A secretaria vai conferir suas informações.",
      });
    }),
  );
}
export function registrationAdminRoutes(
  app: Express,
  db: Database,
  options: Options,
) {
  const scoped = <T>(r: AuthRequest, fn: (q: Query) => Promise<T>) => {
    requireThat(r.church, 400, "Selecione uma igreja.");
    return db.transaction(
      async (q) => {
        const [a] = await q("SELECT can_access('people',true) AS allowed");
        requireThat(
          a.allowed,
          403,
          "Somente a administração e a secretaria locais podem editar fichas.",
        );
        return fn(q);
      },
      { actor: r.actor.id, church: r.church },
    );
  };
  app.get(
    "/api/registration/config",
    route(async (r: AuthRequest, s) => {
      requireThat(r.church, 400, "Selecione uma igreja.");
      const [permission] = await db.transaction(
        (q) => q("SELECT can_access('people',true) AS allowed"),
        { actor: r.actor.id, church: r.church },
      );
      const [membership] = await db.transaction((q) =>
        q(
          "SELECT campus_id FROM memberships WHERE user_id=$1 AND church_id=$2",
          [r.actor.id, r.church],
        ),
      );
      s.json({
        canManage: permission.allowed,
        defaultCampusId: membership?.campus_id ?? null,
        formVersion: REGISTRATION_VERSION,
        publicationPending: /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(
          options.origin,
        ),
      });
    }),
  );
  app.post(
    "/api/people/profiles",
    route(async (r: AuthRequest, s) => {
      const b = profileWriteSchema.parse(r.body),
        photo = await normalizeMemberPhoto(b.photo);
      s.status(201).json(
        await scoped(r, (q) =>
          saveProfile(q, r.actor.id, r.actor.name, r.church, b, options.key, photo),
        ),
      );
    }),
  );
  app.get(
    "/api/people/:id/profile",
    route(async (r: AuthRequest, s) => {
      const id = z.uuid().parse(r.params.id);
      s.json(await scoped(r, async (q) => {
          const result = await loadProfile(q, id, options.key);
          await audit(q, r.actor.id, r.church, "member-profile.viewed", id);
          return result;
        }));
    }),
  );
  // Visão transversal do cadastro: reutiliza a mesma pessoa nos módulos
  // operacionais, mantendo dados pastorais e financeiros fora deste resumo.
  app.get(
    "/api/people/:id/overview",
    route(async (r: AuthRequest, s) => {
      const id = z.uuid().parse(r.params.id);
      s.json(await scoped(r, async (q) => {
        const [person] = await q(
          "SELECT p.id,p.name,p.email,p.phone,p.status,p.household_id,p.campus_id,p.user_id,h.name AS household FROM people p LEFT JOIN households h ON h.id=p.household_id WHERE p.id=$1",
          [id],
        );
        requireThat(person, 404, "Membro não encontrado.");
        const household = person.household_id
          ? await q("SELECT id,name,email,phone,status FROM people WHERE household_id=$1 ORDER BY name", [person.household_id])
          : [];
        const cells = await q(
          "SELECT c.id,c.name,c.leader_name,c.weekday FROM cell_members cm JOIN cells c ON c.id=cm.cell_id WHERE cm.person_id=$1 ORDER BY c.name",
          [id],
        );
        const events = await q(
          "SELECT e.id,e.title,e.kind,e.starts_at,e.ends_at,er.status FROM event_registrations er JOIN church_events e ON e.id=er.event_id WHERE er.person_id=$1 ORDER BY e.starts_at DESC LIMIT 50",
          [id],
        );
        const education = await q(
          "SELECT c.id AS course_id,c.name AS course_name,cl.id AS class_id,cl.name AS class_name,cl.starts_on,cl.ends_on,en.status FROM education_enrollments en JOIN education_classes cl ON cl.id=en.class_id JOIN education_courses c ON c.id=cl.course_id WHERE en.person_id=$1 ORDER BY cl.starts_on DESC LIMIT 50",
          [id],
        );
        const teams = person.user_id
          ? await q(
              "SELECT t.id,t.name,mm.role FROM ministry_members mm JOIN ministry_teams t ON t.id=mm.team_id WHERE mm.user_id=$1 ORDER BY t.name",
              [person.user_id],
            )
          : [];
        const schedules = person.user_id
          ? await q(
              "SELECT id,ministry,starts_at,ends_at,response,team_id FROM schedules WHERE user_id=$1 ORDER BY starts_at DESC LIMIT 50",
              [person.user_id],
            )
          : [];
        const workflows = await q(
          "SELECT wi.id,wi.status,wi.current_step,wi.due_on,wi.created_at,d.name AS workflow_name,s.title AS step_title FROM workflow_instances wi JOIN workflow_definitions d ON d.id=wi.definition_id LEFT JOIN workflow_steps s ON s.definition_id=wi.definition_id AND s.position=wi.current_step WHERE wi.person_id=$1 ORDER BY wi.created_at DESC LIMIT 50",
          [id],
        );
        const tasks = await q(
          "SELECT id,scope,status,due_on,assigned_to,created_at FROM operational_tasks WHERE person_id=$1 ORDER BY due_on NULLS LAST,created_at DESC LIMIT 50",
          [id],
        );
        await audit(q, r.actor.id, r.church, "member-overview.viewed", id);
        return { person, household, cells, events, education, teams, schedules, workflows, tasks };
      }));
    }),
  );
  app.patch(
    "/api/people/:id/profile",
    route(async (r: AuthRequest, s) => {
      const id = z.uuid().parse(r.params.id),
        b = profileWriteSchema.parse(r.body),
        photo = await normalizeMemberPhoto(b.photo);
      s.json(
        await scoped(r, (q) =>
          saveProfile(q, r.actor.id, r.actor.name, r.church, b, options.key, photo, id),
        ),
      );
    }),
  );
  app.get(
    "/api/people/:id/history",
    route(async (r: AuthRequest, s) => {
      const id = z.uuid().parse(r.params.id);
      const params = z.object({
        page: z.coerce.number().int().min(1).default(1),
        pageSize: z.coerce.number().int().min(1).max(100).default(25),
      }).parse(r.query);
      const legacyArray = r.query.page === undefined && r.query.pageSize === undefined;
      const result = await scoped(r, async (q) => {
          const [count] = await q("SELECT count(*)::int AS total FROM member_change_log WHERE person_id=$1 AND church_id=$2", [id, r.church]);
          const items = await q(
            "SELECT id,actor_name,changed_fields,changed_at FROM member_change_log WHERE person_id=$1 AND church_id=$2 ORDER BY changed_at DESC LIMIT $3 OFFSET $4",
            [id, r.church, params.pageSize, (params.page - 1) * params.pageSize],
          );
          return { items, total: Number(count.total), page: params.page, pageSize: params.pageSize, pages: Math.max(1, Math.ceil(Number(count.total) / params.pageSize)) };
        });
      s.json(legacyArray ? result.items : result);
    }),
  );
  app.get(
    "/api/people/:id/photo",
    route(async (r: AuthRequest, s) => {
      const id = z.uuid().parse(r.params.id);
      if (!r.church) r.church = z.uuid().parse(r.query.church);
      const [photo] = await db.transaction(
        (q) =>
          q("SELECT encrypted_data FROM member_photos WHERE person_id=$1", [
            id,
          ]),
        { actor: r.actor.id, church: r.church },
      );
      requireThat(photo, 404, "Foto não encontrada.");
      s.type("image/webp")
        .set("Content-Disposition", "inline")
        .send(
          Buffer.from(decrypt(photo.encrypted_data, options.key), "base64"),
        );
    }),
  );
  app.get(
    "/api/registration/links",
    route(async (r: AuthRequest, s) => {
      s.json(
        await scoped(r, async (q) =>
          (
            await q("SELECT * FROM registration_links ORDER BY created_at DESC")
          ).map((l) => ({
            id: l.id,
            title: l.title,
            active: l.active,
            photoRequired: l.photo_required,
            expiresAt: l.expires_at,
            campusId: l.campus_id,
            url: linkUrl(
              options.origin,
              decrypt(l.encrypted_token, options.key),
            ),
          })),
        ),
      );
    }),
  );
  app.post(
    "/api/registration/links",
    route(async (r: AuthRequest, s) => {
      const b = z
        .object({
          title: z
            .string()
            .trim()
            .min(3)
            .max(150)
            .default("Ficha de cadastro de membros"),
          days: z.number().int().min(1).max(365).default(90),
          photoRequired: z.boolean().default(false),
          campusId: z.uuid().nullable().default(null),
        })
        .strict()
        .parse(r.body);
      const raw = token();
      s.status(201).json(
        await scoped(r, async (q) => {
          const [l] = await q(
            "INSERT INTO registration_links(church_id,campus_id,token_hash,encrypted_token,title,photo_required,expires_at,created_by) VALUES($1,$2,$3,$4,$5,$6,now()+($7::int*interval '1 day'),$8) RETURNING id,expires_at",
            [
              r.church,
              b.campusId,
              hash(raw),
              encrypt(raw, options.key),
              b.title,
              b.photoRequired,
              b.days,
              r.actor.id,
            ],
          );
          await audit(
            q,
            r.actor.id,
            r.church,
            "registration-link.created",
            l.id,
          );
          return {
            id: l.id,
            url: linkUrl(options.origin, raw),
            expiresAt: l.expires_at,
          };
        }),
      );
    }),
  );
  app.patch(
    "/api/registration/links/:id",
    route(async (r: AuthRequest, s) => {
      const id = z.uuid().parse(r.params.id),
        b = z.object({ active: z.boolean() }).strict().parse(r.body);
      await scoped(r, async (q) => {
        const rows = await q(
          "UPDATE registration_links SET active=$1 WHERE id=$2 RETURNING id",
          [b.active, id],
        );
        requireThat(rows.length, 404, "Link não encontrado.");
        await audit(
          q,
          r.actor.id,
          r.church,
          b.active
            ? "registration-link.activated"
            : "registration-link.revoked",
          id,
        );
      });
      s.json({ ok: true });
    }),
  );
  app.get(
    "/api/registration/submissions",
    route(async (r: AuthRequest, s) => {
      const query = z
        .object({
          page: z.coerce.number().int().min(1).max(1000000).default(1),
          pageSize: z.coerce.number().int().min(1).max(100).default(25),
          status: z
            .enum(["all", "pending", "approved", "rejected"])
            .default("all"),
        })
        .parse(r.query);
      s.json(await scoped(r, async (q) => {
          const [counts] = await q(
            "SELECT count(*)::int AS total,count(*) FILTER(WHERE status='pending')::int AS pending,count(*) FILTER(WHERE $1='all' OR status=$1)::int AS filtered FROM registration_submissions",
            [query.status],
          );
          const pages = Math.max(
            1,
            Math.ceil(counts.filtered / query.pageSize),
          );
          const page = Math.min(query.page, pages);
          const rows = await q(
            "SELECT id,encrypted_payload,encrypted_photo IS NOT NULL AS has_photo,status,created_at FROM registration_submissions WHERE $1='all' OR status=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3",
            [query.status, query.pageSize, (page - 1) * query.pageSize],
          );
          return {
            ...counts,
            page,
            pageSize: query.pageSize,
            pages,
            items: rows.map((v) => {
              const p = JSON.parse(
                decrypt(v.encrypted_payload, options.key),
              ).profile;
              return {
                id: v.id,
                name: [p.firstName, p.lastName].filter(Boolean).join(" "),
                congregation: p.congregation,
                email: p.email,
                phone: p.phone,
                hasPhoto: v.has_photo,
                status: v.status,
                createdAt: v.created_at,
              };
            }),
          };
        }));
    }),
  );
  app.get(
    "/api/registration/submissions/:id",
    route(async (r: AuthRequest, s) => {
      const id = z.uuid().parse(r.params.id);
      s.json(await scoped(r, async (q) => {
          const [v] = await q(
            "SELECT * FROM registration_submissions WHERE id=$1",
            [id],
          );
          requireThat(v, 404, "Ficha não encontrada.");
          const [link] = await q(
            "SELECT campus_id FROM registration_links WHERE id=$1",
            [v.link_id],
          );
          const payload = JSON.parse(decrypt(v.encrypted_payload, options.key));
          const p = payload.profile;
          const candidates = await q(
            "SELECT id,name,email,phone FROM people WHERE (NULLIF($1,'') IS NOT NULL AND lower(email)=lower($1)) OR (NULLIF($2,'') IS NOT NULL AND regexp_replace(phone,'[^0-9]','','g')=regexp_replace($2,'[^0-9]','','g')) OR lower(name)=lower($3)",
            [
              p.email,
              p.phone,
              [p.firstName, p.lastName].filter(Boolean).join(" "),
            ],
          );
          await audit(q, r.actor.id, r.church, "registration.viewed", id);
          return {
            id: v.id,
            profile: p,
            administration: defaultAdministration(),
            version: 0,
            status: v.status,
            campusId: link?.campus_id ?? null,
            submissionCampusId: link?.campus_id ?? null,
            photoDataUrl: v.encrypted_photo
              ? "data:image/webp;base64," +
                decrypt(v.encrypted_photo, options.key)
              : null,
            createdAt: v.created_at,
            consent: payload.consent,
            candidates,
          };
        }));
    }),
  );
  app.post(
    "/api/registration/submissions/:id/approve",
    route(async (r: AuthRequest, s) => {
      const id = z.uuid().parse(r.params.id);
      const b = profileWriteSchema
        .extend({ targetPersonId: z.uuid().optional() })
        .parse(r.body);
      const photo = await normalizeMemberPhoto(b.photo);
      const result = await scoped(r, async (q) => {
          const [submission] = await q(
            "SELECT s.*,l.campus_id FROM registration_submissions s JOIN registration_links l ON l.id=s.link_id WHERE s.id=$1 AND s.status='pending' FOR UPDATE OF s",
            [id],
          );
          requireThat(
            submission,
            409,
            "Esta ficha já foi analisada ou não está disponível.",
          );
          let normalized = photo;
          if (b.photo === undefined && submission.encrypted_photo)
            normalized = decrypt(submission.encrypted_photo, options.key);
          const result = await saveProfile(
            q,
            r.actor.id,
            r.actor.name,
            r.church,
            {
              ...b,
              householdId: b.targetPersonId
                ? (b.householdId ?? undefined)
                : b.householdId,
              campusId: b.targetPersonId
                ? (b.campusId ?? undefined)
                : (b.campusId ?? submission.campus_id),
            },
            options.key,
            normalized,
            b.targetPersonId,
          );
          await q(
            "UPDATE registration_submissions SET status='approved',person_id=$1,reviewed_by=$2,reviewed_at=now() WHERE id=$3",
            [result.id, r.actor.id, id],
          );
          await audit(q, r.actor.id, r.church, "registration.approved", id);
          return { id: result.id, status: "approved" };
      });
      await db.transaction((q) => q("UPDATE operational_tasks SET status='done',version=version+1 WHERE source_type='registration_submission' AND source_id=$1 AND status IN ('open','in_progress')", [id]));
      s.json(result);
    }),
  );
  app.post(
    "/api/registration/submissions/:id/reject",
    route(async (r: AuthRequest, s) => {
      const id = z.uuid().parse(r.params.id),
        b = z
          .object({ reason: z.string().trim().min(3).max(500) })
          .parse(r.body);
      await scoped(r, async (q) => {
        const rows = await q(
          "UPDATE registration_submissions SET status='rejected',reviewed_by=$1,reviewed_at=now(),review_reason=$2 WHERE id=$3 AND status='pending' RETURNING id",
          [r.actor.id, b.reason, id],
        );
        requireThat(
          rows.length,
          409,
          "Esta ficha já foi analisada ou não está disponível.",
        );
        await audit(q, r.actor.id, r.church, "registration.rejected", id);
      });
      await db.transaction((q) => q("UPDATE operational_tasks SET status='done',version=version+1 WHERE source_type='registration_submission' AND source_id=$1 AND status IN ('open','in_progress')", [id]));
      s.json({ ok: true });
    }),
  );
}
