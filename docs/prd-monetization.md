# PRD: Monetization & Environment Separation

Status: **confirmed — ready for implementation.**

This covers everything discussed in the deployment/product-strategy conversation
that hasn't been built yet. It's split into four features. All open questions
are resolved below; implementation can proceed in the build order at the end.

**Two tiers: Free and Pro.** A third tier (discussed as "Pro+", bundling the
extras in 1c below) was considered and deliberately deferred, not rejected —
see 1c for why. Revisit once there's real usage data on who upgrades to Pro
and why, rather than guessing at a second price point before the first one is
proven.

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

**Confirmed: free = 10 concurrent active listings, Pro = unlimited.** No
direct market comp gave a clean number for this specific mechanic (Vinted
and Depop monetize via transaction fees rather than listing caps; eBay's
250/month casual-seller allowance is a much bigger general marketplace, not
a useful scale comparison) — this is reasoned rather than researched: 10
comfortably covers someone clearing a personal shelf, while a small reseller
running it like a business will exceed it, which is the split that matters.

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

**Confirmed: free = 3/month, Pro = unlimited.** Grounded in the closest real
comp found: PaperbackSwap, an actual book-swapping service, requires listing
10 books to unlock free credits, and even its **cheapest paid tier**
(~$12/year) only grants **30 book requests per year — about 2.5/month.**
If a real comparable product treats ~2.5 requests/month as worth paying for,
a free tier at 3/month is generous rather than stingy, while Pro's
"unlimited" is still a clear, meaningful step up.

### 1c. Pro-only extras — deferred, not part of this pass

- Extra photos per listing (free: 1, Pro: up to 5).
- Featured/boosted listings in Discover.

**Confirmed: deferred**, and not because they're low-value — they're the
natural shape of a future third tier ("Pro+"), but there's no usage data yet
on what upgraders actually want, and building a second price point around a
guess is premature before the first one (Free → Pro) is proven. Ship the
two core limits, see who upgrades and why, then decide whether these extras
justify a Pro+ tier or belong in Pro as-is.

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
fixed duration, tracked via `profiles.plan_expires_at`. Renewal is just
buying another pass; nothing auto-charges.

**Confirmed: 25,000 UZS for 90 days** (~8,300 UZS/month equivalent).
Deliberately priced below the two local digital-subscription anchors found —
Telegram Premium (34,000-56,000 UZS/month depending on term) and a regional
streaming app observed at 13,000-15,000 UZS/month — because both of those
are proven, high-frequency-use products, whereas this is an unproven,
lower-frequency-use niche product competing for the same price-sensitive
wallet. It should undercut established players until it's proven itself,
not match them.

### Where purchases happen: web only, on every platform

**Finalized approach**: the web app is the *only* place a purchase is ever
made. iOS and Android apps never sell anything — they only read whether the
signed-in user is currently Pro (`profiles.plan` / `plan_expires_at`, the
same row the web app reads) and display it. No native IAP integration, no
RevenueCat, no receipt validation, on either mobile platform, for this
baseline plan.

This is the "reader app" pattern (how Netflix/Kindle operated on iOS for
years) — informing a user their subscription exists and can be managed
elsewhere is allowed; providing a purchase mechanism inside the app is what
triggers Apple/Google's IAP requirement (and their 15-30% cut). Since
nothing purchasable is ever offered in-app, that requirement never applies,
and neither does the commission.

**Real tradeoff, accepted deliberately**: since mobile is the primary
product, this adds friction — a user has to leave the app and go to
kitobjavonim.uz to actually pay. Mitigated with an in-app pointer worded
informationally ("Upgrade on our website"), not as a tappable purchase
button, plus out-of-app channels (Telegram bot/channel, push notifications
that open a browser) to drive people there. This friction is the accepted
cost of paying no platform commission and carrying no App Store rejection
risk.

**Not part of this plan, flagged for later, separately**: Google Play's
*User Choice Billing* can let an eligible app offer a non-Google payment
method in-app alongside Google's, at a reduced fee instead of the full cut
— worth investigating for Android specifically once the web checkout is
live, **if** Uzbekistan is in Google's current eligible-country list (needs
checking against Google's live Play Console docs at that time — this
program's eligibility expands over time and isn't something to assume).
Apple's equivalent ("External Purchase Link" entitlement) is not being
pursued — historically limited to specific regions (US/EU) under regulatory
mandate and requires a formal application; not assumed available here.

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
  shared with Feature 1's enforcement logic, read identically by web, iOS,
  and Android — one entitlement source, three clients.
- Mobile-side work is limited to: reading `profiles.plan`/`plan_expires_at`
  (already fetchable the same way any other profile data is), and a
  read-only "upgrade" UI pointer. No purchase code on mobile at all.

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

**Confirmed: before Feature 2 (payments)** — this is exactly the kind of
change you don't want to test against production data.

---

## 4. Out of scope (this phase)

- **Native mobile purchase flows (Apple/Google IAP) — not a deferral, a
  deliberate design choice.** The finalized plan in Feature 2 has mobile
  apps never selling anything in-app at all, so there's no IAP integration
  to build later for the baseline plan. The only mobile-payment door left
  open is Google's User Choice Billing for Android, noted in Feature 2 as a
  possible future addition once eligibility is confirmed — Apple's
  equivalent is not being pursued.
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

## Confirmed decisions (summary)

- Two tiers: Free and Pro. A "Pro+" tier was considered and deliberately
  deferred until there's usage data to price it against.
- Free tier: 10 concurrent active listings, 3 contact requests/month,
  uncapped personal cataloging. Pro: unlimited on both.
- Pro-only extras (extra photos, featured listings): deferred, likely Pro+
  material later.
- Pro pass: 25,000 UZS for 90 days, one-time purchase, web-only checkout via
  Click.
- Build order: environment separation → freemium enforcement → payment
  integration.
