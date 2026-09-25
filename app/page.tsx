import {
  Bell,
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  HeartHandshake,
  MessageCircle,
  ShieldCheck,
  Smartphone,
  Sparkles,
  UserCheck,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { ComponentType } from "react";

type IconComponent = ComponentType<{ size?: number; strokeWidth?: number }>;

type FeatureCard = {
  icon: IconComponent;
  title: string;
  description: string;
};

const navLinks = [
  { href: "#recursos", label: "Recursos" },
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#demonstracao", label: "Demonstração" },
  { href: "#duvidas", label: "Dúvidas" },
];

const leadershipFeatures: FeatureCard[] = [
  {
    icon: UsersRound,
    title: "Fichas e acessos",
    description: "Cadastros, perfis, congregações e permissões em uma rotina mais organizada.",
  },
  {
    icon: ClipboardCheck,
    title: "Pré-cadastros",
    description: "Receba solicitações, analise dados e libere o acesso dos membros com mais clareza.",
  },
  {
    icon: FileText,
    title: "Relatórios e documentos",
    description: "Fichas, cartas, documentos prontos e informações importantes para secretaria.",
  },
  {
    icon: HeartHandshake,
    title: "Cuidado pastoral",
    description: "Acompanhe pedidos, visitas e atendimentos sem perder o histórico da solicitação.",
  },
];

const memberFeatures: FeatureCard[] = [
  {
    icon: Bell,
    title: "Avisos e mural",
    description: "Comunicados da igreja em um local fácil de encontrar e compartilhar.",
  },
  {
    icon: CalendarDays,
    title: "Agenda da igreja",
    description: "Cultos, aulas, reuniões e eventos organizados por data e horário.",
  },
  {
    icon: MessageCircle,
    title: "Pedidos e contato",
    description: "Um caminho simples para solicitar oração, visita, aconselhamento ou orientação.",
  },
  {
    icon: UserCheck,
    title: "Área do membro",
    description: "Ficha, devocional, EBD, Discipulado e informações pessoais em poucos toques.",
  },
];

const trustCards: FeatureCard[] = [
  {
    icon: ShieldCheck,
    title: "Acesso por perfil",
    description: "Cada pessoa entra apenas nas áreas permitidas para sua função.",
  },
  {
    icon: CheckCircle2,
    title: "Dados protegidos",
    description: "O sistema foi pensado para reduzir exposição de dados internos da igreja.",
  },
  {
    icon: Smartphone,
    title: "Leve no celular",
    description: "Funciona como app instalável, sem exigir download pesado pela loja.",
  },
];

const steps = [
  {
    title: "A igreja envia o link",
    description: "O membro recebe o link de pré-cadastro pelo WhatsApp ou outro canal da igreja.",
  },
  {
    title: "O membro se cadastra",
    description: "Ele informa seus dados principais de forma simples, inclusive pelo celular.",
  },
  {
    title: "A secretaria libera o acesso",
    description: "A liderança analisa, aprova e entrega login e senha para o sistema.",
  },
];

const faq = [
  {
    question: "O aplicativo ocupa espaço na memória do celular?",
    answer: "Ele funciona como um aplicativo leve instalado pelo navegador. A pessoa acessa pelo ícone no celular, sem precisar baixar um app pesado.",
  },
  {
    question: "Membros idosos ou com pouca prática conseguem usar?",
    answer: "Sim. A proposta é deixar o acesso simples, com botões claros para avisos, agenda, pedidos e ficha do membro.",
  },
  {
    question: "Os dados da minha igreja ficam seguros?",
    answer: "O sistema usa login, perfis de acesso e áreas protegidas para que cada pessoa veja apenas o que precisa.",
  },
  {
    question: "Como a igreja começa a usar?",
    answer: "A secretaria envia o link de pré-cadastro, aprova as solicitações e libera os acessos dos membros conforme a rotina da igreja.",
  },
];

const footerLinks = [
  { href: "/sistema", label: "Entrar" },
  { href: "/cadastro", label: "Pré-cadastro" },
  { href: "/privacidade", label: "Privacidade" },
  { href: "/termos", label: "Termos" },
];

function FeatureCard({ description, icon: Icon, title }: FeatureCard) {
  return (
    <article className="landing-feature-card">
      <span className="landing-icon">
        <Icon size={24} strokeWidth={2.4} />
      </span>
      <strong>{title}</strong>
      <p>{description}</p>
    </article>
  );
}

export default function LandingPage() {
  return (
    <main className="landing-page">
      <section className="landing-hero">
        <nav className="landing-nav" aria-label="Navegação principal da landing page">
          <Link className="landing-brand" href="/">
            <Image alt="" height={42} priority src="/icon-192.png" width={42} />
            <span>Igreja Conectada</span>
          </Link>
          <div className="landing-nav-links">
            {navLinks.map((link) => (
              <a href={link.href} key={link.href}>
                {link.label}
              </a>
            ))}
          </div>
          <Link className="landing-nav-login" href="/sistema">
            Entrar
          </Link>
        </nav>

        <div className="landing-hero-grid">
          <div className="landing-hero-copy">
            <p className="landing-eyebrow">Gestão, comunhão e cuidado em um só lugar</p>
            <h1>A gestão da sua igreja simples, organizada e na palma da mão de cada membro.</h1>
            <p className="landing-subtitle">
              Centralize avisos, pedidos de oração, agenda e secretaria em um único aplicativo leve e fácil de usar.
            </p>
            <div className="landing-actions">
              <a className="landing-primary" href="#demonstracao">
                Ver Demonstração
              </a>
            </div>
          </div>

          <div className="landing-device-showcase" aria-label="Mockup visual do sistema">
            <div className="landing-phone-frame">
              <div className="landing-phone-speaker" />
              <div className="landing-app-card featured">
                <span>Hoje na igreja</span>
                <strong>Culto de ensino</strong>
                <small>19h30 - Sede</small>
              </div>
              <div className="landing-app-row">
                <span className="landing-mini-avatar">A</span>
                <div>
                  <strong>Avisos da semana</strong>
                  <small>Mural atualizado</small>
                </div>
              </div>
              <div className="landing-app-grid">
                <span>Agenda</span>
                <span>Oração</span>
                <span>EBD</span>
                <span>Ficha</span>
              </div>
            </div>
            <div className="landing-dashboard-card">
              <Sparkles size={22} />
              <strong>Painel inteligente</strong>
              <small>Pré-cadastros, aniversariantes, mural e pendências em uma visão clara.</small>
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-purpose" aria-labelledby="landing-purpose">
        <div>
          <p className="landing-eyebrow">Feito para igrejas locais e congregações</p>
          <h2 id="landing-purpose">Mais organização para a secretaria. Mais cuidado para os membros.</h2>
        </div>
        <p>
          O Igreja Conectada aproxima liderança e membresia em uma rotina digital simples, com informações importantes no lugar certo e menos dependência de controles espalhados.
        </p>
      </section>

      <section className="landing-section" id="recursos" aria-labelledby="landing-features">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Recursos principais</p>
          <h2 id="landing-features">Tudo separado por quem realmente usa o sistema</h2>
        </div>
        <div className="landing-audience-grid">
          <article className="landing-audience-panel">
            <p className="landing-eyebrow">Para liderança e secretaria</p>
            <h3>Controle completo sem complicar a rotina.</h3>
            <div className="landing-feature-grid">
              {leadershipFeatures.map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}
            </div>
          </article>
          <article className="landing-audience-panel accent">
            <p className="landing-eyebrow">Para os membros</p>
            <h3>Um acesso simples ao que acontece na igreja.</h3>
            <div className="landing-feature-grid">
              {memberFeatures.map((feature) => (
                <FeatureCard key={feature.title} {...feature} />
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="landing-section" id="como-funciona" aria-labelledby="landing-steps">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Como funciona</p>
          <h2 id="landing-steps">Do link ao acesso liberado em três passos</h2>
        </div>
        <div className="landing-steps">
          {steps.map((step, index) => (
            <article className="landing-step" key={step.title}>
              <span>{index + 1}</span>
              <strong>{step.title}</strong>
              <p>{step.description}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="landing-section landing-demo" id="demonstracao" aria-labelledby="landing-demo-title">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Demonstração</p>
          <h2 id="landing-demo-title">Veja como o sistema pode funcionar na rotina da igreja</h2>
        </div>
        <div className="landing-demo-card">
          <div className="landing-demo-preview">
            <span className="landing-play-button">▶</span>
          </div>
          <div>
            <h3>Vídeo demonstrativo preparado para apresentar o sistema</h3>
            <p>
              Espaço reservado para um vídeo curto mostrando como aprovar um pré-cadastro, publicar um aviso e consultar a agenda. Enquanto o vídeo oficial não é adicionado, o botão leva ao ambiente do sistema.
            </p>
            <Link className="landing-secondary" href="/sistema">
              Abrir ambiente do sistema
            </Link>
          </div>
        </div>
      </section>

      <section className="landing-section" aria-labelledby="landing-trust">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Confiança</p>
          <h2 id="landing-trust">Tecnologia discreta, segura e fácil de usar</h2>
        </div>
        <div className="landing-trust-grid">
          {trustCards.map((feature) => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
        <div className="landing-testimonial-placeholder">
          <strong>Preparado para igrejas que precisam de clareza.</strong>
          <p>Uma base visual e funcional pensada para secretaria, liderança e membros caminharem com a mesma informação.</p>
        </div>
      </section>

      <section className="landing-section" id="duvidas" aria-labelledby="landing-faq">
        <div className="landing-section-heading">
          <p className="landing-eyebrow">Perguntas frequentes</p>
          <h2 id="landing-faq">Dúvidas que a igreja costuma ter antes de começar</h2>
        </div>
        <div className="landing-faq-list">
          {faq.map((item, index) => (
            <details key={item.question} open={index === 0}>
              <summary>{item.question}</summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="landing-final" id="contato">
        <p className="landing-eyebrow">Próximo passo</p>
        <h2>Pronto para levar mais organização para sua igreja?</h2>
        <p>Conheça o ambiente do sistema ou envie o link de pré-cadastro para começar a organizar os primeiros acessos.</p>
        <div className="landing-actions">
          <Link className="landing-primary" href="/sistema">
            Entrar
          </Link>
          <Link className="landing-secondary" href="/cadastro">
            Pré-cadastro
          </Link>
        </div>
      </section>

      <footer className="landing-footer">
        <strong>Igreja Conectada</strong>
        <nav aria-label="Links institucionais">
          {footerLinks.map((link) =>
            link.href.startsWith("#") ? (
              <a href={link.href} key={link.href}>
                {link.label}
              </a>
            ) : (
              <Link href={link.href} key={link.href}>
                {link.label}
              </Link>
            ),
          )}
        </nav>
      </footer>
    </main>
  );
}
