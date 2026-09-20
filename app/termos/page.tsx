import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="legal-page">
      <article className="surface legal-document">
        <p className="eyebrow">Igreja Conectada</p>
        <h1>Termos de Uso e Regras da Comunidade</h1>
        <p>Última atualização: 19 de setembro de 2026.</p>
        <h2>Uso responsável</h2>
        <p>Use o sistema para comunicação, comunhão e atividades da igreja. Não publique ofensas, ameaças, conteúdo ilegal, dados pessoais de terceiros, propaganda indevida ou mensagens que exponham aconselhamentos e pedidos pastorais.</p>
        <h2>Fale com a liderança</h2>
        <p>As conversas são privadas entre o membro, o responsável designado e o administrador geral para segurança e auditoria. A secretaria acessa apenas conversas ainda aguardando encaminhamento. Conversas concluídas são removidas após 90 dias.</p>
        <p>Use o canal com respeito. O recurso “Solicitar ajuda” permite encaminhar situações inadequadas ao administrador geral.</p>
        <h2>Conta e senha</h2>
        <p>Cada acesso é pessoal. O usuário deve proteger sua senha e avisar a secretaria em caso de perda, uso indevido ou troca de aparelho.</p>
        <h2>Exclusão</h2>
        <p>A exclusão pode ser solicitada dentro do sistema ou pela página <a href="/excluir-conta">Excluir minha conta</a>.</p>
        <p><Link href="/">Voltar ao Igreja Conectada</Link></p>
      </article>
    </main>
  );
}
