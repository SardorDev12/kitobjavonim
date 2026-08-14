import { supabase } from '@/lib/supabase';

export type CoverScanResult = {
  title: string | null;
  authors: string[];
};

/**
 * Cover OCR via the scan-cover Supabase Edge Function (Gemini vision).
 *
 * An earlier version of this ran Tesseract.js entirely client-side for free,
 * but accuracy on stylized cover typography was poor, and it only worked on
 * web (Tesseract needs Web Workers/WASM the way a browser provides them).
 * Routing through a server function that holds a Gemini API key works on
 * every platform instead, since it's just an HTTPS call, and an LLM reading
 * the cover directly is far more reliable than free OCR text fed through
 * font-size heuristics.
 *
 * This is optional infrastructure — see supabase/functions/scan-cover/README.md.
 * A genuine failure to reach the function at all (never deployed, no
 * network) resolves to `null` so callers can treat that as "no scan
 * available" and simply not show the button, same as before this feature
 * existed. Once the function does respond, though, its own error message
 * (e.g. a Gemini quota/model error) is thrown rather than swallowed —
 * collapsing every failure to the same silent `null` made a real outage
 * indistinguishable from "the cover has no readable text," which is exactly
 * the wrong thing to hide from whoever's trying to find out why scanning
 * stopped working.
 *
 * Pre-fills editable fields only, never saves unattended: cover typography
 * and OCR/LLM accuracy both vary too much for more than a guess.
 */
export async function scanCoverText(imageUrl: string): Promise<CoverScanResult | null> {
  const { data, error } = await supabase.functions.invoke<{
    title: string | null;
    authors: string[];
    error?: string;
  }>('scan-cover', { body: { imageUrl } });

  if (error) {
    // supabase-js doesn't parse a non-2xx body into `data` — the function's
    // own error message lives in the raw Response on `error.context`.
    const detail = await (error as { context?: Response }).context?.json?.().catch(() => null);
    throw new Error(detail?.error ?? error.message);
  }
  if (!data) return null;
  if (data.error) throw new Error(data.error);

  return { title: data.title, authors: data.authors };
}
