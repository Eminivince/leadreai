import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from 'sonner';
import { Providers } from './providers';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'LeadreAI — AI-Powered B2B Lead Generation',
  description: 'Find your next customer with natural language. AI-enriched B2B leads in minutes.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          {children}
          <Toaster
            position="top-right"
            theme="dark"
            toastOptions={{
              style: {
                background: 'hsl(222 47% 14%)',
                border: '1px solid hsl(216 34% 22%)',
                color: 'hsl(213 31% 91%)',
              },
            }}
          />
        </Providers>
      </body>
    </html>
  );
}
