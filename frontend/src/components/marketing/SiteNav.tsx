'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

/**
 * Public landing nav.
 * Desktop (md+): logo · [Pricing Product Docs Customers] · Sign in + CTA.
 * Mobile: logo · CTA · hamburger; tapping hamburger reveals a slide-down panel.
 */
export default function SiteNav() {
  const [menuOpen, setMenuOpen] = useState(false);

  const closeMenu = useCallback(() => setMenuOpen(false), []);

  // Close on Escape; lock body scroll while open.
  useEffect(() => {
    if (!menuOpen) return;

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);

    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [menuOpen]);

  return (
    <nav className="relative flex items-center justify-between px-4 sm:px-6 md:px-12 h-14 border-b border-[color:var(--rule)] gap-4 bg-[color:var(--paper)]">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-7 h-7 rounded-[7px] bg-[color:var(--ink)] flex items-center justify-center flex-shrink-0">
          <svg viewBox="0 0 16 16" fill="none" className="w-4 h-4" aria-hidden="true">
            <path d="M3 13 L3 3 L6 3 L6 10 L13 10 L13 13 Z" fill="white" />
            <circle cx="12" cy="4" r="1.8" fill="rgba(255,255,255,0.5)" />
          </svg>
        </div>
        <span className="font-sans font-bold text-[15px] text-[color:var(--ink)] tracking-[-0.02em]">
          LeadreAI
        </span>
      </div>

      {/* Desktop links */}
      <div className="hidden md:flex items-center gap-7">
        <Link
          href="/pricing"
          className="font-sans text-[13px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors tracking-[0.01em]"
        >
          Pricing
        </Link>
        <a
          href="#what-it-is"
          className="font-sans text-[13px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors tracking-[0.01em]"
        >
          Product
        </a>
        <Link
          href="/docs"
          className="font-sans text-[13px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors tracking-[0.01em]"
        >
          Docs
        </Link>
        <a
          href="#testimonials"
          className="font-sans text-[13px] text-[color:var(--ink-3)] hover:text-[color:var(--ink)] transition-colors tracking-[0.01em]"
        >
          Customers
        </a>
      </div>

      {/* Right side: Sign in (desktop), CTA (always), hamburger (mobile) */}
      <div className="flex items-center gap-2.5">
        <Link
          href="/login"
          className="hidden md:inline-block font-sans text-[13px] font-medium text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition-colors tracking-[0.01em]"
        >
          Sign in
        </Link>
        <Link
          href="/register"
          className="bg-[color:var(--ink)] text-[color:var(--paper)] font-sans text-[12.5px] font-semibold px-[14px] sm:px-[18px] py-2 rounded-md tracking-[0.02em] hover:opacity-85 transition-opacity whitespace-nowrap"
        >
          Start for free
        </Link>
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="md:hidden h-9 w-9 flex items-center justify-center rounded-md text-[color:var(--ink-2)] hover:bg-[color:var(--paper-2)] transition-colors"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-nav-panel"
        >
          {menuOpen ? (
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M6 18L18 6" />
            </svg>
          ) : (
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M3 6h18M3 12h18M3 18h18" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <>
          {/* Backdrop — fills viewport below the nav (h-14 = 56px). */}
          <div
            className="md:hidden fixed inset-0 top-14 bg-[color:var(--ink)]/20 z-30"
            onClick={closeMenu}
            aria-hidden="true"
          />
          <div
            id="mobile-nav-panel"
            className="md:hidden absolute top-full left-0 right-0 bg-[color:var(--paper)] border-b border-[color:var(--rule)] z-40 animate-fade-up shadow-sm"
          >
            <ul className="flex flex-col py-2 px-4">
              <li>
                <Link
                  href="/pricing"
                  onClick={closeMenu}
                  className="block py-3 font-sans text-[14px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] border-b border-[color:var(--rule)]/60 transition-colors"
                >
                  Pricing
                </Link>
              </li>
              <li>
                <a
                  href="#what-it-is"
                  onClick={closeMenu}
                  className="block py-3 font-sans text-[14px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] border-b border-[color:var(--rule)]/60 transition-colors"
                >
                  Product
                </a>
              </li>
              <li>
                <Link
                  href="/docs"
                  onClick={closeMenu}
                  className="block py-3 font-sans text-[14px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] border-b border-[color:var(--rule)]/60 transition-colors"
                >
                  Docs
                </Link>
              </li>
              <li>
                <a
                  href="#testimonials"
                  onClick={closeMenu}
                  className="block py-3 font-sans text-[14px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] border-b border-[color:var(--rule)]/60 transition-colors"
                >
                  Customers
                </a>
              </li>
              <li>
                <Link
                  href="/login"
                  onClick={closeMenu}
                  className="block py-3 font-sans text-[14px] font-medium text-[color:var(--ink)] hover:text-[color:var(--ember)] transition-colors"
                >
                  Sign in
                </Link>
              </li>
            </ul>
          </div>
        </>
      )}
    </nav>
  );
}
