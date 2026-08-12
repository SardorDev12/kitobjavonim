# PRD: Monetization & Environment Separation

Status: **confirmed — implementation in progress.**

This covers everything discussed in the deployment/product-strategy conversation
that hasn't been built yet. It's split into five features. All open questions
are resolved below; implementation proceeds in the build order at the end.

**Two tiers: Free and Pro.** A third tier (discussed as "Pro+", bundling the
extras in 1c below) was considered and deliberately deferred, not rejected —
see 1c for why. Revisit once there's real usage data on who upgrades to Pro
and why, rather than guessing at a second price point before the first one is
proven.

## Implementation status

- [x] **Feature 1 (freemium limits)** — `supabase/migrations/0008_plans_and_limits.sql`
  written and verified against a throwaway Postgres instance (all 7 behaviors
  checked: cap enforcement, quota enforcement with re-contact exemption, plan
  expiry, no forced unlisting on downgrade, and — caught while writing it — a
  real security gap where any signed-in user could have set their own
  `plan`/`plan_expires_at` directly, now closed with a column-level grant).
  **Not yet applied to any live database.** Per the build order below, this
  should run against the staging Supabase project first, once Feature 3
  creates one — not directly against production.
- [ ] Feature 2 (payment integration) — blocked on Click merchant
  registration/credentials, which only the account owner can obtain.
- [ ] Feature 3 (environment separation) — the Cloudflare Pages half is
  done (see Feature 5); still needs the second Supabase project, branch
  protection on `main`, and `.env.staging`.
- [x] **Feature 5 (hosting migration) — DONE. Live on `kitobjavonim.uz`,
  Plesk fully cut over.** Went through Cloudflare's newer Workers-based
  deploy (`wrangler deploy` / `wrangler versions upload`), not the classic
  Pages-only flow the PRD originally assumed — required `wrangler.jsonc`
  (static assets config) and `public/_redirects` (Apache `.htaccess`'s
  dynamic-route and 404 rules don't carry over automatically), neither of
  which existed at first. Six real bugs found and fixed via live testing —
  three in the build/routing (found on the `workers.dev` URL, before
  touching the real domain) and three in the domain cutover itself (found
  going from `workers.dev` to `kitobjavonim.uz`):

  Build/routing:
  1. `_redirects` only accepts status 200/301/302/303/307/308, not 404 —
     custom 404 now goes through `wrangler.jsonc`'s
     `assets.not_found_handling: "404-page"` instead, which needs a literal
     `dist/404.html` the build command copies into place.
  2. Rewriting `/book/*` straight to the real `book/[id].html` looped
     infinitely — that target itself matches its own source wildcard
     pattern, self-rewriting forever if Cloudflare re-evaluates a rewritten
     path against the same rules.
  3. The first fix's replacement names (`_book-shell.html`,
     `_listing-shell.html`) silently failed to serve at all — Cloudflare
     reserves leading-underscore filenames for its own config
     (`_redirects`, `_headers`, `_worker.js`). Renamed to `book-shell.html`
     / `listing-shell.html` (no underscore), which resolved it.

  Domain cutover:
  4. The app is configured for `www.kitobjavonim.uz` specifically
     (`EXPO_PUBLIC_WEB_ORIGIN`), not the bare apex — adding the Custom
     Domain for the apex alone (the first attempt) would have left
     Telegram/Google auth broken even once "working."
  5. Cloudflare's Custom Domains UI didn't reliably auto-provision the DNS
     record for a second hostname (`www`) in the same zone — the routing
     entry got created but the DNS record didn't, causing
     `ERR_EMPTY_RESPONSE`. A proxied CNAME to the apex seemed like the fix
     but isn't valid here (the apex's Worker-bound record isn't a normal
     resolvable CNAME target — Error 1016). What actually worked: a
     placeholder proxied `A` record (`192.0.2.1`) for the hostname, plus a
     separate Worker **Route** (`www.kitobjavonim.uz/*`) binding it to the
     Worker directly — same pattern then repeated for the apex
     (`kitobjavonim.uz/*` route, since `*.kitobjavonim.uz/*` — a wildcard
     Route added along the way — does not cover the bare apex; wildcard
     subdomain patterns never match zero subdomains).
  6. The bare apex direct-serving that resulted from #5 was replaced with a
     **redirect rule** (`kitobjavonim.uz` → `https://www.kitobjavonim.uz`,
     301) instead — deliberately, not as a fallback. Serving identical
     content at both hostnames independently would have left auth broken on
     apex anyway (same root cause as #4) and created an SEO canonicalization
     problem; one canonical hostname with the other redirecting is the
     correct pattern regardless of whether direct-serving could be made to
     work.

  Current Build command (Cloudflare Pages dashboard, not stored in the
  repo — worth knowing if this project's hosting is ever handed off):
  ```
  npm ci && npx expo export --platform web --clear && cp "dist/+not-found.html" dist/404.html && cp "dist/book/[id].html" dist/book-shell.html && cp "dist/listing/[id].html" dist/listing-shell.html
  ```
  Verified on the real domain: homepage, a dynamic route by direct URL (not
  client-side navigation, which would pass even if the rewrite were
  broken), the custom 404 page, the apex→www redirect, and **Google +
  Telegram OAuth — both confirmed working**, the two flows that couldn't be
  tested pre-cutover since they're locked to the real domain by design.
  **Not started**: Cloudflare Email Routing (`support@kitobjavonim.uz`) —
  the other half of Feature 5, separate from everything above.

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
  `.env.production`.
- **Staging web hosting**: Cloudflare Pages — see Feature 5, since the same
  migration that solves the hosting-cost problem also gives staging its
  preview deployments for free, in one move rather than two.
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
- Supabase tier upgrade (not urgent — current traffic doesn't need it, and
  it's a separate lever from anything in this PRD).

---

## 5. Hosting migration: Plesk → Cloudflare Pages, plus email

**Confirmed, cost-driven**: the Plesk plan runs ~35,000 UZS/month for hosting
a site that's just static files behind Cloudflare already. This isn't a new
idea — it's reverting to the README's original plan, from before the Plesk
detour.

- **Cloudflare Pages, free tier**, connected directly to the GitHub repo via
  Cloudflare's own git integration — no GitHub Actions changes needed for
  the build itself, since Pages runs its own build (`npm ci && npx expo
  export --platform web --clear`, output directory `dist`) on every push.
- **This subsumes the custom deploy pipeline built for Plesk.** The
  `.build-sha` polling + Cloudflare cache-purge machinery in
  `.github/workflows/deploy-web.yml` existed specifically to work around
  Plesk's chrooted deploy shell and a separate origin/cache split — Cloudflare
  Pages doesn't have either problem, since deploy and edge-serving are the
  same system with automatic cache invalidation on every new deployment. That
  workflow gets simplified or removed once Pages is confirmed live — not
  before, so there's no gap with nothing serving the site if something in
  the Pages setup needs troubleshooting first.
- **Solves staging too**: Cloudflare Pages gives every non-production branch
  its own automatic preview URL, which is exactly what Feature 3 needed for
  a staging environment — one migration, two problems solved.
- **Email**: Cloudflare Email Routing (free) for a forwarding address like
  `support@kitobjavonim.uz` → an existing real inbox. Not a full mailbox
  (no send-as, no webmail/IMAP) — sufficient for the near-term need (payment
  support once Click checkout is live, a support contact for app store
  listings). Zoho Mail's free tier is the upgrade path later if a real
  mailbox (log in directly, send *from* the address) becomes worth it —
  not needed now.
- **What doesn't change regardless of host**: the `.uz` domain registration
  itself renews on its own schedule either way, and this migration doesn't
  touch it.

**Status**: **live and fully verified — `kitobjavonim.uz` cut over from
Plesk to Cloudflare, all auth flows (Google, Telegram) confirmed working on
the real domain** (six bugs found and fixed along the way — see
"Implementation status" above for the full detail). **Remaining**: set up
Cloudflare Email Routing (not started — separate from everything above),
and decide whether/when to cancel the Plesk plan (worth keeping a little
longer as a safety net before fully committing to that).

---

## Suggested build order

1. **Hosting migration (Feature 5)** — do this early: it's cheap, low-risk
   (Plesk keeps serving the live site until Pages is confirmed working, no
   forced cutover), and its preview deployments are what Feature 3's staging
   environment needs anyway.
2. Environment separation (Feature 3) — the remaining piece once Pages
   exists: the second Supabase project, branch protection on `main`,
   `.env.staging`.
3. Freemium enforcement (Feature 1) — **schema already written and verified**
   (`supabase/migrations/0008_plans_and_limits.sql`); apply it to the staging
   Supabase project once Feature 3 creates one, not directly to production.
4. Payment integration (Feature 2) — now `profiles.plan` already means
   something, so this becomes "the thing that sets it."

---

## Confirmed decisions (summary)

- Two tiers: Free and Pro. A "Pro+" tier was considered and deliberately
  deferred until there's usage data to price it against.
- Free tier: 10 concurrent active listings, 3 contact requests/month,
  uncapped personal cataloging. Pro: unlimited on both. **Implemented** in
  `supabase/migrations/0008_plans_and_limits.sql`, not yet applied to any
  live database.
- Pro-only extras (extra photos, featured listings): deferred, likely Pro+
  material later.
- Pro pass: 25,000 UZS for 90 days, one-time purchase, web-only checkout via
  Click.
- Hosting: migrate from Plesk to Cloudflare Pages (free, solves staging too).
  Email: Cloudflare Email Routing (free forwarding), Zoho Mail free tier if
  a real mailbox is needed later.
- Build order: hosting migration → environment separation → freemium
  enforcement (done) → payment integration.

### What's needed from you to unblock the rest

1. **Cloudflare Pages**: dashboard → Workers & Pages → Create → Pages →
   Connect to Git → pick this repo → build command
   `npm ci && npx expo export --platform web --clear` → output directory
   `dist` → add the `EXPO_PUBLIC_*` variables from `.env.production` as
   Pages environment variables → Save and Deploy.
2. **Cloudflare Email Routing**: dashboard → the `kitobjavonim.uz` zone →
   Email → Email Routing → Enable → add a routing rule
   (`support@kitobjavonim.uz` → your real inbox).
3. **A second Supabase project** for staging (Feature 3) — new project,
   same migrations applied via the SQL editor per `docs/supabase-setup.md`,
   throwaway seed data.
4. **Click merchant credentials** (Feature 2) — needed before the payment
   Edge Function can be built and tested for real, not just written.

I can proceed with everything else in the meantime — the freemium migration
is already done, and I can prepare the Click Edge Function structurally
ahead of having real credentials, though it won't be testable until they
exist.
