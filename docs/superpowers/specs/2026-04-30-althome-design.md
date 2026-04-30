# /althome — Alternative Landing Page Design Spec

**Date:** 2026-04-30
**Status:** Approved for implementation
**Route:** `/althome`

---

## Overview

An experimental alternative to the main landing page (`/`) at route `/althome`. Where the main page uses an editorial broadsheet aesthetic (warm ivory, serif typography, journalistic voice), `/althome` adopts a Modern SaaS design: clean white background, amber accent, search-first hero, and a lead-capture gate built directly into the product interaction.

The core experiment: does a search-console framing with an inline email gate convert better than the editorial broadsheet framing?

---

## Design Direction

**Aesthetic:** Modern SaaS — white, clean, amber (#f59e0b) accent. Closest reference: Apollo.io / Clay with an African-market voice.

**Fonts:** Same as global layout — Instrument Serif (display), Barlow (body), JetBrains Mono (data/mono). Headings lean heavier (font-weight 800, tight letter-spacing) vs. the serif-italic style of the main page.

**Palette (page-scoped CSS variables):**
- `--amber: #f59e0b` — primary accent
- `--amber-light: #fef3c7` — badge/chip backgrounds, final CTA bg
- `--amber-border: #fde68a` — borders on amber surfaces
- `--amber-dark: #92400e` — text on amber surfaces
- `--ink: #111827` — headlines
- `--ink-2: #374151` — body text
- `--ink-3: #6b7280` — secondary text
- `--ink-4: #9ca3af` — placeholder / meta
- `--rule: #e5e7eb` — borders
- `--paper-2: #f9fafb` — section backgrounds
- `--green: #10b981`, `--green-bg: #dcfce7`, `--green-text: #166534` — verified badges

---

## Architecture

**Standalone page** — does not share the existing `Masthead` or `Colophon` components from `app/page.tsx`. Has its own nav and footer. This keeps the experiment clean and avoids the broadsheet furniture pulling the aesthetic.

**File:** `frontend/src/app/althome/page.tsx`

All sub-components are local to the file (same pattern as the existing landing page).

---

## Sections

### 1. Nav (standalone)

Minimal sticky header. No broadsheet dateline, no "Vol I · Issue 07".

- **Left:** Logo — `Leadre.AI` with amber dot separator
- **Center:** empty
- **Right:** `How it works` · `Pricing` · divider · `Sign in` · `Get started free` (dark pill CTA)

### 2. Hero

**Layout:** Centered, single column. Amber gradient fades from `#fffbeb` at top to white at 55%.

**Stack (top to bottom):**
1. **Badge** — amber pill: "Built for Nigerian & African markets"
2. **Headline** — `Find your next customer. Before your competitors do.` (52px, 800 weight, −0.04em tracking). "Before your competitors do." in amber.
3. **Subline** — 16px, gray, max-width 440px
4. **Search box** — full-width up to 580px. White card with 2px border, magnifier icon, static placeholder text (e.g. "Series B fintechs in Lagos with a CTO…"), amber Search button. On focus: amber ring glow (`box-shadow: 0 0 0 4px #f59e0b18`). A blinking amber cursor is shown inside the placeholder to suggest interactivity.
5. **Email gate** — appears inline below the search box once the user starts typing. Shows: lock icon · "Enter your work email to run this search" · email input · "Get results →" button. Does NOT redirect — stays in-place.
6. **Suggestion chips** — 5 example query chips in a wrapped row (e.g. "Fintech CEOs · Lagos", "Law firms · Nairobi"). Clicking a chip populates the search box and triggers the email gate.
7. **Logo trust strip** — "Trusted by teams at" + 4 company name pills (Arlo Logistics, Ardent Insurance, Meridian Compliance, Volta Capital)

### 3. How It Works

3-column grid. Each column: numbered badge (01/02/03 in amber) → connector line → title → body paragraph.

1. **Describe** — Type a plain-English sentence, no filters
2. **Discover & Enrich** — Agent reads registries, websites, open web; emails MX+SMTP verified; source URL on every field
3. **Export & Act** — CSV, HubSpot/Salesforce CRM sync, or copy individual contacts

### 4. Results Demo

A static/mock results table showing what a completed query looks like.

- **Header bar:** "Results" label · italic query pill · Export CSV + CRM sync buttons
- **Table columns:** Company · Contact · Email · Raised · Status
- **Rows:** 3 fully visible (Paystack, Moniepoint, Flutterwave) + 2 blurred rows below
- **Gate row:** Below the blurred rows — "9 more results available. Enter your email to unlock the full list." + email input + "Unlock results →" button
- **Stats strip:** 4 numbers below the table — 50k+ leads delivered · 94% email accuracy · 8min avg delivery · 3x sources cross-checked. **Note:** these are placeholder marketing claims and must be verified/approved before any public traffic is sent to this page.

### 5. Testimonials

3-card grid. Each card: 5 stars · quote · divider · avatar (initial) + name + role + city.

Same 3 testimonials as main page (Adaeze Okonkwo, Mwangi Njoroge, Kofi Mensah). Cards have a subtle border, `#f9fafb` background.

### 6. Pricing

Same 3 tiers as main page (Reader / Correspondent / Bureau). Middle card (Correspondent) inverted dark. "Most popular" amber badge on middle tier.

No changes to tier names, prices, or features vs. current pricing page.

### 7. Final CTA

Full-width amber-tinted section (`#fef3c7` bg). Headline repeats the search-first message. Repeats the search bar (same visual treatment as hero). "Free to start. No credit card. No sales call." subline.

### 8. Footer

Dark (`#111827` bg). Single row: Logo left · 5 links center · copyright right. No colophon, no large wordmark, no city dateline.

---

## Email Gate Behaviour

The email gate is the primary conversion mechanic. Implementation rules:

1. Gate appears **inline** (no modal) below the search box when input length > 3 characters
2. On email submit: store email in local state, show a loading indicator, then redirect to `/register?q=<encoded-query>&email=<encoded-email>` so the register page can pre-fill and attribute the source query
3. The suggestion chips pre-fill the search box AND immediately show the gate (treat as "typed")
4. The demo table gate and final CTA search bar follow the same pattern — same email gate component reused
5. No actual search execution on the landing page — the "results" table is static/mock

---

## What This Page Is NOT

- Not a replacement for `/` — it is an experiment living at `/althome`
- Not connected to the pipeline at build time — the results table is static mock data
- Not a new auth flow — it feeds into the existing `/register` route

---

## Implementation Notes

- `'use client'` required (Framer Motion animations, controlled input state for the search/gate)
- Reuse `framer-motion` (already a dependency) for the email gate fade-in
- The page should be self-contained: one file, local sub-components, no shared layout components
- CSS custom properties scoped to the page `<main>` element (same pattern as existing landing page)
- Add `<meta name="robots" content="noindex">` to the page head to prevent search indexing during the experiment period
