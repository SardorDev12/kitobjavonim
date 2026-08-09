const APP_SCHEME = 'homelibrary';
const ALLOWED_ORIGINS = ['http://localhost:8081', 'https://homelibrary.uz'];

function isAllowedRedirect(value) {
  let parsed;
  try { parsed = new URL(value); } catch { return false; }
  if (parsed.protocol === `${APP_SCHEME}:`) return true;
  return ALLOWED_ORIGINS.includes(parsed.origin);
}

const cases = [
  ['homelibrary://auth/callback',                 true,  'native deep link'],
  ['http://localhost:8081/auth/callback',         true,  'dev web'],
  ['https://homelibrary.uz/auth/callback',        true,  'production web'],
  ['https://attacker.example/steal',              false, 'open redirect to attacker'],
  ['https://homelibrary.uz.attacker.example/x',   false, 'lookalike suffix domain'],
  ['http://homelibrary.uz/auth/callback',         false, 'downgraded to http'],
  ['https://homelibrary.uz:8443/x',               false, 'unlisted port'],
  ['evilscheme://auth/callback',                  false, 'foreign scheme'],
  ['javascript:alert(1)',                         false, 'javascript: url'],
  ['not a url',                                   false, 'unparseable'],
  ['',                                            false, 'empty'],
];

let failures = 0;
for (const [input, expected, label] of cases) {
  const actual = isAllowedRedirect(input);
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${String(actual).padEnd(5)} ${label}`);
}
console.log(failures === 0 ? '\nAll redirect targets classified correctly.' : `\n${failures} FAILED`);
