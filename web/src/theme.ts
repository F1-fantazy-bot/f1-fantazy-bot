export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'f1-fantazy-agent-theme';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function resolveInitialTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'light';

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeMode(stored)) return stored;
  } catch {
    // Ignore storage failures; system preference is a safe fallback.
  }

  return window.matchMedia?.('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function persistTheme(theme: ThemeMode): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is non-critical.
  }
}

export function applyTheme(theme: ThemeMode): void {
  if (typeof document === 'undefined') return;

  const targets = [document.documentElement, document.body].filter(Boolean);
  for (const target of targets) {
    target.dataset.theme = theme;
    target.classList.toggle('dark', theme === 'dark');
  }

  document.documentElement.style.colorScheme = theme;
}
