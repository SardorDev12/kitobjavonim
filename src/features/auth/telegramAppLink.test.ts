import { describe, expect, it } from 'vitest';

import { rewriteTelegramAppLink } from './telegramAppLink';

describe('rewriteTelegramAppLink', () => {
  it('rewrites the full App Link callback, keeping its query', () => {
    expect(rewriteTelegramAppLink('https://app2863632339-login.tg.dev/tglogin?code=abc&state=x')).toBe(
      '/auth/telegram-oidc?code=abc&state=x'
    );
  });

  it('rewrites a bare /tglogin path too', () => {
    expect(rewriteTelegramAppLink('/tglogin?error=access_denied')).toBe('/auth/telegram-oidc?error=access_denied');
  });

  it('leaves unrelated links alone', () => {
    expect(rewriteTelegramAppLink('homelibrary://auth/telegram-oidc?code=abc')).toBe(
      'homelibrary://auth/telegram-oidc?code=abc'
    );
    expect(rewriteTelegramAppLink('/listing/123')).toBe('/listing/123');
  });

  it('does not match lookalike hosts or paths', () => {
    expect(rewriteTelegramAppLink('https://evil.example/tglogin?code=abc')).toBe('https://evil.example/tglogin?code=abc');
    expect(rewriteTelegramAppLink('https://app2863632339-login.tg.dev.evil.example/tglogin')).toBe(
      'https://app2863632339-login.tg.dev.evil.example/tglogin'
    );
    expect(rewriteTelegramAppLink('/tgloginx')).toBe('/tgloginx');
  });
});
