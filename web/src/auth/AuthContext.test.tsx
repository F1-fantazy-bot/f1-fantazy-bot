import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { googleLogout } from '@react-oauth/google';
import { AuthProvider, decodeIdTokenClaims, useAuth } from './AuthContext';

vi.mock('@react-oauth/google', () => ({
  googleLogout: vi.fn(),
}));

const STORAGE_KEY = 'f1-fantasy-agent-id-token';

function encodeBase64Url(value: object): string {
  return window
    .btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(value))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeIdToken(exp: number, name = 'Driver'): string {
  return [
    encodeBase64Url({ alg: 'none', typ: 'JWT' }),
    encodeBase64Url({
      email: 'driver@example.com',
      name,
      sub: 'google-sub-1',
      exp,
    }),
    'signature',
  ].join('.');
}

function renderAuthProbe() {
  let signIn: ((idToken: string) => void) | null = null;
  let signOut: ReturnType<typeof useAuth>['signOut'] | null = null;
  let email: string | null = null;
  let name: string | null = null;

  function Probe() {
    const auth = useAuth();
    signIn = auth.signIn;
    signOut = auth.signOut;
    email = auth.session?.claims.email ?? null;
    name = auth.session?.claims.name ?? null;
    return null;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );
  });

  return {
    get signIn() {
      if (!signIn) throw new Error('signIn was not initialized');
      return signIn;
    },
    get signOut() {
      if (!signOut) throw new Error('signOut was not initialized');
      return signOut;
    },
    get name() {
      return name;
    },
    get email() {
      return email;
    },
    cleanup() {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

afterEach(() => {
  window.sessionStorage.clear();
  vi.clearAllMocks();
});

describe('AuthProvider signOut', () => {
  test('clears the local session without disabling Google auto-select by default', () => {
    const probe = renderAuthProbe();
    const token = makeIdToken(Math.floor(Date.now() / 1000) + 3600);

    act(() => {
      probe.signIn(token);
    });
    expect(probe.email).toBe('driver@example.com');

    act(() => {
      probe.signOut();
    });

    expect(googleLogout).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(probe.email).toBeNull();
    probe.cleanup();
  });

  test('disables Google auto-select for explicit sign-out', () => {
    const probe = renderAuthProbe();
    const token = makeIdToken(Math.floor(Date.now() / 1000) + 3600);

    act(() => {
      probe.signIn(token);
    });
    act(() => {
      probe.signOut({ disableGoogleAutoSelect: true });
    });

    expect(googleLogout).toHaveBeenCalledTimes(1);
    expect(window.sessionStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(probe.email).toBeNull();
    probe.cleanup();
  });
});


describe('UTF-8 profile names', () => {
  test.each(['חיים כהן', 'Driver', 'José', 'محمد', '赛车 🏎️'])(
    'preserves %s when decoding a Google ID token',
    (name) => {
      expect(decodeIdTokenClaims(makeIdToken(2000000000, name))?.name).toBe(name);
    },
  );

  test.each(['sign-in', 'stored session'])('preserves Hebrew on %s', (source) => {
    const name = 'חיים כהן';
    const token = makeIdToken(Math.floor(Date.now() / 1000) + 3600, name);
    if (source === 'stored session') window.sessionStorage.setItem(STORAGE_KEY, token);
    const probe = renderAuthProbe();
    try {
      if (source === 'sign-in') act(() => probe.signIn(token));
      expect(probe.name).toBe(name);
    } finally {
      probe.cleanup();
    }
  });

  test('rejects invalid UTF-8 rather than displaying replacement characters', () => {
    const payload = window.btoa('{"email":"test@example.com","sub":"1","name":"' +
      String.fromCharCode(0xff) + '"}');
    expect(decodeIdTokenClaims(`header.${payload}.signature`)).toBeNull();
  });
});
