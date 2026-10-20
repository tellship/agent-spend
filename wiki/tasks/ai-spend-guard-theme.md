---
title: AI Spend Guard theme
status: blocked
last_updated: 2026-10-19
---

# AI Spend Guard theme

Conventions borrowed from rates-app/wiki/CLAUDE.md, tasks/ only; no project wiki existed.

## Feature


Positioning line: "Know the cost of every AI feature and customer, and get alerted before spending becomes a problem."

Illustrative figures from the brief (fictional, not live account data): October AI spend $482.60; budget used 80.4%; largest cost centre Support AI at $301.20; spend by feature: Support ticket replies $301.20, Wiki summarisation $120.40, Classification $61.00.

## Explorer findings (verbatim)


## Mockup

- Theme "Ledger". The mockup is the spec.
- Not yet opened in a browser (stated 2026-10-19, not re-checked). Nothing in the criteria below has been verified against a rendered page.

## Criteria

Uxer, verbatim. Grouped by slice, as the uxer wrote them.

Theme "Ledger": paper #f6f4ee, white cards, ink-navy #14213d, teal #0b6b63, amber #fff3d1/#b45309 for alerts only; system fonts + mono; 4px spacing; all tokens in :root CSS custom properties. Mockup NOT checked in a browser. Prerequisite for slice 1: page shell with header and skip link.

### Slice 1: Demo dashboard

- 1.1 Given the page loads, when I look at the top, then I see h1 "October AI spend", eyebrow "AI SPEND GUARD · DEMO", and a "DEMO" pill in the header.
- 1.2 Given the total-spend card, then it shows "$482.60", badge "Illustrative data", note "Example monthly spend · not live account data".
- 1.3 Given the budget card, then "Budget used" and "80.4%". Meter has role="meter", aria-valuenow="80.4", min 0, max 100, aria-valuetext="80.4% of budget used". Filled bar = 80.4% of track width.
- 1.4 Given the cost-centre card, then "Largest cost centre", "Support AI", "$301.20 this month".
- 1.5 Given "Spend by feature", exactly 3 rows in order: "Support ticket replies" $301.20; "Wiki summarisation" $120.40; "Classification" $61.00. Sum = $482.60. Bar widths 62.4%, 24.9%, 12.6% (computed from amounts, not hard-coded); bars aria-hidden.
- 1.6 Given the alert card, title "Example alert: Wiki summarisation"; body "Average tokens per request increased 3× compared with the previous week. Review the prompt, context size and caching strategy."; below it "(The numbers are fictional examples.)". It is an aside, amber style plus ▲ icon (not colour alone).
- 1.7 Given a 375px viewport, cards stack in one column, no horizontal page scroll. Given >=1024px, two columns: total + budget/cost-centre on one row, feature list + alert on the next.
- 1.8 Given keyboard use, first Tab lands on "Skip to main content"; activating it moves focus to #main.

### Slice 2: Navigation and landmarks

- 2.1 Nav "Page sections" has 6 links: Dashboard, How it works, What you can do, Why not the provider dashboard, Existing AI tools, Recommendation; each targets an existing section id.
- 2.2 Exactly one h1; every section has an accessible name; html lang="en".

### Slice 3: How it works in a real application

- 3.1 Heading "How you would use it in a real application" with "a SaaS company using AI across Support, Product, Development and QA".
- 3.2 Flow diagram in order: Your application (chips "Support replies", "Wiki summaries", "Code reviews") -> AI Spend Guard SDK "Records model, tokens, cost, feature and outcome" -> two outputs "Cost analytics: Where the money goes" and "Alerts: Unexpected cost increases". Arrows down on mobile, right on desktop (ordered list, arrows decorative/hidden from AT).
- 3.3 Code sample contains spendGuard.track(, feature: "wiki-summary", customerId: "customer-123", environment: "production", () => callYourLLM(). Focusable (tabindex=0). Caption below starts "This is illustrative SDK pseudocode, not an existing library." No copy button.
- 3.4 Callout: "the dashboard could reveal one customer's repeated wiki summarisation costing ten times more than expected."

### Slice 4: What can you do with the information

- 4.1 Table headers "What you discover" / "What you do", exactly 6 rows: A feature's costs doubled -> Inspect recent prompt or traffic changes | One customer consumes disproportionate tokens -> Investigate usage patterns or introduce plan limits | A small model performs adequately for simple tasks -> Route suitable requests to that model | The same document is summarised repeatedly -> Cache the result | Retries account for significant spending -> Fix retry loops and enforce limits | AI costs increase faster than revenue -> Adjust pricing or feature allowances.
- 4.2 Closing line: "The goal is not just showing costs, but helping teams lower their cost per useful AI task."
- 4.3 First column cells are th scope="row".

### Slice 5: Difference from the provider dashboard

- 5.1 Heading "How is this different from OpenAI's own dashboard?" with two intro paragraphs (providers already offer usage reporting, cost exports, spend alerts, project spend limits; AI Spend Guard combines providers and links cost to feature, customer and result).
- 5.2 "It should answer" card lists 4 questions: Which customer is most expensive to serve with AI? | What does it cost us to resolve one support ticket? | Which model gives the best balance of cost and acceptable output? | How much money did our prompt optimisation actually save?
- 5.3 "Limitation" callout: provider billing data alone won't identify features or customers; estimates must account for model pricing, retries, cached tokens and other billable operations.

### Slice 6: Existing AI tools

- 6.1 Two cards: "LLM API usage" - "Instrument API calls and aggregate cost by team, workflow and customer."; "Developer-assistant subscriptions (Copilot, Claude subscriptions)" - bill via pooled licences or plans, may not expose per-request cost, need separate integrations; ends "The SDK alone won't capture them."

### Slice 7: Recommendation

- 7.1 Promise banner: "Know the cost of every AI feature and customer, and get alerted before spending becomes a problem."
- 7.2 v1 list has exactly 5 items: One LLM provider; A lightweight SDK; A cost dashboard; Budget alerts; A customer/feature breakdown. Below: "Add model recommendations and automated cost controls later."
- 7.3 Validation card: "Will developers pay for that visibility when providers already offer basic usage reporting? Interview potential customers before committing the full 2-4 weeks."

### Cross-cutting

- X.1 Contrast >= 4.5:1 body, >= 3:1 large text and focus ring.
- X.2 At 200% zoom or 320px: nothing clipped, no horizontal page scroll (only code block and table scroll inside their containers).
- X.3 Page makes no network requests.

### UX risks (uxer)

- 1 Page is half product UI, half pitch deck (slices 3-7 are explanation).
- 2 Real vs demo trust: keep badge, note, alert footnote, footer.
- 3 80.4% shows no budget amount (implies ~$600; not in source; decide whether to state it).
- 4 Alert is a read-only dead end (no view/dismiss).
- 5 Bar widths derived, compute them.
- 6 "OpenAI's own dashboard" heading may need brand/legal check.
- 7 Pseudocode looks real; no copy button.
- 8 Table has no mobile card layout.
- 9 Nav has 6 links, one long; wraps on mobile.
- 10 Mockup wart: table caption uses inline style and a nonexistent class `visually-hidden-fallback`; replace with .sr-only when porting.

Ambiguity: "theme" = (a) product concept or (b) visual theme. uxer took both; a different brand/dark mode only changes :root.

## Plan

Status: drafted and advisor-reviewed (2026-10-19). Awaiting USER approval of the option and the budget answer. No code until approved.

### Options

- **Option A (smallest).** Hand-written static site: `site/index.html`, `theme.css`, `spend.js`. No bundler, no TS. Vitest, Playwright and http-server. Failure mode: no typecheck, one ~450-line HTML file, copy and tests drift, poor theme reuse. Effort ~0.5-1 day.
- **Option B (recommended, middle).** Vite + vanilla TypeScript, Vitest, Playwright (chromium), @axe-core/playwright. Mirrors rates-app: npm, ESM, Node >=20.19, TS ^5.9, Vitest ^3.2, Playwright 1.63.0 pinned, config at `playwright/playwright.config.ts`. Commands: `npm run dev` / `typecheck` / `test` / `build` / `e2e` / `check`. The e2e webServer builds, then runs `vite preview`. Dashboard data is bundled (X.3: no network). Money is stored as integer cents; the total is derived; `sharePct = Math.round(cents*1000/total)/10` gives 62.4 / 24.9 / 12.6; the budget base is a derived 60000-cent constant. Effort ~1.5-2 days.
- **Option C (largest).** Componentised app (Astro or React) + token package + Storybook + visual regression + dark mode + CI. Overreach: it builds a platform for a labelled fictional demo. Effort ~4-6 days.

Recommended: Option B.

### Slices

Each slice adds its own section and nav link.

- **S1: runnable dashboard + shell.** Criteria 1.1-1.8, 2.2, and the X.1-X.3 e2e checks, which run in every slice. Fixes: the mockup needs `tabindex="-1"` on `main`, or 1.8 fails; inline styles and the nonexistent class `visually-hidden-fallback` are replaced with `.sr-only`; uppercase text is asserted via `innerText`.
- **S2: How it works.** Criteria 3.1-3.4.
- **S3: What you can do.** Criteria 4.1-4.3.
- **S4: Provider difference.** Criteria 5.1-5.3.
- **S5: Existing AI tools.** Criterion 6.1.
- **S6: Recommendation.** Criteria 7.1-7.3 and 2.1, because the last section completes the nav.

There is no final hardening-gate slice. The X.1-X.3 and axe checks run in every slice instead.

### Repo setup (not a slice; no vertical cut)

- `git init -b main`.
- `.gitignore`: `node_modules`, `dist`, `test-results`, `playwright-report`, and `.claude/settings.local.json` because of the plaintext key.
- Commit `mockup/` and `wiki/`.
- Do NOT create `docs/plan.md` or `docs/acceptance-criteria.md`. The wiki holds the criteria.
- No runner agent exists in this session, so git and npm commands go in the programmer's step 3 brief, not the main thread.

### Advisor decisions

- Defaults: breakpoint 52rem; Chromium only; out-of-criteria UX items stay as in the mockup (read-only alert, table scrolls in place, mixed page shape); the "OpenAI's own dashboard" heading stays verbatim (it is the user's own text, flagged once); local commits only, no remote; the page is a static labelled demo (X.3); the axe dependency comes with approving B.
- Plan amendments: 2.2 moves into S1 and 2.1 closes with the last section, because stub link targets would break 2.1. The hardening-gate slice is dropped because it is a verification layer, not a slice. The `docs/` copies are dropped to avoid drift.
- Escalated to the user, because these change scope or criteria:
  1. Which option, with the meaning of "theme" folded in. A single demo page = A or B. A reusable token artifact = C. A platform theme such as Shopify fits none of A-C and needs a new plan.
  2. The budget amount: show "of $600.00" (new copy, changes 1.3), or keep the criterion verbatim.

## Decision log

- Wiki created from scratch with only tasks/. Decided by the advisor. Rationale: a wiki note is not shipping code, and adopting the user's own rates-app pattern is not inventing one.
- The mockup is the spec. Decided 2026-10-19. The uxer took "theme" as both the product concept and a visual theme. Open item (c) remains until the user picks one; a different brand or dark mode would only change :root.
- Paused 2026-10-19: the user prioritised the claude-code-spend-report task; the option (A/B/C) and budget questions remain unanswered; the plan, mockup and criteria stay on file.

## Open items for the step 2 plan

- (a) Pick a stack, defaulting to rates-app's for consistency (survey via a follow-up message to the same explorer).
- (b) No git repo; raise `git init` as a plan item.
- (c) Clarify whether "theme" means the product concept or a visual theme.

## Gaps

- The system prompt refers to a mockup hint "in CLAUDE.md", but no CLAUDE.md contains one. Does not block.

## Resume

- Step 0 done. The explorer has finished.
- Step 2 is the current step (set 2026-10-19). The plan is recorded under Plan and reviewed by the advisor. Awaiting USER approval of the option (A/B/C) and the budget answer ("of $600.00" or the verbatim criterion). Next, after approval: slice 1 via the programmer, TDD, with the criteria verbatim from Criteria. No code until approved.
- PAUSED (2026-10-19). Status is blocked. The user prioritised the claude-code-spend-report task. Awaiting the USER's answer on the option (A/B/C) and the budget question before this task resumes. The plan, mockup and criteria stay on file; no code has been written.
