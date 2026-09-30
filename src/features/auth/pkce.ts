// Pure helpers for PKCE (RFC 7636), kept free of React Native imports so they
// can be unit-tested directly. The random bytes and SHA-256 digest themselves
// come from expo-crypto in telegramOidc.ts.

// Exactly 64 characters, all from RFC 7636's unreserved set, so `byte & 63`
// maps every byte to a character with no modulo bias.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/** A code_verifier (or state) string, one character per random byte. */
export function randomStringFromBytes(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += ALPHABET[byte & 63];
  return out;
}

/** code_challenge = BASE64URL(SHA256(verifier)) — this converts the standard-base64 digest. */
export function base64ToBase64Url(base64: string): string {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
