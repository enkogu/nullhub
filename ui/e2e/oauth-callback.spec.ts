import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const callbackHtmlPath = fileURLToPath(new URL('../../../../public/auth/callback.html', import.meta.url));
const pocketBaseModuleUrl = 'https://cdn.jsdelivr.net/npm/pocketbase@0.26.3/dist/pocketbase.es.mjs';

async function installCallbackFixture(
  page: Page,
  options: { authFailureMessage?: string } = {},
) {
  const callbackHtml = await readFile(callbackHtmlPath, 'utf8');
  const authFailureMessage =
    options.authFailureMessage || 'The OAuth code has expired or was already used.';

  await page.route('**/auth/callback.html**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: callbackHtml,
    }),
  );

  await page.route(pocketBaseModuleUrl, (route) =>
    route.fulfill({
      status: 200,
      contentType: 'text/javascript',
      body: `
        export default class PocketBase {
          constructor(origin) {
            this.origin = origin;
            this.authStore = { token: "fixture-token" };
          }

          collection() {
            return {
              authWithOAuth2Code: async () => {
                const error = new Error(${JSON.stringify(authFailureMessage)});
                error.status = 400;
                error.response = {
                  message: ${JSON.stringify(authFailureMessage)},
                  data: { code: "invalid_oauth2_code" }
                };
                throw error;
              }
            };
          }
        }
      `,
    }),
  );
}

test('callback missing-provider-state shows a direct sign-in retry', async ({ page }, testInfo) => {
  await installCallbackFixture(page);

  await page.goto('/auth/callback.html?code=fixture-code');

  await expect(page.getByRole('heading', { name: 'Start sign-in again' })).toBeVisible();
  await expect(page.locator('#status')).toHaveAttribute('data-error-code', 'missing-provider-state');
  await expect(page.getByText(/missing the secure sign-in session/i)).toBeVisible();
  await expect(page.getByText(/Reference: auth-[a-f0-9]{8}\./)).toBeVisible();

  const retryLink = page.getByRole('link', { name: 'Try sign-in again' });
  await expect(retryLink).toBeVisible();
  await expect(retryLink).toHaveAttribute('href', '/signin/');

  const screenshotPath = testInfo.outputPath('oauth-callback-missing-provider.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);
});

test('callback consumed code shows a fresh-code recovery state', async ({ page }, testInfo) => {
  await installCallbackFixture(page, {
    authFailureMessage: 'The OAuth code has expired or was already used.',
  });
  await page.addInitScript(() => {
    localStorage.setItem(
      'oauth_provider',
      JSON.stringify({ name: 'google', codeVerifier: 'fixture-verifier' }),
    );
  });

  await page.goto('/auth/callback.html?code=used-code');

  await expect(page.getByRole('heading', { name: 'This sign-in link expired' })).toBeVisible();
  await expect(page.locator('#status')).toHaveAttribute('data-error-code', 'consumed-code');
  await expect(page.getByText(/OAuth links can only be used once/i)).toBeVisible();
  await expect(page.getByText(/Reference: auth-[a-f0-9]{8}\./)).toBeVisible();

  const retryLink = page.getByRole('link', { name: 'Get a fresh sign-in link' });
  await expect(retryLink).toBeVisible();
  await expect(retryLink).toHaveAttribute('href', '/signin/');

  const pageText = (await page.locator('.callback-card').innerText()).trim();
  expect(pageText.length).toBeGreaterThan(100);

  const screenshotPath = testInfo.outputPath('oauth-callback-consumed-code.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);
});
