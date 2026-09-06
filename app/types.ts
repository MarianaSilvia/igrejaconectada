export type ReportKind =
  | "members"
  | "visitors"
  | "birthdays"
  | "kids"
  | "agenda"
  | "schedules"
  | "attendance"
  | "absences"
  | "finance"
  | "assets";

export type TransactionRecord = {
  id: string;
  date: string;
  type: "Entrada" | "Saida" | "Dizimo" | "Oferta";
  category: string;
  description: string;
  amount: number;
  method: string;
  status: "Pendente" | "Confirmado";
  memberName: string;
  notes: string;
};

export type AssetRecord = {
  id: string;
  name: string;
  category: string;
  location: string;
  responsible: string;
  condition: "Novo" | "Bom" | "Manutencao" | "Baixado";
  lastMaintenance: string;
  notes: string;
};

export type DevotionalRecord = {
  id: string;
  title: string;
  verse: string;
  body: string;
  status: "Publicado" | "Rascunho" | "Arquivado";
  publishedAt: string;
};
