# Home Library

A digital catalogue for a physical book collection, with a peer-to-peer exchange
and sale layer on top. One codebase serves iOS, Android and the web.

Built from `personal_library_catalog_prd.txt`. Uzbekistan is the launch market,
so the app ships in Uzbek, Russian and English, and locations are modelled on
Uzbek regions and districts.

---

## What is here

| | |
|---|---|
| **App** | Expo SDK 57, React Native 0.86, Expo Router (file-based routes with real URLs on web) |
| **Backend** | Supabase — Postgres, Auth, Storage, Row Level Security |
| **Data layer** | React Query, with the library and shelves persisted to disk for offline reading |
| **Book metadata** | Google Books, falling back to Open Library, with results cached into your own `books` table |
| **Sign-in** | Email + password, Google, Sign in with Apple, Telegram |

Everything runs on free tiers. The only unavoidable costs are the app stores:
**Apple Developer $99/year** and **Google Play $25 once**.

---

## Getting it running

### 1. Install

```bash
npm install
```

### 2. Create the Supabase project

**Full walkthrough: [docs/supabase-setup.md](docs/supabase-setup.md).** In short:
make a project at [supabase.com](https://supabase.com), then run the files in
`supabase/migrations/` **in order** through the SQL editor:

```
0001_init.sql                tables, enums, indexes, triggers
0002_views.sql               listings / library_entries / public_profiles
0003_rls.sql                 row level security + the request_contact function
0004_storage.sql             avatar and listing-photo buckets
0005_seed_reference.sql      14 regions, 61 districts, 20 categories
0006_category_permissions.sql  who may classify a shared book
```

Order matters — each file builds on the last. The SQL editor runs each file in a
transaction, so a failure rolls the whole file back rather than leaving a
half-applied schema.

The Supabase CLI's `supabase db push` will not pick these up as written: it
expects timestamped filenames like `20260809120000_init.sql`, and these are
`0001_`-prefixed. Use the SQL editor, or rename them first.

### 3. Point the app at it

```bash
cp .env.example .env
```

Fill in the project URL and the **anon** key from Project Settings → API. Restart
the dev server afterwards — Expo reads env vars at startup.

### 4. Run

```bash
npm run web
```

```bash
npm run ios
```

```bash
npm run android
```

The barcode scanner needs a real device or simulator build; the web build
detects this and offers manual entry instead.

---

## Sign-in providers

**Email + password** works as soon as the project exists.

**Google** — Supabase Dashboard → Authentication → Providers → Google. Add
`homelibrary://` and your web origin to the redirect allow-list.

**Apple** — required by App Store review because another social login is offered.
Same dashboard page; needs an Apple Developer account to generate the key.

**Telegram** — not an OAuth provider. The login widget is hosted by the app
itself at `/auth/telegram-login`, not by Supabase — its shared domain refuses
to serve `text/html`, so a widget hosted there renders as raw source instead
of a page. The Edge Function in `supabase/functions/telegram-auth/` only
verifies the signed result. Full setup, including why `localhost` cannot work
with Telegram's widget at all, is in the README next to it. If you would
rather launch without it, delete the Telegram button from
`src/app/(auth)/sign-in.tsx`; nothing else depends on it.

---

## Deploying

### Web → Cloudflare Pages

```bash
npm run build:web
```

Publish the `dist` folder. In the Cloudflare dashboard: build command
`npm run build:web`, output directory `dist`, and add the two `EXPO_PUBLIC_*`
variables under Settings → Environment variables.

Cloudflare Pages rather than Vercel on purpose — Vercel's Hobby tier is licensed
for non-commercial use only, and this app has a marketplace in its roadmap.

### Mobile → EAS

```bash
npx eas build --platform all --profile production
```

Fill in the `env` blocks in `eas.json` first, or set them as EAS secrets.

Two things worth knowing before you plan a launch date:

- New personal Google Play developer accounts must run a closed test with **12
  testers for 14 days** before a production release is allowed.
- Apple review will ask what the app does with the camera; the usage strings in
  `app.json` already explain the ISBN scanning.

---

## The data model

The distinction the whole schema rests on:

- **`books`** is the canonical record — one row per edition, shared by everyone.
- **`user_books`** is *your copy* of a book: where it sits, whether you finished
  it, what you thought, whether you would part with it.

Two people owning *Atomic Habits* share one `books` row and have their own
`user_books` row. Nothing personal ever touches the shared record.

Physical location is `bookshelves` → `bookshelf_positions` → referenced from
`user_books`. Positions are entirely user-defined; no shelf or row values are
baked into the schema or the app.

### Privacy

Your reviews, ratings, notes and shelf layout are private, but they live on the
same row as the listing fields — and a Postgres SELECT policy grants whole rows,
not chosen columns. So `user_books` is simply not readable by anyone but its
owner, and strangers read the `listings` view instead, whose column list is the
hard boundary of what can escape.

Contact details work the same way. They are not a column on any browsable table.
`request_contact()` checks you are signed in, writes a row to
`contact_requests`, and only then returns the owner's Telegram handle or phone —
so "number of owner contacts", the headline metric in the PRD, cannot drift away
from reality.

### Testing the policies

```bash
./supabase/tests/run.sh
```

Spins up a throwaway Postgres, applies every migration, and asserts the rules
above — a stranger reads 0 rows from `user_books`, an anonymous visitor can still
browse `listings`, `request_contact` refuses without a session. Needs
`brew install postgresql@17`; it never touches your Supabase project.

---

## Things you will hit

**Book metadata coverage for local publishing is poor.** Google Books and Open
Library between them have very little Uzbek-language or locally-published stock.
Manual entry is a routine path here, not an edge case, which is why
`add/manual.tsx` is a first-class screen. Every book added by hand is cached into
your `books` table, so the catalogue becomes more useful as it is used — that
shared table is the real long-term asset.

**The free tier pauses.** Supabase pauses a free project after 7 days with no
requests. Harmless once real users exist, mildly annoying during a quiet week of
development.

**No automatic backups on free.** Worth a weekly `pg_dump` on a cron once you
have data you would miss.

**1 GB of storage.** Covers come from external URLs rather than copies, so the
limit really applies to listing photos. The buckets cap uploads at 2 MB each.

---

## Layout

```
src/
  app/              routes (expo-router)
    (auth)/         sign in, sign up, password reset
    (tabs)/         library, discover, add, profile
    add/            scan, manual entry, configure-and-save
    book/[id]       your copy — status, review, location, listing
    listing/[id]    someone else's listing — contact owner
    bookshelves/    shelf and position configuration
  components/       BookCard, ListingCard, BookCover, ui/ primitives
  features/         auth session and providers
  lib/
    books/          Google Books + Open Library lookup
    i18n/           uz / ru / en catalogues
    queries/        React Query hooks, one file per domain
  theme/            design tokens, light + dark
supabase/
  migrations/       schema, views, RLS, storage, seed data
  functions/        telegram-auth Edge Function
  tests/            RLS test harness
```

## Renaming

The app ships as "Home Library" with the bundle id `uz.homelibrary.app` and the
scheme `homelibrary`. To change it, edit `name`, `slug`, `scheme`,
`ios.bundleIdentifier` and `android.package` in `app.json` — do it before the
first store submission, since bundle ids cannot be changed afterwards.
