import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { googleLogout } from '@react-oauth/google';
import { AuthProvider, useAuth } from './AuthContext';

vi.mock('@react-oauth/google', () => ({
  googleLogout: vi.fn(),
}));

const STORAGE_KEY = 'f1-fantasy-agent-id-token';

function encodeBase64Url(value: object): string {
  return window
    .btoa(JSON.stringify(value))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeIdToken(exp: number): string {
  return [
    encodeBase64Url({ alg: 'none', typ: 'JWT' }),
    encodeBase64Url({
      email: 'driver@example.com',
      name: 'Driver',
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

  function Probe() {
    const auth = useAuth();
    signIn = auth.signIn;
    signOut = auth.signOut;
    email = auth.session?.claims.email ?? null;
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
