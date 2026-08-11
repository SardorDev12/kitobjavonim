# PRD: Monetization & Environment Separation

Status: **draft — awaiting confirmation before implementation begins.**

This covers everything discussed in the deployment/product-strategy conversation
that hasn't been built yet. It's split into four features. Sections marked
**Open question** need a decision before implementation starts; everything else
reflects what was actually agreed on.

---

## 1. Freemium limits

**Goal**: monetize the marketplace behavior (listing books to exchange/sell, and
contacting owners) without gating personal cataloging — cataloging drives the
shared `books` table and daily engagement, which is the product's actual
long-term asset per the original PRD, so it stays free and uncapped regardless
of plan.

### 1a. Active listing cap

- Free plan: capped number of **concurrently active** listings
  (`user_books.availability_type <> 'private'`), not lifetime listings ever
  created. A book that's sold/traded and unlisted frees up a slot.
- Pro plan: high cap or unlimited.
- Enforced at the moment a `user_books` row transitions into a listed state —
  extends the existing `sync_listed_at()` trigger in `0001_init.sql` rather
  than adding a parallel mechanism.
- Downgrade behavior: if a Pro user's plan lapses while over the free cap,
  existing listings are **not** force-unlisted. They simply can't add a new
  one until back under the cap. No cleanup job needed — this falls out of the
  trigger only firing on new transitions-to-listed.

**Open question**: exact numbers. Discussed as an example: free = 5 concurrent
active listings, Pro = effectively unlimited. Confirm or adjust.

### 1b. Contact-request quota

- Free plan: capped number of **distinct listings contacted** per calendar
  month (re-opening a contact already unlocked this month doesn't burn a
  second slot).
- Pro plan: high cap or unlimited.
- Enforced inside the existing `request_contact()` function (`0003_rls.sql`)
  — the natural choke point, since every contact reveal already goes through
  it, and it's a security-definer function so this is a real enforcement
  boundary, not just client-side UX.
- Remaining quota should be visible in the UI (e.g. "3 of 5 contacts left this
  month") before the wall is hit, not sprung on the user mid-flow.

**Open question**: exact number. Discussed as an example: free = 3-5/month.
Confirm or adjust.

### 1c. Pro-only extras (lower priority, can ship later)

- Extra photos per listing (free: 1, Pro: up to 5) — cheap to build, directly
  improves response rate on listings.
- Featured/boosted listings in Discover — pure upside, no free-tier feature
  removed.

**Open question**: include these in the first implementation pass, or defer
to a later iteration once the core limits are live?

---

## 2. Payment integration

**Model: one-time purchase, not auto-renewing subscription.** Decided for
three reasons: Payme/Click/Uzum are built as one-time checkout/invoice
systems, not subscription managers, so a true recurring subscription means
building and maintaining re-charge/renewal/grace-period logic ourselves on
top of rails not designed for it; auto-renewing subscriptions face stricter
App Store/Play Store IAP review than a one-time "unlock" product; and it's a
smaller trust ask in a market before monetization is proven at all.

Concretely: a **"Pro pass"** — one-time payment, grants Pro status for a
fixed duration (e.g. 90 days), tracked via `profiles.plan_expires_at`.
Renewal is just buying another pass; nothing auto-charges.

### Scope for this phase

- **Web only.** Mobile (iOS/Android) in-app purchases are a separate,
  larger effort (Apple/Google require their own IAP for in-app digital
  purchases) and are explicitly **out of scope** for this phase.
- **One provider to start: Click** — most mature public docs and the
  simplest checkout flow of the three considered (Payme, Uzum, Click).
  Payme/Uzum can be added later using the same pattern.

### Architecture

- New table `payments` (or `subscription_transactions`): provider, external
  transaction id, user_id, amount, status, period granted, timestamps —
  needed for reconciliation and support, since users will ask "why didn't my
  payment go through."
- New Supabase Edge Function, `supabase/functions/click-callback/`, mirroring
  the existing `telegram-auth` function's shape: verifies Click's signature
  on the incoming callback (never trust the payload alone — this is the real
  security boundary), implements Click's `Prepare`/`Complete` two-phase
  contract, and on confirmed payment upserts into `payments` and extends
  `profiles.plan_expires_at`.
- **Idempotency required**: providers retry callbacks. Must check "have I
  already processed this transaction id" before extending a plan, or a retry
  double-extends it.
- `profiles.plan` (`free`/`pro`) and `profiles.plan_expires_at` columns,
  shared with Feature 1's enforcement logic.

**Open question**: exact Pro pass price and duration.

---

## 3. Environment separation (dev / staging / prod)

**Goal**: pushing to `main` currently deploys straight to production
(kitobjavonim.uz) with no gate, and — more importantly — any testing right
now would hit the live production Supabase database. This needs fixing
*before* payment webhooks go anywhere near this codebase, since a payment
integration bug hitting production data is a much worse failure mode than a
UI bug.

- **Git branching**: `main` = production, protected (require a PR to merge,
  even solo — this alone kills instant-push-to-prod). `develop` = staging,
  auto-deploys the same way `main` does now.
- **A second, separate Supabase project for staging** — same migrations
  applied, throwaway seed data. This is the priority item: the frontend
  build is stateless and cheap to duplicate, the database is where real
  damage happens.
- **`.env.staging`**, alongside the existing (intentionally committed)
  `.env.production`. The GitHub Actions workflow picks the right file based
  on which branch triggered the build before running `expo export`.
- **Staging web hosting**: recommend Cloudflare Pages for staging
  specifically rather than replicating the Plesk-webhook setup a second
  time — Cloudflare Pages has built-in branch/PR preview deployments with
  no extra plumbing needed.
- **Mobile**: `eas.json` already exists with build-profile support; wiring
  `development`/`preview`/`production` channels to the right env vars is
  the remaining piece, lower priority than the web-side split.

**Open question**: none blocking — this is infrastructure work with fairly
clear agreement already. Confirm priority: before or alongside Feature 2
(payments)? Recommendation: **before**, since payments are exactly the kind
of change you don't want to test against production data.

---

## 4. Out of scope (this phase)

- Mobile in-app purchases (Apple/Google IAP) for Pro.
- Payme and Uzum integrations (Click only, first pass).
- True auto-renewing subscriptions (revisit once one-time purchases prove
  people will pay at all).
- Production hosting migration off Plesk to Cloudflare Pages (separate
  scaling discussion, not urgent at current traffic).
- Supabase tier upgrade (same — not urgent yet).

---

## Suggested build order

1. Environment separation (Feature 3) — do this first so nothing else is
   built/tested against production data.
2. Freemium enforcement (Feature 1) — schema changes (`profiles.plan`,
   `plan_expires_at`) plus the two trigger/function changes. Can ship with
   `plan` manually set for testing, before payments exist.
3. Payment integration (Feature 2) — now `profiles.plan` already means
   something, so this just becomes "the thing that sets it."

---

## Confirm before implementation starts

- [ ] Free-tier numbers: active listing cap, monthly contact-request cap.
- [ ] Include Pro-only extras (extra photos, featured listings) in this pass
      or defer.
- [ ] Pro pass price and duration.
- [ ] Build order above, or a different sequence.
