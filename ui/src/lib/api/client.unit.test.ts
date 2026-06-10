import { afterEach, describe, expect, test } from 'vitest';
import { api } from './client';
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

afterEach(() => {
  fixture?.restore();
  fixture = null;
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
