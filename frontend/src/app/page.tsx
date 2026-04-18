'use client';

import Image from 'next/image';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowRight, Brain, ChevronDown, Download, LogIn, Sparkles, UserPlus, Zap } from 'lucide-react';
import { CinematicFooter, MagneticButton } from '@/components/ui/motion-footer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, duration: 0.5, ease: [0.22, 1, 0.36, 1] },
  }),
};

const features = [
  {
    icon: Zap,
    title: 'Natural Language Queries',
    description:
      'Describe your ideal customer in plain English. "SaaS companies in NYC with 50–200 employees using Salesforce" — LeadreAI handles the rest.',
  },
  {
    icon: Brain,
    title: 'AI Lead Enrichment',
    description:
      'Every lead automatically enriched with verified emails, direct phone numbers, LinkedIn profiles, and company intelligence.',
  },
  {
    icon: Download,
    title: 'Export Ready',
    description:
      'One-click export to CSV or Excel. Direct CRM sync coming soon. Your leads, your workflow.',
  },
];

const stats = [
  { value: '10,000+', label: 'Leads Generated' },
  { value: '500+', label: 'Companies Served' },
  { value: '98%', label: 'Data Accuracy' },
];

/** Unsplash — stable editorial image */
const HERO_IMAGE =
  'https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=1920&q=80';

export default function LandingPage() {
  return (
    <div className="relative w-full overflow-x-hidden bg-background font-sans text-foreground selection:bg-muted selection:text-foreground">
      <header className="sticky top-0 z-[60] border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link href="/" className="text-xl font-bold tracking-tight text-foreground">
            LeadreAI
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <MagneticButton
              as={Link}
              href="/login"
              className="footer-glass-pill group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-foreground sm:px-5 sm:py-2.5"
            >
              <LogIn className="h-4 w-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground sm:h-[18px] sm:w-[18px]" />
              Sign in
            </MagneticButton>
            <MagneticButton
              as={Link}
              href="/register"
              className="group inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow-[0_8px_24px_-8px_rgba(0,0,0,0.45)] transition-colors hover:bg-primary/90 sm:px-5 sm:py-2.5"
            >
              <UserPlus className="h-4 w-4 shrink-0 opacity-90 transition-opacity group-hover:opacity-100 sm:h-[18px] sm:w-[18px]" />
              Get Started
            </MagneticButton>
          </nav>
        </div>
      </header>

      <main className="relative z-10 min-h-[125vh] w-full rounded-b-3xl border-b border-border/60 bg-background shadow-[0_32px_120px_-24px_rgba(0,0,0,0.55)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_center,hsl(0_0%_100%_/_0.04)_0%,transparent_55%)]" />

        <section className="relative min-h-[85vh] overflow-hidden px-6 py-28 md:py-32">
          <Image
            src={HERO_IMAGE}
            alt="Team collaborating around laptops in a modern office"
            fill
            priority
            className="object-cover opacity-[0.12]"
            sizes="100vw"
          />
          <div className="absolute inset-0 dot-grid opacity-50" />
          <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-white/[0.06] blur-[120px]" />

          <div className="relative mx-auto max-w-4xl text-center">
            <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
              <Badge variant="outline" className="mb-6 gap-1.5 px-3 py-1 text-xs">
                <Sparkles size={12} />
                AI-Powered Lead Generation
              </Badge>
            </motion.div>

            <motion.h1
              custom={1}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="mb-6 text-5xl font-extrabold leading-tight tracking-tight sm:text-6xl lg:text-7xl"
            >
              Find Your Next{' '}
              <span className="text-foreground underline decoration-white/25 decoration-2 underline-offset-8">
                Customer
              </span>{' '}
              with Natural Language
            </motion.h1>

            <motion.p
              custom={2}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="mb-10 text-lg text-muted-foreground sm:text-xl"
            >
              Describe your ideal prospect in plain English. LeadreAI uses AI to find, enrich, and
              deliver verified B2B leads — in minutes, not days.
            </motion.p>

            <motion.div
              custom={3}
              variants={fadeUp}
              initial="hidden"
              animate="visible"
              className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center"
            >
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
                See how it works
              </MagneticButton>
            </motion.div>
          </div>
        </section>

        <section className="border-y border-border/50 bg-card/30 px-6 py-12">
          <div className="mx-auto max-w-4xl">
            <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
              {stats.map((stat, i) => (
                <motion.div
                  key={stat.label}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                  className="text-center"
                >
                  <div className="text-4xl font-extrabold text-foreground">{stat.value}</div>
                  <div className="mt-1 text-sm text-muted-foreground">{stat.label}</div>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 py-24">
          <div className="mx-auto max-w-6xl">
            <motion.div
              variants={fadeUp}
              custom={0}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="mb-16 text-center"
            >
              <h2 className="mb-4 text-3xl font-bold sm:text-4xl">Everything you need to close deals</h2>
              <p className="text-muted-foreground">
                From query to qualified lead in minutes — powered by Claude AI.
              </p>
            </motion.div>

            <div className="grid gap-6 sm:grid-cols-3">
              {features.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  custom={i}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                >
                  <Card className="h-full border-border/60 bg-card/60 transition-colors hover:border-foreground/20 hover:bg-card">
                    <CardContent className="p-6">
                      <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
                        <feature.icon size={20} className="text-foreground" />
                      </div>
                      <h3 className="mb-2 font-semibold text-foreground">{feature.title}</h3>
                      <p className="text-sm leading-relaxed text-muted-foreground">
                        {feature.description}
                      </p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-6 pb-16 pt-4">
          <div className="mx-auto max-w-3xl">
            <motion.div
              variants={fadeUp}
              custom={0}
              initial="hidden"
              whileInView="visible"
              viewport={{ once: true }}
              className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-muted/50 via-background to-background p-12 text-center"
            >
              <div className="absolute inset-0 dot-grid opacity-20" />
              <div className="relative">
                <h2 className="mb-4 text-3xl font-bold">Ready to fill your pipeline?</h2>
                <p className="mb-8 text-muted-foreground">
                  Join hundreds of sales teams using AI to find their next customers.
                </p>
                <Button size="lg" className="gap-2 px-10" asChild>
                  <Link href="/register">
                    Start for free <ArrowRight size={16} />
                  </Link>
                </Button>
              </div>
            </motion.div>
          </div>
        </section>

        <div className="flex flex-col items-center justify-end pb-10 pt-4 text-muted-foreground">
          <p className="mb-3 text-xs font-medium uppercase tracking-[0.35em]">Scroll to reveal</p>
          <ChevronDown className="h-6 w-6 animate-bounce opacity-70" aria-hidden />
        </div>
      </main>

      <CinematicFooter />
    </div>
  );
}
