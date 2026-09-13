import { formatDate, memberGroupLabel } from "./app-helpers";
import { classNameById } from "./attendance-helpers";
import { escapeHtml } from "./report-helpers";
import type { AppData, KidRecord, MemberRecord } from "./types";

export type PrintableDocumentKind =
  | "member-file"
  | "transfer-letter"
  | "recommendation-letter"
  | "school-certificate"
  | "discipleship-certificate"
  | "kid-presentation";

export const printableDocumentDefinitions: Array<{ kind: PrintableDocumentKind; title: string; target: "member" | "kid" }> = [
  { kind: "member-file", title: "Ficha cadastral do membro", target: "member" },
  { kind: "transfer-letter", title: "Carta de transferência", target: "member" },
  { kind: "recommendation-letter", title: "Carta de acompanhamento", target: "member" },
  { kind: "school-certificate", title: "Diploma / certificado EBD", target: "member" },
  { kind: "discipleship-certificate", title: "Diploma / certificado Discipulado", target: "member" },
  { kind: "kid-presentation", title: "Apresentação de criança", target: "kid" },
];

type PrintableDocument = {
  bodyHtml: string;
  title: string;
};

function valueOrFallback(value: unknown) {
  const text = typeof value === "string" ? value.trim() : String(value ?? "").trim();
  return text || "Não informado";
}

function field(label: string, value: unknown) {
  return `
    <div class="doc-field">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(valueOrFallback(value))}</strong>
    </div>
  `;
}

function section(title: string, fields: string) {
  return `
    <section class="doc-section">
      <h2>${escapeHtml(title)}</h2>
      <div class="doc-grid">${fields}</div>
    </section>
  `;
}

function todayLong() {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date());
}

function signatureBlock(label = "Pastor / Secretaria") {
  return `
    <div class="signature-block">
      <span></span>
      <strong>${escapeHtml(label)}</strong>
    </div>
  `;
}

function memberPhoto(member: MemberRecord) {
  if (member.photoUrl) {
    return `<img alt="${escapeHtml(member.fullName)}" class="member-file-photo" src="${escapeHtml(member.photoUrl)}" />`;
  }

  return `<div class="member-file-photo placeholder">${escapeHtml(member.fullName.slice(0, 1) || "M")}</div>`;
}

function memberFile(data: AppData, member: MemberRecord): PrintableDocument {
  const schoolClass = classNameById(data.schoolClasses, member.schoolClassId) || "Não matriculado";
  const discipleshipClass = classNameById(data.discipleshipClasses, member.discipleshipClassId) || "Não matriculado";
  const title = `Ficha cadastral - ${member.fullName}`;

  return {
    title,
    bodyHtml: `
      <div class="member-file-header">
        ${memberPhoto(member)}
        <div>
          <p class="eyebrow">Ficha cadastral do membro</p>
          <h1>${escapeHtml(member.fullName)}</h1>
          <p>Código: ${escapeHtml(valueOrFallback(member.memberCode))}</p>
        </div>
      </div>
      ${section(
        "Dados pessoais",
        [
          field("Nome completo", member.fullName),
          field("CPF", member.cpf),
          field("Telefone", member.phone),
          field("E-mail", member.email),
          field("Nascimento", formatDate(member.birthDate)),
          field("Idade", member.age),
          field("Faixa etária", member.ageGroup),
          field("Sexo", member.gender),
          field("Pai", member.fatherName),
          field("Mãe", member.motherName),
          field("Cônjuge", member.spouseName),
          field("Estado civil", member.maritalStatus),
          field("Escolaridade", member.education),
        ].join(""),
      )}
      ${section(
        "Endereço",
        [
          field("Endereço", member.address),
          field("Bairro", member.neighborhood),
          field("Cidade", member.city),
          field("CEP", member.zipCode),
        ].join(""),
      )}
      ${section(
        "Igreja e acompanhamento",
        [
          field("Congregação", member.congregation),
          field("Grupos", memberGroupLabel(member)),
          field("Cargos", member.role),
          field("Função ministerial", member.ministerialFunction),
          field("Categorias", member.categories),
          field("EBD", schoolClass),
          field("Discipulado", discipleshipClass),
          field("Conversão", formatDate(member.conversionDate)),
          field("Batismo", formatDate(member.baptismDate)),
          field("Origem do cadastro", member.registrationSource),
          field("Situação pastoral", member.pastoralStatus),
        ].join(""),
      )}
      ${section(
        "Observações",
        [field("Observação visível ao membro", member.memberVisibleNotes), field("Observações internas", member.notes)].join(""),
      )}
      <p class="doc-footer-note">Ficha gerada em ${escapeHtml(new Date().toLocaleString("pt-BR"))}.</p>
    `,
  };
}

function transferLetter(member: MemberRecord): PrintableDocument {
  return {
    title: `Carta de transferência - ${member.fullName}`,
    bodyHtml: `
      <h1>Carta de transferência</h1>
      <p class="doc-text">
        Declaramos, para os devidos fins, que <strong>${escapeHtml(member.fullName)}</strong>, CPF
        <strong>${escapeHtml(valueOrFallback(member.cpf))}</strong>, encontra-se cadastrado(a) nesta igreja como
        <strong>${escapeHtml(valueOrFallback(member.status))}</strong>.
      </p>
      <p class="doc-text">
        Por solicitação do(a) membro, emitimos esta carta para fins de transferência e acompanhamento junto à nova congregação,
        rogando que seja recebido(a) em comunhão cristã, conforme a orientação pastoral.
      </p>
      <p class="doc-place">Local e data: ${escapeHtml(todayLong())}</p>
      ${signatureBlock()}
    `,
  };
}

function recommendationLetter(member: MemberRecord): PrintableDocument {
  return {
    title: `Carta de acompanhamento - ${member.fullName}`,
    bodyHtml: `
      <h1>Carta de acompanhamento</h1>
      <p class="doc-text">
        Apresentamos <strong>${escapeHtml(member.fullName)}</strong>, da congregação
        <strong>${escapeHtml(valueOrFallback(member.congregation))}</strong>, para acompanhamento, integração e cuidado pastoral.
      </p>
      <p class="doc-text">
        Solicitamos que a liderança local ofereça acolhimento, orientação e acompanhamento espiritual, preservando o cuidado,
        a comunhão e a responsabilidade cristã.
      </p>
      <p class="doc-place">Local e data: ${escapeHtml(todayLong())}</p>
      ${signatureBlock()}
    `,
  };
}

function certificate(data: AppData, member: MemberRecord, area: "school" | "discipleship"): PrintableDocument {
  const className =
    area === "school"
      ? classNameById(data.schoolClasses, member.schoolClassId) || "Escola Bíblica Dominical"
      : classNameById(data.discipleshipClasses, member.discipleshipClassId) || "Discipulado";
  const areaLabel = area === "school" ? "Escola Bíblica Dominical" : "Discipulado";

  return {
    title: `Certificado ${areaLabel} - ${member.fullName}`,
    bodyHtml: `
      <div class="certificate">
        <p class="eyebrow">Certificado</p>
        <h1>${escapeHtml(areaLabel)}</h1>
        <p>Certificamos que</p>
        <strong>${escapeHtml(member.fullName)}</strong>
        <p>participou da classe <b>${escapeHtml(className)}</b>, conforme registros da igreja.</p>
        <p class="doc-place">${escapeHtml(todayLong())}</p>
        ${signatureBlock("Professor / Coordenação")}
      </div>
    `,
  };
}

function kidPresentation(kid: KidRecord): PrintableDocument {
  return {
    title: `Apresentação de criança - ${kid.childName}`,
    bodyHtml: `
      <h1>Apresentação de criança</h1>
      <p class="doc-text">
        Registramos a apresentação da criança <strong>${escapeHtml(kid.childName)}</strong>, nascida em
        <strong>${escapeHtml(formatDate(kid.birthDate))}</strong>, sob responsabilidade de
        <strong>${escapeHtml(valueOrFallback(kid.guardianName))}</strong>.
      </p>
      <p class="doc-text">
        Que o Senhor abençoe esta criança e sua família, conduzindo-os em graça, sabedoria e fé.
      </p>
      ${section(
        "Dados da criança",
        [
          field("Nome", kid.childName),
          field("Nascimento", formatDate(kid.birthDate)),
          field("Faixa", kid.ageGroup),
          field("Turma", kid.className),
          field("Responsável", kid.guardianName),
          field("Telefone", kid.guardianPhone),
          field("Congregação", kid.congregation),
        ].join(""),
      )}
      <p class="doc-place">Local e data: ${escapeHtml(todayLong())}</p>
      ${signatureBlock()}
    `,
  };
}

export function buildPrintableDocument(data: AppData, kind: PrintableDocumentKind, targetId: string): PrintableDocument | null {
  if (kind === "kid-presentation") {
    const kid = data.kids.find((item) => item.id === targetId);
    return kid ? kidPresentation(kid) : null;
  }

  const member = data.members.find((item) => item.id === targetId);
  if (!member) return null;

  if (kind === "member-file") return memberFile(data, member);
  if (kind === "transfer-letter") return transferLetter(member);
  if (kind === "recommendation-letter") return recommendationLetter(member);
  if (kind === "school-certificate") return certificate(data, member, "school");
  if (kind === "discipleship-certificate") return certificate(data, member, "discipleship");

  return null;
}
