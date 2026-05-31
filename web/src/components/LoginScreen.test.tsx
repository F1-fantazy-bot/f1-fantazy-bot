import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { GoogleLoginProps } from '@react-oauth/google';
import { AuthProvider } from '../auth/AuthContext';
import { LoginScreen } from './LoginScreen';

let latestGoogleLoginProps: GoogleLoginProps | null = null;

vi.mock('@react-oauth/google', () => ({
  googleLogout: vi.fn(),
  GoogleLogin: (props: GoogleLoginProps) => {
    latestGoogleLoginProps = props;
    return <button type="button">Google sign in</button>;
  },
}));

function renderLoginScreen() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  act(() => {
    root.render(
      <AuthProvider>
        <LoginScreen />
      </AuthProvider>,
    );
  });

  return () => {
    act(() => {
      root.unmount();
    });
    container.remove();
  };
}

afterEach(() => {
  latestGoogleLoginProps = null;
  vi.clearAllMocks();
});

describe('LoginScreen', () => {
  test('enables Google One Tap automatic sign-in while keeping the button fallback', () => {
    const cleanup = renderLoginScreen();

    expect(latestGoogleLoginProps).toMatchObject({
      useOneTap: true,
      auto_select: true,
      theme: 'filled_blue',
      size: 'large',
      shape: 'rectangular',
    });
    expect(document.body.textContent).toContain('Google sign in');

    cleanup();
  });
});
