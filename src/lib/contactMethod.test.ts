import { describe, expect, it } from 'vitest';

import { hasContactMethod } from './contactMethod';
import type { Profile } from '@/types/database';

function profile(overrides: Partial<Profile>): Profile {
  return {
    id: 'u1',
    display_name: 'Test',
    avatar_url: null,
    bio: null,
    region_id: null,
    district_id: null,
    telegram_username: null,
    phone: null,
    show_phone: false,
    show_telegram: false,
    preferred_locale: 'en',
    plan: 'free',
    plan_expires_at: null,
    onboarded_at: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  } as Profile;
}

describe('hasContactMethod', () => {
  it('is false for null profile', () => {
    expect(hasContactMethod(null)).toBe(false);
  });

  it('is false when neither channel is shown', () => {
    expect(hasContactMethod(profile({ phone: '+998901234567', telegram_username: 'user' }))).toBe(false);
  });

  it('is true when phone is set and shown', () => {
    expect(hasContactMethod(profile({ phone: '+998901234567', show_phone: true }))).toBe(true);
  });

  it('is true when telegram is set and shown', () => {
    expect(hasContactMethod(profile({ telegram_username: 'user', show_telegram: true }))).toBe(true);
  });

  it('is false when shown but the value itself is empty', () => {
    expect(hasContactMethod(profile({ phone: null, show_phone: true }))).toBe(false);
  });
});
