import { afterEach, describe, expect, test, vi } from 'vitest';
import { api, nullBoilerApi, nullTicketsStoreApi } from './client';
import { ALL_SPACES_STORAGE_VALUE, SELECTED_SPACE_STORAGE_KEY } from './spaces';
import {
  coreApiFixtureRoutes,
  statusFixture,
} from './__fixtures__/handlers';
import {
  installApiFixture,
  jsonFixture,
  type InstalledApiFixture,
} from './__fixtures__/backend';

let fixture: InstalledApiFixture | null = null;
const originalLocalStorage = globalThis.localStorage;

function storageValue(spaceId: string | null) {
  return spaceId === null ? ALL_SPACES_STORAGE_VALUE : spaceId;
}

function installSelectedSpace(spaceId: string | null) {
  let value = storageValue(spaceId);
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: vi.fn((key: string) => (key === SELECTED_SPACE_STORAGE_KEY ? value : null)),
    },
  });
  return (nextSpaceId: string | null) => {
    value = storageValue(nextSpaceId);
  };
}

afterEach(() => {
  fixture?.restore();
  fixture = null;
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: originalLocalStorage,
  });
});

describe('api client fake backend fixture', () => {
  test('serves JSON fixtures through the client request path', async () => {
    fixture = installApiFixture(coreApiFixtureRoutes);

    await expect(api.getStatus()).resolves.toEqual(statusFixture);
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]).toMatchObject({
      method: 'GET',
      path: '/api/status',
    });
  });

  test('appends the selected space to product read requests', async () => {
    installSelectedSpace('ops');
    fixture = installApiFixture([
      ...coreApiFixtureRoutes,
      {
        method: 'GET',
        path: '/api/instances?space=ops',
        handler: () => ({ body: { instances: [] } }),
      },
      {
        method: 'GET',
        path: '/api/usage?window=7d',
        handler: () => ({ body: { totals: { total_tokens: 0, requests: 0 }, by_instance: [], by_model: [], timeseries: [] } }),
      },
      {
        method: 'GET',
        path: '/api/providers?reveal=true&space=ops',
        handler: () => ({ body: { providers: [] } }),
      },
      {
        method: 'GET',
        path: '/api/channels?space=ops',
        handler: () => ({ body: { channels: [] } }),
      },
      {
        method: 'GET',
        path: '/api/instances/nullclaw/agent/config?space=ops',
        handler: () => ({ body: { config: {} } }),
      },
      {
        method: 'GET',
        path: '/api/nullboiler/runs?limit=1&space=ops',
        handler: () => ({ body: { items: [], has_more: false } }),
      },
      {
        method: 'POST',
        path: '/api/instances/nulltickets/tickets/tickets?space=ops',
        handler: () => ({ body: { tasks: [] } }),
      },
      {
        method: 'GET',
        path: '/api/mission-control/state?space=ops',
        handler: () => ({ body: { status: 'idle' } }),
      },
      {
        method: 'GET',
        path: '/api/instances/nullclaw/agent/docs?space=ops',
        handler: () => ({ body: { documents: [] } }),
      },
      {
        method: 'GET',
        path: '/api/instances/nullclaw/agent/docs?path=notes%2Freadme.md&space=ops',
        handler: () => ({ body: { path: 'notes/readme.md' } }),
      },
      {
        method: 'GET',
        path: '/api/nulltickets/store/markdown.documents?space=ops',
        handler: () => ({ body: [] }),
      },
    ]);

    await expect(api.getInstances()).resolves.toEqual({ instances: [] });
    await expect(api.getGlobalUsage('7d')).resolves.toMatchObject({ totals: { total_tokens: 0, requests: 0 } });
    await expect(api.getSavedProviders(true)).resolves.toEqual({ providers: [] });
    await expect(api.getSavedChannels()).resolves.toEqual({ channels: [] });
    await expect(api.getConfig('nullclaw', 'agent')).resolves.toEqual({ config: {} });
    await expect(nullBoilerApi.listRunsPage({ limit: 1 })).resolves.toMatchObject({ items: [] });
    await expect(api.nullTicketsTasks('nulltickets', 'tickets', { limit: 8 })).resolves.toEqual({ tasks: [] });
    await expect(api.getMissionControlState()).resolves.toEqual({ status: 'idle' });
    await expect(api.listDocs('nullclaw', 'agent')).resolves.toEqual({ documents: [] });
    await expect(api.getDoc('nullclaw', 'agent', 'notes/readme.md')).resolves.toEqual({ path: 'notes/readme.md' });
    await expect(nullTicketsStoreApi.storeList('markdown.documents')).resolves.toEqual([]);

    expect(fixture.requests.map((request) => request.path)).toEqual([
      '/api/instances?space=ops',
      '/api/usage?window=7d',
      '/api/providers?reveal=true&space=ops',
      '/api/channels?space=ops',
      '/api/instances/nullclaw/agent/config?space=ops',
      '/api/nullboiler/runs?limit=1&space=ops',
      '/api/instances/nulltickets/tickets/tickets?space=ops',
      '/api/mission-control/state?space=ops',
      '/api/instances/nullclaw/agent/docs?space=ops',
      '/api/instances/nullclaw/agent/docs?path=notes%2Freadme.md&space=ops',
      '/api/nulltickets/store/markdown.documents?space=ops',
    ]);
  });

  test('re-scopes cached product GETs when the selected space changes', async () => {
    const selectSpace = installSelectedSpace('cache-ops');
    fixture = installApiFixture([
      {
        method: 'GET',
        path: '/api/instances?space=cache-ops',
        handler: () => ({ body: { space: 'cache-ops' } }),
      },
      {
        method: 'GET',
        path: '/api/instances?space=cache-lab',
        handler: () => ({ body: { space: 'cache-lab' } }),
      },
    ]);

    await expect(api.getInstances()).resolves.toEqual({ space: 'cache-ops' });
    selectSpace('cache-lab');
    await expect(api.getInstances()).resolves.toEqual({ space: 'cache-lab' });

    expect(fixture.requests.map((request) => request.path)).toEqual([
      '/api/instances?space=cache-ops',
      '/api/instances?space=cache-lab',
    ]);
  });

  test('keeps All Spaces mode unscoped for product GET requests', async () => {
    installSelectedSpace(null);
    fixture = installApiFixture([
      ...coreApiFixtureRoutes,
      {
        method: 'GET',
        path: '/api/instances',
        handler: () => ({ body: { instances: [] } }),
      },
    ]);

    await expect(api.getInstances()).resolves.toEqual({ instances: [] });

    expect(fixture.requests[0].path).toBe('/api/instances');
  });

  test('adds the selected space to saved provider and channel mutation bodies', async () => {
    installSelectedSpace('ops');
    fixture = installApiFixture([
      {
        method: 'POST',
        path: '/api/providers',
        handler: () => ({ body: { ok: true } }),
      },
      {
        method: 'PUT',
        path: '/api/providers/provider-1',
        handler: () => ({ body: { ok: true } }),
      },
      {
        method: 'POST',
        path: '/api/channels',
        handler: () => ({ body: { ok: true } }),
      },
      {
        method: 'PUT',
        path: '/api/channels/channel-1',
        handler: () => ({ body: { ok: true } }),
      },
    ]);

    await expect(api.createSavedProvider({ provider: 'openrouter', api_key: 'test-key' })).resolves.toEqual({ ok: true });
    await expect(api.updateSavedProvider('sp_provider-1', { model: 'openai/gpt-5.5' })).resolves.toEqual({ ok: true });
    await expect(api.createSavedChannel({ channel_type: 'telegram', account: 'ops', config: {} })).resolves.toEqual({ ok: true });
    await expect(api.updateSavedChannel('sc_channel-1', { account: 'lab' })).resolves.toEqual({ ok: true });

    expect(fixture.requests.map((request) => request.bodyJson)).toEqual([
      { provider: 'openrouter', api_key: 'test-key', space_id: 'ops' },
      { model: 'openai/gpt-5.5', space_id: 'ops' },
      { channel_type: 'telegram', account: 'ops', config: {}, space_id: 'ops' },
      { account: 'lab', space_id: 'ops' },
    ]);
  });

  test('keeps saved provider and channel mutation bodies unscoped in All Spaces mode', async () => {
    installSelectedSpace(null);
    fixture = installApiFixture([
      {
        method: 'POST',
        path: '/api/providers',
        handler: () => ({ body: { ok: true } }),
      },
      {
        method: 'POST',
        path: '/api/channels',
        handler: () => ({ body: { ok: true } }),
      },
    ]);

    await expect(api.createSavedProvider({ provider: 'openrouter', api_key: 'test-key' })).resolves.toEqual({ ok: true });
    await expect(api.createSavedChannel({ channel_type: 'telegram', account: 'ops', config: {} })).resolves.toEqual({ ok: true });

    expect(fixture.requests.map((request) => request.bodyJson)).toEqual([
      { provider: 'openrouter', api_key: 'test-key' },
      { channel_type: 'telegram', account: 'ops', config: {} },
    ]);
  });

  test('connects Telegram through the PocketBase control-plane route', async () => {
    fixture = installApiFixture([
      {
        method: 'POST',
        path: '/api/me/telegram/connect',
        handler: (request) => {
          expect(request.bodyJson).toEqual({ telegramBotToken: '123456:ABC' });
          return jsonFixture({ telegram: { status: 'waiting' } });
        },
      },
    ]);

    await expect(api.connectTelegram({ telegramBotToken: '123456:ABC' })).resolves.toEqual({
      telegram: { status: 'waiting' },
    });
    expect(fixture.requests).toHaveLength(1);
    expect(fixture.requests[0]).toMatchObject({
      method: 'POST',
      path: '/api/me/telegram/connect',
    });
  });
});
