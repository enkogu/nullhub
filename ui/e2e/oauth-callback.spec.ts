import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const callbackHtml = readFileSync(new URL('../../../../public/auth/callback.html', import.meta.url), 'utf8');

const pocketBaseMock = `
export default class PocketBase {
  constructor(origin) {
    this.origin = origin;
    this.authStore = { token: 'fixture-token' };
  }

  collection(name) {
    return {
      authWithOAuth2Code: async (...args) => {
        window.__oauthCallbackCalls = [...(window.__oauthCallbackCalls || []), args];
        const error = new Error('The OAuth2 code has expired or already been used.');
        error.status = 400;
        error.response = { message: error.message };
        throw error;
      },
    };
  }
}
`;

async function installCallbackFixtureRoutes(page: Page) {
  await page.route(/\/auth\/callback\.html(\?.*)?$/, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: callbackHtml,
    }),
  );
  await page.route('**/vendor/pocketbase.es.mjs', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: pocketBaseMock,
    }),
  );
}

test('OAuth callback missing provider state shows a recoverable signin retry', async ({ page }, testInfo) => {
  await installCallbackFixtureRoutes(page);

  await page.goto('/auth/callback.html?code=fixture-code');

  await expect(page.locator('#spinner')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Start sign-in again' })).toBeVisible();
  await expect(page.locator('#status')).toHaveAttribute('data-error', 'OAUTH_STATE_MISSING');
  await expect(page.locator('#status')).toContainText('secure sign-in session expired');
  await expect(page.locator('#status')).toContainText(/Reference VD-[0-9A-F]{4}\./);
  await expect(page.locator('#retry-link')).toHaveAttribute('href', '/signin/');
  await expect(page.getByRole('link', { name: 'Try sign-in again' })).toBeVisible();

  const screenshotPath = testInfo.outputPath('oauth-callback-missing-provider.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);
});

test('OAuth callback consumed code shows a distinct signin retry state', async ({ page }, testInfo) => {
  await installCallbackFixtureRoutes(page);
  await page.addInitScript(() => {
    window.localStorage.setItem(
      'oauth_provider',
      JSON.stringify({ name: 'google', codeVerifier: 'fixture-verifier' }),
    );
  });

  await page.goto('/auth/callback.html?code=consumed-code');

  await expect(page.locator('#spinner')).toBeHidden();
  await expect(page.getByRole('heading', { name: 'This sign-in link expired' })).toBeVisible();
  await expect(page.locator('#status')).toHaveAttribute('data-error', 'OAUTH_CODE_EXPIRED');
  await expect(page.locator('#status')).toContainText('already used or expired');
  await expect(page.locator('#status')).toContainText(/Reference VD-[0-9A-F]{4}\./);
  await expect(page.locator('#retry-link')).toHaveAttribute('href', '/signin/');
  await expect(page.getByRole('link', { name: 'Try sign-in again' })).toBeVisible();

  const calls = await page.evaluate(() => (window as any).__oauthCallbackCalls || []);
  expect(calls).toHaveLength(1);
  expect(calls[0][0]).toBe('google');
  expect(calls[0][1]).toBe('consumed-code');
  expect(calls[0][2]).toBe('fixture-verifier');
  expect(calls[0][3]).toMatch(/\/auth\/callback\.html$/);

  const screenshotPath = testInfo.outputPath('oauth-callback-consumed-code.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);
});
