import type { Metadata } from 'next';
import Script from 'next/script';
import { Inter, Barlow, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { Providers } from './providers';
import { ThemedToaster } from '@/components/shared/ThemedToaster';
import { THEME_INIT_SCRIPT } from '@/hooks/useTheme';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const barlow = Barlow({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600'],
  variable: '--font-barlow',
});
const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-instrument-serif',
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'LeadreAI — AI-Powered B2B Lead Generation',
  description: 'Find your next customer with natural language. AI-enriched B2B leads in minutes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${barlow.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        {/* Static, hand-written script that sets html.dark pre-hydration
         * to prevent a flash of the wrong theme. */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <Providers>
          {children}
          <ThemedToaster />
        </Providers>
      </body>
    </html>
  );
}
