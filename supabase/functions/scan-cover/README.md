# Cover OCR

Reads a title and author(s) off a photographed book cover, using Gemini's
vision API. Called from the client via `src/lib/ocr.ts` — `scanCoverText()`
— whenever the "Scan cover" button appears next to a cover photo (manual
entry, the add-flow's "Edit details" sheet, and book detail's "Edit book
details" sheet).

This is optional. Nothing else in the app depends on it — if it is never
deployed, `scanCoverText()` fails closed (returns `null`) and the "Scan
cover" button simply never appears, same as before this feature existed.

## Why this needs a server function at all

The Gemini API key cannot live in the app itself. Every client build —
including the web one — ships as plain, readable JavaScript, so any key
baked into it is public the moment someone opens dev tools. This function
holds the key as a Supabase secret, and is the only thing that ever calls
Gemini; the client only ever sends an image URL and gets back
`{ title, authors }`.

## What you need first

1. **A Gemini API key.** Free, no billing required to start: go to
   [aistudio.google.com/apikey](https://aistudio.google.com/apikey), sign in
   with a Google account, and click **Create API key**. Gemini's free tier
   (as of writing) comfortably covers casual use of this feature; if you
   outgrow it, enable billing on the same Google Cloud project and the paid
   rate for `gemini-2.0-flash` is a small fraction of a cent per image.

2. **The Supabase CLI**, if you don't already have it:
   ```bash
   npm install -g supabase
   ```

## Deploying

```bash
supabase login
supabase link --project-ref <your-project-ref>   # find this in the dashboard URL

supabase secrets set GEMINI_API_KEY=<your key>
supabase functions deploy scan-cover
```

That's it — no extra config beyond the secret. `GEMINI_MODEL` is also
settable as a secret if you ever want to point this at a different Gemini
model without redeploying code; it defaults to `gemini-2.0-flash`.

## Verifying it worked

Add a book manually, attach a cover photo, and tap **Scan cover for title &
author** (now on every platform, not just web). A quick way to check the
function itself, independent of the app:

```bash
curl -i -X POST 'https://<project-ref>.supabase.co/functions/v1/scan-cover' \
  -H "Authorization: Bearer <a signed-in user's access token>" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "https://example.com/some-book-cover.jpg"}'
```

A `401` means the Authorization header didn't carry a valid session — the
function deliberately requires one, so this can't become an open, metered
proxy anyone could hit for free. A `500` mentioning `GEMINI_API_KEY` means
the secret above wasn't set (or the function needs redeploying after it
was).
