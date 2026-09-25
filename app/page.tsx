import Image from "next/image";
import Link from "next/link";

const features = [
  "Membros e acessos",
  "Pré-cadastro online",
  "Agenda e eventos",
  "Mural e comunicados",
  "Atendimento pastoral",
  "EBD e Discipulado",
  "WhatsApp manual",
  "Relatórios e documentos",
  "Área do membro",
  "PWA instalável",
];

const leadershipBenefits = [
  "Controle de membros, visitantes e congregações",
  "Permissões por perfil para liderança e secretaria",
  "Documentos prontos, relatórios e fichas cadastrais",
  "Acompanhamento de pedidos pastorais e pré-cadastros",
];

const memberBenefits = [
  "Ver agenda, mural e comunicados da igreja",
  "Atualizar a própria ficha com mais facilidade",
  "Solicitar oração, visita ou aconselhamento",
  "Acompanhar devocional, EBD e Discipulado",
];

const steps = [
  "A igreja envia o link",
  "O membro faz o pré-cadastro",
  "A secretaria aprova e libera o acesso",
];

const highlights = [
  { value: "PWA", label: "instalável no celular" },
  { value: "Supabase", label: "base segura para dados" },
  { value: "Perfis", label: "acesso por função" },
];

const managementCards = [
  "Pré-cadastros aguardando análise",
  "Pedidos pastorais e visitas",
  "Mural, comunicados e agenda",
  "Fichas, documentos e relatórios",
];

const footerLinks = [
  { href: "/sistema", label: "Entrar no sistema" },
  { href: "/cadastro", label: "Pré-cadastro" },
  { href: "/privacidade", label: "Privacidade" },
  { href: "/termos", label: "Termos de uso" },
];

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <nav className="landing-nav" aria-label="Acesso principal">
          <Link className="landing-brand" href="/">
            <Image alt="" height={42} priority src="/icon-192.png" width={42} />
            <span>Igreja Conectada</span>
          </Link>
          <div className="landing-nav-actions">
            <Link href="/cadastro">Pré-cadastro</Link>
            <Link className="landing-nav-login" href="/sistema">Entrar no sistema</Link>
          </div>
        </nav>

        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Gestão, comunhão e cuidado em um só lugar</p>
            <h1>Igreja Conectada</h1>
            <p className="landing-subtitle">Mais organização para a igreja. Mais acesso para os membros.</p>
            <p className="landing-copy">
              Um sistema para aproximar membros, liderança e gestão da igreja, reunindo cadastro, agenda,
              mural, atendimento pastoral, EBD, Discipulado e comunicação em uma única plataforma.
            </p>
            <div className="landing-actions">
              <Link className="landing-primary" href="/sistema">Entrar no sistema</Link>
              <Link className="landing-secondary" href="/cadastro">Fazer pré-cadastro</Link>
            </div>
            <div className="landing-highlights" aria-label="Destaques do sistema">
              {highlights.map((item) => (
                <span key={item.label}>
                  <strong>{item.value}</strong>
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div className="landing-device-showcase" aria-label="Prévia visual do sistema">
            <div className="landing-desktop-mockup">
              <div className="landing-mockup-header">
                <span />
                <span />
                <span />
              </div>
              <div className="landing-mockup-hero">
                <strong>Painel inteligente</strong>
                <small>Agenda, mural, aniversariantes e pendências</small>
              </div>
              <div className="landing-mockup-grid">
                {managementCards.map((card) => (
                  <span key={card}>{card}</span>
                ))}
              </div>
            </div>
            <div className="landing-phone-mockup">
              <Image alt="" height={54} src="/icon-192.png" width={54} />
              <strong>Área do membro</strong>
              <small>Avisos, agenda e pedidos em poucos toques</small>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-purpose" aria-labelledby="landing-purpose">
        <div>
          <p className="landing-eyebrow">Para igrejas e congregações</p>
          <h2 id="landing-purpose">Uma central simples para cuidar melhor das pessoas.</h2>
        </div>
        <p>
          O Igreja Conectada ajuda a secretaria, liderança e membros a encontrarem as informações certas
          com mais rapidez, mantendo a rotina da igreja organizada sem perder o cuidado pastoral.
        </p>
      </section>

      <section className="landing-section" aria-labelledby="landing-features">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">O que o sistema oferece</p>
          <h2 id="landing-features">Uma vitrine completa da rotina da igreja</h2>
        </div>
        <div className="landing-feature-grid">
          {features.map((feature) => (
            <article className="landing-feature-card" key={feature}>
              <span>{feature.slice(0, 2).toUpperCase()}</span>
              <strong>{feature}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-split-section" aria-labelledby="landing-audience">
        <div className="landing-info-card">
          <p className="landing-eyebrow">Para a direção da igreja</p>
          <h2 id="landing-audience">Gestão mais clara, segura e organizada</h2>
          <ul>
            {leadershipBenefits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div className="landing-info-card accent">
          <p className="landing-eyebrow">Para os membros</p>
          <h2>Acesso simples ao que importa</h2>
          <ul>
            {memberBenefits.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="landing-steps">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Como funciona</p>
          <h2 id="landing-steps">Do cadastro ao acesso em três passos</h2>
          <p className="landing-section-copy">
            O domínio público apresenta o sistema. O aplicativo instalado no celular abre direto na área segura,
            em <strong>/sistema</strong>, para facilitar o acesso dos membros.
          </p>
        </div>
        <div className="landing-steps">
          {steps.map((step, index) => (
            <article className="landing-step" key={step}>
              <span>{index + 1}</span>
              <strong>{step}</strong>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-final">
        <p className="landing-eyebrow">Feito para igrejas locais e congregações</p>
        <h2>Leve mais organização e cuidado para sua igreja.</h2>
        <p>Igreja Conectada: tecnologia a serviço da comunhão, organização e cuidado.</p>
        <div className="landing-actions">
          <Link className="landing-primary" href="/sistema">Entrar no sistema</Link>
          <Link className="landing-secondary" href="/cadastro">Fazer pré-cadastro</Link>
        </div>
      </section>

      <footer className="landing-footer">
        <strong>Igreja Conectada</strong>
        <nav aria-label="Links institucionais">
          {footerLinks.map((link) => (
            <Link href={link.href} key={link.href}>{link.label}</Link>
          ))}
        </nav>
      </footer>
    </main>
  );
}
