const FOOTER_LINKS: Array<{ label: string; href: string }> = [
 { label: 'How it works', href: '#how' },
 { label: 'Pricing',   href: '#pricing' },
 { label: 'Docs',     href: '/docs' },
];

export default function AltFooter() {
 return (
  <footer className="bg-[color:var(--alt-ink)] px-6 md:px-10 py-8">
   <div className="max-w-[1200px] mx-auto flex flex-wrap items-center justify-between gap-5">
    <div className="flex items-baseline gap-px">
     <span className="font-extrabold text-[15px] text-white tracking-tight">Leadre</span>
     <span className="font-extrabold text-[15px] text-[color:var(--alt-amber)]">.</span>
     <span className="font-extrabold text-[15px] text-white tracking-tight">AI</span>
    </div>
    <nav className="flex flex-wrap gap-5" aria-label="Footer">
     {FOOTER_LINKS.map(link => (
      <a key={link.label} href={link.href} className="text-[12px] text-white/40 hover:text-white/70 transition-colors">
       {link.label}
      </a>
     ))}
    </nav>
    <span className="text-[11px] text-white/25">&copy; 2026 LeadreAI</span>
   </div>
  </footer>
 );
}
