'use client';

import * as React from 'react';
import * as DialogPrimitives from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

const Dialog = DialogPrimitives.Root;
const DialogTrigger = DialogPrimitives.Trigger;
const DialogPortal = DialogPrimitives.Portal;
const DialogClose = DialogPrimitives.Close;

const DialogOverlay = React.forwardRef<
 React.ElementRef<typeof DialogPrimitives.Overlay>,
 React.ComponentPropsWithoutRef<typeof DialogPrimitives.Overlay>
>(({ className, ...props }, ref) => (
 <DialogPrimitives.Overlay
  ref={ref}
  className={cn(
   'fixed inset-0 z-50 bg-black/60 backdrop-blur-sm',
   'data-[state=open]:animate-in data-[state=closed]:animate-out',
   'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
   className
  )}
  {...props}
 />
));
DialogOverlay.displayName = DialogPrimitives.Overlay.displayName;

const DialogContent = React.forwardRef<
 React.ElementRef<typeof DialogPrimitives.Content>,
 React.ComponentPropsWithoutRef<typeof DialogPrimitives.Content>
>(({ className, children, ...props }, ref) => (
 <DialogPortal>
  <DialogOverlay />
  <DialogPrimitives.Content
   ref={ref}
   className={cn(
    'fixed left-[50%] top-[50%] z-50 translate-x-[-50%] translate-y-[-50%]',
    'w-full max-w-lg rounded-lg border border-border bg-card p-6 shadow-xl',
    'data-[state=open]:animate-in data-[state=closed]:animate-out',
    'data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
    'data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
    'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]',
    'data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]',
    className
   )}
   {...props}
  >
   {children}
   <DialogPrimitives.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
    <X size={16} />
    <span className="sr-only">Close</span>
   </DialogPrimitives.Close>
  </DialogPrimitives.Content>
 </DialogPortal>
));
DialogContent.displayName = DialogPrimitives.Content.displayName;

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
 return (
  <div className={cn('flex flex-col space-y-1.5 text-center sm:text-left', className)} {...props} />
 );
}
DialogHeader.displayName = 'DialogHeader';

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
 return (
  <div
   className={cn('flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2', className)}
   {...props}
  />
 );
}
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef<
 React.ElementRef<typeof DialogPrimitives.Title>,
 React.ComponentPropsWithoutRef<typeof DialogPrimitives.Title>
>(({ className, ...props }, ref) => (
 <DialogPrimitives.Title
  ref={ref}
  className={cn('text-lg font-semibold leading-none tracking-tight text-foreground', className)}
  {...props}
 />
));
DialogTitle.displayName = DialogPrimitives.Title.displayName;

const DialogDescription = React.forwardRef<
 React.ElementRef<typeof DialogPrimitives.Description>,
 React.ComponentPropsWithoutRef<typeof DialogPrimitives.Description>
>(({ className, ...props }, ref) => (
 <DialogPrimitives.Description
  ref={ref}
  className={cn('text-sm text-muted-foreground', className)}
  {...props}
 />
));
DialogDescription.displayName = DialogPrimitives.Description.displayName;

export {
 Dialog,
 DialogPortal,
 DialogOverlay,
 DialogClose,
 DialogTrigger,
 DialogContent,
 DialogHeader,
 DialogFooter,
 DialogTitle,
 DialogDescription,
};
