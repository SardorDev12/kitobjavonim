import type { Profile } from '@/types/database';

/** True once the user can actually be reached — required before listing a book. */
export function hasContactMethod(profile: Profile | null): boolean {
  if (!profile) return false;
  return (
    Boolean(profile.telegram_username && profile.show_telegram) ||
    Boolean(profile.phone && profile.show_phone)
  );
}
