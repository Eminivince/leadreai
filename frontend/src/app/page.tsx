'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Zap, Brain, Download, ArrowRight, Sparkles, Users, Target } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Navbar */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-xl font-bold text-transparent">
            LeadreAI
          </span>
          <nav className="flex items-center gap-3">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Sign in</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Get Started</Link>
            </Button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 py-32">
        {/* Background effects */}
        <div className="absolute inset-0 dot-grid opacity-40" />
        <div className="absolute left-1/2 top-0 h-[600px] w-[800px] -translate-x-1/2 rounded-full bg-indigo-600/10 blur-[120px]" />

        <div className="relative mx-auto max-w-4xl text-center">
          <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible">
            <Badge variant="indigo" className="mb-6 gap-1.5 px-3 py-1 text-xs">
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
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
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
            className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center"
          >
            <Button size="lg" className="gap-2 px-8" asChild>
              <Link href="/register">
                Start for free <ArrowRight size={16} />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <Link href="/login">See how it works</Link>
            </Button>
          </motion.div>
        </div>
      </section>

      {/* Stats bar */}
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

      {/* Features */}
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
                <Card className="h-full border-border/60 bg-card/60 transition-colors hover:border-indigo-500/40 hover:bg-card">
                  <CardContent className="p-6">
                    <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-600/20">
                      <feature.icon size={20} className="text-indigo-400" />
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

      {/* CTA Banner */}
      <section className="px-6 pb-24">
        <div className="mx-auto max-w-3xl">
          <motion.div
            variants={fadeUp}
            custom={0}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            className="relative overflow-hidden rounded-2xl border border-indigo-500/30 bg-gradient-to-br from-indigo-600/20 via-purple-600/10 to-background p-12 text-center"
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

      {/* Footer */}
      <footer className="border-t border-border/50 px-6 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 text-sm text-muted-foreground sm:flex-row">
          <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text font-bold text-transparent">
            LeadreAI
          </span>
          <span>© {new Date().getFullYear()} LeadreAI. All rights reserved.</span>
          <div className="flex gap-4">
            <Link href="/login" className="hover:text-foreground transition-colors">Sign in</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Register</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
