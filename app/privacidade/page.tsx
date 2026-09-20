import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-page">
      <article className="surface legal-document">
        <p className="eyebrow">Igreja Conectada</p>
        <h1>Política de Privacidade</h1>
        <p>Última atualização: 19 de setembro de 2026.</p>
        <h2>Dados tratados</h2>
        <p>O sistema registra dados cadastrais, congregação, participação em classes e grupos, presença, solicitações pastorais e informações necessárias à administração da igreja. Dados da Área Kids são tratados com cuidado reforçado e autorização do responsável.</p>
        <h2>Finalidades</h2>
        <p>Os dados são usados para identificação, cuidado pastoral, comunicação, organização de atividades, segurança da Área Kids, emissão de documentos e cumprimento das atividades religiosas e administrativas da igreja.</p>
        <h2>Acesso e segurança</h2>
        <p>O acesso é limitado por perfil e congregação. Não vendemos dados pessoais. Compartilhamentos externos só ocorrem quando exigidos por lei ou autorizados pelo titular.</p>
        <p>Mensagens enviadas pelo canal “Fale com a liderança” são restritas ao remetente e ao responsável após o encaminhamento. Conversas concluídas são eliminadas após 90 dias, mantendo somente auditoria mínima sem o texto das mensagens.</p>
        <h2>Direitos do titular</h2>
        <p>Você pode solicitar correção, informação, exportação ou exclusão dos seus dados. Alguns registros poderão ser preservados pelo período necessário para obrigações legais, segurança ou proteção de direitos.</p>
        <h2>Contato</h2>
        <p>Procure a secretaria da sua congregação ou use a página <a href="/excluir-conta">Excluir minha conta</a>.</p>
        <p><Link href="/">Voltar ao Igreja Conectada</Link></p>
      </article>
    </main>
  );
}
