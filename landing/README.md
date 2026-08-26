# Kitobjavonim — landing page

A single static marketing page, deployed to its own Cloudflare subdomain and
kept apart from both the consumer app and the admin panel — same reasoning
as `admin/README.md`: a separate deploy means a change or an outage on one
side never touches the others.

- **No build step.** Plain HTML/CSS/JS — `public/index.html`,
  `public/assets/styles.css`, `public/assets/main.js` (mobile-nav toggle,
  footer year, the language switcher, and the theme toggle),
  `public/assets/theme-init.js` (see below). No framework, no
  `npm install`, nothing to compile. The root `tsconfig.json`/
  `vitest.config.ts` don't reach into this folder, same as `admin/`.
- **No backend.** No Supabase calls, no forms that submit anywhere — every
  call-to-action link goes to `https://app.kitobjavonim.uz` (the consumer
  app itself) or `mailto:`. Nothing here needs an environment variable.
- **Own icon assets.** `public/assets/icon.png` / `icon-128.png` /
  `favicon.png` are the real app icon (`assets/images/icon.png` at the repo
  root), resized down for web use — not redrawn, so the landing page and
  the app it's advertising actually look like the same product.
- **Same palette and voice as the app.** Colors are `src/theme/tokens.ts`'s
  own light/dark palette (warm paper, burnt-sienna primary, brass accent),
  copied by value rather than imported — this folder has no build step to
  resolve a TS import through, and the palette changes rarely enough that
  copying is simpler than wiring up a shared package for two consumers.
  Copy is adapted from the app's own onboarding/tab strings
  (`src/lib/i18n/locales/uz.ts`) rather than invented from scratch.
- **Uzbek, Russian, and English**, matching the app's own three languages.
  `main.js` holds a flat `STRINGS` dictionary and swaps `textContent`/
  attributes on every `[data-i18n]`/`[data-i18n-attr]` element in
  `index.html` — no i18n library, since three languages of static copy
  don't need one. **Uzbek is the default for every first-time visitor**,
  deliberately not sniffed from `navigator.language` — this is the launch
  market's own site, not a generic international one. A visitor's choice
  via the `UZ`/`RU`/`EN` buttons in the nav is remembered in `localStorage`
  from then on.
- **Light and dark mode**, light by default. The CSS variables carry a full
  dark palette (same tokens as the app), applied only via an explicit
  `data-theme="dark"` attribute — deliberately **not** driven by
  `prefers-color-scheme`, so a visitor's OS-level dark mode doesn't change
  what a first-time visitor sees. `main.js`'s sun/moon toggle sets that
  attribute and remembers the choice in `localStorage`.
  `assets/theme-init.js` is loaded synchronously in `<head>`, before
  `styles.css`, purely to apply a *returning* visitor's stored choice
  before first paint — without it, someone who chose dark previously would
  see a flash of light mode before JS caught up.

## Local preview

No server needed — open `public/index.html` directly in a browser, or serve
it with anything static:

```bash
cd landing/public
npx serve .
```

## Deploying

**`deploy-landing.yml` (GitHub Actions)** is the live setup — runs
`wrangler deploy` on every push touching `landing/**` (from either
`develop` or `main`, or manually via the Actions tab's "Run workflow"
button), always to the single `kitobjavonim-landing` Worker. Needs
`CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` as repo secrets.

Unlike the app/admin Workers, there's no separate staging deploy here —
this page has no backend and no environment variables (see above), so a
second Worker would only ever be a byte-for-byte copy of production.

Cloudflare's own Git integration (Workers & Pages → connect the repo)
was tried instead and abandoned — for a no-build, assets-only Worker like
this one, its build step hung indefinitely at "Initializing" with nothing
diagnosable from either side. GitHub Actions doesn't touch Cloudflare's
build queue at all — it deploys straight from a GitHub-hosted runner via
`wrangler` — so if the Git integration situation ever changes, don't
reconnect it for this project; `deploy-landing.yml` is the dependable path.

Local alternative: `cd landing && npx wrangler deploy` (with `wrangler
login` run once, or `CLOUDFLARE_API_TOKEN`/`CLOUDFLARE_ACCOUNT_ID` set as
env vars) deploys the same `wrangler.jsonc` config directly from a local
machine.

Once the Worker exists (either path above): **Workers & Pages → [project] →
Settings → Domains & Routes → Add → Custom domain** — point the bare apex
`kitobjavonim.uz` at the production Worker (`kitobjavonim-landing`). This
is the site's main URL; the consumer app lives at `app.kitobjavonim.uz`
instead (see the root `README.md`'s "Web → Cloudflare Pages" section for
that binding). This step still needs the dashboard; neither deploy path
creates the domain binding on its own.

`www.kitobjavonim.uz` is not a second copy of the site — it's a Cloudflare
DNS `CNAME` + Redirect Rule (zone-level, no Worker involved) that
301-redirects to the bare apex, so there's exactly one canonical URL.

## What's deliberately not here

- **No app store badges.** The primary call-to-action links straight to
  the live web app at `app.kitobjavonim.uz` rather than a Play Store/App
  Store URL, since neither listing is public yet. Once they are, swap the
  hero's secondary link (or add badges) — the store URL format is
  `https://play.google.com/store/apps/details?id=uz.homelibrary.app` for
  Android (see `src/components/UpdateAvailableModal.tsx` for the existing
  reference to that same package id).
- **No analytics.** Nothing calls out to a third party at all — add one
  deliberately if it's wanted, along with updating `public/_headers`'
  CSP to allow it.
