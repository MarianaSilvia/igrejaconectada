"use client";

import { useMemo, useState } from "react";

type FeatureKey = "ID" | "Mural" | "Agenda" | "WhatsApp";

const features = [
  {
    key: "ID" as const,
    title: "Carteirinha digital",
    copy: "Identificacao viva do membro com status, QR visual, grupos e ministerios.",
    metric: "428",
    label: "membros ativos",
  },
  {
    key: "Mural" as const,
    title: "Mural social",
    copy: "Avisos com foto, video e destaque para o que esta acontecendo na igreja.",
    metric: "18k",
    label: "alcance mensal",
  },
  {
    key: "Agenda" as const,
    title: "Agenda inteligente",
    copy: "Cultos, ensaios, reunioes e escalas vistos por mes, grupo e responsavel.",
    metric: "36",
    label: "eventos no mes",
  },
  {
    key: "WhatsApp" as const,
    title: "WhatsApp viral",
    copy: "Templates prontos para aniversariantes, grupos, convites e confirmacoes.",
    metric: "1 click",
    label: "para enviar",
  },
];

const feed = [
  { title: "Santa ceia", kind: "Foto", color: "from-[#1be7ff] to-[#7357ff]" },
  { title: "Noite jovem", kind: "Video", color: "from-[#ff4ecd] to-[#7c3cff]" },
  { title: "Acao social", kind: "Live", color: "from-[#a6ff3d] to-[#12d8a0]" },
];

const agenda = [
  ["03", "Ensaio", "Louvor"],
  ["06", "Culto", "Todos"],
  ["10", "EBD", "Alunos"],
  ["14", "Jovens", "Grupo"],
  ["21", "Ceia", "Igreja"],
  ["28", "Missoes", "Equipe"],
];

const messages = [
  "Paz, Ana! Feliz aniversario. Que Deus abencoe sua vida hoje e sempre.",
  "Equipe, ensaio sabado as 17h. Confirme presenca no grupo.",
  "Domingo tem Culto da Familia as 19h. Convide alguem especial.",
];

function whatsappLink(message: string) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export default function Home() {
  const [activeFeature, setActiveFeature] = useState<FeatureKey>("ID");
  const [messageIndex, setMessageIndex] = useState(0);

  const selected = useMemo(
    () => features.find((feature) => feature.key === activeFeature) ?? features[0],
    [activeFeature],
  );

  return (
    <main className="min-h-screen overflow-hidden bg-[#070a18] text-white">
      <section className="relative min-h-screen px-4 py-5 sm:px-6 lg:px-8">
        <div className="cyber-bg absolute inset-0" aria-hidden="true" />
        <div className="mx-auto flex max-w-7xl flex-col gap-10">
          <header className="relative z-10 flex items-center justify-between rounded-full border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-xl">
            <a className="flex min-w-0 items-center gap-3" href="#topo">
              <span className="logo-pulse grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#1be7ff] text-sm font-black text-[#07111f]">
                IC
              </span>
              <span className="min-w-0">
                <span className="block text-xs font-black uppercase text-[#9fb4d8]">Igreja Conectada</span>
                <span className="block truncate text-sm font-black sm:text-base">Sistema social para igrejas</span>
              </span>
            </a>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Navegacao principal">
              {["Produto", "Mural", "Agenda", "WhatsApp"].map((item) => (
                <a className="rounded-full px-4 py-2 text-sm font-bold text-[#c9d8ff] hover:bg-white/10" href={`#${item.toLowerCase()}`} key={item}>
                  {item}
                </a>
              ))}
            </nav>
            <a
              className="rounded-full bg-white px-5 py-3 text-sm font-black text-[#07111f] shadow-[0_0_35px_rgba(27,231,255,0.35)]"
              href={whatsappLink("Ola! Quero uma demonstracao da Igreja Conectada.")}
              rel="noreferrer"
              target="_blank"
            >
              Quero demo
            </a>
          </header>

          <div className="relative z-10 grid items-center gap-10 lg:grid-cols-[0.86fr_1.14fr]">
            <div className="pt-2 lg:pb-12 lg:pt-10">
              <div className="inline-flex items-center gap-3 rounded-full border border-[#1be7ff]/30 bg-[#1be7ff]/10 px-4 py-2 text-sm font-black text-[#bdf8ff]">
                <span className="h-2 w-2 rounded-full bg-[#a6ff3d] shadow-[0_0_18px_#a6ff3d]" />
                Landing page pronta para viralizar
              </div>
              <h1 className="mt-6 max-w-4xl text-5xl font-black leading-[0.98] sm:text-6xl lg:text-7xl">
                A igreja no bolso dos membros. A gestao na mao da lideranca.
              </h1>
              <p className="mt-6 max-w-2xl text-lg leading-8 text-[#b9c8e8]">
                Uma experiencia digital com cara de app premium: carteirinha,
                mural com midia, agenda mensal e mensagens de WhatsApp que
                saem prontas para aniversariantes e grupos.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <a className="cta-neon rounded-full px-6 py-4 text-sm font-black text-[#07111f]" href="#produto">
                  Ver experiencia
                </a>
                <a className="rounded-full border border-white/15 bg-white/[0.06] px-6 py-4 text-sm font-black text-white backdrop-blur-xl hover:bg-white/12" href="#whatsapp">
                  Templates WhatsApp
                </a>
              </div>
              <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3">
                <HeroMetric value="4 modulos" label="para vender a ideia" />
                <HeroMetric value="Mobile" label="primeiro impacto" />
                <HeroMetric value="Social" label="mural com midia" />
              </div>
            </div>

            <ExperienceMockup activeFeature={activeFeature} setActiveFeature={setActiveFeature} selected={selected} />
          </div>
        </div>
      </section>

      <section className="relative bg-[#0b1024] px-4 py-16 sm:px-6 lg:px-8" id="produto">
        <div className="mx-auto max-w-7xl">
          <div className="grid gap-6 lg:grid-cols-[0.75fr_1.25fr] lg:items-end">
            <div>
              <p className="text-sm font-black uppercase text-[#1be7ff]">Produto memoravel</p>
              <h2 className="mt-3 text-4xl font-black leading-tight sm:text-5xl">
                Cada recurso parece conteudo compartilhavel.
              </h2>
            </div>
            <p className="text-lg leading-8 text-[#aebde0]">
              A pagina deixa de parecer apenas administrativa e passa a parecer
              uma plataforma de comunidade: visual de app, contraste forte,
              cards com brilho, informacao rapida e chamada clara para acao.
            </p>
          </div>

          <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {features.map((feature) => (
              <button
                className={`feature-card min-h-64 rounded-[28px] border p-5 text-left transition ${
                  activeFeature === feature.key
                    ? "border-[#1be7ff]/70 bg-[#101a38] shadow-[0_0_45px_rgba(27,231,255,0.16)]"
                    : "border-white/10 bg-white/[0.045] hover:border-[#ff4ecd]/45"
                }`}
                key={feature.key}
                onClick={() => setActiveFeature(feature.key)}
                type="button"
              >
                <span className="text-sm font-black text-[#a6ff3d]">{feature.key}</span>
                <h3 className="mt-7 text-2xl font-black">{feature.title}</h3>
                <p className="mt-3 min-h-20 text-sm leading-6 text-[#aebde0]">{feature.copy}</p>
                <div className="mt-6 rounded-2xl bg-white/[0.07] p-4">
                  <p className="text-3xl font-black text-white">{feature.metric}</p>
                  <p className="text-sm font-bold text-[#8da0c6]">{feature.label}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="grid lg:grid-cols-2" id="mural">
        <div className="bg-[#f4f7fb] px-4 py-16 text-[#10182c] sm:px-6 lg:px-10">
          <div className="mx-auto max-w-2xl lg:mr-0">
            <p className="text-sm font-black uppercase text-[#7357ff]">Mural com foto e video</p>
            <h2 className="mt-3 text-4xl font-black leading-tight">
              Avisos com cara de feed, nao de quadro esquecido.
            </h2>
            <p className="mt-4 leading-8 text-[#596a84]">
              Posts visuais ajudam a divulgar cultos, congressos, acoes sociais
              e recados de lideranca com mais vontade de compartilhar.
            </p>
            <div className="mt-7 grid gap-3">
              {feed.map((item) => (
                <div className="flex items-center gap-4 rounded-3xl bg-white p-3 shadow-sm" key={item.title}>
                  <div className={`h-20 w-24 rounded-2xl bg-gradient-to-br ${item.color}`} />
                  <div>
                    <p className="text-xs font-black uppercase text-[#7357ff]">{item.kind}</p>
                    <h3 className="text-lg font-black">{item.title}</h3>
                    <p className="text-sm text-[#596a84]">Publicado para membros e grupos.</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="bg-[#10182c] px-4 py-16 sm:px-6 lg:px-10" id="agenda">
          <div className="mx-auto max-w-2xl lg:ml-0">
            <p className="text-sm font-black uppercase text-[#a6ff3d]">Agenda mensal</p>
            <h2 className="mt-3 text-4xl font-black leading-tight">
              Um calendario que parece painel de comando.
            </h2>
            <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3">
              {agenda.map(([day, event, group]) => (
                <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur" key={`${day}-${event}`}>
                  <p className="text-4xl font-black text-[#1be7ff]">{day}</p>
                  <h3 className="mt-3 font-black">{event}</h3>
                  <p className="text-sm font-bold text-[#8da0c6]">{group}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="relative bg-[#070a18] px-4 py-16 sm:px-6 lg:px-8" id="whatsapp">
        <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_430px] lg:items-center">
          <div>
            <p className="text-sm font-black uppercase text-[#25f4a8]">WhatsApp pronto</p>
            <h2 className="mt-3 max-w-3xl text-4xl font-black leading-tight sm:text-5xl">
              Mensagens que a secretaria envia em segundos.
            </h2>
            <div className="mt-7 grid gap-3">
              {messages.map((message, index) => (
                <button
                  className={`rounded-3xl border p-5 text-left transition ${
                    messageIndex === index
                      ? "border-[#25f4a8]/70 bg-[#25f4a8]/10"
                      : "border-white/10 bg-white/[0.045] hover:border-[#1be7ff]/45"
                  }`}
                  key={message}
                  onClick={() => setMessageIndex(index)}
                  type="button"
                >
                  <p className="text-xs font-black uppercase text-[#1be7ff]">Template {index + 1}</p>
                  <p className="mt-2 leading-7 text-[#dbe7ff]">{message}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="phone-frame mx-auto w-full max-w-[380px] rounded-[42px] border border-white/15 bg-[#10182c] p-4 shadow-[0_0_70px_rgba(37,244,168,0.18)]">
            <div className="rounded-[32px] bg-[#eafff7] p-4 text-[#132338]">
              <div className="flex items-center gap-3 border-b border-[#c9f3e2] pb-4">
                <div className="grid h-11 w-11 place-items-center rounded-full bg-[#25f4a8] font-black">W</div>
                <div>
                  <p className="font-black">Secretaria</p>
                  <p className="text-sm font-bold text-[#567062]">Mensagem pronta</p>
                </div>
              </div>
              <div className="mt-5 rounded-[26px] bg-white p-4 shadow-sm">
                <p className="leading-7 text-[#40515f]">{messages[messageIndex]}</p>
              </div>
              <a
                className="mt-5 inline-flex w-full justify-center rounded-full bg-[#25a277] px-5 py-4 text-sm font-black text-white"
                href={whatsappLink(messages[messageIndex])}
                rel="noreferrer"
                target="_blank"
              >
                Abrir no WhatsApp
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-[#f4f7fb] px-4 py-16 text-[#10182c] sm:px-6 lg:px-8">
        <div className="mx-auto rounded-[38px] bg-[#111c3c] p-6 text-white shadow-2xl shadow-[#111c3c]/20 sm:p-10 lg:max-w-7xl">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:items-center">
            <div>
              <p className="text-sm font-black uppercase text-[#1be7ff]">Chamada final</p>
              <h2 className="mt-3 text-4xl font-black leading-tight">
                Uma landing mais tecnologica, mais desejavel e mais facil de vender.
              </h2>
              <p className="mt-4 max-w-3xl leading-8 text-[#b9c8e8]">
                O foco agora e impacto visual: produto no centro, linguagem de
                comunidade, interacao e CTAs que levam direto para demonstracao.
              </p>
            </div>
            <a
              className="cta-neon inline-flex justify-center rounded-full px-6 py-4 text-sm font-black text-[#07111f]"
              href={whatsappLink("Ola! Quero apresentar essa landing page para uma igreja.")}
              rel="noreferrer"
              target="_blank"
            >
              Apresentar agora
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}

function ExperienceMockup({
  activeFeature,
  setActiveFeature,
  selected,
}: {
  activeFeature: FeatureKey;
  setActiveFeature: (feature: FeatureKey) => void;
  selected: (typeof features)[number];
}) {
  return (
    <div className="relative min-h-[620px]">
      <div className="absolute left-2 top-12 hidden w-44 rotate-[-8deg] rounded-[30px] border border-white/10 bg-white/[0.08] p-3 shadow-2xl backdrop-blur-xl sm:block">
        <div className="rounded-[24px] bg-[#07111f] p-4">
          <p className="text-xs font-black text-[#1be7ff]">MEMBRO</p>
          <h3 className="mt-3 text-xl font-black">Maria O.</h3>
          <p className="mt-1 text-xs text-[#9fb4d8]">Louvor · EBD</p>
          <div className="mt-4 grid h-24 grid-cols-5 gap-1 rounded-2xl bg-white p-2">
            {Array.from({ length: 25 }).map((_, index) => (
              <span className={index % 2 === 0 || index % 7 === 0 ? "bg-[#07111f]" : "bg-[#dfe8f7]"} key={index} />
            ))}
          </div>
        </div>
      </div>

      <div className="relative ml-auto rounded-[38px] border border-white/10 bg-white/[0.08] p-3 shadow-[0_35px_100px_rgba(0,0,0,0.35)] backdrop-blur-2xl">
        <div className="overflow-hidden rounded-[30px] bg-[#f7f9ff] text-[#10182c]">
          <div className="grid lg:grid-cols-[178px_minmax(0,1fr)]">
            <aside className="hidden bg-[#111c3c] p-5 text-white lg:block">
              <div className="rounded-2xl bg-[#1be7ff] px-4 py-3 text-sm font-black text-[#07111f]">
                Criar aviso
              </div>
              <nav className="mt-6 space-y-2" aria-label="Modulos">
                {features.map((feature) => (
                  <button
                    className={`w-full rounded-2xl px-3 py-3 text-left text-sm font-black ${
                      activeFeature === feature.key ? "bg-white text-[#111c3c]" : "text-[#aebde0] hover:bg-white/10"
                    }`}
                    key={feature.key}
                    onClick={() => setActiveFeature(feature.key)}
                    type="button"
                  >
                    {feature.title}
                  </button>
                ))}
              </nav>
              <div className="mt-8 rounded-3xl border border-white/10 p-4">
                <p className="text-xs font-black text-[#a6ff3d]">ENGAJAMENTO</p>
                <p className="mt-2 text-3xl font-black">92%</p>
                <p className="text-xs text-[#8da0c6]">avisos vistos</p>
              </div>
            </aside>

            <div className="min-w-0 p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-[#7a8aa2]">Command center</p>
                  <h2 className="mt-1 text-2xl font-black sm:text-3xl">Igreja Central</h2>
                </div>
                <div className="hidden rounded-full bg-white px-4 py-3 text-sm font-bold text-[#8b98ad] shadow-sm sm:block">
                  Buscar membro, grupo, aviso...
                </div>
              </div>

              <div className="mt-5 grid gap-3 sm:grid-cols-4">
                {features.map((feature) => (
                  <button
                    className={`rounded-3xl p-4 text-left transition ${
                      activeFeature === feature.key
                        ? "bg-[#1769d4] text-white shadow-[0_18px_40px_rgba(23,105,212,0.28)]"
                        : "bg-white text-[#10182c] shadow-sm"
                    }`}
                    key={feature.key}
                    onClick={() => setActiveFeature(feature.key)}
                    type="button"
                  >
                    <p className="text-xs font-black opacity-70">{feature.key}</p>
                    <p className="mt-5 text-xl font-black">{feature.metric}</p>
                  </button>
                ))}
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_240px]">
                <div className="rounded-[30px] bg-white p-5 shadow-sm">
                  <p className="text-xs font-black uppercase text-[#1769d4]">{selected.title}</p>
                  <h3 className="mt-2 text-3xl font-black">{selected.metric}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#596a84]">{selected.copy}</p>
                  <Preview activeFeature={activeFeature} />
                </div>
                <div className="rounded-[30px] bg-[#111c3c] p-5 text-white">
                  <p className="text-xs font-black text-[#1be7ff]">AO VIVO</p>
                  <div className="mt-4 space-y-3">
                    {["Aniversario enviado", "Video publicado", "Escala confirmada"].map((item) => (
                      <div className="rounded-2xl bg-white/10 p-3" key={item}>
                        <p className="text-sm font-black">{item}</p>
                        <p className="text-xs text-[#8da0c6]">agora</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 overflow-hidden rounded-[28px] bg-white shadow-sm">
                {["Culto domingo", "Aniversariantes", "Aviso juventude"].map((item, index) => (
                  <div className="grid gap-2 border-b border-[#edf1f7] px-5 py-4 text-sm last:border-b-0 sm:grid-cols-[1fr_120px_90px]" key={item}>
                    <span className="font-black">{item}</span>
                    <span className="text-[#667891]">{index === 0 ? "Agenda" : index === 1 ? "WhatsApp" : "Mural"}</span>
                    <span className="font-black text-[#1769d4]">Pronto</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Preview({ activeFeature }: { activeFeature: FeatureKey }) {
  if (activeFeature === "Mural") {
    return (
      <div className="mt-5 grid grid-cols-3 gap-3">
        {feed.map((item) => (
          <div className="overflow-hidden rounded-2xl bg-[#f4f7fb]" key={item.title}>
            <div className={`h-20 bg-gradient-to-br ${item.color}`} />
            <p className="p-3 text-xs font-black">{item.kind}</p>
          </div>
        ))}
      </div>
    );
  }

  if (activeFeature === "Agenda") {
    return (
      <div className="mt-5 grid grid-cols-3 gap-3">
        {agenda.slice(0, 6).map(([day, event]) => (
          <div className="rounded-2xl bg-[#f4f7fb] p-3" key={day}>
            <p className="text-2xl font-black text-[#1769d4]">{day}</p>
            <p className="text-xs font-black text-[#596a84]">{event}</p>
          </div>
        ))}
      </div>
    );
  }

  if (activeFeature === "WhatsApp") {
    return (
      <div className="mt-5 rounded-2xl bg-[#eafff7] p-4">
        <p className="text-xs font-black text-[#25a277]">WHATSAPP</p>
        <p className="mt-2 text-sm leading-6 text-[#40515f]">{messages[0]}</p>
      </div>
    );
  }

  return (
    <div className="mt-5 rounded-2xl bg-[#eef5ff] p-4">
      <p className="text-xs font-black text-[#1769d4]">CARTEIRINHA DIGITAL</p>
      <div className="mt-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-lg font-black">Maria Oliveira</p>
          <p className="text-sm text-[#596a84]">Membro ativo desde 2019</p>
        </div>
        <div className="grid h-16 w-16 grid-cols-4 gap-1 rounded-xl bg-white p-2">
          {Array.from({ length: 16 }).map((_, index) => (
            <span className={index % 2 === 0 || index % 5 === 0 ? "bg-[#10182c]" : "bg-[#cfe3ff]"} key={index} />
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 backdrop-blur-xl">
      <p className="text-lg font-black text-white sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs font-bold text-[#9fb4d8] sm:text-sm">{label}</p>
    </div>
  );
}
