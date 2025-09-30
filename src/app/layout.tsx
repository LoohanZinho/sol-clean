import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { cn } from '@/lib/utils';
import { ThemeProvider } from '@/components/app/ThemeProvider';

const inter = Inter({ 
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
    title: 'Painel de atendimento - Lz',
    description: "Gerencie seu atendimento via WhatsApp com um assistente de IA. Automatize respostas, agende horários e organize conversas com o Gerente Inteligente.",
    manifest: '/manifest.json',
    themeColor: '#111827',
    appleWebApp: {
      capable: true,
      statusBarStyle: 'default',
      title: 'Painel Lz',
    },
    icons: {
        icon: '/favicon.ico',
        shortcut: '/favicon-16x16.png',
        apple: '/apple-touch-icon.png',
    }
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={cn(inter.variable, 'font-sans')} suppressHydrationWarning>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        </head>
        <body className="bg-background text-foreground antialiased">
            <ThemeProvider>
                {children}
            </ThemeProvider>
        </body>
    </html>
  );
}
