import PDFDocument from "pdfkit";
import * as archiver from "archiver";
import sharp from "sharp";
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

export async function buildPdf(data: Awaited<ReturnType<typeof loadPerson>>, generatedBy: string) {
  const isMinor = (ageOn(String(data.profile.birthDate ?? "")) ?? 18) < 18;
  const photo = data.photo ? await sharp(data.photo).png().toBuffer() : null;
  const doc = new PDFDocument({ size: "A4", margin: 0, info: { Title: `Ficha de ${data.person.name}`, Author: "EcclesiaOS" } });
  const chunks: Buffer[] = [];
  doc.on("data", (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve, reject) => { doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const pageWidth = 595.28;
  const colors = { navy: "#17324d", blue: "#2e6f9e", pale: "#eef4f8", line: "#c9d4dc", ink: "#1f2933", muted: "#5f6b75" };
  const p = data.profile as any;
  const a = p.address ?? {};
  const adm = data.administration as any;
  const situation = adm.communion === "disciplined" ? "Disciplinado" : data.person.status === "inactive" ? "Não ativo" : "Ativo";
  const relationship = ({ visitor: "Visitante", congregado: "Congregado", member: "Membro", worker: "Obreiro", inactive: "Inativo" } as Record<string, string>)[String(data.person.status)] ?? "Não informado";
  const churchName = text(data.person.church_name, "Igreja");
  const dateLabel = new Intl.DateTimeFormat("pt-BR").format(new Date());
  const drawHeader = (title: string, subtitle: string) => {
    doc.rect(0, 0, pageWidth, 76).fill(colors.navy);
    const logo = imageBuffer((data.person as any).logo_url);
    if (logo) { try { doc.image(logo, 28, 12, { fit: [50, 50], align: "center", valign: "center" }); } catch { /* logo inválido não interrompe a ficha */ } }
    doc.fillColor("#ffffff").font("Helvetica-Bold").fontSize(18).text(title, 92, 18, { width: 470, lineBreak: false });
    doc.font("Helvetica").fontSize(9).text(subtitle, 92, 45, { width: 470, lineBreak: false });
    doc.fillColor(colors.ink);
  };
  const section = (label: string, y: number) => {
    doc.roundedRect(28, y, pageWidth - 56, 22, 4).fill(colors.pale);
    doc.fillColor(colors.navy).font("Helvetica-Bold").fontSize(10).text(label, 38, y + 6, { lineBreak: false });
    doc.fillColor(colors.ink);
  };
  const field = (label: string, raw: unknown, x: number, y: number, width: number, opts: { height?: number; size?: number } = {}) => {
    const height = opts.height ?? 34;
    doc.roundedRect(x, y, width, height, 3).lineWidth(0.7).stroke(colors.line);
    doc.fillColor(colors.muted).font("Helvetica-Bold").fontSize(7.5).text(label.toUpperCase(), x + 8, y + 5, { width: width - 16, lineBreak: false });
    const v = text(raw, "");
    if (v) doc.fillColor(colors.ink).font("Helvetica").fontSize(opts.size ?? 9).text(v.slice(0, 160), x + 8, y + 17, { width: width - 16, height: height - 19, ellipsis: true, lineBreak: false });
    doc.fillColor(colors.ink);
  };
  const paragraph = (label: string, raw: unknown, x: number, y: number, width: number, height: number) => {
    doc.roundedRect(x, y, width, height, 3).lineWidth(0.7).stroke(colors.line);
    doc.fillColor(colors.muted).font("Helvetica-Bold").fontSize(7.5).text(label.toUpperCase(), x + 8, y + 5, { width: width - 16, lineBreak: false });
    const v = text(raw, "");
    if (v) doc.fillColor(colors.ink).font("Helvetica").fontSize(9).text(v.slice(0, 600), x + 8, y + 18, { width: width - 16, height: height - 22, ellipsis: true });
    doc.fillColor(colors.ink);
  };
  const footer = (page: number) => {
    doc.moveTo(28, 808).lineTo(pageWidth - 28, 808).lineWidth(0.5).stroke(colors.line);
    doc.fillColor(colors.muted).font("Helvetica").fontSize(7.5).text(`${churchName} - Ficha cadastral ${isMinor ? "de menor de idade" : "de membro"} - Gerado por ${generatedBy}`, 28, 817, { width: 390, lineBreak: false });
    doc.text(`Página ${page} · ${dateLabel}`, 420, 817, { width: 147, align: "right", lineBreak: false });
    doc.fillColor(colors.ink);
  };

  drawHeader("Ficha cadastral de membro", isMinor ? "Cadastro de menor de idade - dados do responsável legal na segunda página" : "Cadastro e acompanhamento administrativo da membresia");
  const photoX = 455, photoY = 92, photoW = 112, photoH = 132;
  doc.roundedRect(photoX, photoY, photoW, photoH, 4).lineWidth(1).stroke(colors.blue);
  if (photo) { try { doc.image(photo, photoX + 5, photoY + 5, { fit: [photoW - 10, photoH - 10], align: "center", valign: "center" }); } catch { /* foto inválida não interrompe a ficha */ } }
  else doc.fillColor(colors.muted).font("Helvetica").fontSize(8).text("FOTO", photoX, photoY + 61, { width: photoW, align: "center" });
  doc.fillColor(colors.ink);
  section("IDENTIFICAÇÃO", 92);
  field("Nome completo", data.person.name, 28, 122, 410, { size: 10 });
  field("Código do membro", data.person.id.slice(0, 12), 28, 160, 190);
  field("Situação", situation, 226, 160, 212);
  field("Igreja / congregação", p.congregation || churchName, 28, 198, 410);
  field("Campus / setor", [p.campus, p.sector].filter(Boolean).join(" / "), 28, 236, 410);
  section("CONTATO E ENDEREÇO", 284);
  field("Endereço", [a.street, a.number].filter(Boolean).join(", "), 28, 314, 410);
  field("Bairro", a.neighborhood, 28, 352, 195);
  field("Cidade / UF", [a.city, a.state].filter(Boolean).join(" / "), 231, 352, 207);
  field("CEP", a.postalCode, 28, 390, 195);
  field("Telefone", p.phone || data.person.phone, 231, 390, 207);
  field("Celular / WhatsApp", p.phone2, 28, 428, 195);
  field("E-mail", p.email || data.person.email, 231, 428, 207);
  section("DOCUMENTOS E DADOS PESSOAIS", 476);
  field("CPF", p.cpf, 28, 506, 195);
  field("RG", p.rg, 231, 506, 207);
  field("Título de eleitor", p.voterTitle, 28, 544, 195);
  field("Data de nascimento", date(p.birthDate), 231, 544, 207);
  field("Naturalidade", p.birthPlace, 28, 582, 195);
  field("Nacionalidade", p.nationality, 231, 582, 207);
  field("Profissão", p.profession, 28, 620, 195);
  field("Escolaridade", p.education, 231, 620, 207);
  field("Sexo", p.sex, 28, 658, 195);
  field("Estado civil", p.maritalStatus, 231, 658, 207);
  field("Data de cadastro", date(data.person.created_at), 28, 696, 195);
  field("Autorização de imagem", p.imageAuthorization ? "Autorizada" : "Não informada", 231, 696, 207);
  footer(1);

  doc.addPage();
  drawHeader("Ficha cadastral de membro", "Informações familiares, ministeriais e histórico administrativo");
  section("FILIAÇÃO E FAMÍLIA", 92);
  field("Nome do pai", p.fatherName, 28, 122, 539);
  field("Nome da mãe", p.motherName, 28, 160, 539);
  field("Cônjuge", p.spouseName, 28, 198, 270);
  field("Data do casamento", date(p.marriageDate), 308, 198, 126);
  field("Registro do casamento", p.marriageId, 28, 236, 270);
  field("Quantidade de filhos", p.childrenCount, 308, 236, 126);
  section("BATISMO, CONVERSÃO E RECEBIMENTO", 284);
  field("Origem / procedência", p.origin, 28, 314, 539);
  field("Data da conversão", date(p.conversionDate), 28, 352, 170);
  field("Local de batismo", p.baptismLocation, 208, 352, 226);
  field("Data de batismo", date(p.baptismDate), 28, 390, 170);
  field("Batismo no Espírito Santo", p.holySpiritBaptism === "yes" ? "Sim" : p.holySpiritBaptism === "no" ? "Não" : "Não informado", 208, 390, 226);
  field("Data do batismo no Espírito Santo", date(p.holySpiritBaptismDate), 28, 428, 170);
  field("Tipo de recebimento", p.receptionType, 208, 428, 226);
  field("Data de recebimento", date(p.receptionDate), 28, 466, 170);
  field("Tipo de admissão", p.admissionType, 208, 466, 226);
  section("GRUPOS, ENSINO E FUNÇÕES", 514);
  field("Grupos", data.groups.map((g: Row) => g.name).join(", "), 28, 544, 539);
  field("Vínculo", relationship, 28, 582, 170);
  field("Funções ministeriais", adm.roles || adm.ministries, 208, 582, 359);
  const courseSummary = data.courses.map((course: Row) => [course.course_name, course.track, course.status].filter(Boolean).join(" - ")).join("; ");
  paragraph("EBD, discipulado e cursos", courseSummary, 28, 620, 539, 48);
  section("HISTÓRICO ADMINISTRATIVO", 682);
  const historySummary = data.history.map((event: Row) => `${date(event.event_date)} - ${event.title || event.event_type}${event.description ? `: ${event.description}` : ""}`).join("\n");
  paragraph("Linha do tempo", historySummary, 28, 712, 539, 58);
  if (isMinor) {
    field("Responsável legal", p.guardianName, 28, 778, 220, { height: 30 });
    field("Parentesco", p.guardianRelationship, 258, 778, 130, { height: 30 });
    field("Contato do responsável", p.guardianContact, 398, 778, 169, { height: 30 });
  }
  footer(2);
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
