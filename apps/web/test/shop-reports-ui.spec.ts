import { test, expect, type Page } from '@playwright/test';
async function setup(page: Page, role = 'ADMIN') {
  const requests: URL[] = [];
  await page.addInitScript(({ role }) => {
    sessionStorage.setItem('swiftlog.bike-intro-seen', 'true');
    sessionStorage.setItem('courier.auth-session', JSON.stringify({ accessToken: `test.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`, refreshToken: 'test', user: { id: 'test', displayName: 'Test member', organizationId: 'org', roles: [role], permissions: [] } }));
  }, { role });
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/reports/shops') || url.pathname.endsWith('/customers')) { await route.fulfill({ json: [{ id: 'shop-1', name: 'Test shop' }] }); return; }
    if (url.pathname.endsWith('/rider-payments')) { await route.fulfill({ json: [] }); return; }
    if (url.pathname.endsWith('/reports/shop-payments.pdf')) { requests.push(url); await route.fulfill({ contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF' }); return; }
    if (url.pathname.endsWith('/reports/shop-payments')) {
      requests.push(url);
      await route.fulfill({ json: { from: url.searchParams.get('from'), to: url.searchParams.get('to'), group: url.searchParams.get('group'), timezone: 'Asia/Karachi', basis: 'payment date', totals: [{ currencyCode: 'PKR', netReceived: '900.00', payments: 1, shipments: 1 }], periods: [{ period: url.searchParams.get('from'), currencyCode: 'PKR', netReceived: '900.00', payments: 1 }], payments: [{ id: 'pay-1', shop: { id: 'shop-1', name: 'Test shop' }, paidAt: '2026-10-21T12:00:00Z', currencyCode: 'PKR', netReceived: '900.00', shipments: [{ cnNumber: 'CN-REPORT-1', netReceived: '900.00' }] }] } }); return;
    }
    await route.fulfill({ json: url.pathname.endsWith('/notifications/inbox') ? { items: [], unread: 0 } : {} });
  });
  await page.goto('/reports'); await expect(page.getByRole('heading', { name: 'Shop payment reports' })).toBeVisible();
  return requests;
}
test('admin report supports month, daily, weekly and custom filters, retry and PDF export', async ({ page }) => {
  const requests = await setup(page);
  await expect(page.getByText('900.00', { exact: true })).toBeVisible();
  await page.getByRole('combobox', { name: 'Shop', exact: true }).selectOption('shop-1');
  await page.getByLabel('Month', { exact: true }).fill('2026-09');
  await page.getByRole('button', { name: 'View report', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('from')).toBe('2026-09-01');
  expect(requests.at(-1)?.searchParams.get('to')).toBe('2026-09-30');
  expect(requests.at(-1)?.searchParams.get('shopId')).toBe('shop-1');
  for (const preset of ['day', 'week']) {
    await page.getByRole('combobox', { name: 'Period', exact: true }).selectOption(preset);
    await page.getByRole('button', { name: 'View report', exact: true }).click();
    await expect.poll(() => requests.at(-1)?.searchParams.get('group')).toBe(preset);
  }
  await page.getByLabel('From', { exact: true }).fill('2026-08-01');
  await page.getByLabel('To', { exact: true }).fill('2026-10-21');
  await page.getByRole('combobox', { name: 'Group by', exact: true }).selectOption('month');
  await page.getByRole('button', { name: 'View report', exact: true }).click();
  await expect.poll(() => requests.at(-1)?.searchParams.get('from')).toBe('2026-08-01');
  const count = requests.length;
  await page.getByRole('button', { name: 'View report', exact: true }).click();
  await expect.poll(() => requests.length).toBeGreaterThan(count);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download PDF' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('shop-payments-report.pdf');
  expect(requests.at(-1)?.searchParams.get('from')).toBe('2026-08-01');
  const popupPromise = page.waitForEvent('popup');
  await page.getByRole('button', { name: 'View PDF' }).click();
  const popup = await popupPromise; await popup.close();
});
test('shop report hides account selector and stays usable on mobile', async ({ page }) => {
  await setup(page, 'SHOP'); await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('combobox', { name: 'Shop', exact: true })).toHaveCount(0);
  await expect(page.getByText('900.00', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator('.report-payment summary').click();
  await expect(page.getByText('CN-REPORT-1', { exact: true })).toBeVisible();
});
test('admin can record a net shop payout without entering a reference', async ({ page }) => {
  await setup(page);
  let paid = false; let payload: any;
  await page.route('**/api/v1/shops/shop-1/financials/**', async (route) => {
    if (route.request().method() === 'POST') { payload = route.request().postDataJSON(); paid = true; await route.fulfill({ json: { success: true } }); return; }
    await route.fulfill({ json: { shop: { id: 'shop-1', name: 'Test shop' }, currencyCode: 'PKR', netPayable: paid ? '0.00' : '900.00', shipments: paid ? [] : [{ id: 'parcel', cnNumber: 'CN-REPORT-1', netPayable: '900.00' }] } });
  });
  await page.goto('/payments');
  await expect(page.getByRole('heading', { name: 'Rider payments', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: 'Shops', exact: true }).click();
  await page.getByRole('combobox', { name: 'Shop', exact: true }).selectOption('shop-1');
  await expect(page.getByRole('heading', { name: 'PKR 900.00' })).toBeVisible();
  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Pay shop', exact: true }).click();
  await expect(page.getByText('Payment recorded. It is now included in Reports.')).toBeVisible();
  expect(payload).toEqual({ expectedAmount: '900.00', currencyCode: 'PKR' });
  await expect(page.getByRole('button', { name: 'Pay shop', exact: true })).toBeDisabled();
});
