"use client";

import { useMemo, useState } from "react";

type Role = "Pastor" | "Tesoureiro" | "Secretaria" | "Lider" | "Membro";
type Section =
  | "Visao geral"
  | "Pessoas"
  | "Financeiro"
  | "Escalas"
  | "Mural"
  | "Biblia"
  | "Devocional"
  | "Patrimonio";

const sections: Section[] = [
  "Visao geral",
  "Pessoas",
  "Financeiro",
  "Escalas",
  "Mural",
  "Biblia",
  "Devocional",
  "Patrimonio",
];

const permissions: Record<Role, string[]> = {
  Pastor: ["Acesso total", "Aprovar devocionais", "Ver relatorios"],
  Tesoureiro: ["Financeiro", "PIX", "Fluxo de caixa"],
  Secretaria: ["Membros", "Frequencia", "Cartas"],
  Lider: ["Equipe", "Escalas", "Avisos do ministerio"],
  Membro: ["Carteirinha", "Mural", "Contribuicoes"],
};

const members = [
  {
    name: "Ana Beatriz Souza",
    role: "Diaconisa",
    family: "Familia Souza",
    status: "Membro",
    baptism: "12/05/2019",
    ministry: "Intercessao",
  },
  {
    name: "Carlos Henrique Lima",
    role: "Musico",
    family: "Familia Lima",
    status: "Membro",
    baptism: "23/09/2021",
    ministry: "Louvor",
  },
  {
    name: "Marina Costa",
    role: "Visitante",
    family: "Sem familia vinculada",
    status: "Visitante",
    baptism: "-",
    ministry: "Classe de novos",
  },
];

const finances = [
  { label: "Dizimos confirmados", value: "R$ 8.420,00", trend: "+12%" },
  { label: "Ofertas do mes", value: "R$ 3.180,00", trend: "+8%" },
  { label: "Contas a pagar", value: "R$ 2.760,00", trend: "4 abertas" },
  { label: "Saldo em caixa", value: "R$ 18.940,00", trend: "Atualizado agora" },
];

const schedules = [
  {
    title: "Culto de domingo",
    date: "30/08 - 19h",
    team: "Louvor, som, recepcao",
    confirmed: "11 de 14 confirmados",
  },
  {
    title: "Ensaio do louvor",
    date: "29/08 - 17h",
    team: "Musicos e vocal",
    confirmed: "7 de 8 confirmados",
  },
  {
    title: "Classe de batismo",
    date: "31/08 - 20h",
    team: "Secretaria e ensino",
    confirmed: "3 de 3 confirmados",
  },
];

const noticeBoard = [
  {
    title: "Conferencia da Familia",
    kind: "Foto",
    text: "Inscricoes abertas para sabado, com programacao para criancas.",
    media: "bg-[linear-gradient(135deg,#87c5b5,#f4d35e)]",
  },
  {
    title: "Chamada para voluntarios",
    kind: "Video",
    text: "Mensagem curta da lideranca para a equipe de recepcao.",
    media: "bg-[linear-gradient(135deg,#36536b,#e07a5f)]",
  },
];

const bibleBooks = [
  { book: "Joao", chapter: 3, verse: 16, text: "Porque Deus amou o mundo de tal maneira..." },
  { book: "Salmos", chapter: 23, verse: 1, text: "O Senhor e o meu pastor; nada me faltara." },
  { book: "Romanos", chapter: 8, verse: 28, text: "Todas as coisas cooperam para o bem..." },
];

const hymns = [
  { number: 15, title: "Conversao", status: "Letra licenciada" },
  { number: 77, title: "Guarda o contato", status: "Indice aprovado" },
  { number: 577, title: "Em fervente oracao", status: "Letra em revisao" },
];

const prayers = [
  "Familia em tratamento medico",
  "Direcao para novo ministerio",
  "Gratidao por emprego recebido",
];

function buildWhatsAppLink(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<Section>("Visao geral");
  const [selectedRole, setSelectedRole] = useState<Role>("Pastor");
  const [devotionalApproved, setDevotionalApproved] = useState(false);
  const [scaleConfirmed, setScaleConfirmed] = useState(false);
  const [search, setSearch] = useState("");

  const filteredVerses = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    if (!normalized) return bibleBooks;
    return bibleBooks.filter(
      (verse) =>
        verse.book.toLowerCase().includes(normalized) ||
        verse.text.toLowerCase().includes(normalized),
    );
  }, [search]);

  const whatsappMessage =
    "Paz! Voce esta escalado para o Culto de domingo, 30/08 as 19h. Pode confirmar sua presenca?";

  return (
    <main className="min-h-screen bg-[#f7f5ef] text-[#1f2933]">
      <header className="sticky top-0 z-20 border-b border-[#d8d3c6] bg-[#fffdf8]/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-[#224c55] text-sm font-bold text-white">
              IC
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase text-[#6d766c]">Igreja Conectada</p>
              <h1 className="truncate text-lg font-bold sm:text-xl">Gestao completa da igreja</h1>
            </div>
          </div>
          <div className="hidden items-center gap-2 sm:flex">
            {(["Pastor", "Tesoureiro", "Secretaria", "Lider", "Membro"] as Role[]).map((role) => (
              <button
                key={role}
                onClick={() => setSelectedRole(role)}
                className={`rounded-md border px-3 py-2 text-sm font-medium transition ${
                  selectedRole === role
                    ? "border-[#224c55] bg-[#224c55] text-white"
                    : "border-[#d8d3c6] bg-white text-[#344054] hover:border-[#224c55]"
                }`}
              >
                {role}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[230px_minmax(0,1fr)_360px] sm:px-6">
        <aside className="rounded-lg border border-[#d8d3c6] bg-white p-3 lg:sticky lg:top-20 lg:h-[calc(100vh-104px)]">
          <nav className="grid grid-cols-2 gap-2 lg:grid-cols-1" aria-label="Modulos do painel">
            {sections.map((section) => (
              <button
                key={section}
                onClick={() => setActiveSection(section)}
                className={`rounded-md px-3 py-2 text-left text-sm font-semibold ${
                  activeSection === section
                    ? "bg-[#224c55] text-white"
                    : "bg-[#f7f5ef] text-[#344054] hover:bg-[#ebe6d8]"
                }`}
              >
                {section}
              </button>
            ))}
          </nav>

          <div className="mt-5 rounded-lg bg-[#edf7f4] p-4">
            <p className="text-xs font-semibold uppercase text-[#4d7169]">Permissao atual</p>
            <h2 className="mt-1 text-lg font-bold">{selectedRole}</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {permissions[selectedRole].map((item) => (
                <li key={item} className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-[#2f8f83]" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className="space-y-5">
          <div className="rounded-lg border border-[#d8d3c6] bg-white p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-[#6d766c]">Painel administrativo</p>
                <h2 className="text-2xl font-bold">{activeSection}</h2>
              </div>
              <a
                className="inline-flex items-center justify-center rounded-md bg-[#2f8f83] px-4 py-2 text-sm font-bold text-white"
                href={buildWhatsAppLink(whatsappMessage)}
                target="_blank"
                rel="noreferrer"
              >
                Enviar WhatsApp
              </a>
            </div>
          </div>

          <Dashboard section={activeSection} />

          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-lg border border-[#d8d3c6] bg-white p-5">
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#6d766c]">Bíblia no app</p>
                  <h3 className="text-xl font-bold">Busca e leitura</h3>
                </div>
                <span className="rounded-md bg-[#f1ead7] px-3 py-1 text-xs font-bold text-[#77622b]">
                  Licenciado
                </span>
              </div>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar livro ou trecho"
                className="mb-3 w-full rounded-md border border-[#d8d3c6] px-3 py-2 text-sm outline-none focus:border-[#224c55]"
              />
              <div className="space-y-3">
                {filteredVerses.map((verse) => (
                  <article key={`${verse.book}-${verse.chapter}-${verse.verse}`} className="rounded-md bg-[#f7f5ef] p-3">
                    <p className="text-sm font-bold">
                      {verse.book} {verse.chapter}:{verse.verse}
                    </p>
                    <p className="mt-1 text-sm text-[#52606d]">{verse.text}</p>
                  </article>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-[#d8d3c6] bg-white p-5">
              <p className="text-sm font-semibold text-[#6d766c]">Devocional diario</p>
              <h3 className="text-xl font-bold">Rascunho para aprovacao</h3>
              <div className="mt-4 rounded-md bg-[#f7f5ef] p-4">
                <p className="text-xs font-bold uppercase text-[#96704d]">Tema de hoje</p>
                <h4 className="mt-1 font-bold">Servir com alegria</h4>
                <p className="mt-2 text-sm text-[#52606d]">
                  Uma reflexao curta preparada para revisao pastoral antes de aparecer aos fieis.
                </p>
              </div>
              <button
                onClick={() => setDevotionalApproved(true)}
                className="mt-4 w-full rounded-md bg-[#224c55] px-4 py-2 text-sm font-bold text-white"
              >
                {devotionalApproved ? "Devocional aprovado" : "Aprovar publicacao"}
              </button>
            </div>
          </div>
        </section>

        <aside className="space-y-5 lg:sticky lg:top-20 lg:h-[calc(100vh-104px)] lg:overflow-auto">
          <div className="mx-auto max-w-[360px] rounded-[28px] border-8 border-[#1f2933] bg-[#fffdf8] shadow-xl">
            <div className="border-b border-[#d8d3c6] px-5 py-4">
              <p className="text-xs font-semibold uppercase text-[#6d766c]">Area do fiel</p>
              <h2 className="text-lg font-bold">Maria Oliveira</h2>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-lg bg-[#224c55] p-4 text-white">
                <p className="text-xs uppercase opacity-80">Carteirinha digital</p>
                <h3 className="mt-3 text-xl font-bold">Membro ativo</h3>
                <p className="mt-1 text-sm opacity-90">Igreja Central - Sao Paulo</p>
                <div className="mt-4 grid h-16 place-items-center rounded-md bg-white/15 text-xs">
                  QR de identificacao
                </div>
              </div>

              <MobileCard title="Mural de avisos">
                {noticeBoard.map((notice) => (
                  <div key={notice.title} className="mb-3 overflow-hidden rounded-md border border-[#d8d3c6]">
                    <div className={`h-24 ${notice.media}`} />
                    <div className="p-3">
                      <p className="text-xs font-bold text-[#2f8f83]">{notice.kind}</p>
                      <h4 className="font-bold">{notice.title}</h4>
                      <p className="text-sm text-[#52606d]">{notice.text}</p>
                    </div>
                  </div>
                ))}
              </MobileCard>

              <MobileCard title="Escala">
                <p className="text-sm text-[#52606d]">Culto de domingo - Louvor - 19h</p>
                <button
                  onClick={() => setScaleConfirmed(true)}
                  className="mt-3 w-full rounded-md bg-[#2f8f83] px-3 py-2 text-sm font-bold text-white"
                >
                  {scaleConfirmed ? "Presenca confirmada" : "Confirmar presenca"}
                </button>
              </MobileCard>

              <MobileCard title="Harpa Crista">
                <div className="space-y-2">
                  {hymns.map((hymn) => (
                    <p key={hymn.number} className="text-sm">
                      <strong>{hymn.number}</strong> - {hymn.title}
                    </p>
                  ))}
                </div>
              </MobileCard>

              <MobileCard title="Pedido de oracao">
                <textarea
                  className="h-20 w-full resize-none rounded-md border border-[#d8d3c6] p-2 text-sm outline-none focus:border-[#224c55]"
                  placeholder="Escreva seu pedido com seguranca"
                />
                <button className="mt-2 w-full rounded-md bg-[#224c55] px-3 py-2 text-sm font-bold text-white">
                  Enviar a pastoral
                </button>
              </MobileCard>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function Dashboard({ section }: { section: Section }) {
  if (section === "Pessoas") {
    return (
      <div className="rounded-lg border border-[#d8d3c6] bg-white p-5">
        <h3 className="text-xl font-bold">Cadastro de pessoas</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-[#f7f5ef] text-[#52606d]">
              <tr>
                <th className="p-3">Nome</th>
                <th className="p-3">Status</th>
                <th className="p-3">Familia</th>
                <th className="p-3">Batismo</th>
                <th className="p-3">Ministerio</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.name} className="border-t border-[#ece6d8]">
                  <td className="p-3 font-semibold">{member.name}</td>
                  <td className="p-3">{member.status}</td>
                  <td className="p-3">{member.family}</td>
                  <td className="p-3">{member.baptism}</td>
                  <td className="p-3">{member.ministry}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (section === "Financeiro") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {finances.map((item) => (
          <Metric key={item.label} label={item.label} value={item.value} trend={item.trend} />
        ))}
      </div>
    );
  }

  if (section === "Escalas") {
    return (
      <div className="grid gap-4">
        {schedules.map((schedule) => (
          <article key={schedule.title} className="rounded-lg border border-[#d8d3c6] bg-white p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-lg font-bold">{schedule.title}</h3>
                <p className="text-sm text-[#52606d]">{schedule.team}</p>
              </div>
              <div className="text-sm font-bold text-[#224c55]">{schedule.date}</div>
            </div>
            <p className="mt-3 rounded-md bg-[#edf7f4] px-3 py-2 text-sm font-semibold text-[#2f675f]">
              {schedule.confirmed}
            </p>
          </article>
        ))}
      </div>
    );
  }

  if (section === "Mural") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        {noticeBoard.map((notice) => (
          <article key={notice.title} className="overflow-hidden rounded-lg border border-[#d8d3c6] bg-white">
            <div className={`h-44 ${notice.media}`} />
            <div className="p-5">
              <p className="text-xs font-bold uppercase text-[#2f8f83]">{notice.kind}</p>
              <h3 className="mt-1 text-xl font-bold">{notice.title}</h3>
              <p className="mt-2 text-sm text-[#52606d]">{notice.text}</p>
            </div>
          </article>
        ))}
      </div>
    );
  }

  if (section === "Biblia") {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Metric label="Versoes licenciadas" value="1" trend="Bloqueio ativo sem licenca" />
        <Metric label="Favoritos dos fieis" value="248" trend="Sincronizado" />
        <Metric label="Harpa Crista" value="640 hinos" trend="Letras por licenca" />
        <Metric label="Planos de leitura" value="3 ativos" trend="Progresso salvo" />
      </div>
    );
  }

  if (section === "Devocional") {
    return (
      <div className="rounded-lg border border-[#d8d3c6] bg-white p-5">
        <h3 className="text-xl font-bold">Fila de revisao pastoral</h3>
        <div className="mt-4 grid gap-3">
          {["Servir com alegria", "Perdao que restaura", "Fe em dias comuns"].map((title, index) => (
            <div key={title} className="flex items-center justify-between gap-3 rounded-md bg-[#f7f5ef] p-3">
              <div>
                <p className="font-bold">{title}</p>
                <p className="text-sm text-[#52606d]">{index === 0 ? "Rascunho de hoje" : "Programado"}</p>
              </div>
              <span className="rounded-md bg-white px-3 py-1 text-xs font-bold text-[#96704d]">Aguardando</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === "Patrimonio") {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        <Metric label="Instrumentos" value="18" trend="2 em manutencao" />
        <Metric label="Som e midia" value="34" trend="Inventario OK" />
        <Metric label="Imoveis" value="2" trend="Documentos anexados" />
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Metric label="Membros ativos" value="428" trend="+9 este mes" />
      <Metric label="Visitantes" value="36" trend="12 para contato" />
      <Metric label="Contribuicoes PIX" value="R$ 4.650,00" trend="6 pendentes" />
      <Metric label="Pedidos de oracao" value="24" trend="Canal pastoral" />
    </div>
  );
}

function Metric({ label, value, trend }: { label: string; value: string; trend: string }) {
  return (
    <article className="rounded-lg border border-[#d8d3c6] bg-white p-5">
      <p className="text-sm font-semibold text-[#6d766c]">{label}</p>
      <h3 className="mt-2 text-2xl font-bold">{value}</h3>
      <p className="mt-3 text-sm font-semibold text-[#2f8f83]">{trend}</p>
    </article>
  );
}

function MobileCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-[#d8d3c6] bg-white p-3">
      <h3 className="mb-2 font-bold">{title}</h3>
      {children}
    </section>
  );
}
