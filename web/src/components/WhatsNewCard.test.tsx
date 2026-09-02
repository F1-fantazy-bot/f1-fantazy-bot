import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { WhatsNewCard, type WhatsNewResult } from './WhatsNewCard';

beforeAll(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(() => {
  delete (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT?: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT;
});

function renderCard(result: WhatsNewResult) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<WhatsNewCard result={result} />));

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('WhatsNewCard', () => {
  test('renders a safe, structured English release announcement', () => {
    const rendered = renderCard({
      status: 'ok',
      lang: 'en',
      announcement: {
        id: 'release-1',
        createdAt: '2026-04-29T07:58:42Z',
        version: 'wow',
        text: 'Lights out!\n\n*New tools*\n- Use /follow_league\n- Read /whats_new',
      },
    });

    expect(rendered.container.querySelector('article')).not.toBeNull();
    expect(rendered.container.querySelector('strong')?.textContent).toBe('New tools');
    expect(rendered.container.querySelectorAll('li')).toHaveLength(2);
    expect(rendered.container.textContent).toContain('Special release');
    expect(rendered.container.textContent).toContain('Updated:');
    expect(rendered.container.textContent).toContain('/follow_league');
    rendered.cleanup();
  });

  test('renders Hebrew labels and RTL without interpreting source text as HTML', () => {
    const rendered = renderCard({
      status: 'ok',
      lang: 'he',
      announcement: {
        createdAt: '2026-04-29T07:58:42Z',
        version: 'standard',
        text: 'עדכון *חשוב* <img src=x onerror=alert(1)>\n\n- /follow_league',
      },
    });

    expect(rendered.container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(rendered.container.textContent).toContain('מה חדש');
    expect(rendered.container.textContent).toContain('עדכון גרסה');
    expect(rendered.container.querySelector('img')).toBeNull();
    expect(rendered.container.textContent).toContain('<img src=x onerror=alert(1)>');
    rendered.cleanup();
  });

  test.each([
    ['empty', 'No release notes are available yet'],
    ['error', 'cannot be displayed'],
  ] as const)('renders the %s state', (status, expected) => {
    const rendered = renderCard({ status, lang: 'en' });
    expect(rendered.container.textContent).toContain(expected);
    rendered.cleanup();
  });

  test('renders an error state for malformed successful payloads', () => {
    const rendered = renderCard({ status: 'ok', lang: 'en', announcement: null });
    expect(rendered.container.textContent).toContain('cannot be displayed');
    rendered.cleanup();
  });
});
