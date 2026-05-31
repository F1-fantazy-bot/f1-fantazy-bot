import { afterEach, describe, expect, test, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  persistTheme,
  resolveInitialTheme,
} from './theme';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.body.removeAttribute('data-theme');
  document.documentElement.classList.remove('dark');
  document.body.classList.remove('dark');
  document.documentElement.style.colorScheme = '';
  vi.restoreAllMocks();
});

describe('theme preferences', () => {
  test('uses stored theme before system preference', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    vi.spyOn(window, 'matchMedia').mockReturnValue({
      matches: false,
    } as MediaQueryList);

    expect(resolveInitialTheme()).toBe('dark');
  });

  test('applies dark theme to document roots', () => {
    applyTheme('dark');

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.body.dataset.theme).toBe('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(document.body.classList.contains('dark')).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe('dark');
  });

  test('persists explicit theme preference', () => {
    persistTheme('light');

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('light');
  });
});
