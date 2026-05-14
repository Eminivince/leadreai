import type { Metadata } from 'next';
import { Inter, Barlow, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import './globals.css';

// Geist is the primary UI typeface for the dashboard redesign — pulled
// in via the `geist` package so it's locally hosted (no extra DNS hop).
// Inter / Barlow / Instrument Serif / JetBrains Mono stay loaded for
// the marketing pages and any pre-redesign components that still
// reference them. Once those are migrated, the legacy imports can go.
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
    /* suppressHydrationWarning is required: next-themes injects the `dark`
       class on <html> via an inline script before React hydrates, which
       the SSR snapshot doesn't know about. Without this attribute React
       would log a hydration mismatch warning on every page load. */
    <html lang="en" suppressHydrationWarning>
      <body className={`${GeistSans.variable} ${GeistMono.variable} ${inter.variable} ${barlow.variable} ${instrumentSerif.variable} ${jetbrainsMono.variable} font-sans antialiased`}>
        <Providers>
          {children}
          {/* theme="system" lets sonner choose its own dark/light styling
              from prefers-color-scheme, while our token-driven style
              overrides ensure the toast follows our app theme regardless. */}
          <Toaster
            position="top-right"
            theme="system"
            toastOptions={{
              style: {
                background: 'var(--paper-3)',
                border: '1px solid var(--rule)',
                color: 'var(--ink)',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
