# Design System Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic amber/white B2B SaaS aesthetic with a warm-cream, craft-tool design language using Instrument Serif + Outfit + DM Mono typography and a single burnt-terracotta (ember) accent.

**Architecture:** Group A (globals.css + tailwind.config + root layout) must land first since every component inherits from it. Groups B–F can then proceed in parallel. Because the token names are deliberately preserved (--paper, --ink, --rule), most components only need color substitutions (--forest → --ember) rather than structural rewrites.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS 3, next/font/google (no external Google Fonts URL), Framer Motion, shadcn/ui, geist package (to be removed from layout.tsx)

**Design spec:** `docs/superpowers/specs/2026-05-14-design-system-redesign.md`
**Approved mockup:** `.superpowers/brainstorm/19882-1778781621/content/authentic.html`

---

## GROUP A — Foundation (must complete before B–F)

### Task 1: globals.css — Replace design tokens and update font base

**Files:**
- Modify: `frontend/src/app/globals.css`

- [ ] **Step 1: Replace the `:root` token block and remove the Google Fonts import**

Open `frontend/src/app/globals.css`. The file currently starts with a Google Fonts `@import` for Plus Jakarta Sans. Remove that line entirely. Then replace the entire `:root { ... }` block (lines roughly 8–43) with:

```css
:root {
  /* Backgrounds */
  --paper:    #F6F2EA;   /* warm cream — main bg */
  --paper-2:  #EDE8DC;   /* raised surfaces, table stripes */
  --paper-3:  #E4DCCE;   /* subtle panel tint */

  /* Text */
  --ink:      #1C1714;   /* primary */
  --ink-2:    #4A4035;   /* secondary */
  --ink-3:    #8A7A65;   /* tertiary / meta */
  --ink-4:    #B8A898;   /* quaternary / placeholder */

  /* Structure */
  --rule:     #DDD7CC;   /* hairlines, borders */

  /* Accent — burnt terracotta */
  --ember:    #B84C2B;
  --ember-bg: #F7E8E2;
  --ember-2:  #8A3520;

  /* Semantic */
  --warn:     #DC2626;
  --success:  #2D7A4A;

  /* shadcn HSL tokens — mapped to new palette */
  --background: 40 40% 94%;
  --foreground: 23 17% 9%;
  --card: 38 32% 90%;
  --card-foreground: 23 17% 9%;
  --border: 39 20% 83%;
  --input: 39 20% 83%;
  --ring: 14 62% 45%;
  --primary: 23 17% 9%;
  --primary-foreground: 40 40% 94%;
  --secondary: 38 32% 88%;
  --secondary-foreground: 23 17% 9%;
  --muted: 38 32% 88%;
  --muted-foreground: 30 18% 47%;
  --accent: 14 62% 45%;
  --accent-foreground: 40 40% 94%;
  --destructive: 0 72% 51%;
  --destructive-foreground: 0 0% 100%;
  --radius: 0.5rem;
}
```

- [ ] **Step 2: Replace the `.dark` block**

Find and replace the entire `.dark { ... }` block with:

```css
.dark {
  --paper:    #1C1714;
  --paper-2:  #26201A;
  --paper-3:  #312820;
  --ink:      #F0EBE0;
  --ink-2:    #C8B8A0;
  --ink-3:    #8A7A65;
  --ink-4:    #5A4A38;
  --rule:     #3A3028;
  --ember:    #D4623A;
  --ember-bg: #2A1810;
  --ember-2:  #E87850;
  --warn:     #F87171;
  --success:  #4ADE80;

  /* shadcn dark */
  --background: 22 14% 10%;
  --foreground: 40 35% 92%;
  --card: 22 18% 13%;
  --card-foreground: 40 35% 92%;
  --border: 22 14% 20%;
  --input: 22 14% 20%;
  --ring: 15 61% 53%;
  --primary: 40 35% 92%;
  --primary-foreground: 22 14% 10%;
  --secondary: 22 18% 19%;
  --secondary-foreground: 40 35% 92%;
  --muted: 22 18% 19%;
  --muted-foreground: 30 12% 55%;
  --accent: 15 61% 53%;
  --accent-foreground: 22 14% 10%;
  --destructive: 0 84% 70%;
  --destructive-foreground: 0 0% 100%;
}
```

- [ ] **Step 3: Remove the `.alt-tokens` block (old marketing page tokens)**

Delete the entire `.alt-tokens { ... }` and `.dark .alt-tokens { ... }` blocks. These were for the old amber marketing pages. The new token system handles all pages.

- [ ] **Step 4: Update body font reference and the `.ldr-input` block**

In the `body { ... }` rule, add `font-family: var(--font-body), system-ui, sans-serif;` so the body uses Outfit once the font is loaded in layout.tsx.

Replace the `.ldr-input` block:

```css
.ldr-input {
  width: 100%;
  background: white;
  border: 1px solid var(--rule);
  color: var(--ink);
  font-family: var(--font-body), system-ui, sans-serif;
  font-size: 13.5px;
  padding: 10px 14px;
  border-radius: 8px;
  transition: border-color .15s;
  outline: none;
}
.ldr-input::placeholder { color: var(--ink-4); }
.ldr-input:hover { border-color: var(--ink-3); }
.ldr-input:focus {
  border-color: var(--ink);
  box-shadow: none;
}
```

- [ ] **Step 5: Update `.indeterminate-bar::after` to use `--ember`**

Find `background: var(--forest);` inside `.indeterminate-bar::after` and change to `background: var(--ember);`.

- [ ] **Step 6: Verify by running TypeScript check**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: 0 errors (CSS changes don't affect TS). If there are pre-existing errors, note them but don't treat as a blocker for this task.

- [ ] **Step 7: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/globals.css
git commit -m "design: replace design tokens with warm-cream palette + ember accent"
```

---

### Task 2: tailwind.config.ts — Font family extensions

**Files:**
- Modify: `frontend/tailwind.config.ts`

- [ ] **Step 1: Replace the `fontFamily` block**

In `tailwind.config.ts`, find the `fontFamily` block inside `theme.extend` and replace it entirely:

```ts
fontFamily: {
  display: ['var(--font-display)', 'Georgia', 'serif'],
  sans:    ['var(--font-body)',    'system-ui', 'sans-serif'],
  mono:    ['var(--font-mono)',    'ui-monospace', 'monospace'],
},
```

This overrides the default Tailwind `font-sans` to use Outfit (via `--font-body`), adds `font-display` for Instrument Serif headings, and maps `font-mono` to DM Mono.

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add tailwind.config.ts
git commit -m "design: remap font-sans/display/mono to new typeface system"
```

---

### Task 3: app/layout.tsx — Replace font loading

**Files:**
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Replace font imports and variables**

Replace the entire font import and configuration block at the top of the file. Remove Geist, Inter, Barlow, Instrument_Serif (old variable), JetBrains_Mono. Add Instrument_Serif, Outfit, DM_Mono:

```tsx
import { Instrument_Serif, Outfit, DM_Mono } from 'next/font/google';

const instrumentSerif = Instrument_Serif({
  subsets: ['latin'],
  weight: '400',
  style: ['normal', 'italic'],
  variable: '--font-display',
  display: 'swap',
});

const outfit = Outfit({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-body',
  display: 'swap',
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-mono',
  display: 'swap',
});
```

- [ ] **Step 2: Update the `<body>` className**

Replace the body element with:

```tsx
<body className={`${instrumentSerif.variable} ${outfit.variable} ${dmMono.variable} font-sans antialiased`}>
```

This injects the CSS variables and applies `font-sans` (which Tailwind now maps to `--font-body` / Outfit).

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend && npx tsc --noEmit 2>&1 | head -20
```

Expected: `DM_Mono` and `Outfit` are valid exports from `next/font/google`. If either shows "Module has no exported member", check spelling: it's `DM_Mono` (capital M) and `Outfit`.

- [ ] **Step 4: Start dev server and verify fonts load**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend && npm run dev -- --port 3001 &
sleep 5 && curl -s http://localhost:3001 | grep -o 'font-display\|font-body\|font-mono' | head -5
```

If the CSS variables appear in the HTML, fonts are loading. Check the browser at http://localhost:3001 — page background should now be warm cream (#F6F2EA) instead of white.

- [ ] **Step 5: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/layout.tsx
git commit -m "design: load Outfit + Instrument Serif + DM Mono via next/font"
```

---

## GROUP B — Shell (run after Group A)

### Task 4: Sidebar.tsx — Retheme to ember accent + cream background

**Files:**
- Modify: `frontend/src/components/layout/Sidebar.tsx`

The sidebar currently uses `--forest` for the active state and logo background. The new design uses:
- Background: `--paper-2` (was `--paper`)
- Active nav item: `--ember/10` tint + `--ember-2` text + 2px left ember bar
- Logo: `bg-[color:var(--ember)]` 
- Credits bar: `--ember` instead of `--forest`
- Section labels: use `font-mono text-[9px] tracking-[0.18em] uppercase` pattern

- [ ] **Step 1: Update sidebar container background**

In the `<motion.aside>` element, change `bg-[color:var(--paper)]` to `bg-[color:var(--paper-2)]`.

- [ ] **Step 2: Update logo background**

In the logo `<Link>`, change `bg-[color:var(--forest)]` to `bg-[color:var(--ember)]`.

- [ ] **Step 3: Update brand wordmark dot color**

In the wordmark span with `text-[color:var(--forest)]`, change to `text-[color:var(--ember)]`.

- [ ] **Step 4: Update `NavRow` active state to include ember left bar**

In the `rowState` active class, replace:
```ts
'bg-[color:var(--forest)]/10 text-[color:var(--forest-2)] font-semibold'
```
with:
```ts
'bg-[color:var(--ember)]/8 text-[color:var(--ember)] font-semibold pl-[11px] border-l-2 border-[color:var(--ember)]'
```

And for child active items, replace `text-[color:var(--forest-2)] ... bg-[color:var(--forest)]/10` with `text-[color:var(--ember)] ... bg-[color:var(--ember)]/8`.

- [ ] **Step 5: Update credits bar color**

Find `'bg-[color:var(--forest)]'` in the credits progress bar (the `motion.div` with width percentage) and change to `'bg-[color:var(--ember)]'`. Also update the "Top-up" button color from `text-[color:var(--forest)]` to `text-[color:var(--ember)]`.

- [ ] **Step 6: Update section labels to use monospace pattern**

Replace the two `<motion.span>` section labels ("Workspace", "More"):

```tsx
<motion.span
  ...
  className="px-5 mb-1 font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-4)] whitespace-nowrap"
>
  Workspace
</motion.span>
```

Same pattern for "More".

- [ ] **Step 7: Update user avatar background**

Change `bg-[color:var(--forest)]` on the avatar `div` to `bg-[color:var(--ember)]`.

- [ ] **Step 8: TypeScript check + commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend && npx tsc --noEmit 2>&1 | head -20
git add src/components/layout/Sidebar.tsx
git commit -m "design: retheme sidebar — ember accent, paper-2 bg, mono section labels"
```

---

### Task 5: Topbar.tsx — Border-bottom, paper background, h-14

**Files:**
- Modify: `frontend/src/components/layout/Topbar.tsx`

- [ ] **Step 1: Update height to `h-14`**

Change `h-[52px]` on the outer div to `h-14` (56px as per spec).

- [ ] **Step 2: Verify the file compiles**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend && npx tsc --noEmit 2>&1 | grep Topbar
```

The topbar doesn't reference `--forest`, so this is mainly a height change. The border-b is applied by the dashboard layout wrapper.

- [ ] **Step 3: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/components/layout/Topbar.tsx
git commit -m "design: topbar height h-14"
```

---

### Task 6: Dashboard layout.tsx — Update shell colors and border

**Files:**
- Modify: `frontend/src/app/(dashboard)/layout.tsx`

- [ ] **Step 1: Update the main content background**

The content area `<div className="flex-1 relative bg-[color:var(--paper-2)]">` — this is correct already for the new design (paper-2 as raised surface). Keep it.

- [ ] **Step 2: Remove aurora/glass remnants, update topbar wrapper**

The sticky topbar wrapper currently has `bg-[color:var(--paper)]/95 backdrop-blur-sm border-b border-[color:var(--rule)]`. This is correct — keep it as-is.

The outer div uses `selection:bg-[color:var(--forest)] selection:text-white`. Change `--forest` to `--ember`:

```tsx
<div className="flex min-h-screen w-full bg-[color:var(--paper)] text-[color:var(--ink)] selection:bg-[color:var(--ember)] selection:text-white flex-col">
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(dashboard\)/layout.tsx
git commit -m "design: update dashboard layout selection color to ember"
```

---

### Task 7: WorkspaceSwitcher.tsx — Update accent references

**Files:**
- Modify: `frontend/src/components/layout/WorkspaceSwitcher.tsx`

- [ ] **Step 1: Read the file and substitute `--forest` → `--ember`**

```bash
grep -n "forest\|rust" /Users/Shared/personalProjects/leadreai/frontend/src/components/layout/WorkspaceSwitcher.tsx
```

Read the file, find any `--forest` or `--rust` token references, and replace with `--ember` or `--ember-2` respectively.

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/components/layout/WorkspaceSwitcher.tsx
git commit -m "design: workspace switcher ember accent"
```

---

### Task 8: NotificationDropdown.tsx — Update accent references

**Files:**
- Modify: `frontend/src/components/layout/NotificationDropdown.tsx`

- [ ] **Step 1: Read the file and substitute tokens**

```bash
grep -n "forest\|rust" /Users/Shared/personalProjects/leadreai/frontend/src/components/layout/NotificationDropdown.tsx
```

Replace all `--forest` with `--ember` and `--rust` with `--ember-2`.

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/components/layout/NotificationDropdown.tsx
git commit -m "design: notification dropdown ember accent"
```

---

## GROUP C — Marketing + Auth (run in parallel with Group B, after Group A)

### Task 9: app/page.tsx — Rebuild landing page from approved mockup

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: Read the approved mockup and understand the full structure**

Read the file at `.superpowers/brainstorm/19882-1778781621/content/authentic.html` in full. This is the source of truth for the landing page design.

Key sections to implement:
- Full-width nav with "LeadreAI" wordmark (font-sans font-bold) + right-side CTA buttons
- Hero section: eyebrow label in `font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ember)]`, headline in `font-display text-[48px]` (Instrument Serif), subheadline in `font-sans text-[color:var(--ink-2)]`
- Product demo table (blurred lower rows + unlock gate with ember CTA)
- "What it is" honest copy section
- 3-card testimonials in Instrument Serif italic
- Footer

- [ ] **Step 2: Rewrite app/page.tsx**

Rebuild the page as a React Server Component. Use `next/link` for navigation. The page must:
- NOT import from `geist` — fonts come from the root layout CSS variables
- Use `bg-[color:var(--paper)]` as the page background
- Use the design token classes throughout (no hardcoded hex values)
- Use `font-display` for h1/h2 headings
- Use `font-mono text-[9.5px] tracking-[0.18em] uppercase` for all eyebrow/category labels
- Use `bg-[color:var(--ember)]` for primary CTAs with `text-white`
- Remove any reference to `alt-tokens` class

Example nav markup:
```tsx
<nav className="border-b border-[color:var(--rule)] bg-[color:var(--paper)]/95 backdrop-blur-sm sticky top-0 z-50">
  <div className="max-w-6xl mx-auto px-6 h-14 flex items-center gap-6">
    <span className="font-sans font-bold text-[15px] text-[color:var(--ink)]">LeadreAI</span>
    <div className="ml-auto flex items-center gap-3">
      <Link href="/login" className="font-sans font-medium text-[13px] text-[color:var(--ink-2)] hover:text-[color:var(--ink)] transition-colors">
        Sign in
      </Link>
      <Link href="/register" className="bg-[color:var(--ink)] text-[color:var(--paper)] font-sans font-semibold text-[13px] px-5 py-2.5 rounded-lg hover:opacity-85 transition-opacity">
        Get started
      </Link>
    </div>
  </div>
</nav>
```

Example hero eyebrow:
```tsx
<p className="font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ember)] mb-4">
  B2B Intelligence · Nigeria
</p>
```

- [ ] **Step 3: TypeScript check**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend && npx tsc --noEmit 2>&1 | head -20
```

- [ ] **Step 4: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/page.tsx
git commit -m "design: rebuild landing page with authentic warm-cream design language"
```

---

### Task 10: AuthShell.tsx — Retheme to cream card + ember CTA

**Files:**
- Modify: `frontend/src/components/auth/AuthShell.tsx`

- [ ] **Step 1: Read the current file**

```bash
cat /Users/Shared/personalProjects/leadreai/frontend/src/components/auth/AuthShell.tsx
```

- [ ] **Step 2: Update shell structure**

Per spec §5.4: Auth shell uses `var(--paper)` full-page background with a centered card: `max-w-md`, `bg-white border border-[color:var(--rule)] rounded-2xl p-8`. The logo is centered at top.

Key changes:
- Replace any dark background or gradient with `bg-[color:var(--paper)] min-h-screen`
- Card: `bg-white border border-[color:var(--rule)] rounded-2xl p-8 shadow-none`
- Logo: "LeadreAI" in `font-sans font-bold text-[17px] text-[color:var(--ink)]`
- Form inputs: must use the new `.ldr-input` style (or inline equivalent: `bg-white border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5 text-[13.5px] focus:border-[color:var(--ink)] focus:outline-none`)
- Primary button: `bg-[color:var(--ink)] text-[color:var(--paper)] font-sans font-semibold text-[13px] px-5 py-2.5 rounded-lg hover:opacity-85 w-full`
- SSO/Google buttons: `border border-[color:var(--rule)] bg-transparent text-[color:var(--ink-2)] font-sans font-medium text-[13px] px-5 py-2.5 rounded-lg hover:border-[color:var(--ink)] w-full`

- [ ] **Step 3: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/components/auth/AuthShell.tsx
git commit -m "design: retheme auth shell — cream bg, card border, ember-less inputs"
```

---

### Task 11: Auth pages — login, register, magic, SSO complete

**Files:**
- Modify: `frontend/src/app/(auth)/login/page.tsx`
- Modify: `frontend/src/app/(auth)/register/page.tsx`
- Modify: `frontend/src/app/auth/magic/page.tsx`
- Modify: `frontend/src/app/auth/sso/complete/page.tsx`

- [ ] **Step 1: Read each file and update any inline color references**

For each file, run:
```bash
grep -n "forest\|rust\|#\|rgba\|rgb(" /Users/Shared/personalProjects/leadreai/frontend/src/app/\(auth\)/login/page.tsx
```

Auth pages should delegate all styling to `AuthShell`. If any page has its own background color, dark styling, or hardcoded colors, replace with token references. Any amber/forest accent should become ember.

- [ ] **Step 2: Commit all four**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(auth\)/login/page.tsx src/app/\(auth\)/register/page.tsx src/app/auth/magic/page.tsx src/app/auth/sso/complete/page.tsx
git commit -m "design: auth pages use new token-based auth shell"
```

---

### Task 12: OnboardingWizard.tsx — Retheme to cream + ember

**Files:**
- Modify: `frontend/src/components/onboarding/OnboardingWizard.tsx`

- [ ] **Step 1: Read the file and find color references**

```bash
grep -n "forest\|rust\|amber\|#f59e\|rgba\|bg-white\|bg-gray\|border-gray" /Users/Shared/personalProjects/leadreai/frontend/src/components/onboarding/OnboardingWizard.tsx | head -20
```

- [ ] **Step 2: Apply retheme**

The wizard is a modal/overlay — use `shadow-xl` for elevation (spec §4.1 exception). Key updates:
- Modal container: `bg-[color:var(--paper)] border border-[color:var(--rule)] rounded-2xl shadow-xl`
- Progress/step indicator: use `--ember` for active step color
- Primary "Continue" button: `bg-[color:var(--ink)] text-[color:var(--paper)]`
- Input fields: new `.ldr-input` style
- Any forest/amber references: replace with ember

- [ ] **Step 3: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/components/onboarding/OnboardingWizard.tsx
git commit -m "design: onboarding wizard ember accent + cream bg"
```

---

### Task 13: pricing/page.tsx — Retheme

**Files:**
- Modify: `frontend/src/app/pricing/page.tsx`

- [ ] **Step 1: Read and replace color tokens**

```bash
grep -n "forest\|rust\|alt-amber\|alt-ink\|alt-paper\|Plus Jakarta\|font-barlow" /Users/Shared/personalProjects/leadreai/frontend/src/app/pricing/page.tsx | head -20
```

Remove any `className="alt-tokens"`. Replace amber token references with ember. Page background: `bg-[color:var(--paper)]`. Pricing cards: `border border-[color:var(--rule)] rounded-xl bg-white` (no shadows). Popular/featured card: `border-[color:var(--ember)]`. CTA buttons: ember primary style.

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/pricing/page.tsx
git commit -m "design: pricing page rethemed to warm-cream palette"
```

---

## GROUP D — Dashboard Core Pages (run after Group B)

### Task 14: dashboard/page.tsx (The Desk)

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/page.tsx`

- [ ] **Step 1: Read the file and find all color/font references**

```bash
grep -n "forest\|rust\|font-barlow\|font-geist\|GlassCard\|aurora\|liquid-glass" /Users/Shared/personalProjects/leadreai/frontend/src/app/\(dashboard\)/dashboard/page.tsx | head -20
```

- [ ] **Step 2: Apply retheme**

The dashboard page uses cards and data displays. Key changes:
- Page title: add `font-display text-[28px]` (Instrument Serif) to the main h1
- Card containers: remove any `shadow-*` classes, use `border border-[color:var(--rule)] rounded-xl` instead
- Stats/metric numbers: wrap in `font-mono` class
- Any `--forest` accent: replace with `--ember`
- Section headers: `font-sans font-semibold text-[15px] text-[color:var(--ink)]`
- Eyebrow labels above sections: `font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]`

- [ ] **Step 3: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(dashboard\)/dashboard/page.tsx
git commit -m "design: dashboard home — display font headings, ember accent, border cards"
```

---

### Task 15: leads/page.tsx

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/leads/page.tsx`

- [ ] **Step 1: Apply the table style from spec §4.6**

The leads page has a data table. Apply:
```
thead: bg-[color:var(--paper-2)] border-b border-[color:var(--rule)]
th: font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-4)] font-medium px-4 py-2.5
td: font-sans text-[13px] text-[color:var(--ink-2)] px-4 py-3 border-b border-[color:var(--paper-2)]
```

Replace any `--forest`/`--rust` token references with `--ember`/`--ember-2`.

The search input: `bg-white border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5 text-[13.5px] focus:border-[color:var(--ink)] focus:outline-none`.

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(dashboard\)/dashboard/leads/page.tsx
git commit -m "design: leads table — mono headers, ember accent, border-not-shadow cards"
```

---

### Task 16: campaigns/page.tsx and campaigns/[campaignId]/page.tsx

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/campaigns/page.tsx` (if exists)
- Modify: `frontend/src/app/(dashboard)/dashboard/campaigns/[campaignId]/page.tsx`

- [ ] **Step 1: Check if campaigns list page exists**

```bash
ls /Users/Shared/personalProjects/leadreai/frontend/src/app/\(dashboard\)/dashboard/campaigns/
```

- [ ] **Step 2: Retheme both pages**

For each file, read it and apply:
- `--forest` → `--ember`
- `--rust` → `--ember-2`
- Card shadows → `border border-[color:var(--rule)] rounded-xl`
- Table headers → mono label pattern
- Status badges: use `font-mono text-[9.5px] tracking-[0.16em] uppercase` with appropriate semantic token (`--success` for active, `--warn` for paused, `--ember-bg` bg for pending)

- [ ] **Step 3: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(dashboard\)/dashboard/campaigns/
git commit -m "design: campaigns pages — ember accent, mono status badges"
```

---

### Task 17: workflows pages

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/workflows/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/workflows/[workflowId]/page.tsx`

- [ ] **Step 1: Retheme**

```bash
grep -n "forest\|rust\|shadow-\|glass\|aurora" /Users/Shared/personalProjects/leadreai/frontend/src/app/\(dashboard\)/dashboard/workflows/page.tsx | head -10
grep -n "forest\|rust\|shadow-\|glass\|aurora" /Users/Shared/personalProjects/leadreai/frontend/src/app/\(dashboard\)/dashboard/workflows/\[workflowId\]/page.tsx | head -10
```

Apply same pattern: `--forest` → `--ember`, remove shadows on cards, add borders, mono labels.

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(dashboard\)/dashboard/workflows/
git commit -m "design: workflows pages rethemed"
```

---

### Task 18: tables, files, library, integrations pages

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/tables/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/files/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/library/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/integrations/page.tsx`

- [ ] **Step 1: Batch retheme all four**

For each file, run:
```bash
grep -n "forest\|rust\|shadow-\|glass\|aurora\|alt-amber" <file> | head -10
```

Apply standard retheme:
- `--forest` → `--ember`
- `--rust` → `--ember-2`
- Card shadows → `border border-[color:var(--rule)] rounded-xl`
- Table th → `font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]`
- Integration/library cards: keep `rounded-xl border` approach, no box-shadow

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(dashboard\)/dashboard/tables/ src/app/\(dashboard\)/dashboard/files/ src/app/\(dashboard\)/dashboard/library/ src/app/\(dashboard\)/dashboard/integrations/
git commit -m "design: tables/files/library/integrations — rethemed to ember + border cards"
```

---

## GROUP E — Settings (run after Group B)

### Task 19: settings/layout.tsx

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/layout.tsx`

- [ ] **Step 1: Read and retheme**

```bash
grep -n "forest\|rust\|shadow\|glass" /Users/Shared/personalProjects/leadreai/frontend/src/app/\(dashboard\)/dashboard/settings/layout.tsx | head -10
```

The settings layout has a sidebar nav with grouped sections. Apply:
- Active section: `text-[color:var(--ember)] bg-[color:var(--ember-bg)] rounded-lg` 
- Section group labels: `font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]`
- Layout bg: `bg-[color:var(--paper)]`

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(dashboard\)/dashboard/settings/layout.tsx
git commit -m "design: settings layout — ember active state, mono group labels"
```

---

### Task 20: settings/page.tsx (index)

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/page.tsx`

- [ ] **Step 1: Retheme the settings overview card grid**

The settings index shows group cards. Apply:
- Card: `border border-[color:var(--rule)] rounded-xl bg-white hover:border-[color:var(--ink-3)] transition-colors`
- Card icon: `text-[color:var(--ink-3)]` default, `text-[color:var(--ember)]` on hover
- Card title: `font-sans font-semibold text-[14px] text-[color:var(--ink)]`
- Page h1: `font-display text-[28px]` (Instrument Serif)
- Remove any box-shadow on cards

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(dashboard\)/dashboard/settings/page.tsx
git commit -m "design: settings index — display font heading, border cards"
```

---

### Task 21: Settings sub-pages — account, workspace, team, billing, security

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/account/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/workspace/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/team/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/billing/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/security/page.tsx`

- [ ] **Step 1: For each page, apply the standard settings page pattern**

For each file, check existence first:
```bash
ls /Users/Shared/personalProjects/leadreai/frontend/src/app/\(dashboard\)/dashboard/settings/
```

For each existing page, apply:
- Section heading: `font-sans font-semibold text-[15px] text-[color:var(--ink)] mb-4`
- Form fields: new input style (bg-white border-[color:var(--rule)] rounded-lg)
- Submit / save buttons: `bg-[color:var(--ink)] text-[color:var(--paper)] font-sans font-semibold text-[13px] px-5 py-2.5 rounded-lg hover:opacity-85`
- Destructive actions: `bg-[color:var(--warn)] text-white`
- Section dividers: `border-t border-[color:var(--rule)]`
- `--forest` → `--ember` throughout

For `billing/page.tsx` specifically: plan cards should show the active plan with `border-[color:var(--ember)]` border highlight.

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(dashboard\)/dashboard/settings/account/ src/app/\(dashboard\)/dashboard/settings/workspace/ src/app/\(dashboard\)/dashboard/settings/team/ src/app/\(dashboard\)/dashboard/settings/billing/ src/app/\(dashboard\)/dashboard/settings/security/
git commit -m "design: settings sub-pages — token retheme, ember accent, border inputs"
```

---

### Task 22: Settings sub-pages — email, data-sources, api-keys, branding, clients, suppression

**Files:**
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/email/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/data-sources/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/api-keys/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/branding/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/clients/page.tsx`
- Modify: `frontend/src/app/(dashboard)/dashboard/settings/suppression/page.tsx`

- [ ] **Step 1: Read and retheme each page**

For each file, run:
```bash
grep -n "forest\|rust\|amber\|shadow-\|Plus Jakarta\|font-barlow" <filepath> | head -10
```

Apply the standard pattern for each:
- Token substitution: `--forest` → `--ember`, `--rust` → `--ember-2`
- Connected/verified status: use `--success` color  
- API key display areas: `font-mono text-[13px] bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded-lg px-3 py-2`
- Copy/regenerate buttons: secondary outline button style

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/app/\(dashboard\)/dashboard/settings/email/ src/app/\(dashboard\)/dashboard/settings/data-sources/ src/app/\(dashboard\)/dashboard/settings/api-keys/ src/app/\(dashboard\)/dashboard/settings/branding/ src/app/\(dashboard\)/dashboard/settings/clients/ src/app/\(dashboard\)/dashboard/settings/suppression/
git commit -m "design: remaining settings pages — token retheme"
```

---

## GROUP F — Shared Components (can run after Group A)

### Task 23: CommandPalette.tsx — Retheme

**Files:**
- Modify: `frontend/src/components/search/CommandPalette.tsx`

- [ ] **Step 1: Read and retheme**

```bash
grep -n "forest\|rust\|shadow-\|glass\|rgba" /Users/Shared/personalProjects/leadreai/frontend/src/components/search/CommandPalette.tsx | head -15
```

The command palette is an overlay modal. Apply:
- Container: `bg-white border border-[color:var(--rule)] rounded-xl shadow-xl` (modals get shadow-xl per spec §4.1 exception)
- Search input: new input style
- Result items: `hover:bg-[color:var(--paper-2)]` 
- Active/selected item: `bg-[color:var(--ember-bg)] text-[color:var(--ember)]`
- Section labels: `font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]`
- Keyboard shortcut badges: `font-mono text-[9px] bg-[color:var(--paper-2)] border border-[color:var(--rule)] rounded px-1`

- [ ] **Step 2: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/components/search/CommandPalette.tsx
git commit -m "design: command palette — ember active, mono section labels, shadow-xl overlay"
```

---

### Task 24: settings/sections.tsx and settings/primitives.tsx

**Files:**
- Modify: `frontend/src/components/settings/sections.tsx`
- Modify: `frontend/src/components/settings/primitives.tsx`

- [ ] **Step 1: Read sections.tsx and update badge/icon colors**

```bash
grep -n "forest\|rust\|amber\|color" /Users/Shared/personalProjects/leadreai/frontend/src/components/settings/sections.tsx | head -15
```

In `sections.tsx`, any colored badge or icon that used `--forest` should use `--ember`. Category icon colors can use `--ink-3` by default.

- [ ] **Step 2: Read primitives.tsx and update form field styles**

```bash
cat /Users/Shared/personalProjects/leadreai/frontend/src/components/settings/primitives.tsx
```

Update `<SettingsInput>`, `<SettingsTextarea>`, `<SettingsSelect>` primitives to use the new input style:
```
bg-white border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5
text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-4)]
focus:border-[color:var(--ink)] focus:outline-none transition-colors
```

- [ ] **Step 3: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/components/settings/sections.tsx src/components/settings/primitives.tsx
git commit -m "design: settings registry + primitives — ember badges, new input style"
```

---

### Task 25: ImpersonationBanner.tsx + install/[shareToken]/page.tsx

**Files:**
- Modify: `frontend/src/components/layout/ImpersonationBanner.tsx`
- Modify: `frontend/src/app/install/[shareToken]/page.tsx`

- [ ] **Step 1: Retheme ImpersonationBanner**

```bash
cat /Users/Shared/personalProjects/leadreai/frontend/src/components/layout/ImpersonationBanner.tsx
```

The banner should use a warm amber warning style: `bg-[color:var(--ember-bg)] border-b border-[color:var(--ember)] text-[color:var(--ember-2)]`. Exit button: `--ember` accent.

- [ ] **Step 2: Retheme install/[shareToken]/page.tsx**

```bash
grep -n "forest\|rust\|shadow-\|glass" /Users/Shared/personalProjects/leadreai/frontend/src/app/install/\[shareToken\]/page.tsx | head -10
```

The install/share page uses the landing page aesthetic. Apply cream background, border cards, ember CTA.

- [ ] **Step 3: Commit**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git add src/components/layout/ImpersonationBanner.tsx src/app/install/\[shareToken\]/page.tsx
git commit -m "design: impersonation banner + install page rethemed"
```

---

## Final Verification

### Task 26: Full TypeScript check + visual review

- [ ] **Step 1: Run full TypeScript check**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend && npx tsc --noEmit 2>&1
```

Expected: 0 errors. If errors exist, fix them before proceeding.

- [ ] **Step 2: Start dev server and visually verify key pages**

```bash
cd /Users/Shared/personalProjects/leadreai/frontend && npm run dev -- --port 3001
```

Check these pages in a browser:
1. `http://localhost:3001` — landing page (warm cream bg, Instrument Serif headline, ember CTA)
2. `http://localhost:3001/login` — auth shell (centered card, clean inputs)
3. `http://localhost:3001/dashboard` — sidebar is paper-2 bg, ember active indicator, mono section labels
4. `http://localhost:3001/dashboard/leads` — table has mono headers
5. `http://localhost:3001/dashboard/settings` — card grid with Instrument Serif page title

- [ ] **Step 3: Clean up Bloom page if not needed as a permanent route**

The `frontend/src/app/bloom/` directory was created as a reference during design exploration. If it should not be a production route, remove it:
```bash
# Only run if bloom page should be removed
rm -rf /Users/Shared/personalProjects/leadreai/frontend/src/app/bloom/
git add -A && git commit -m "chore: remove bloom reference page"
```

- [ ] **Step 4: Create new feature branch and wrap up**

Per CLAUDE.md, work should be on a feature branch. Ensure all changes are on `feature/design-system-redesign` (or similar), not on main.

```bash
cd /Users/Shared/personalProjects/leadreai/frontend
git log --oneline -15
```

Review that all 25 task commits are present.

---

## Token Reference Quick-Map

When reading any file during this plan, use this substitution table:

| Old token | New token | Notes |
|---|---|---|
| `--forest` | `--ember` | Main accent color |
| `--forest-2` | `--ember-2` | Darker accent / hover |
| `--rust` | `--ember-2` | Was amber-800, now darker ember |
| `--ink-4` | `--ink-4` | New token, doesn't exist in old system — add where placeholder text needed |
| `shadow-md/lg` on cards | `border border-[color:var(--rule)]` | No shadows on cards |
| `shadow-xl` on modals | keep `shadow-xl` | Modals/overlays are the exception |
| `font-barlow` | `font-sans` (Outfit) | Barlow is removed |
| `font-geist-sans` | `font-sans` (Outfit) | Geist is removed |
| `font-jetbrains-mono` | `font-mono` (DM Mono) | JetBrains Mono removed |
| `font-instrument-serif` | `font-display` | Variable renamed from `--font-instrument-serif` to `--font-display` |
| `className="alt-tokens"` | remove | Old marketing token scope — no longer needed |
| `Plus Jakarta Sans` reference | remove | Font removed from system |
