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
 * If the function was never deployed, this fails closed rather than
 * throwing, so callers can treat `null` as "no scan available" and simply
 * not show the button, same as before this feature existed.
 *
 * Pre-fills editable fields only, never saves unattended: cover typography
 * and OCR/LLM accuracy both vary too much for more than a guess.
 */
export async function scanCoverText(imageUrl: string): Promise<CoverScanResult | null> {
  try {
    const { data, error } = await supabase.functions.invoke<{
      title: string | null;
      authors: string[];
      error?: string;
    }>('scan-cover', { body: { imageUrl } });

    if (error || !data || data.error) return null;
    return { title: data.title, authors: data.authors };
  } catch {
    return null;
  }
}
