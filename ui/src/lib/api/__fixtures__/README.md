# API Client Fixtures

API client contract tests use this directory as the shared fake backend. Keep
response bodies as JSON fixtures, expose route handlers from `handlers.ts`, and
install those handlers from `*.unit.test.ts` files with `installApiFixture`.

Route paths are the client-visible paths after the origin, including the `/api`
prefix used by the NullHub UI client. A route string without a query matches by
pathname; include the query string when the query is part of the contract. Use a
regular expression or predicate route only when path parameters make a literal
fixture hard to read.

Example:

```ts
import { afterEach, describe, expect, test } from 'vitest';
import { api } from './client';
import { coreApiFixtureRoutes, statusFixture } from './__fixtures__/handlers';
import { installApiFixture, type InstalledApiFixture } from './__fixtures__/backend';

let fixture: InstalledApiFixture | null = null;

afterEach(() => {
  fixture?.restore();
  fixture = null;
});

describe('status client', () => {
  test('reads from the fake backend', async () => {
    fixture = installApiFixture(coreApiFixtureRoutes);

    await expect(api.getStatus()).resolves.toEqual(statusFixture);
  });
});
```

New Spaces, Orders, and other product API clients should add their stable
response bodies here instead of building bespoke fetch mocks in individual
tests.
