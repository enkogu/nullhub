import { describe, expect, test, vi } from 'vitest';
import type { Space, SpacesApi } from '$lib/api/spaces';
import { SELECTED_SPACE_STORAGE_KEY, SpacesStore } from '$lib/stores/spaces.svelte';

function createMemoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      values.delete(key);
    }),
  };
}

function createSpacesApi(spaces: Space[]): SpacesApi {
  return {
    listSpaces: vi.fn(async () => spaces),
    createSpace: vi.fn(async (input) => ({
      id: input.id ?? 'created',
      name: input.name,
      kind: input.kind ?? 'workspace',
      stage: input.stage ?? 'active',
    })),
    updateSpace: vi.fn(async (spaceId, input) => ({
      id: spaceId,
      name: input.name ?? 'Updated',
      kind: input.kind ?? 'workspace',
      stage: input.stage ?? 'active',
    })),
    scopedPath: vi.fn((path) => path),
  };
}

describe('spaces store', () => {
  test('loads spaces and selects the URL space before persisted storage', async () => {
    const storage = createMemoryStorage({ [SELECTED_SPACE_STORAGE_KEY]: 'lab' });
    const history = { replaceState: vi.fn() };
    const store = new SpacesStore({
      api: createSpacesApi([{ id: 'ops', name: 'Operations', kind: 'workspace', stage: 'active' }]),
      storage,
      location: { href: 'https://studio.local/work?space=ops' },
      history,
    });

    await expect(store.load()).resolves.toHaveLength(1);
    expect(store.selectedSpaceId).toBe('ops');
    expect(store.selectedSpace).toEqual({ id: 'ops', name: 'Operations', kind: 'workspace', stage: 'active' });
    expect(store.status).toBe('ready');
  });

  test('persists selection to localStorage and the space query parameter', () => {
    const storage = createMemoryStorage();
    const history = { replaceState: vi.fn() };
    const store = new SpacesStore({
      api: createSpacesApi([]),
      storage,
      location: { href: 'https://studio.local/work?tab=live' },
      history,
    });

    store.selectSpace('ops');

    expect(storage.setItem).toHaveBeenCalledWith(SELECTED_SPACE_STORAGE_KEY, 'ops');
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/work?tab=live&space=ops');
    expect(store.selectedSpaceQuery).toEqual({ space: 'ops' });
  });

  test('supports persisted All mode by removing the URL scope', () => {
    const storage = createMemoryStorage({ [SELECTED_SPACE_STORAGE_KEY]: 'ops' });
    const history = { replaceState: vi.fn() };
    const store = new SpacesStore({
      api: createSpacesApi([]),
      storage,
      location: { href: 'https://studio.local/work?space=ops&tab=live#runs' },
      history,
    });

    store.selectAll();

    expect(store.selectedSpaceId).toBeNull();
    expect(store.isAllSelected).toBe(true);
    expect(store.selectedSpaceQuery).toEqual({ space: undefined });
    expect(storage.setItem).toHaveBeenCalledWith(SELECTED_SPACE_STORAGE_KEY, '__all__');
    expect(history.replaceState).toHaveBeenCalledWith(null, '', '/work?tab=live#runs');
  });
});
