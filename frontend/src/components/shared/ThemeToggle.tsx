'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * Sun/moon button that flips the app between light and dark.
 *
 * Hydration: useTheme() returns undefined during SSR + the first client
 * render. Rendering the icon based on `theme` directly would briefly
 * mismatch the server snapshot. We mount-gate the visible icon behind
 * a `mounted` boolean and render a same-sized placeholder until then,
 * so layout doesn't shift and React doesn't log a mismatch.
 *
 * resolvedTheme is preferred over theme: when defaultTheme="system",
 * `theme` reads "system" but resolvedTheme reads the actual current
 * appearance ("light" or "dark"), which is what the user sees.
 */
export function ThemeToggle({ className = '' }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const isDark = resolvedTheme === 'dark';

  const base =
    'inline-flex items-center justify-center w-9 h-9 rounded-lg ' +
    'text-[color:var(--ink-2)] hover:text-[color:var(--ink)] ' +
    'hover:bg-[color:var(--paper-3)] transition-colors ' +
    'border border-[color:var(--rule)]';

  if (!mounted) {
    // Placeholder keeps layout stable; aria-hidden because no real
    // control is exposed yet.
    return <div aria-hidden className={`${base} ${className}`} />;
  }

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      aria-label={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
      title={isDark ? 'Light theme' : 'Dark theme'}
      className={`${base} ${className}`}
    >
      {isDark ? <Sun size={16} strokeWidth={1.6} /> : <Moon size={16} strokeWidth={1.6} />}
    </button>
  );
}
