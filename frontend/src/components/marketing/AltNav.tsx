import Link from 'next/link';
import { ThemeToggle } from '@/components/shared/ThemeToggle';

export default function AltNav() {
 return (
  <header className="sticky top-0 z-40 bg-[color:var(--paper)] border-b border-[color:var(--alt-rule)]">
   <div className="max-w-[1200px] mx-auto px-6 md:px-10 h-16 flex items-center justify-between gap-6">
    <Link href="/" className="flex items-baseline gap-px shrink-0">
     <span className="font-extrabold text-[16px] tracking-tight text-[color:var(--alt-ink)]">Leadre</span>
     <span className="font-extrabold text-[16px] text-[color:var(--alt-amber)]">.</span>
     <span className="font-extrabold text-[16px] tracking-tight text-[color:var(--alt-ink)]">AI</span>
    </Link>
    <nav className="flex items-center gap-4 md:gap-6" aria-label="Site navigation">
     <div className="hidden md:flex items-center gap-6">
      <a href="#how" className="text-[13px] text-[color:var(--alt-ink-3)] hover:text-[color:var(--alt-ink)] transition-colors">How it works</a>
      <a href="#pricing" className="text-[13px] text-[color:var(--alt-ink-3)] hover:text-[color:var(--alt-ink)] transition-colors">Pricing</a>
      <div className="w-px h-4 bg-[color:var(--alt-rule)]" aria-hidden={true} />
     </div>
     <ThemeToggle className="h-9 w-9" />
     <Link href="/login" className="hidden md:inline text-[13px] text-[color:var(--alt-ink-2)] hover:text-[color:var(--alt-ink)] transition-colors">
      Sign in
     </Link>
     <Link
      href="/auth/register"
      className="text-[13px] font-semibold bg-[color:var(--alt-ink)] text-[color:var(--paper)] px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
     >
      Get started free
     </Link>
    </nav>
   </div>
  </header>
 );
}
