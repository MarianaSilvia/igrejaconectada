import Image from "next/image";
import Link from "next/link";

const features = [
  "Cadastro de membros",
  "Pré-cadastro online",
  "Agenda da igreja",
  "Mural de avisos",
  "Atendimento pastoral",
  "EBD e Discipulado",
  "Comunicação por WhatsApp",
  "Relatórios e fichas",
  "Área do membro",
  "App instalável no celular",
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
                <span>Membros</span>
                <span>Agenda</span>
                <span>Mural</span>
                <span>Pastoral</span>
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
    </main>
  );
}
