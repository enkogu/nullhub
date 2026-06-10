import { expect, test } from '@playwright/test';
import { installNullHubFixtureRoutes } from './fixtures/nullhub';

test('channels route connects Telegram through the control-plane route', async ({ page }, testInfo) => {
  const connectRequests: unknown[] = [];

  await installNullHubFixtureRoutes(page);
  await page.route('**/api/status', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        ok: true,
        version: 'playwright-fixture',
        components: {},
        instances: {
          nullclaw: {
            default: { status: 'running' },
          },
        },
      }),
    }),
  );
  await page.route('**/nullhub-api/channels', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        channels: [
          {
            id: 'web-default',
            name: 'Web',
            channel_type: 'web',
            account: 'default',
            config: { port: 51000 },
            validated_at: '2026-06-11T00:00:00Z',
          },
        ],
      }),
    }),
  );
  await page.route('**/api/me/telegram/connect', async (route) => {
    connectRequests.push(route.request().postDataJSON());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        telegram: { status: 'waiting', account: 'main' },
      }),
    });
  });

  await page.goto('/channels');
  await expect(page.getByRole('button', { name: 'Connect Telegram' })).toBeVisible();
  await page.getByRole('button', { name: 'Connect Telegram' }).click();
  await expect(page.getByRole('dialog', { name: 'Connect Telegram' })).toBeVisible();
  await page.getByLabel('Bot Token').fill('123456:ABC');
  await page.getByRole('button', { name: 'Connect & claim' }).click();

  await expect.poll(() => connectRequests).toEqual([{ telegramBotToken: '123456:ABC' }]);

  const screenshotPath = testInfo.outputPath('channels-connect-telegram.png');
  await page.screenshot({ path: screenshotPath, fullPage: true });
  console.log(`screenshot: ${screenshotPath}`);
});
