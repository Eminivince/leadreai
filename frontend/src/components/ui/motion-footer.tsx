'use client';

import * as React from 'react';
import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ArrowRight, ArrowUp, LogIn, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';

if (typeof window !== 'undefined') {
 gsap.registerPlugin(ScrollTrigger);
}

export type MagneticButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
 React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  as?: React.ElementType;
 };

export const MagneticButton = React.forwardRef<HTMLElement, MagneticButtonProps>(
 ({ className, children, as: Component = 'button', ...props }, forwardedRef) => {
  const localRef = useRef<HTMLElement>(null);

  useEffect(() => {
   if (typeof window === 'undefined') return;
   const element = localRef.current;
   if (!element) return;

   const ctx = gsap.context(() => {
    const handleMouseMove = (e: MouseEvent) => {
     const rect = element.getBoundingClientRect();
     const h = rect.width / 2;
     const w = rect.height / 2;
     const x = e.clientX - rect.left - h;
     const y = e.clientY - rect.top - w;

     gsap.to(element, {
      x: x * 0.4,
      y: y * 0.4,
      rotationX: -y * 0.15,
      rotationY: x * 0.15,
      scale: 1.05,
      ease: 'power2.out',
      duration: 0.4,
     });
    };

    const handleMouseLeave = () => {
     gsap.to(element, {
      x: 0,
      y: 0,
      rotationX: 0,
      rotationY: 0,
      scale: 1,
      ease: 'elastic.out(1, 0.3)',
      duration: 1.2,
     });
    };

    element.addEventListener('mousemove', handleMouseMove);
    element.addEventListener('mouseleave', handleMouseLeave);

    return () => {
     element.removeEventListener('mousemove', handleMouseMove);
     element.removeEventListener('mouseleave', handleMouseLeave);
    };
   }, element);

   return () => ctx.revert();
  }, []);

  return (
   <Component
    ref={(node: HTMLElement | null) => {
     (localRef as React.MutableRefObject<HTMLElement | null>).current = node;
     if (typeof forwardedRef === 'function') forwardedRef(node);
     else if (forwardedRef) (forwardedRef as React.MutableRefObject<HTMLElement | null>).current = node;
    }}
    className={cn('cursor-pointer', className)}
    {...props}
   >
    {children}
   </Component>
  );
 }
);
MagneticButton.displayName = 'MagneticButton';

const MarqueeItem = () => (
 <div className="flex items-center space-x-12 px-6">
  <span>Natural language queries</span> <span className="text-muted-foreground/50">✦</span>
  <span>AI lead enrichment</span> <span className="text-muted-foreground/50">✦</span>
  <span>Verified emails &amp; phones</span> <span className="text-muted-foreground/50">✦</span>
  <span>CSV export ready</span> <span className="text-muted-foreground/50">✦</span>
  <span>Pipeline in minutes</span> <span className="text-muted-foreground/50">✦</span>
 </div>
);

export function CinematicFooter() {
 const wrapperRef = useRef<HTMLDivElement>(null);
 const giantTextRef = useRef<HTMLDivElement>(null);
 const headingRef = useRef<HTMLHeadingElement>(null);
 const linksRef = useRef<HTMLDivElement>(null);

 useEffect(() => {
  if (typeof window === 'undefined') return;
  if (!wrapperRef.current) return;

  const ctx = gsap.context(() => {
   gsap.fromTo(
    giantTextRef.current,
    { y: '10vh', scale: 0.8, opacity: 0 },
    {
     y: '0vh',
     scale: 1,
     opacity: 1,
     ease: 'power1.out',
     scrollTrigger: {
      trigger: wrapperRef.current,
      start: 'top 80%',
      end: 'bottom bottom',
      scrub: 1,
     },
    }
   );

   gsap.fromTo(
    [headingRef.current, linksRef.current],
    { y: 50, opacity: 0 },
    {
     y: 0,
     opacity: 1,
     stagger: 0.15,
     ease: 'power3.out',
     scrollTrigger: {
      trigger: wrapperRef.current,
      start: 'top 40%',
      end: 'bottom bottom',
      scrub: 1,
     },
    }
   );
  }, wrapperRef);

  return () => ctx.revert();
 }, []);

 const scrollToTop = () => {
  window.scrollTo({ top: 0, behavior: 'smooth' });
 };

 return (
  <div
   ref={wrapperRef}
   className="relative h-screen w-full"
   style={{ clipPath: 'polygon(0% 0, 100% 0%, 100% 100%, 0 100%)' }}
  >
   <footer className="cinematic-footer-wrapper fixed bottom-0 left-0 flex h-screen w-full flex-col justify-between overflow-hidden bg-background text-foreground">
    <div className="footer-aurora pointer-events-none absolute left-1/2 top-1/2 z-0 h-[60vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 animate-footer-breathe rounded-[50%] blur-[80px]" />
    <div className="footer-bg-grid pointer-events-none absolute inset-0 z-0" />

    <div
     ref={giantTextRef}
     className="footer-giant-bg-text pointer-events-none absolute -bottom-[5vh] left-1/2 z-0 -translate-x-1/2 select-none whitespace-nowrap"
    >
     LEADS
    </div>

    <div className="absolute left-0 top-12 z-10 w-full -rotate-2 scale-110 overflow-hidden border-y border-border/50 bg-background/60 py-4 shadow-2xl backdrop-blur-md">
     <div className="flex w-max animate-footer-scroll-marquee text-xs font-bold uppercase tracking-[0.3em] text-muted-foreground md:text-sm">
      <MarqueeItem />
      <MarqueeItem />
     </div>
    </div>

    <div className="relative z-10 mx-auto mt-20 flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6">
     <h2
      ref={headingRef}
      className="footer-text-glow mb-12 text-center text-5xl font-black tracking-tighter md:text-8xl"
     >
      Ready to begin?
     </h2>

     <div ref={linksRef} className="flex w-full flex-col items-center gap-6">
      <div className="flex w-full flex-wrap justify-center gap-4">
       <MagneticButton
        as={Link}
        href="/register"
        className="group flex items-center gap-3 rounded-full bg-primary px-10 py-5 text-sm font-bold text-primary-foreground shadow-[0_12px_40px_-12px_rgba(0,0,0,0.5)] transition-colors hover:bg-primary/90 md:text-base"
       >
        <UserPlus className="h-6 w-6 opacity-80 transition-opacity group-hover:opacity-100" />
        Start for free
        <ArrowRight className="h-5 w-5 opacity-80 transition-opacity group-hover:opacity-100" />
       </MagneticButton>

       <MagneticButton
        as={Link}
        href="/login"
        className="footer-glass-pill group flex items-center gap-3 rounded-full px-10 py-5 text-sm font-bold text-foreground md:text-base"
       >
        <LogIn className="h-6 w-6 text-muted-foreground transition-colors group-hover:text-foreground" />
        Sign in
       </MagneticButton>
      </div>

      <div className="mt-2 flex w-full flex-wrap justify-center gap-3 md:gap-6">
       <MagneticButton
        as={Link}
        href="#"
        className="footer-glass-pill rounded-full px-6 py-3 text-xs font-medium text-muted-foreground hover:text-foreground md:text-sm"
       >
        Privacy
       </MagneticButton>
       <MagneticButton
        as={Link}
        href="#"
        className="footer-glass-pill rounded-full px-6 py-3 text-xs font-medium text-muted-foreground hover:text-foreground md:text-sm"
       >
        Terms
       </MagneticButton>
       <MagneticButton
        as={Link}
        href="/login"
        className="footer-glass-pill rounded-full px-6 py-3 text-xs font-medium text-muted-foreground hover:text-foreground md:text-sm"
       >
        Support
       </MagneticButton>
      </div>
     </div>
    </div>

    <div className="relative z-20 flex w-full flex-col items-center justify-between gap-6 px-6 pb-8 md:flex-row md:px-12">
     <div className="order-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground md:order-1 md:text-xs">
      © {new Date().getFullYear()} LeadreAI. All rights reserved.
     </div>

     

     <MagneticButton
      as="button"
      type="button"
      onClick={scrollToTop}
      className="footer-glass-pill group order-3 flex h-12 w-12 items-center justify-center rounded-full text-muted-foreground hover:text-foreground"
      aria-label="Back to top"
     >
      <ArrowUp className="h-5 w-5 transition-transform duration-300 group-hover:-translate-y-1.5" />
     </MagneticButton>
    </div>
   </footer>
  </div>
 );
}
