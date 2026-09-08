import type { Metadata, Viewport } from 'next';
import { PwaBoot } from './components/PwaBoot';
import './globals.css';

export const metadata: Metadata = {
  applicationName: 'Igreja Conectada',
  manifest: '/manifest.webmanifest',
  title: 'Igreja Conectada',
  description:
    'Sistema conectado para membros, secretaria, agenda, mural, atendimento pastoral, EBD, Discipulado e comunicacao da igreja.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Igreja Conectada',
  },
  icons: {
    icon: '/icon.svg',
    apple: '/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#080910',
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <PwaBoot />
        {children}
      </body>
    </html>
  );
}
