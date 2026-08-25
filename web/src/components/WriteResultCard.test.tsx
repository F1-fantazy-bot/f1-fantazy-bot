import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { WriteResultCard } from './WriteResultCard';

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

describe('WriteResultCard localization', () => {
  test('renders Hebrew result-shell labels when uiLang is he', () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WriteResultCard
          result={{
            status: 'ok',
            tool: 'set_language',
            summary: 'השפה שונתה לעברית.',
            uiLang: 'he',
          }}
        />,
      );
    });

    expect(container.querySelector('[role="status"]')?.getAttribute('dir')).toBe(
      'rtl',
    );
    expect(container.textContent).toContain('בוצע');
    expect(container.textContent).toContain('פרטים');
    expect(container.textContent).toContain('השפה שונתה לעברית.');

    act(() => root.unmount());
    container.remove();
  });
});
