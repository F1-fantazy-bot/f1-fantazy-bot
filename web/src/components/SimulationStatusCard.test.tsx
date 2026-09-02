import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import {
  SimulationStatusCard,
  type SimulationStatusResult,
} from './SimulationStatusCard';

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

function renderCard(result?: SimulationStatusResult) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<SimulationStatusCard result={result} />));

  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe('SimulationStatusCard', () => {
  test('renders safe shared simulation metadata and availability counts', () => {
    const rendered = renderCard({
      status: 'ok',
      lang: 'en',
      source: { kind: 'simulation', name: 'Monza simulation' },
      matchday: 16,
      freshness: { status: 'fresh', updatedAtLocal: '2 Sept 2026, 14:00' },
      available: { drivers: 22, constructors: 11 },
      projections: {
        drivers: [
          { code: 'VER', price: 30.5, expectedPoints: 25, expectedPriceChange: 0.2 },
        ],
        constructors: [
          { code: 'MCL', price: 25, expectedPoints: 30, expectedPriceChange: -0.1 },
        ],
      },
    });

    expect(rendered.container.querySelector('article')).not.toBeNull();
    expect(rendered.container.textContent).toContain('Simulation status');
    expect(rendered.container.textContent).toContain('Monza simulation');
    expect(rendered.container.textContent).toContain('Current');
    expect(rendered.container.textContent).toContain('Available drivers');
    expect(rendered.container.textContent).toContain('22');
    expect(rendered.container.textContent).toContain('Simulation data');
    expect(rendered.container.textContent).toContain('Driver projections');
    expect(rendered.container.textContent).toContain('Constructor projections');
    expect(rendered.container.textContent).toContain('VER');
    expect(rendered.container.textContent).toContain('MCL');
    expect(rendered.container.textContent).toContain('2 Sept 2026, 14:00');
    expect(rendered.container.textContent).not.toContain('UTC');
    expect(rendered.container.textContent).not.toContain('storage');
    rendered.cleanup();
  });

  test('labels a previous-race simulation as old without using its timestamp age', () => {
    const rendered = renderCard({
      status: 'ok',
      lang: 'he',
      source: { kind: 'simulation', name: 'Zandvoort. Post-SQ.' },
      freshness: { status: 'stale' },
      available: { drivers: 22, constructors: 11 },
    });

    expect(rendered.container.textContent).toContain(
      'ישן',
    );
    expect(rendered.container.querySelector('dd')?.textContent).toBe(
      'Zandvoort. Post-SQ.',
    );
    rendered.cleanup();
  });

  test('renders the Hebrew not-loaded state in RTL', () => {
    const rendered = renderCard({ status: 'not_loaded', lang: 'he' });

    expect(rendered.container.firstElementChild?.getAttribute('dir')).toBe('rtl');
    expect(rendered.container.textContent).toContain('נתוני סימולציה עדיין אינם זמינים');
    expect(rendered.container.textContent).toContain('אפשר לנסות שוב');
    rendered.cleanup();
  });

  test('renders an error state for missing or failed payloads', () => {
    const rendered = renderCard({ status: 'error', lang: 'en' });
    expect(rendered.container.querySelector('[role="alert"]')).not.toBeNull();
    expect(rendered.container.textContent).toContain('cannot be displayed');
    rendered.cleanup();
  });
});
