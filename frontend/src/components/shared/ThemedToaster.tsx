'use client';

import { Toaster } from 'sonner';
import { useTheme } from '@/hooks/useTheme';

/**
 * Sonner wrapper that follows the resolved theme. Light mode uses
 * the ivory/ink editorial palette; dark uses the charcoal variant.
 * Colors are read from CSS variables so a palette tweak in globals.css
 * updates toasts for free.
 */
export function ThemedToaster() {
  const { resolved } = useTheme();

  return (
    <Toaster
      position="top-right"
      theme={resolved}
      toastOptions={{
        style: {
          background: 'var(--paper-3)',
          border: '1px solid var(--rule)',
          color: 'var(--ink)',
        },
      }}
    />
  );
}
