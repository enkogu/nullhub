import { afterEach, describe, expect, test } from 'vitest';
import { api } from './client';
import {
  coreApiFixtureRoutes,
  statusFixture,
} from './__fixtures__/handlers';
import {
  installApiFixture,
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
});
