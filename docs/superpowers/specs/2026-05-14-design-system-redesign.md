# LeadreAI — Full-App Design System Redesign
_Date: 2026-05-14 · Status: approved by user_

## 1. Why

The existing UI looks like generic AI-generated B2B SaaS. The user brief: "minimalist, stand out, nothing authentic." After 20+ direction explorations the approved direction is described as:

> "Walking into a place and immediately feeling like you belong" + "picking up a tool that's been made with real care and you can feel it in your hand."

The approved mockup is at `.superpowers/brainstorm/.../content/authentic.html` — warm cream palette, Instrument Serif display type, Outfit body, DM Mono for data/labels, single burnt-terracotta accent.

---

## 2. Design Tokens

Replace ALL existing CSS variables in `globals.css` with these. The old `--forest` (amber) and pure-white `--paper` are gone.

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

  /* The ONE accent — burnt terracotta */
  --ember:    #B84C2B;
  --ember-bg: #F7E8E2;
  --ember-2:  #8A3520;   /* hover / darker */

  /* Semantic */
  --warn:     #DC2626;   /* destructive */
  --success:  #2D7A4A;   /* verified, success */
}
```

Dark mode (`.dark` class) maps these to inverted warm values:
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
}
```

---

## 3. Typography

### 3.1 Fonts to load (root layout.tsx via next/font/google)

| Variable | Font | Weights | Use |
|---|---|---|---|
| `--font-display` | Instrument Serif | 400 normal + italic | Display headings only |
| `--font-body` | Outfit | 300, 400, 500, 600, 700 | All body text, UI labels, buttons |
| `--font-mono` | DM Mono | 300, 400, 500 | Data cells, timestamps, metadata labels, code |

Remove: Geist Sans, Geist Mono, Instrument Serif (old variable), Barlow, JetBrains Mono.

### 3.2 Tailwind font-family extensions (tailwind.config.ts)
```ts
fontFamily: {
  display: ['var(--font-display)', 'Georgia', 'serif'],
  sans:    ['var(--font-body)',    'system-ui', 'sans-serif'],
  mono:    ['var(--font-mono)',    'ui-monospace', 'monospace'],
}
```

### 3.3 Usage rules
- `font-display` (Instrument Serif): page-level h1/h2, section headings, hero headlines. Never in nav, buttons, or data tables.
- `font-sans` (Outfit): everything else — nav, body copy, buttons, form labels, card text.
- `font-mono` (DM Mono): ALL data: table cells, timestamps, IDs, source counts, badge labels, mono metadata labels (`font-mono text-[9.5px] tracking-[0.16em] uppercase`).

---

## 4. Component Language

### 4.1 Borders, not shadows
- **No** `box-shadow` on cards or panels
- Use `border border-[color:var(--rule)]` instead
- Exception: modals/overlays get `shadow-xl` for elevation signal

### 4.2 Border radius
- Buttons: `rounded-lg` (8px)
- Cards / panels: `rounded-xl` (12px)
- Large containers: `rounded-2xl` (16px)
- Pills / badges: `rounded-full`
- Input fields: `rounded-lg` (8px)

### 4.3 The ember accent — rules of use
The ember color is used for:
- Primary CTA buttons (`bg-[color:var(--ember)]`)
- Active sidebar item indicator (left 2px bar)
- Verified / positive state text (keep `--success` for verified email)
- Eyebrow labels above headings (`text-[color:var(--ember)]`)
- Hover states on primary elements

The ember is NOT used for:
- Decorative background swaths
- Random highlights
- Every link

### 4.4 Monospace label pattern
Throughout the app, category labels, section headers, and metadata use:
```
font-mono text-[9.5px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]
```
Example: "B2B INTELLIGENCE · LAGOS", "50K+ LEADS", "3 SOURCES"

### 4.5 Primary button
```
bg-[color:var(--ink)] text-[color:var(--paper)] font-sans font-semibold
text-[13px] px-5 py-2.5 rounded-lg
hover:opacity-85 transition-opacity
```
Secondary / outline button:
```
border border-[color:var(--rule)] bg-transparent text-[color:var(--ink-2)]
font-sans font-medium text-[13px] px-5 py-2.5 rounded-lg
hover:border-[color:var(--ink)] hover:text-[color:var(--ink)]
```
Destructive:
```
bg-[color:var(--warn)] text-white ...same padding/radius
```

### 4.6 Table style
```
thead: bg-[color:var(--paper-2)] border-b border-[color:var(--rule)]
th:    font-mono text-[9px] tracking-[0.18em] uppercase text-[color:var(--ink-4)]
       font-medium px-4 py-2.5
td:    font-sans text-[13px] text-[color:var(--ink-2)] px-4 py-3
       border-b border-[color:var(--paper-2)]
tr:nth-even td: bg-[color:var(--paper-2)]
```

### 4.7 Input fields
```
bg-white border border-[color:var(--rule)] rounded-lg px-3.5 py-2.5
text-[13.5px] text-[color:var(--ink)] placeholder:text-[color:var(--ink-4)]
focus:border-[color:var(--ink)] focus:outline-none transition-colors
```

---

## 5. Layout Shells

### 5.1 Dashboard sidebar
- Background: `var(--paper-2)` with `border-r border-[color:var(--rule)]`
- Width: `w-56` (224px) desktop
- Logo area: wordmark "LeadreAI" in `font-sans font-bold` + logomark SVG
- Nav items: `font-sans font-medium text-[13px] text-[color:var(--ink-3)]`
- Active item: `text-[color:var(--ink)] bg-[color:var(--paper-3)]` + `2px left bar in ember`
- Section labels: monospace pattern above groups
- Bottom: workspace switcher + user avatar

### 5.2 Dashboard topbar
- Background: `var(--paper)` with `border-b border-[color:var(--rule)]`
- Height: `h-14` (56px)
- Contains: page title (font-sans font-semibold) + search trigger (⌘K) + notifications

### 5.3 Page content area
- Background: `var(--paper)`
- Padding: `p-6` or `px-8 py-6`
- Page title: `font-display text-[28px]` (Instrument Serif)
- Section headers: `font-sans font-semibold text-[15px]`

### 5.4 Auth shell
- Background: `var(--paper)` full page
- Centered card: `max-w-md`, `bg-white border border-[color:var(--rule)] rounded-2xl p-8`
- Logo centered at top
- Form uses standard input style from 4.7

---

## 6. Surface-by-Surface Scope

### Group A — Foundation (do first, everything depends on these)
1. `globals.css` — token swap + font base
2. `tailwind.config.ts` — font-family extensions
3. `app/layout.tsx` (root) — font loading (replace Geist with Outfit + Instrument Serif + DM Mono)

### Group B — Shell (all dashboard pages inherit)
4. `components/layout/Sidebar.tsx`
5. `components/layout/Topbar.tsx`
6. `components/layout/WorkspaceSwitcher.tsx`
7. `components/layout/NotificationDropdown.tsx`
8. `app/(dashboard)/layout.tsx`

### Group C — Marketing + Auth
9. `app/page.tsx` — rebuild from the approved mockup HTML
10. `app/pricing/page.tsx`
11. `components/auth/AuthShell.tsx`
12. `app/(auth)/login/page.tsx`
13. `app/(auth)/register/page.tsx`
14. `app/auth/magic/page.tsx`
15. `app/auth/sso/complete/page.tsx`
16. `components/onboarding/OnboardingWizard.tsx`

### Group D — Dashboard core pages
17. `dashboard/page.tsx` (The Desk)
18. `dashboard/leads/page.tsx`
19. `dashboard/leads/[leadId]/page.tsx`
20. `dashboard/campaigns/page.tsx`
21. `dashboard/campaigns/new/page.tsx`
22. `dashboard/campaigns/[campaignId]/page.tsx`
23. `dashboard/workflows/page.tsx`
24. `dashboard/workflows/[workflowId]/page.tsx`
25. `dashboard/files/page.tsx`
26. `dashboard/files/[fileId]/page.tsx`
27. `dashboard/library/page.tsx`
28. `dashboard/library/[documentId]/page.tsx`
29. `dashboard/integrations/page.tsx`
30. `dashboard/tables/page.tsx`
31. `dashboard/tables/[tableId]/page.tsx`

### Group E — Settings
32. `settings/layout.tsx`
33. `settings/page.tsx` (index)
34. `settings/account/page.tsx`
35. `settings/workspace/page.tsx`
36. `settings/branding/page.tsx`
37. `settings/team/page.tsx`
38. `settings/clients/page.tsx`
39. `settings/email/page.tsx`
40. `settings/suppression/page.tsx`
41. `settings/data-sources/page.tsx`
42. `settings/data-sources/invocations/page.tsx`
43. `settings/billing/page.tsx`
44. `settings/api-keys/page.tsx`
45. `settings/security/page.tsx`
46. `settings/security/sso/page.tsx`
47. `settings/security/audit/page.tsx`

### Group F — Shared components
48. `components/settings/sections.tsx` — update badge colours + icon colours
49. `components/settings/primitives.tsx` — update form field styles
50. `components/search/CommandPalette.tsx` — retheme
51. `components/layout/ImpersonationBanner.tsx`
52. `app/install/[shareToken]/page.tsx`

---

## 7. What Does NOT Change
- Backend code — zero changes
- Shared types / schemas — zero changes
- Component logic / API calls — preserved
- Liquid-glass classes in globals.css — kept (used on landing page)
- Dark mode support — kept, tokens updated

---

## 8. Key Design Decisions

**Why warm cream instead of white?** White reads as generic. Cream reads as considered.

**Why Instrument Serif only for headings?** Mixing serif and sans is the most reliable way to create visual hierarchy without needing colour. Serif signals "important". Keeping it only at h1/h2 level means it doesn't become noise.

**Why a single ember accent?** Multiple accent colours (the old amber + forest + rule system) create visual noise. One colour used sparingly has more weight. The ember is warm, specific, and not used by any major SaaS competitor.

**Why no card shadows?** Shadows in SaaS UIs have become a cliché that signals "I'm using a UI kit." Borders express structure; the warm background provides depth through tone alone.

---

## 9. Implementation Order

Must be sequential within groups. Groups B–F can be parallelised once Group A is done.

```
A (tokens/fonts) → B (shell) in parallel with C (marketing/auth)
                → D (dashboard pages) after B
                → E (settings) after B
                → F (shared components) after A
```

Estimated files per group: A=3, B=7, C=8, D=15, E=16, F=5 = **54 files total**
