/**
 * The Android App Link Telegram generated for this app in BotFather (Bot
 * Settings → Login Widget → Native Login → "App URL"). Telegram hosts the
 * domain's assetlinks.json itself, built from the package name and SHA-256
 * registered there, so a login returned through it provably reaches this
 * app, and Telegram names the app in its sign-in notification instead of
 * "Unverified App". Declared as a verified intent filter in app.config.js,
 * which must stay in sync with this host.
 */
export const TELEGRAM_APP_LINK_HOST = 'app2863632339-login.tg.dev';
export const TELEGRAM_APP_LINK_PATH = '/tglogin';

/**
 * Rewrites Telegram's App Link callback onto the existing auth/telegram-oidc
 * route, which already finishes the sign-in. Anything else passes through
 * untouched. `path` may arrive as a full URL or as a bare path, depending on
 * how the router received it, so both forms are handled.
 */
export function rewriteTelegramAppLink(path: string): string {
  const queryStart = path.indexOf('?');
  const query = queryStart === -1 ? '' : path.slice(queryStart);
  const base = queryStart === -1 ? path : path.slice(0, queryStart);

  const bareMatch = base === TELEGRAM_APP_LINK_PATH || base.startsWith(`${TELEGRAM_APP_LINK_PATH}/`);
  const fullMatch =
    base === `https://${TELEGRAM_APP_LINK_HOST}${TELEGRAM_APP_LINK_PATH}` ||
    base.startsWith(`https://${TELEGRAM_APP_LINK_HOST}${TELEGRAM_APP_LINK_PATH}/`);

  return bareMatch || fullMatch ? `/auth/telegram-oidc${query}` : path;
}
