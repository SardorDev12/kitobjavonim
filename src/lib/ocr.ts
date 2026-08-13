import { Platform } from 'react-native';

export type CoverScanResult = {
  title: string | null;
  authors: string[];
};

const LANGS = 'eng+rus';

/**
 * Free, client-side cover OCR — Tesseract.js, no API key, no server to run.
 *
 * Web only. Tesseract.js needs Web Workers and WASM the way a browser
 * provides them; Hermes (React Native's JS engine on iOS/Android) does not,
 * and a real native OCR module would mean a native rebuild this environment
 * has no device to verify — so the feature is scoped to where it can
 * actually be tested. The import is dynamic and this function returns before
 * ever reaching it on native, so the module is never evaluated there even
 * though Metro still bundles it.
 *
 * This is a heuristic, not a lookup: the tallest line(s) of text on a cover
 * are almost always the title, and a nearby line shaped like "First Last" —
 * optionally preceded by "by" — is guessed as the author. Both are meant to
 * pre-fill editable fields, never to save unattended; cover typography and
 * OCR accuracy vary too much for more than that.
 */
export async function scanCoverText(imageUrl: string): Promise<CoverScanResult | null> {
  if (Platform.OS !== 'web') return null;

  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker(LANGS);

  try {
    const { data } = await worker.recognize(imageUrl, {}, { blocks: true });

    const lines = (data.blocks ?? [])
      .flatMap((block) => block.paragraphs)
      .flatMap((paragraph) => paragraph.lines)
      .map((line) => ({ text: line.text.trim(), height: line.bbox.y1 - line.bbox.y0 }))
      .filter((line) => line.text.length > 0);

    if (lines.length === 0) return null;

    const maxHeight = Math.max(...lines.map((line) => line.height));
    // A hard equality check on line height would miss a title's own second
    // line — real rendering varies a few px even within "the same" font size.
    const titleLines = lines.filter((line) => line.height >= maxHeight * 0.85);
    const title = titleLines.map((line) => line.text).join(' ').trim() || null;

    const remaining = lines.filter((line) => !titleLines.includes(line));
    const authorLine = remaining.find((line) =>
      /^(by[:\s]+)?[A-ZА-ЯЁ][\wʻʼ'’-]+(\s+[A-ZА-ЯЁ][\wʻʼ'’-]+){0,3}$/.test(line.text)
    );
    const authors = authorLine ? [authorLine.text.replace(/^by[:\s]+/i, '').trim()] : [];

    return { title, authors };
  } finally {
    await worker.terminate();
  }
}
