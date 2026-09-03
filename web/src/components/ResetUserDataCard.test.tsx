import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it } from 'vitest';
import { UiLanguageProvider } from './uiLanguage';
import { ResetUserDataCard } from './ResetUserDataCard';

const impact = {
  teamBlobs: 2,
  selectedTeam: true,
  rankingPreferences: 2,
  selectedBestTeams: 1,
  chipPreferences: 2,
  driverProjectionOverride: true,
  constructorProjectionOverride: false,
};

describe('ResetUserDataCard', () => {
  it('renders the safe reset result without raw data in English', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(
      <UiLanguageProvider initialLanguage="en">
        <ResetUserDataCard
          result={{
            status: 'ok',
            tool: 'reset_user_data',
            uiLang: 'en',
            impact,
            summary: 'Your saved F1 Fantasy data was reset.',
          }}
        />
      </UiLanguageProvider>,
    ));

    expect(container.querySelector('[aria-label="User data reset"]')?.getAttribute('dir')).toBe('ltr');
    expect(container.textContent).toContain('Deleted teams');
    expect(container.textContent).not.toContain('{');
    act(() => root.unmount());
    container.remove();
  });

  it('uses Hebrew and RTL for the saved-language result', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => root.render(
      <UiLanguageProvider initialLanguage="he">
        <ResetUserDataCard
          result={{
            status: 'ok',
            tool: 'reset_user_data',
            uiLang: 'he',
            impact,
            summary: 'הנתונים אופסו.',
          }}
        />
      </UiLanguageProvider>,
    ));

    expect(container.querySelector('[aria-label="נתוני המשתמש אופסו"]')?.getAttribute('dir')).toBe('rtl');
    expect(container.textContent).toContain('קבוצות שנמחקו');
    act(() => root.unmount());
    container.remove();
  });
});
