import { rewriteTelegramAppLink } from '@/features/auth/telegramAppLink';

// Incoming native links are processed here before routing. The only rewrite is
// Telegram's verified App Link login callback (see telegramAppLink.ts).
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return rewriteTelegramAppLink(path);
}
