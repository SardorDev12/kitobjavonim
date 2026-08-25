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
  call-to-action link goes to `https://kitobjavonim.uz` (the consumer app
  itself) or `mailto:`. Nothing here needs an environment variable.
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

Same two options as `admin/README.md`:

**Cloudflare Git integration (recommended — no local machine needed).**
Workers & Pages → connect the GitHub repo → track **`main`** (or
`develop`, if you want a staging subdomain too) → root directory
`landing/public`, **no build command**, output directory `/` (the root
directory already points at the deployable folder, since there's nothing
to build). Cloudflare redeploys automatically on every push to that
branch.

**Local build + wrangler CLI**, if you'd rather:

```bash
cd landing
npx wrangler deploy
```

`wrangler.jsonc`'s `name` is `kitobjavonim-landing`; `assets.directory`
points at `./public` directly.

Either way, once the project exists: **Workers & Pages → [project] →
Settings → Domains & Routes → Add → Custom domain** — point your chosen
subdomain (e.g. `www.kitobjavonim.uz` or `home.kitobjavonim.uz`) at this
Worker.

## What's deliberately not here

- **No language switcher.** Copy is Uzbek only, matching the app's launch
  market and the voice already established in its own strings. The page
  is small enough that a Russian/English version is a straightforward
  follow-up (duplicate `index.html` and its copy, share `styles.css`/
  `main.js`/`assets/` as-is) if it's wanted later.
- **No app store badges.** The primary call-to-action links straight to
  the live web app at `kitobjavonim.uz` rather than a Play Store/App
  Store URL, since neither listing is public yet. Once they are, swap the
  hero's secondary link (or add badges) — the store URL format is
  `https://play.google.com/store/apps/details?id=uz.homelibrary.app` for
  Android (see `src/components/UpdateAvailableModal.tsx` for the existing
  reference to that same package id).
- **No analytics.** Nothing calls out to a third party at all — add one
  deliberately if it's wanted, along with updating `public/_headers`'
  CSP to allow it.
