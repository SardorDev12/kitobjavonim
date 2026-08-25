# Kitobjavonim — landing page

A single static marketing page, deployed to its own Cloudflare subdomain and
kept apart from both the consumer app and the admin panel — same reasoning
as `admin/README.md`: a separate deploy means a change or an outage on one
side never touches the others.

- **No build step.** Plain HTML/CSS/JS — `public/index.html`,
  `public/assets/styles.css`, `public/assets/main.js` (a mobile-nav toggle
  and the footer year, nothing else). No framework, no `npm install`,
  nothing to compile. The root `tsconfig.json`/`vitest.config.ts` don't
  reach into this folder, same as `admin/`.
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

## Local preview

No server needed — open `public/index.html` directly in a browser, or serve
it with anything static:

```bash
cd landing/public
npx serve .
```

## Deploying

**GitHub Actions (recommended).** `.github/workflows/deploy-landing.yml`
runs `wrangler deploy` on every push that touches `landing/**` — same
mechanism `eas-update.yml` already uses for the app, just with
`cloudflare/wrangler-action` instead of `expo-github-action`. `develop`
deploys to `kitobjavonim-landing-staging`, `main` to `kitobjavonim-landing`
(the name `wrangler.jsonc` itself carries) — same staging/production split
as the admin panel.

This needs two repository secrets (**Settings → Secrets and variables →
Actions → New repository secret**), created once:

- `CLOUDFLARE_API_TOKEN` — **My Profile → API Tokens → Create Token →
  "Edit Cloudflare Workers"** template, scoped to this account. This token
  can create/update/delete Workers — treat it like any other deploy
  credential; a scoped token that can only touch Workers (not your whole
  Cloudflare account) is the point of using that template instead of a
  broader one.
- `CLOUDFLARE_ACCOUNT_ID` — Cloudflare dashboard → any domain in this
  account → **Account ID** in the right sidebar (or **Workers & Pages**
  → **Overview**, same value shown there).

Once both secrets exist, pushing to `develop` or `main` deploys
automatically — no further action needed, and no local machine involved.

**Alternatives**, if you'd rather not wire up the workflow: Cloudflare's
own Git integration (Workers & Pages → connect the repo → root directory
`landing/public`, no build command) works too, or `cd landing && npx
wrangler deploy` locally with `wrangler login` already run once.

Either way, once the Worker exists (from any of the three paths above):
**Workers & Pages → [project] → Settings → Domains & Routes → Add →
Custom domain** — point the bare apex `kitobjavonim.uz` at the production
Worker (`kitobjavonim-landing`). This is the site's main URL; the consumer
app lives at `app.kitobjavonim.uz` instead (see the root `README.md`'s
"Web → Cloudflare Pages" section for that binding). This one step still
needs the dashboard; none of the deploy paths above create the domain
binding on their own.

## What's deliberately not here

- **No language switcher.** Copy is Uzbek only, matching the app's launch
  market and the voice already established in its own strings. The page
  is small enough that a Russian/English version is a straightforward
  follow-up (duplicate `index.html` and its copy, share `styles.css`/
  `main.js`/`assets/` as-is) if it's wanted later.
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
