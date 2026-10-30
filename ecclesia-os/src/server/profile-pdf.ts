import PDFDocument from "pdfkit";
import * as archiver from "archiver";
import { readFileSync } from "node:fs";
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { Database, Query, Row } from "./db.js";
import { audit } from "./seed.js";
import { decrypt, requireThat } from "./security.js";
import { ageOn } from "../shared/registration.js";

type AuthRequest = Request & { actor: Row; church: string };
type PdfOptions = { key: Buffer };
const id = z.uuid();
const route = (fn: (r: AuthRequest, s: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req as AuthRequest, res)).catch(next);

function text(value: unknown, fallback = "Não informado") {
  const result = String(value ?? "").trim();
  return result || fallback;
}

function date(value: unknown) {
  const result = String(value ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) return "";
  const [year, month, day] = result.split("-");
  return `${day}/${month}/${year}`;
}

function safeFilename(value: unknown) {
  const normalized = String(value ?? "ficha")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
  return `${normalized || "ficha"}.pdf`;
}

function imageBuffer(value: unknown) {
  const raw = String(value ?? "");
  const match = /^data:image\/(?:png|jpe?g|webp);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
  return match ? Buffer.from(match[1], "base64") : null;
}

async function canExport(q: Query, actor: string, church: string) {
  const [permission] = await q(
    "SELECT can_access('people') AS allowed, can_access('people',true) AS manage",
  );
  requireThat(permission?.allowed && permission?.manage, 403, "Você não tem acesso ao cadastro de pessoas.");
  const [membership] = await q("SELECT local_role() AS role");
  requireThat(
    membership && ["admin", "secretary"].includes(String(membership.role)),
    403,
    "Somente administração ou secretaria pode exportar fichas completas.",
  );
}

async function loadPerson(q: Query, church: string, personId: string, key: Buffer, branding: Row = {}) {
  const [person] = await q(
    "SELECT p.id,p.name,p.email,p.phone,p.status,p.created_at,p.household_id,p.campus_id,p.user_id,h.name AS household FROM people p LEFT JOIN households h ON h.id=p.household_id WHERE p.id=$1 AND p.church_id=$2",
    [personId, church],
  );
  requireThat(person, 404, "Membro não encontrado nesta igreja.");
  Object.assign(person, branding);
  const [profileRow] = await q("SELECT encrypted_profile FROM member_profiles WHERE person_id=$1 AND church_id=$2", [personId, church]);
  const profilePayload = profileRow ? JSON.parse(decrypt(profileRow.encrypted_profile, key)) : { profile: {}, administration: {} };
  const [photo] = await q("SELECT encrypted_data FROM member_photos WHERE person_id=$1 AND church_id=$2", [personId, church]);
  const relatedGroups = await q("SELECT c.name FROM cells c JOIN cell_members cm ON cm.cell_id=c.id WHERE cm.person_id=$1 AND c.church_id=$2 ORDER BY c.name", [personId, church]);
  const groups: Row[] = relatedGroups.length
    ? relatedGroups
    : profilePayload.administration?.groups
      ? [{ name: profilePayload.administration.groups }]
      : [];
  const courses = await q("SELECT c.name AS course_name,c.track,cl.name AS class_name,ee.status,ee.enrolled_at FROM education_enrollments ee JOIN education_classes cl ON cl.id=ee.class_id JOIN education_courses c ON c.id=cl.course_id WHERE ee.person_id=$1 AND ee.church_id=$2 ORDER BY ee.enrolled_at DESC", [personId, church]);
  const history = await q("SELECT event_date,event_type,title,description FROM historical_events WHERE subject_type='person' AND subject_id=$1 AND church_id=$2 AND visibility='administrative' ORDER BY event_date ASC,created_at ASC LIMIT 100", [personId, church]);
  return { person, profile: profilePayload.profile ?? {}, administration: profilePayload.administration ?? {}, photo: photo ? Buffer.from(decrypt(photo.encrypted_data, key), "base64") : null, groups, courses, history };
}

export function buildPdf(data: Awaited<ReturnType<typeof loadPerson>>, generatedBy: string) {
  const isMinor = (ageOn(String(data.profile.birthDate ?? "")) ?? 18) < 18;
  const template = readFileSync(new URL(`./templates/member-${isMinor ? "minor" : "adult"}.png`, import.meta.url));
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `Ficha de ${data.person.name}`, Author: "EcclesiaOS" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.image(template, 0, 0, { width: 595.5, height: 842.25 });
  const value = (x: number, y: number, width: number, raw: unknown, size = 7.2) => {
    const v = text(raw, "");
    if (!v) return;
    doc.fillColor("#111111").font("Helvetica").fontSize(size).text(v.slice(0, 90), x, y, { width, height: 16, ellipsis: true, lineBreak: false });
  };
  const check = (x: number, y: number, yes: boolean) => { if (yes) value(x, y, 12, "X", 9); };
  const p = data.profile as any;
  const a = p.address ?? {};
  const adm = data.administration as any;
  if (data.photo) { try { doc.image(data.photo, 487, 23, { fit: [70, 82], align: "center", valign: "center" }); } catch { /* foto inválida não interrompe a ficha */ } }
  value(70, 159, 105, data.person.id.slice(0, 12));
  value(195, 159, 180, p.congregation || data.person.church_name);
  value(420, 159, 125, p.sector);
  value(40, 188, 545, data.person.name, 8.2);
  value(40, 218, 545, [a.street, a.number].filter(Boolean).join(", "));
  value(40, 248, 340, a.neighborhood); value(420, 248, 125, a.state);
  value(40, 278, 340, a.city); value(420, 278, 125, a.postalCode);
  value(40, 308, 340, p.phone || data.person.phone); value(420, 308, 125, p.phone2);
  value(40, 338, 165, p.cpf); value(220, 338, 155, p.rg); value(420, 338, 125, p.voterTitle);
  value(72, 374, 480, p.fatherName); value(72, 392, 480, p.motherName);
  value(40, 425, 230, p.nationality); value(390, 425, 150, p.profession);
  value(40, 455, 190, p.education); value(260, 455, 100, p.sex); value(390, 455, 150, date(p.birthDate));
  value(40, 485, 220, p.birthPlace); value(260, 485, 285, p.email || data.person.email);
  value(40, 515, 120, p.maritalStatus); value(185, 515, 120, date(p.marriageDate)); value(320, 515, 100, p.marriageId); value(470, 515, 70, p.childrenCount);
  value(40, 545, 545, p.spouseName);
  value(40, 575, 180, p.profession); value(260, 575, 180, p.education); value(460, 575, 80, date(p.birthDate));
  value(40, 605, 220, date(p.conversionDate)); value(300, 605, 245, p.holySpiritBaptism === "yes" ? "Sim" : p.holySpiritBaptism === "no" ? "Não" : "");
  value(40, 615, 510, p.origin);
  value(145, 664, 165, p.baptismLocation); value(420, 664, 120, date(p.baptismDate));
  value(145, 675, 165, p.holySpiritBaptism === "yes" ? "Sim" : p.holySpiritBaptism === "no" ? "Não" : ""); value(420, 675, 120, date(p.holySpiritBaptismDate));
  value(145, 686, 165, p.receptionType); value(420, 686, 120, date(p.receptionDate));
  if (isMinor) {
    const guardian = [p.guardianName, p.guardianRelationship, p.guardianContact].filter(Boolean).join(" · ");
    value(42, 773, 510, guardian, 6.4);
  }
  check(85, 270, String(p.admissionType).toLowerCase().includes("atual"));
  doc.fillColor("#111111").font("Helvetica").fontSize(7).text(`Registro EcclesiaOS · ${new Intl.DateTimeFormat("pt-BR").format(new Date())} · ${generatedBy}`, 42, 814, { width: 510, align: "center" });
  doc.end();
  return done;
}

export function profilePdfRoutes(app: Express, db: Database, options: PdfOptions) {
  const scoped = <T>(r: AuthRequest, fn: (q: Query) => Promise<T>) => db.transaction(fn, { actor: r.actor.id, church: r.church });
  app.get("/api/people/:id/profile.pdf", route(async (r, s) => {
    const personId = id.parse(r.params.id);
    const branding = await db.transaction((q) => q("SELECT name AS church_name,primary_color,address_line,address_number,address_neighborhood,city,state,postal_code,phone AS church_phone,institutional_email,leader_name,logo_url,founded_on FROM churches WHERE id=$1", [r.church]));
    const result = await scoped(r, async (q) => { await canExport(q, r.actor.id, r.church); return loadPerson(q, r.church, personId, options.key, branding[0]); });
    const pdf = await buildPdf(result, r.actor.name);
    await scoped(r, (q) => audit(q, r.actor.id, r.church, "person.profile-pdf-exported", personId));
    s.set("Cache-Control", "no-store").type("application/pdf").attachment(safeFilename(result.person.name)).send(pdf);
  }));
  app.post("/api/people/export.pdf", route(async (r, s) => {
    const body = z.object({ personIds: z.array(id).min(1).max(100) }).parse(r.body);
    const branding = await db.transaction((q) => q("SELECT name AS church_name,primary_color,address_line,address_number,address_neighborhood,city,state,postal_code,phone AS church_phone,institutional_email,leader_name,logo_url,founded_on FROM churches WHERE id=$1", [r.church]));
    const result = await scoped(r, async (q) => {
      await canExport(q, r.actor.id, r.church);
      const people: Awaited<ReturnType<typeof loadPerson>>[] = [];
      for (const personId of [...new Set(body.personIds)]) people.push(await loadPerson(q, r.church, personId, options.key, branding[0]));
      return people;
    });
    const archive = new archiver.ZipArchive({ zlib: { level: 6 } });
    const chunks: Buffer[] = [];
    archive.on("data", (chunk: Buffer) => chunks.push(chunk));
    const done = new Promise<Buffer>((resolve, reject) => { archive.on("end", () => resolve(Buffer.concat(chunks))); archive.on("error", reject); });
    for (const member of result) archive.append(await buildPdf(member, r.actor.name), { name: safeFilename(member.person.name) });
    await archive.finalize();
    await scoped(r, (q) => audit(q, r.actor.id, r.church, "people.profile-pdf-batch-exported"));
    s.set("Cache-Control", "no-store").type("application/zip").attachment("fichas-membros.zip").send(await done);
  }));
}
