import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Igreja Conectada | Painel Administrativo Local',
  description:
    'Painel local para gerenciamento de igrejas com atendimento pastoral, notificacoes, mural, agenda e backup.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
