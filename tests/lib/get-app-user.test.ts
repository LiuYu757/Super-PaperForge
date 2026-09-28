import { describe, it, expect } from 'vitest';
import { getAppUser } from '@/lib/session';

describe('getAppUser', () => {
  it('returns null for null / undefined session', () => {
    expect(getAppUser(null)).toBeNull();
    expect(getAppUser(undefined)).toBeNull();
  });

  it('returns null when session has no user', () => {
    expect(getAppUser({})).toBeNull();
  });

  it('returns null when user.id is missing or not a string', () => {
    expect(getAppUser({ user: {} })).toBeNull();
    expect(getAppUser({ user: { id: 42 } })).toBeNull();
    expect(getAppUser({ user: { id: null } })).toBeNull();
  });

  it('returns a typed user when id is present', () => {
    const u = getAppUser({
      user: {
        id: 'user-uuid',
        email: 'a@b.com',
        name: 'Ada',
        image: 'data:image/png;base64,xxx',
        role: 'admin',
      },
    });
    expect(u).toEqual({
      id: 'user-uuid',
      email: 'a@b.com',
      name: 'Ada',
      image: 'data:image/png;base64,xxx',
      role: 'admin',
    });
  });

  it('defaults role to "user" when missing', () => {
    const u = getAppUser({ user: { id: 'x' } });
    expect(u?.role).toBe('user');
  });

  it('coerces non-string optional fields to null', () => {
    const u = getAppUser({
      user: { id: 'x', email: 42, name: null, image: undefined, role: true },
    });
    expect(u?.email).toBeNull();
    expect(u?.name).toBeNull();
    expect(u?.image).toBeNull();
    expect(u?.role).toBe('user');
  });
});
