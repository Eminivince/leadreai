import type { Metadata } from 'next';
import { Instrument_Serif, Outfit, DM_Mono } from 'next/font/google';
import { Providers } from './providers';
import { Toaster } from 'sonner';
import './globals.css';

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-mono',
  display: 'swap',
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
      <body className={`${instrumentSerif.variable} ${outfit.variable} ${dmMono.variable} font-sans antialiased`}>
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
