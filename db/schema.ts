import { integer, real, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const churches = sqliteTable("churches", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  city: text("city").notNull(),
  state: text("state").notNull(),
  pixKey: text("pix_key"),
  privacyNotice: text("privacy_notice").notNull(),
  createdAt: text("created_at").notNull(),
});

export const profiles = sqliteTable("profiles", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  authUserId: text("auth_user_id").notNull(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone"),
  role: text("role", {
    enum: ["pastor", "tesoureiro", "secretaria", "lider", "membro"],
  }).notNull(),
  ministryId: text("ministry_id"),
  invitedBy: text("invited_by"),
  status: text("status", { enum: ["convidado", "ativo", "bloqueado"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const ministries = sqliteTable("ministries", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  name: text("name").notNull(),
  leaderProfileId: text("leader_profile_id").references(() => profiles.id),
});

export const families = sqliteTable("families", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  name: text("name").notNull(),
  address: text("address"),
});

export const members = sqliteTable("members", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  familyId: text("family_id").references(() => families.id),
  profileId: text("profile_id").references(() => profiles.id),
  fullName: text("full_name").notNull(),
  email: text("email"),
  phone: text("phone"),
  birthDate: text("birth_date"),
  baptismDate: text("baptism_date"),
  roleTitle: text("role_title"),
  status: text("status", { enum: ["membro", "visitante", "inativo"] }).notNull(),
  lgpdConsentAt: text("lgpd_consent_at"),
  createdAt: text("created_at").notNull(),
});

export const attendance = sqliteTable("attendance", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  memberId: text("member_id").notNull().references(() => members.id),
  className: text("class_name").notNull(),
  attendedAt: text("attended_at").notNull(),
});

export const transferLetters = sqliteTable("transfer_letters", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  memberId: text("member_id").notNull().references(() => members.id),
  destinationChurch: text("destination_church").notNull(),
  body: text("body").notNull(),
  issuedAt: text("issued_at").notNull(),
});

export const assets = sqliteTable("assets", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  name: text("name").notNull(),
  category: text("category", { enum: ["movel", "instrumento", "som", "imovel", "outro"] }).notNull(),
  location: text("location"),
  condition: text("condition"),
  documentFileKey: text("document_file_key"),
  createdAt: text("created_at").notNull(),
});

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  memberId: text("member_id").references(() => members.id),
  type: text("type", { enum: ["dizimo", "oferta", "entrada", "saida", "conta_pagar"] }).notNull(),
  amount: real("amount").notNull(),
  status: text("status", { enum: ["pendente", "confirmado", "rejeitado", "pago"] }).notNull(),
  method: text("method", { enum: ["pix_manual", "dinheiro", "transferencia", "outro"] }).notNull(),
  proofFileKey: text("proof_file_key"),
  dueDate: text("due_date"),
  paidAt: text("paid_at"),
  createdAt: text("created_at").notNull(),
});

export const schedules = sqliteTable("schedules", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  ministryId: text("ministry_id").notNull().references(() => ministries.id),
  title: text("title").notNull(),
  startsAt: text("starts_at").notNull(),
  createdBy: text("created_by").notNull().references(() => profiles.id),
});

export const scheduleAssignments = sqliteTable("schedule_assignments", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  scheduleId: text("schedule_id").notNull().references(() => schedules.id),
  memberId: text("member_id").notNull().references(() => members.id),
  functionName: text("function_name").notNull(),
  confirmationStatus: text("confirmation_status", {
    enum: ["pendente", "confirmado", "recusado"],
  }).notNull(),
  confirmedAt: text("confirmed_at"),
});

export const prayerRequests = sqliteTable("prayer_requests", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  memberId: text("member_id").references(() => members.id),
  content: text("content").notNull(),
  visibility: text("visibility", { enum: ["pastoral", "intercessores"] }).notNull(),
  status: text("status", { enum: ["novo", "em_oracao", "concluido"] }).notNull(),
  createdAt: text("created_at").notNull(),
});

export const noticePosts = sqliteTable("notice_posts", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  title: text("title").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["rascunho", "publicado"] }).notNull(),
  publishedAt: text("published_at"),
  createdBy: text("created_by").notNull().references(() => profiles.id),
});

export const mediaFiles = sqliteTable("media_files", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  ownerType: text("owner_type", { enum: ["aviso", "comprovante", "patrimonio"] }).notNull(),
  ownerId: text("owner_id").notNull(),
  fileKey: text("file_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  createdAt: text("created_at").notNull(),
});

export const bibleVersions = sqliteTable("bible_versions", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  licenseName: text("license_name").notNull(),
  licenseUrl: text("license_url"),
  canPublish: integer("can_publish", { mode: "boolean" }).notNull(),
});

export const bibleVerses = sqliteTable("bible_verses", {
  id: text("id").primaryKey(),
  versionId: text("version_id").notNull().references(() => bibleVersions.id),
  book: text("book").notNull(),
  chapter: integer("chapter").notNull(),
  verse: integer("verse").notNull(),
  content: text("content").notNull(),
});

export const hymns = sqliteTable("hymns", {
  id: text("id").primaryKey(),
  number: integer("number").notNull(),
  title: text("title").notNull(),
  lyrics: text("lyrics"),
  licenseName: text("license_name"),
  canPublishLyrics: integer("can_publish_lyrics", { mode: "boolean" }).notNull(),
});

export const favorites = sqliteTable("favorites", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  memberId: text("member_id").notNull().references(() => members.id),
  targetType: text("target_type", { enum: ["versiculo", "hino"] }).notNull(),
  targetId: text("target_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const devotionals = sqliteTable("devotionals", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  title: text("title").notNull(),
  verseReference: text("verse_reference").notNull(),
  body: text("body").notNull(),
  status: text("status", { enum: ["rascunho", "aprovado", "publicado"] }).notNull(),
  generatedAt: text("generated_at").notNull(),
  approvedBy: text("approved_by").references(() => profiles.id),
  publishedAt: text("published_at"),
});

export const messageLogs = sqliteTable("message_logs", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  senderProfileId: text("sender_profile_id").notNull().references(() => profiles.id),
  targetType: text("target_type", { enum: ["membro", "familia", "ministerio", "escala"] }).notNull(),
  targetId: text("target_id").notNull(),
  channel: text("channel", { enum: ["whatsapp_manual"] }).notNull(),
  messageBody: text("message_body").notNull(),
  createdAt: text("created_at").notNull(),
});

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  churchId: text("church_id").notNull().references(() => churches.id),
  actorProfileId: text("actor_profile_id").notNull().references(() => profiles.id),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: text("entity_id").notNull(),
  createdAt: text("created_at").notNull(),
});

export const profileAuthUserIdx = uniqueIndex("idx_profiles_auth_user")
  .on(profiles.authUserId, profiles.churchId);

export const bibleVerseIdx = uniqueIndex("idx_bible_verse_lookup")
  .on(bibleVerses.versionId, bibleVerses.book, bibleVerses.chapter, bibleVerses.verse);

export const hymnNumberIdx = uniqueIndex("idx_hymns_number").on(hymns.number);
