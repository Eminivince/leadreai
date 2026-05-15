import type { ReactNode } from 'react';
import { Poppins, Source_Serif_4 } from 'next/font/google';

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-poppins',
  display: 'swap',
});

const sourceSerif4 = Source_Serif_4({
  subsets: ['latin'],
  weight: ['300', '400', '600'],
  style: ['normal', 'italic'],
  variable: '--font-source-serif',
  display: 'swap',
});

export const metadata = { title: 'Bloom — AI Floral Design' };

export default function BloomLayout({ children }: { children: ReactNode }) {
  return (
    <div className={`${poppins.variable} ${sourceSerif4.variable}`}>
      {children}
    </div>
  );
}
