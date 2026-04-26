'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Theme preference lives in three states:
 *   · 'light'  — user chose light explicitly
 *   · 'dark'   — user chose dark explicitly
 *   · 'system' — follow OS / prefers-color-scheme (default)
 *
 * Resolved applied theme is always 'light' | 'dark'. It's what the
 * <html> tag reflects via the `dark` class.
 *
 * The single source of truth across tabs is localStorage + the
 * `prefers-color-scheme` media query. A tiny blocking script in
 * the root layout applies the right class *before* React hydrates
 * so there is no FOUC; this hook stays in sync from there.
 */

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function readStoredPreference(): ThemePreference {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

function systemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function applyThemeClass(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
}

export function useTheme(): {
  preference: ThemePreference;
  resolved: ResolvedTheme;
  setPreference: (p: ThemePreference) => void;
  toggle: () => void;
} {
  const [preference, setPreferenceState] = useState<ThemePreference>('system');
  const [resolved, setResolved] = useState<ResolvedTheme>('light');

  useEffect(() => {
    const pref = readStoredPreference();
    setPreferenceState(pref);
    const r: ResolvedTheme = pref === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : pref;
    setResolved(r);
    applyThemeClass(r);
  }, []);

  useEffect(() => {
    if (preference !== 'system') return;
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const listener = (e: MediaQueryListEvent) => {
      const r: ResolvedTheme = e.matches ? 'dark' : 'light';
      setResolved(r);
      applyThemeClass(r);
    };
    mq.addEventListener('change', listener);
    return () => mq.removeEventListener('change', listener);
  }, [preference]);

  const setPreference = useCallback((p: ThemePreference) => {
    setPreferenceState(p);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, p);
    }
    const r: ResolvedTheme = p === 'system' ? (systemPrefersDark() ? 'dark' : 'light') : p;
    setResolved(r);
    applyThemeClass(r);
  }, []);

  const toggle = useCallback(() => {
    setPreference(preference === 'light' ? 'dark' : preference === 'dark' ? 'system' : 'light');
  }, [preference, setPreference]);

  return { preference, resolved, setPreference, toggle };
}

// A literal, static string emitted into <head> to apply the theme
// class before hydration. Contains no interpolated values — the
// storage key is a constant and the rest is hand-written JS. Safe
// to mount via dangerouslySetInnerHTML.
export const THEME_INIT_SCRIPT = `
(function(){try{
  var k='${STORAGE_KEY}';
  var s=localStorage.getItem(k);
  var m=window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches;
  var d=(s==='dark')||(s!=='light'&&m);
  var r=document.documentElement;
  if(d) r.classList.add('dark'); else r.classList.remove('dark');
}catch(e){}})();
`;
