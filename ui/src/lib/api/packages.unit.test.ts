import { afterEach, describe, expect, test, vi } from 'vitest';
import { createPackagesApi } from './packages';
import { ALL_SPACES_STORAGE_VALUE, SELECTED_SPACE_STORAGE_KEY } from './spaces';
import { installApiFixture, jsonFixture, type InstalledApiFixture } from './__fixtures__/backend';

let fixture: InstalledApiFixture | null = null;
const originalLocalStorage = globalThis.localStorage;

const catalogPackage = {
  id: 'builtin.loop-templates',
  name: 'Built-in Loop Templates',
  version: '1.0.0',
  scale: 'kit',
  summary: 'Local Loop catalog seeds.',
  requires: [
    { kind: 'package', id: 'builtin.nullclaw-agent' },
    { kind: 'component', name: 'nulltickets' },
  ],
  contributes: [{ kind: 'loop_template', name: 'Test Until Green' }],
  config: { taxonomy: 'loops', install_target: 'nulltickets.loop_library' },
  seeds: [{ kind: 'loop_template', slug: 'test-until-green' }],
  extends: ['builtin.nullclaw-agent'],
  charter: {
    mission: 'Install durable Loop templates.',
    autonomy_bounds: ['Loop execution writes Work evidence.'],
    metrics: ['loop_templates_installed'],
  },
};

function installSelectedSpace(spaceId: string | null) {
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => {
        if (key !== SELECTED_SPACE_STORAGE_KEY) return null;
        return spaceId === null ? ALL_SPACES_STORAGE_VALUE : spaceId;
      }),
    },
  });
}

function withQuery(path: string, params: Record<string, string | number | boolean | null | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${path}?${query}` : path;
}

afterEach(() => {
  fixture?.restore();
  fixture = null;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
});

describe('packages api', () => {
  test('normalizes built-in package manifests into market taxonomy fields', async () => {
    fixture = installApiFixture([
      {
        method: 'GET',
        path: '/api/market/catalog',
        handler: () => jsonFixture({ packages: [catalogPackage] }),
      },
    ]);
    const api = createPackagesApi((path) => fetch(`/api${path}`).then((res) => res.json()), withQuery);

    const result = await api.listCatalogPackages();

    expect(result.packages).toHaveLength(1);
    expect(result.packages[0]).toMatchObject({
      id: 'builtin.loop-templates',
      itemType: 'loop',
      itemTypeLabel: 'Loops',
      stage: 'starter',
      stageLabel: 'Starter',
      installTarget: 'nulltickets.loop_library',
    });
    expect(result.packages[0].requires.map((requirement) => requirement.label)).toEqual(['Package', 'Component']);
    expect(result.packages[0].contributes[0]).toMatchObject({ label: 'Loop', name: 'Test Until Green' });
  });

  test('reads installed packages from the selected space', async () => {
    installSelectedSpace('ops');
    fixture = installApiFixture([
      {
        method: 'GET',
        path: '/api/market/installed?space=ops',
        handler: () => jsonFixture({ packages: [] }),
      },
    ]);
    const api = createPackagesApi((path) => fetch(`/api${path}`).then((res) => res.json()), withQuery);

    await expect(api.listInstalledPackages()).resolves.toEqual({ packages: [] });
    expect(fixture.requests[0].path).toBe('/api/market/installed?space=ops');
  });

  test('requires a selected space for installed package reads', async () => {
    installSelectedSpace(null);
    const api = createPackagesApi((path) => fetch(`/api${path}`).then((res) => res.json()), withQuery);

    await expect(api.listInstalledPackages()).rejects.toThrow('Packages API requires a selected Space.');
  });
});
