import PDFDocument from "pdfkit";
import * as archiver from "archiver";
import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import type { Database, Query, Row } from "./db.js";
import { audit } from "./seed.js";
import { decrypt, requireThat } from "./security.js";

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result)) return "Não informado";
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

function buildPdf(data: Awaited<ReturnType<typeof loadPerson>>, generatedBy: string) {
  const doc = new PDFDocument({ size: "A4", margin: 42, info: { Title: `Ficha de ${data.person.name}`, Author: "EcclesiaOS" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const color = String(data.person.primary_color || "#7062db");
  doc.fillColor(color).rect(0, 0, doc.page.width, 92).fill();
  const logo = imageBuffer(data.person.logo_url);
  if (logo) { try { doc.image(logo, 42, 18, { fit: [58, 58] }); } catch { /* logo inválida não interrompe a ficha */ } }
  doc.fillColor("#ffffff").fontSize(18).font("Helvetica-Bold").text(text(data.person.church_name), logo ? 115 : 42, 27, { width: 420 });
  doc.font("Helvetica").fontSize(10).text("Ficha cadastral de membro", logo ? 115 : 42, 53);
  doc.fillColor("#1f2937").moveDown(2);
  if (data.photo) { try { doc.image(data.photo, 410, 112, { fit: [130, 150], align: "center", valign: "center" }); } catch { /* foto inválida não interrompe a ficha */ } }
  doc.font("Helvetica-Bold").fontSize(16).text(text(data.person.name), 42, 116, { width: 340 });
  doc.font("Helvetica").fontSize(9).fillColor("#64748b").text(`Gerado em ${new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date())}`, 42, 141);
  doc.fillColor("#1f2937");
  const section = (title: string) => { doc.moveDown(1.3).fillColor(color).font("Helvetica-Bold").fontSize(11).text(title.toUpperCase()); doc.moveTo(42, doc.y + 3).lineTo(553, doc.y + 3).strokeColor(color).stroke(); doc.moveDown(0.4).fillColor("#1f2937").font("Helvetica").fontSize(9); };
  const row = (label: string, value: unknown) => { doc.font("Helvetica-Bold").text(`${label}: `, { continued: true }); doc.font("Helvetica").text(text(value)); };
  section("Dados pessoais");
  row("Nome completo", data.person.name); row("Nascimento", date(data.profile.birthDate)); row("Sexo", data.profile.sex); row("Estado civil", data.profile.maritalStatus); row("CPF", data.profile.cpf); row("RG", data.profile.rg);
  section("Contato e endereço");
  row("Telefone", data.profile.phone || data.person.phone); row("Telefone secundário", data.profile.phone2); row("E-mail", data.profile.email || data.person.email); const a = data.profile.address ?? {}; row("Endereço", [a.street, a.number, a.neighborhood].filter(Boolean).join(", ")); row("Cidade/UF", [a.city, a.state].filter(Boolean).join("/")); row("CEP", a.postalCode);
  section("Vínculo com a igreja");
  row("Unidade", data.person.church_name); row("Campus", data.person.campus_name); row("Situação", data.administration.status || data.person.status); row("Congregação informada", data.profile.congregation); row("Data de conversão", date(data.profile.conversionDate)); row("Batismo", data.profile.baptized === "yes" ? "Sim" : data.profile.baptized === "no" ? "Não" : "Não informado"); row("Grupos", data.groups.map((g) => g.name).join(", ")); row("Categorias", Array.isArray(data.administration.categories) ? data.administration.categories.join(", ") : ""); row("Funções", Array.isArray(data.administration.positions) ? data.administration.positions.join(", ") : "");
  if (data.courses.length) { section("Ensino e formação"); for (const course of data.courses) row(`${course.track === "discipulado" ? "Discipulado" : "Curso"}`, `${course.course_name} · ${course.class_name} · ${course.status}`); }
  if (data.history.length) { section("Histórico administrativo"); for (const event of data.history) row(date(event.event_date), `${event.title}${event.description ? ` — ${event.description}` : ""}`); }
  section("Identificação do documento"); row("Cadastrado em", date(data.person.created_at)); row("Gerado por", generatedBy); row("Versão", "Modelo padrão EcclesiaOS 1.0");
  doc.fontSize(8).fillColor("#64748b").text("Documento gerado pelo EcclesiaOS. Os dados devem ser tratados conforme a finalidade autorizada e a política de privacidade da igreja.", 42, 770, { width: 510, align: "center" });
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
