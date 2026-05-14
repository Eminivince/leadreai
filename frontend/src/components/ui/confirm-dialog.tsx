'use client';

import * as React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './dialog';

/**
 * Confirm-before-destroy modal. Wrap any irreversible mutation (revoke API
 * key, delete KB entry, remove suppression row) with this so a fat-fingered
 * icon click can't lose customer data.
 *
 * The component is fully controlled — parent owns `open` state. We pull the
 * Radix focus-trap by default (built into <Dialog>), so keyboard users land
 * on the cancel button first and can't tab into anything behind the modal.
 */
export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  title: string;
  description?: string;
  // Name of the thing being destroyed; rendered with extra emphasis to give
  // the user a chance to spot a wrong-row mis-click.
  itemName?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  // Variant 'destructive' tints the confirm button red — the default. Use
  // 'default' for non-destructive confirms (e.g., publish, send, activate).
  variant?: 'destructive' | 'default';
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  itemName,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'destructive',
  loading = false,
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
  };

  const confirmClass =
    variant === 'destructive'
      ? 'inline-flex items-center justify-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50'
      : 'inline-flex items-center justify-center rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-50';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {itemName ? (
          <div className="mt-2 rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-3 py-2 text-sm">
            <span className="text-[color:var(--ink-2)]">Target: </span>
            <span className="font-medium text-[color:var(--ink)]">{itemName}</span>
          </div>
        ) : null}
        <DialogFooter className="mt-4">
          <button
            type="button"
            disabled={loading}
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center justify-center rounded-md border border-[color:var(--rule)] bg-[color:var(--paper-1)] px-4 py-2 text-sm hover:bg-[color:var(--paper-3)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => void handleConfirm()}
            className={confirmClass}
            autoFocus={false}
          >
            {loading ? 'Working…' : confirmLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
