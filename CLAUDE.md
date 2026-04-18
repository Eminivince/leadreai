
## Project Management
For every new task, switch to a new git branch when done with the task. Merge back to the staging branch of the folder you've worked on. Never merge to or touch main/master.
Never put this `Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>` or anything similar in a git commit. No mentioning of author etc.
You are to navigate into each individual folder and commit your work there. not at the root file. commit frontend separately and backend separately

## High-Risk Change Protocol (MANDATORY)
For anything involving:
- Payments
- Wallets / balances
- Contracts / revenue splits
- Authentication / authorization

You MUST:

1. Define invariants explicitly
   Example:
   - User balance must never go negative
   - Chapter purchase must be idempotent

2. Identify failure modes
   - Double charge
   - Race conditions
   - Partial writes

3. Enforce protections
   - Use transactions where applicable
   - Add idempotency keys
   - Validate inputs strictly

4. Log critical events
   - Purchases
   - Withdrawals
   - Contract creation

5. NEVER ship without verifying edge cases


## Boundary Rules

- Frontend must NOT:
  - Contain business logic for payments or contracts
- Backend must:
  - Be source of truth for all financial logic
- No duplication of logic across frontend/backend

## Logging & Observability

- All critical flows must log:
  - Inputs (sanitized)
  - Outputs
  - Errors

- Required for:
  - Payments
  - Auth events
  - Contract operations

- Logs must be:
  - Structured
  - Searchable

## How the AI should work in this repo

- **Assumptions & clarifications**
  - If something is ambiguous but not critical, make a **reasonable, documented assumption** update such in a file called ASSUMPTIONS.md, if file does not exist create one, and proceed.
  - Always ask the user question for directtion, it is better you ask too much question that too little.
  - Also make it a habit to explain your choices or preferences.

- **Change size & scope**
  - Prefer **small, focused PR‑sized changes** over huge refactors.
  - For refactors touching many files, clearly explain:
    - The intent of the refactor.
    - The scope (which files / features).
    - Any migration steps the user must perform.

- **Safety around sensitive areas**
  - Treat anything involving **authentication, authorization, money, or contracts** as high‑risk.
  - In those areas, be extra explicit about:
    - Invariants you are relying on.
    - Possible failure modes.
    - Any changes to security‑relevant logic.

- **Reading before writing**
  - Before editing a file, **read enough surrounding context** to understand:
    - How the function/component is used.
    - Any invariants or assumptions documented nearby.
  - For cross‑cutting concerns (e.g. auth, theming, layout), search for existing utilities/hooks and reuse them.

---

## Workflow orchestration

1. **Plan node default**
   - Enter plan mode for ANY non‑trivial task (3+ steps or architectural decisions).
   - If something goes sideways, STOP and re‑plan immediately—don't keep pushing.
   - Use plan mode for verification steps, not just building.
   - Write detailed specs upfront to reduce ambiguity.

2. **Subagent strategy**
   - Use subagents liberally to keep main context window clean.
   - Offload research, exploration, and parallel analysis to subagents.
   - For complex problems, throw more compute at it via subagents.
   - One task per subagent for focused execution.

3. **Self‑improvement loop**
   - After ANY correction from the user: update `tasks/lessons.md` with the pattern.
   - Write rules for yourself that prevent the same mistake.
   - Ruthlessly iterate on these lessons until mistake rate drops.
   - Review lessons at session start for relevant project.

4. **Verification before done**
   - Never mark a task complete without proving it works.
   - Diff behavior between main and your changes when relevant.
   - Ask yourself: "Would a staff engineer approve this?"
   - Run tests, check logs, demonstrate correctness.

5. **Demand elegance (balanced)**
   - For non‑trivial changes: pause and ask "is there a more elegant way?"
   - If a fix feels hacky: "Knowing everything I know now, implement the elegant solution."
   - Skip this for simple, obvious fixes—don't over‑engineer.
   - Challenge your own work before presenting it.

6. **Autonomous bug fixing**
   - When given a bug report: just fix it. Don't ask for hand‑holding.
   - Point at logs, errors, failing tests—then resolve them.
   - Zero context switching required from the user.
   - Go fix failing CI tests without being told how.

---

## Task management

- **Plan first**: Write plan to `tasks/todo.md` with checkable items.
- **Verify plan**: Check in before starting implementation.
- **Track progress**: Mark items complete as you go.
- **Explain changes**: High‑level summary at each step.
- **Document results**: Add review section to `tasks/todo.md`.
- **Capture lessons**: Update `tasks/lessons.md` after corrections.

---

## Core principles

- **Simplicity first**: Make every change as simple as possible. Impact minimal code.
- **No laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal impact**: Changes should only touch what's necessary. Avoid introducing bugs.

---

## Documentation & communication style

- **Tone**
  - Be concise, direct, and pragmatic.
  - Prefer **actionable steps** over long essays, unless the user explicitly asks for deep explanation.

- **When implementing features**
  - Briefly outline:
    - What you’re about to change.
    - Which files you’ll touch.
    - Any trade‑offs you’re making.
  - Afterward, summarize:
    - Key changes.
    - How to run/lint/test them.
    - Any manual migration steps.
    - If we will need a script to support or carry out something we implement, proceed to write the script.

- **Comments in code**
  - Only add comments for **non‑obvious intent, constraints, or trade‑offs**.
  - Do **not** narrate straightforward code.

---

## When in doubt

If you’re unsure between several reasonable approaches:

1. **Prefer the approach that matches existing patterns** in this codebase.
2. Choose the option that:
   - Minimizes breaking changes.
   - Minimizes new dependencies.
   - Is easiest for a human to understand and maintain.
3. Clearly explain your reasoning in 2–4 sentences so the user can override if needed.

If the user explicitly asks for different behavior or conventions, **their instructions override this file**