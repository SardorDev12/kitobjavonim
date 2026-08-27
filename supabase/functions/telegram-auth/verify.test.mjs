import crypto from 'node:crypto';

const BOT_TOKEN = '123456789:AAHtest_token_value_for_verification';

// Build a payload exactly as Telegram's Login Widget sends it.
const user = {
  auth_date: String(Math.floor(Date.now() / 1000)),
  first_name: 'Ali',
  id: '987654321',
  last_name: 'Karimov',
  photo_url: 'https://t.me/i/userpic/320/abc.jpg',
  username: 'ali_uz',
};

// Telegram's documented algorithm, computed independently with Node's crypto.
const dataCheckString = Object.keys(user).sort().map((k) => `${k}=${user[k]}`).join('\n');
const secret = crypto.createHash('sha256').update(BOT_TOKEN).digest();
const expectedHash = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex');

// Now the function's implementation, using WebCrypto the way Deno does.
async function isSignatureValid(payload, botToken) {
  const { hash, ...fields } = payload;
  if (!hash) return false;
  const dcs = Object.keys(fields).sort().map((k) => `${k}=${fields[k]}`).join('\n');
  const enc = new TextEncoder();
  const secretKey = await crypto.webcrypto.subtle.digest('SHA-256', enc.encode(botToken));
  const key = await crypto.webcrypto.subtle.importKey('raw', secretKey, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.webcrypto.subtle.sign('HMAC', key, enc.encode(dcs));
  const actual = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return actual.length === hash.length && crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(hash));
}

const valid = { ...user, hash: expectedHash };
const tampered = { ...user, id: '111111111', hash: expectedHash };
const badHash = { ...user, hash: 'f'.repeat(64) };

console.log('data_check_string:\n' + dataCheckString + '\n');
console.log('genuine payload accepted:      ', await isSignatureValid(valid, BOT_TOKEN));
console.log('tampered telegram id rejected: ', !(await isSignatureValid(tampered, BOT_TOKEN)));
console.log('forged hash rejected:          ', !(await isSignatureValid(badHash, BOT_TOKEN)));
console.log('wrong bot token rejected:      ', !(await isSignatureValid(valid, BOT_TOKEN + 'x')));
