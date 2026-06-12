import { describe, expect, test } from 'vitest';
import { instanceRoute, routePath, withQueryParam } from './path';

describe('nullstack path helpers', () => {
  test('encodes instance route segments', () => {
    expect(instanceRoute('null claw', 'agent/one')).toBe('/team/instances/null%20claw/agent%2Fone');
  });

  test('updates query parameters without dropping the hash', () => {
    expect(withQueryParam('/work/tasks?space=old#results', 'space', 'alpha space')).toBe(
      '/work/tasks?space=alpha+space#results'
    );
  });

  test('removes search and hash details for active-route matching', () => {
    expect(routePath('/orders?space=alpha#loops')).toBe('/orders');
  });
});
