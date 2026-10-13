import { test, expect } from '@playwright/test';
test('original bike shows at startup, renders its canvas, skips and stays out of subsequent pages', async ({ page }) => {
  await page.route('**/api/v1/auth/config', (route) => route.fulfill({ json: { googleClientId: null, emailEnabled: false } }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'SwiftLog startup' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip intro' }).click();
  await expect(page.locator('.rider-intro')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await page.goto('/payments');
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible();
  await expect(page.locator('.rider-intro')).toHaveCount(0);
  await page.goto('/rider-speed/index.html?embed');
  await expect(page.locator('canvas')).toBeVisible();
});
