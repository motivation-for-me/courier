import { test, expect } from '@playwright/test';

test('bike is compulsory before login even after a previous visit', async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem('swiftlog.bike-intro-seen', 'true'));
  await page.route('**/api/v1/auth/config', (route) => route.fulfill({ json: { googleClientId: null, emailEnabled: false } }));
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'SwiftLog startup' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Skip intro' })).toHaveCount(0);
  await expect(page.frameLocator('iframe[title="Delivery bike animation"]').locator('canvas')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 6000 });
  await expect(page.locator('.rider-intro')).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('region', { name: 'SwiftLog startup' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in', exact: true })).toBeVisible({ timeout: 6000 });
});
