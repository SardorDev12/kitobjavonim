/**
 * Cover OCR — extracts a title and author(s) from a photographed book cover
 * using Gemini's vision API, invoked from src/lib/ocr.ts via
 * supabase.functions.invoke('scan-cover', { body: { imageUrl } }).
 *
 * This exists as a server-side function rather than a direct client call for
 * one reason: the Gemini API key. It cannot live in the app bundle — every
 * client build, including the web one, ships as plain readable JS — so this
 * function holds it as a Supabase secret and is the only thing that ever
 * calls Gemini. The client sends a URL, gets back { title, authors }.
 *
 * An earlier version of this feature ran Tesseract.js entirely client-side,
 * for free, but it was unreliable on stylized cover typography and only
 * worked on web (Tesseract needs Web Workers and WASM the way a browser
 * provides them). This version works on every platform, since it's just an
 * HTTPS call, and an LLM reading the cover directly is far more accurate
 * than free OCR text fed through font-size heuristics.
 *
 * Setup: supabase/functions/scan-cover/README.md
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
// gemini-2.0-flash was retired (June 2026). Its documented replacement,
// gemini-2.5-flash, turned out to already be gated off new API keys too —
// Google is pushing everyone straight to the 3.x line ahead of the 2.5
// series' own official October 2026 shutdown. Whatever is hardcoded here
// will eventually go the same way — GEMINI_MODEL exists as a secret
// specifically so the fix, next time, is one dashboard edit instead of a
// redeploy.
const GEMINI_MODEL = Deno.env.get('GEMINI_MODEL') ?? 'gemini-3.5-flash';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

const PROMPT =
  "This is a photo of a book cover. Read the title and author(s) exactly as printed on the cover — " +
  'not a publisher, series name, or tagline. If no title is legible, return an empty string for it. ' +
  'If no author is visible, return an empty array.';

const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    authors: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['title', 'authors'],
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

  if (!GEMINI_API_KEY) return json({ error: 'GEMINI_API_KEY is not set' }, 500);
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json({ error: 'Supabase environment is not available' }, 500);

  // supabase.functions.invoke() attaches the caller's access token — requiring
  // a real one (not just a header's presence) is what stops this becoming an
  // open, metered Gemini proxy anyone could hit for free.
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Not signed in' }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Not signed in' }, 401);

  let imageUrl: unknown;
  try {
    ({ imageUrl } = await request.json());
  } catch {
    return json({ error: 'imageUrl is required' }, 400);
  }
  if (typeof imageUrl !== 'string' || !imageUrl) return json({ error: 'imageUrl is required' }, 400);

  let imageBytes: ArrayBuffer;
  let contentType = 'image/jpeg';
  try {
    const imageResponse = await fetch(imageUrl);
    if (!imageResponse.ok) throw new Error(`fetch failed: ${imageResponse.status}`);
    contentType = imageResponse.headers.get('content-type') ?? contentType;
    imageBytes = await imageResponse.arrayBuffer();
  } catch (cause) {
    return json({ error: `Could not fetch the image: ${(cause as Error).message}` }, 400);
  }

  const geminiResponse = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: PROMPT },
              { inline_data: { mime_type: contentType, data: encodeBase64(imageBytes) } },
            ],
          },
        ],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
        },
      }),
    }
  );

  if (!geminiResponse.ok) {
    const detail = await geminiResponse.text();
    return json({ error: `Gemini request failed (${geminiResponse.status}): ${detail}` }, 502);
  }

  const geminiData = await geminiResponse.json();
  const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== 'string') return json({ error: 'No response from Gemini' }, 502);

  let parsed: { title?: unknown; authors?: unknown };
  try {
    parsed = JSON.parse(text);
  } catch {
    return json({ error: 'Could not parse the Gemini response' }, 502);
  }

  const title = typeof parsed.title === 'string' ? parsed.title.trim() : '';
  const authors = Array.isArray(parsed.authors)
    ? parsed.authors.filter((a): a is string => typeof a === 'string').map((a) => a.trim()).filter(Boolean)
    : [];

  return json({ title: title || null, authors });
});
