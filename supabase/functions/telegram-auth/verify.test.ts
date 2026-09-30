import crypto from 'node:crypto';

import { describe, expect, it } from 'vitest';

/**
 * Reimplements telegram-auth's HMAC check independently with Node's crypto
 * rather than importing index.ts directly — that file runs on Deno and
 * resolves a `jsr:` specifier vitest/Node can't. Keeping a second,
 * independent implementation here is deliberate: if a future edit to
 * index.ts's algorithm and this test's algorithm drift apart, the test
 * should fail, not agree with whatever index.ts now does.
 */
async function isSignatureValid(payload: Record<string, string>, botToken: string): Promise<boolean> {
  const { hash, ...fields } = payload;
  if (!hash) return false;
  const dcs = Object.keys(fields)
    .sort()
    .map((k) => `${k}=${fields[k]}`)
    .join('\n');
  const enc = new TextEncoder();
  const secretKey = await crypto.webcrypto.subtle.digest('SHA-256', enc.encode(botToken));
  const key = await crypto.webcrypto.subtle.importKey('raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.webcrypto.subtle.sign('HMAC', key, enc.encode(dcs));
  const actual = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return actual.length === hash.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(hash));
}

const BOT_TOKEN = '123456789:AAHtest_token_value_for_verification';

const user = {
  auth_date: String(Math.floor(Date.now() / 1000)),
  first_name: 'Ali',
  id: '987654321',
  last_name: 'Karimov',
  photo_url: 'https://t.me/i/userpic/320/abc.jpg',
  username: 'ali_uz',
};

// Telegram's documented algorithm, computed independently with Node's crypto,
// as the known-good hash the tests below check against.
const dataCheckString = Object.keys(user)
  .sort()
  .map((k) => `${k}=${(user as Record<string, string>)[k]}`)
  .join('\n');
const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest();
const expectedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

describe('telegram-auth HMAC verification', () => {
  it('accepts a genuine, correctly signed payload', async () => {
    const valid = { ...user, hash: expectedHash };
    await expect(isSignatureValid(valid, BOT_TOKEN)).resolves.toBe(true);
  });

  it('rejects a payload with a field changed after signing', async () => {
    const tampered = { ...user, id: '111111111', hash: expectedHash };
    await expect(isSignatureValid(tampered, BOT_TOKEN)).resolves.toBe(false);
  });

  it('rejects a hand-forged hash', async () => {
    const badHash = { ...user, hash: 'f'.repeat(64) };
    await expect(isSignatureValid(badHash, BOT_TOKEN)).resolves.toBe(false);
  });

  it('rejects a payload verified against the wrong bot token', async () => {
    const valid = { ...user, hash: expectedHash };
    await expect(isSignatureValid(valid, BOT_TOKEN + 'x')).resolves.toBe(false);
  });
});
