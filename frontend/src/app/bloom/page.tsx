'use client';

import {
  Download,
  Wand2,
  BookOpen,
  ArrowRight,
  Menu,
  Sparkles,
  Twitter,
  Linkedin,
  Instagram,
} from 'lucide-react';

/* ─── Inline SVG leaf/bloom logo ─────────────────────────────── */
function BloomLogo({ size = 32 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* Centre stem */}
      <path
        d="M20 36 C20 36 20 20 20 8"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      {/* Left petal */}
      <path
        d="M20 18 C14 14 8 12 8 18 C8 24 14 26 20 22"
        fill="rgba(255,255,255,0.22)"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="0.8"
      />
      {/* Right petal */}
      <path
        d="M20 18 C26 14 32 12 32 18 C32 24 26 26 20 22"
        fill="rgba(255,255,255,0.22)"
        stroke="rgba(255,255,255,0.5)"
        strokeWidth="0.8"
      />
      {/* Top petal */}
      <path
        d="M20 18 C16 12 16 6 20 6 C24 6 24 12 20 18"
        fill="rgba(255,255,255,0.3)"
        stroke="rgba(255,255,255,0.6)"
        strokeWidth="0.8"
      />
      {/* Centre dot */}
      <circle cx="20" cy="20" r="2.2" fill="rgba(255,255,255,0.85)" />
    </svg>
  );
}

/* ─── Font helpers — applied via inline style so the page fonts  ─
      don't bleed into the global Next.js shell               ─── */
const POPPINS = "var(--font-poppins, 'Poppins'), sans-serif";
const SERIF   = "var(--font-source-serif, 'Source Serif 4'), serif";

export default function BloomPage() {
  return (
    <div
      className="relative min-h-screen overflow-hidden"
      style={{ fontFamily: POPPINS }}
    >
      {/* ── z-0: Video background ───────────────────────────────── */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
        style={{ zIndex: 0 }}
        src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260315_073750_51473149-4350-4920-ae24-c8214286f323.mp4"
      />

      {/* ── z-10: Two-panel layout ──────────────────────────────── */}
      <div className="relative flex min-h-screen" style={{ zIndex: 10 }}>

        {/* ════════════════════════════════════════════════════════
            LEFT PANEL  w-[52%]
            ════════════════════════════════════════════════════════ */}
        <div className="relative w-full lg:w-[52%] flex flex-col p-4 lg:p-6 min-h-screen">

          {/* Glass strong backdrop (purely visual, no content inside) */}
          <div className="liquid-glass-strong absolute inset-4 lg:inset-6 rounded-3xl pointer-events-none" />

          {/* Content sits on top of the glass */}
          <div className="relative flex flex-col h-full" style={{ zIndex: 1 }}>

            {/* ── Nav ─────────────────────────────────────────── */}
            <nav className="flex items-center justify-between px-2 pt-2 pb-1">
              <div className="flex items-center gap-2.5">
                <BloomLogo size={32} />
                <span className="text-2xl font-semibold text-white tracking-tighter">
                  bloom
                </span>
              </div>
              <button className="liquid-glass rounded-full flex items-center gap-2 px-4 py-2 hover:scale-105 transition-transform">
                <Menu className="w-4 h-4 text-white/80" />
                <span className="text-sm text-white/80">Menu</span>
              </button>
            </nav>

            {/* ── Hero centre ─────────────────────────────────── */}
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-6">
              <BloomLogo size={80} />

              <h1
                className="mt-7 mb-8 font-medium text-white leading-[0.92] tracking-[-0.05em]"
                style={{ fontSize: 'clamp(3.2rem, 8vw, 4.5rem)' }}
              >
                Innovating the
                <br />
                <em
                  style={{
                    fontFamily: SERIF,
                    fontStyle: 'italic',
                    color: 'rgba(255,255,255,0.8)',
                    fontWeight: 400,
                  }}
                >
                  spirit of bloom
                </em>{' '}
                AI
              </h1>

              {/* CTA */}
              <button className="liquid-glass-strong rounded-full inline-flex items-center gap-3 px-7 py-3.5 text-white font-medium hover:scale-105 active:scale-95 transition-transform mb-7">
                Explore Now
                <span className="w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
                  <Download className="w-3.5 h-3.5" />
                </span>
              </button>

              {/* Pills */}
              <div className="flex flex-wrap gap-2.5 justify-center">
                {['Artistic Gallery', 'AI Generation', '3D Structures'].map((label) => (
                  <span
                    key={label}
                    className="liquid-glass rounded-full px-4 py-1.5 text-xs text-white/80"
                  >
                    {label}
                  </span>
                ))}
              </div>
            </div>

            {/* ── Bottom quote ────────────────────────────────── */}
            <div className="text-center px-4 pb-3">
              <p className="text-xs tracking-widest uppercase text-white/50 mb-2">
                Visionary Design
              </p>
              <blockquote className="text-sm leading-relaxed text-white/80">
                "We imagined a realm with{' '}
                <span
                  style={{
                    fontFamily: SERIF,
                    fontStyle: 'italic',
                  }}
                >
                  no ending.
                </span>
                "
              </blockquote>
              <div className="flex items-center justify-center gap-4 mt-3">
                <span className="flex-1 max-w-16 h-px bg-white/20" />
                <span className="text-[10px] tracking-widest uppercase text-white/50">
                  Marcus Aurelio
                </span>
                <span className="flex-1 max-w-16 h-px bg-white/20" />
              </div>
            </div>
          </div>
        </div>

        {/* ════════════════════════════════════════════════════════
            RIGHT PANEL  w-[48%]  desktop only
            ════════════════════════════════════════════════════════ */}
        <div className="hidden lg:flex w-[48%] flex-col gap-5 p-6">

          {/* ── Top bar: socials + account ──────────────────────── */}
          <div className="flex items-center justify-between">
            {/* Social icons pill */}
            <div className="liquid-glass rounded-full flex items-center gap-1 px-3 py-2">
              {([Twitter, Linkedin, Instagram] as const).map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:text-white/80 hover:scale-105 transition-all"
                >
                  <Icon className="w-3.5 h-3.5" />
                </a>
              ))}
              <div className="w-px h-4 bg-white/20 mx-1" />
              <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:scale-105 transition-transform">
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Account button */}
            <button className="liquid-glass rounded-full flex items-center gap-2 px-4 py-2 text-white/80 hover:scale-105 transition-transform">
              <Sparkles className="w-4 h-4" />
              <span className="text-xs">Account</span>
            </button>
          </div>

          {/* ── Community card ──────────────────────────────────── */}
          <div className="liquid-glass rounded-2xl p-5 w-56">
            <h3 className="text-sm font-semibold text-white mb-1.5">Enter team</h3>
            <p className="text-xs text-white/60 leading-relaxed">
              Join our creative community of floral AI designers and researchers.
            </p>
          </div>

          {/* ── Bottom feature section (mt-auto pushes to foot) ──── */}
          <div className="mt-auto">
            <div className="liquid-glass rounded-[2.5rem] p-4 flex flex-col gap-3">

              {/* Two side-by-side feature cards */}
              <div className="grid grid-cols-2 gap-3">
                <div className="liquid-glass rounded-3xl p-4 flex flex-col">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mb-3">
                    <Wand2 className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-xs font-semibold text-white mb-1">Processing</h4>
                  <p className="text-xs text-white/50 leading-relaxed">
                    Real-time AI floral generation engine
                  </p>
                </div>

                <div className="liquid-glass rounded-3xl p-4 flex flex-col">
                  <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center mb-3">
                    <BookOpen className="w-4 h-4 text-white" />
                  </div>
                  <h4 className="text-xs font-semibold text-white mb-1">Growth Archive</h4>
                  <p className="text-xs text-white/50 leading-relaxed">
                    Curated botanical library
                  </p>
                </div>
              </div>

              {/* Bottom wide card with flower thumbnail */}
              <div className="liquid-glass rounded-2xl p-3 flex items-center gap-3">
                {/* Flower image — placeholder gradient since asset not available */}
                <div
                  className="w-24 h-16 rounded-xl flex-shrink-0"
                  style={{
                    background:
                      'linear-gradient(135deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.06) 100%)',
                    boxShadow: 'inset 0 1px 1px rgba(255,255,255,0.2)',
                  }}
                />

                <div className="flex-1 min-w-0">
                  <h4 className="text-xs font-semibold text-white mb-0.5">
                    Advanced Plant Sculpting
                  </h4>
                  <p className="text-xs text-white/50 leading-relaxed line-clamp-2">
                    Shape and sculpt botanical forms with precision AI tools.
                  </p>
                </div>

                <button className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white text-xl font-light hover:scale-105 transition-transform flex-shrink-0 leading-none">
                  +
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
