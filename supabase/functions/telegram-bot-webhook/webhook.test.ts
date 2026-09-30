import { describe, expect, it } from 'vitest';

/** Mirrors index.ts's /start parsing and buildLoginUrl — see telegram-auth/verify.test.ts for why this is reimplemented, not imported. */
function parseStartPlatform(text: string): 'web' | 'native' | null {
  const match = /^\/start(?:@\S+)?(?:\s+(\S+))?/.exec(text);
  if (!match) return null;
  return match[1] === 'native' ? 'native' : 'web';
}

function buildLoginUrl(platform: 'web' | 'native', env: { appScheme: string; webOrigin: string }): string {
  const redirectTo = platform === 'native' ? `${env.appScheme}://auth/callback` : `${env.webOrigin}/auth/callback`;

  // Must be on the bound web origin, never the Edge Function's own
  // *.supabase.co domain — Telegram rejects a login_url whose own `url`
  // isn't the domain registered via /setdomain (BOT_DOMAIN_INVALID),
  // confirmed against a real deploy. See telegram-login.tsx.
  const url = new URL(`${env.webOrigin}/auth/telegram-login`);
  url.searchParams.set('redirect_to', redirectTo);
  if (platform === 'native') url.searchParams.set('origin', env.webOrigin);

  return url.toString();
}

const ENV = {
  appScheme: 'homelibrary',
  webOrigin: 'https://homelibrary.uz',
};

describe('telegram-bot-webhook /start parsing', () => {
  it('treats a bare /start as web', () => {
    expect(parseStartPlatform('/start')).toBe('web');
  });

  it('reads the native payload', () => {
    expect(parseStartPlatform('/start native')).toBe('native');
  });

  it('reads the web payload', () => {
    expect(parseStartPlatform('/start web')).toBe('web');
  });

  it('defaults an unrecognized payload to web', () => {
    expect(parseStartPlatform('/start something-else')).toBe('web');
  });

  it('handles the @botname suffix Telegram adds in group chats', () => {
    expect(parseStartPlatform('/start@home_library_signin_bot native')).toBe('native');
  });

  it('is not a /start command at all', () => {
    expect(parseStartPlatform('hello')).toBeNull();
    expect(parseStartPlatform('/help')).toBeNull();
  });
});

describe('telegram-bot-webhook login_url construction', () => {
  it('always targets telegram-login.tsx on the bound web origin, never the Edge Function directly', () => {
    expect(new URL(buildLoginUrl('web', ENV)).origin).toBe('https://homelibrary.uz');
    expect(new URL(buildLoginUrl('native', ENV)).origin).toBe('https://homelibrary.uz');
  });

  it('builds a plain callback redirect for web, with no origin bounce param', () => {
    const url = new URL(buildLoginUrl('web', ENV));
    expect(url.pathname).toBe('/auth/telegram-login');
    expect(url.searchParams.get('redirect_to')).toBe('https://homelibrary.uz/auth/callback');
    expect(url.searchParams.has('origin')).toBe(false);
  });

  it('builds a custom-scheme redirect for native, with the web origin as the bounce point', () => {
    const url = new URL(buildLoginUrl('native', ENV));
    expect(url.searchParams.get('redirect_to')).toBe('homelibrary://auth/callback');
    expect(url.searchParams.get('origin')).toBe('https://homelibrary.uz');
  });
});
