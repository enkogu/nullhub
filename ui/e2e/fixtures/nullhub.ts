import type { Page, Route } from '@playwright/test';

type JsonBody = Record<string, unknown> | unknown[];

async function fulfillJson(route: Route, body: JsonBody, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  });
}

async function fulfillText(route: Route, body: string, contentType: string) {
  await route.fulfill({
    status: 200,
    contentType,
    body,
  });
}

const fixtureStatus = {
  ok: true,
  version: 'playwright-fixture',
  components: {},
  instances: {
    nulltickets: {},
  },
};

export async function installNullHubFixtureRoutes(page: Page) {
  await page.route('**/api/**', (route) =>
    fulfillJson(route, { error: 'Unhandled Playwright fixture route' }, 404),
  );
  await page.route('**/nullhub-api/**', (route) =>
    fulfillJson(route, { error: 'Unhandled Playwright fixture route' }, 404),
  );

  await page.route('**/site.webmanifest', (route) =>
    fulfillJson(route, { name: 'NullHub', short_name: 'NullHub', start_url: '/', display: 'standalone' }),
  );
  await page.route('**/browserconfig.xml', (route) =>
    fulfillText(route, '<?xml version="1.0" encoding="utf-8"?><browserconfig></browserconfig>', 'application/xml'),
  );

  await page.route('**/api/status', (route) => fulfillJson(route, fixtureStatus));
  await page.route('**/nullhub-api/status', (route) => fulfillJson(route, fixtureStatus));
}
