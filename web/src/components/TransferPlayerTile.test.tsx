import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, test } from 'vitest';
import { TransferPlayerTile } from './TransferPlayerTile';
import manifest from '../assets/playerAssets.json';

function renderPlayer(name: string | undefined, code: string, ambiguousCode = false) {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => root.render(<TransferPlayerTile player={{ id: 'stored-player-id', name, code, ambiguousCode }} kind="driver" he />));
  return { container, cleanup() { act(() => root.unmount()); } };
}

test.each([
  ['L. Norris', 'NOR'], ['C. Leclerc', 'LEC'], ['F. Alonso', 'ALO'],
  ['K. Antonelli', 'ANT'], ['A. Albon', 'ALB'], ['N. Hulkenberg', 'HUL'],
  ['Y. Tsunoda', 'TSU'], ['J. Doohan', 'DOO'], ['Nico Hülkenberg', 'HUL'],
])('stored name %s resolves its verified portrait', (name, code) => {
  const view = renderPlayer(name, code);
  expect(view.container.querySelector('img')?.getAttribute('src')).toBe(manifest.players.find((p) => p.code === code)?.imageUrl);
  expect(view.container.textContent).toContain(name);
  view.cleanup();
});

test('unknown names and ambiguous code-only identities keep their fallback', () => {
  for (const name of ['Another Norris', undefined]) {
    const view = renderPlayer(name, 'NOR', true);
    expect(view.container.querySelector('img')).toBeNull();
    expect(view.container.textContent).toContain('NOR');
    view.cleanup();
  }
});

test('failed alias portrait preserves the name and code', () => {
  const view = renderPlayer('L. Norris', 'NOR');
  act(() => view.container.querySelector('img')!.dispatchEvent(new Event('error')));
  expect(view.container.querySelector('img')).toBeNull();
  expect(view.container.textContent).toContain('L. Norris');
  expect(view.container.textContent).toContain('NOR');
  view.cleanup();
});
