import { z } from "zod";

export const REGISTRATION_VERSION = 1;
export const sexOptions = [
  "Não informado",
  "Feminino",
  "Masculino",
  "Prefiro não informar",
];
export const educationOptions = [
  "Não informado",
  "Não alfabetizado",
  "Ensino fundamental incompleto",
  "Ensino fundamental completo",
  "Ensino médio incompleto",
  "Ensino médio completo",
  "Ensino superior incompleto",
  "Ensino superior completo",
  "Pós-graduação",
];
export const maritalOptions = [
  "Não informado",
  "Solteiro(a)",
  "Casado(a)",
  "União estável",
  "Divorciado(a)",
  "Separado(a)",
  "Viúvo(a)",
];
const optionalText = (max = 200) => z.string().trim().max(max).default("");
export function todayInBrazil() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export function ageOn(birth: string, today = todayInBrazil()) {
  if (!birth) return null;
  const [y, m, d] = birth.split("-").map(Number),
    [ty, tm, td] = today.split("-").map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}
export function ageGroup(birth: string) {
  const age = ageOn(birth);
  return age === null
    ? "Não informado"
    : age < 12
      ? "Criança"
      : age < 18
        ? "Adolescente"
        : age < 30
          ? "Jovem"
          : age < 60
            ? "Adulto(a)"
            : "Pessoa idosa";
}
export function validCpf(value: string) {
  const n = value.replace(/\D/g, "");
  if (!/^\d{11}$/.test(n) || /^(\d)\1{10}$/.test(n)) return false;
  for (let length = 9; length <= 10; length++) {
    let sum = 0;
    for (let i = 0; i < length; i++) sum += Number(n[i]) * (length + 1 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(n[length])) return false;
  }
  return true;
}
const optionalDate = z
  .union([z.literal(""), z.iso.date()])
  .default("")
  .refine(
    (v) => !v || v <= todayInBrazil(),
    "A data não pode estar no futuro.",
  );
export const memberProfileSchema = z
  .object({
    firstName: z.string().trim().min(1, "Informe o nome.").max(100),
    lastName: optionalText(150),
    birthDate: optionalDate.refine(
      (v) => !v || (ageOn(v) ?? 0) <= 125,
      "Confira a data de nascimento.",
    ),
    sex: z.enum(sexOptions as [string, ...string[]]).default("Não informado"),
    education: z
      .enum(educationOptions as [string, ...string[]])
      .default("Não informado"),
    maritalStatus: z
      .enum(maritalOptions as [string, ...string[]])
      .default("Não informado"),
    cpf: optionalText(20)
      .transform((v) => v.replace(/[.\-\s]/g, ""))
      .refine((v) => !v || validCpf(v), "CPF inválido."),
    rg: optionalText(30),
    congregation: optionalText(160),
    phone: optionalText(30),
    phone2: optionalText(30),
    email: z.union([z.literal(""), z.email().max(254)]).default(""),
    address: z
      .object({
        street: optionalText(),
        number: optionalText(30),
        neighborhood: optionalText(100),
        postalCode: optionalText(12).refine(
          (v) => !v || /^\d{5}-?\d{3}$/.test(v),
          "CEP inválido.",
        ),
        city: optionalText(100),
        state: optionalText(80),
        country: optionalText(80).default("Brasil"),
      })
      .strict()
      .default({
        street: "",
        number: "",
        neighborhood: "",
        postalCode: "",
        city: "",
        state: "",
        country: "Brasil",
      }),
    conversionDate: optionalDate,
    baptized: z.enum(["not_informed", "yes", "no"]).default("not_informed"),
    guardianName: optionalText(150),
    guardianContact: optionalText(100),
    guardianDeclaration: z.boolean().default(false),
  })
  .strict()
  .superRefine((p, ctx) => {
    if (p.birthDate && p.conversionDate && p.conversionDate < p.birthDate)
      ctx.addIssue({
        code: "custom",
        path: ["conversionDate"],
        message: "A conversão não pode ser anterior ao nascimento.",
      });
  });
export type MemberProfile = z.infer<typeof memberProfileSchema>;
export const administrativeSchema = z
  .object({
    status: z
      .enum(["visitor", "member", "worker", "inactive"])
      .default("member"),
    categories: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    positions: z.array(z.string().trim().min(1).max(100)).max(20).default([]),
    communion: z
      .enum(["not_informed", "active", "disciplined"])
      .default("not_informed"),
    groups: optionalText(1000),
    notes: optionalText(4000),
  })
  .strict();
export type MemberAdministration = z.infer<typeof administrativeSchema>;
export const profileWriteSchema = z
  .object({
    profile: memberProfileSchema,
    administration: administrativeSchema.default({
      status: "member",
      categories: [],
      positions: [],
      communion: "not_informed",
      groups: "",
      notes: "",
    }),
    version: z.number().int().min(0).optional(),
    householdId: z.uuid().nullable().optional(),
    campusId: z.uuid().nullable().optional(),
    photo: z.string().max(4_200_000).nullable().optional(),
  })
  .strict();
export const publicSubmissionSchema = z
  .object({
    profile: memberProfileSchema,
    photo: z.string().max(4_200_000).optional(),
    acceptedPrivacyNotice: z.literal(true, {
      error: "Confirme que leu o aviso de privacidade.",
    }),
    challenge: z.string().max(300),
    submissionKey: z.uuid(),
    website: z.string().max(200).default(""),
  })
  .strict()
  .superRefine((b, ctx) => {
    if (!b.profile.congregation)
      ctx.addIssue({
        code: "custom",
        path: ["profile", "congregation"],
        message: "Informe sua igreja ou congregação.",
      });
    if (!b.profile.email && !b.profile.phone)
      ctx.addIssue({
        code: "custom",
        path: ["profile", "phone"],
        message: "Informe pelo menos um telefone ou e-mail.",
      });
    const age = ageOn(b.profile.birthDate);
    if (age !== null && age < 18) {
      if (
        !b.profile.guardianName ||
        !b.profile.guardianContact ||
        !b.profile.guardianDeclaration
      )
        ctx.addIssue({
          code: "custom",
          path: ["profile", "guardianName"],
          message:
            "Para menores de 18 anos, informe o responsável, seu contato e a declaração de responsabilidade.",
        });
    }
  });
export function defaultProfile(firstName = ""): MemberProfile {
  return {
    firstName,
    lastName: "",
    birthDate: "",
    sex: "Não informado",
    education: "Não informado",
    maritalStatus: "Não informado",
    cpf: "",
    rg: "",
    congregation: "",
    phone: "",
    phone2: "",
    email: "",
    address: {
      street: "",
      number: "",
      neighborhood: "",
      postalCode: "",
      city: "",
      state: "",
      country: "Brasil",
    },
    conversionDate: "",
    baptized: "not_informed",
    guardianName: "",
    guardianContact: "",
    guardianDeclaration: false,
  };
}
export function defaultAdministration(
  status: MemberAdministration["status"] = "member",
): MemberAdministration {
  return {
    status,
    categories: [],
    positions: [],
    communion: "not_informed",
    groups: "",
    notes: "",
  };
}
