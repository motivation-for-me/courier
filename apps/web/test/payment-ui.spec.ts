import { test, expect, type Page } from '@playwright/test';

async function setup(page: Page, own = false, delayed = false, failure = false) {
  const writes: Array<{ path: string; body: any }> = [];
  const group = (status: string, kind = 'DELIVERY', amount = '100.00') => ({ status, kind, currencyCode: 'PKR', _count: { _all: 1 }, _sum: { amount } });
  const riders = Array.from({ length: 24 }, (_, i) => ({ id: `rider-${i + 1}`, employeeCode: `E${i + 1}`, deliveryFee: '100.00', isActive: true, user: { displayName: `Test rider ${i + 1}`, email: `rider${i + 1}@example.com` }, totals: [group('PENDING'), group('SENT'), group('PAID')] }));
  const entry = (id: string, status: string) => ({ id, amount: '100.00', currencyCode: 'PKR', kind: 'DELIVERY', status, note: 'Agreed delivery fee', reference: status === 'SENT' ? 'Bank transfer 123' : null, createdAt: '2026-10-12T10:00:00Z', sentAt: status === 'SENT' ? '2026-10-12T11:00:00Z' : null, sentById: status === 'SENT' ? 'admin-other' : null, consignment: { id: `parcel-${id}`, cnNumber: `CN-${id}`, deliveredAt: '2026-10-12T10:00:00Z', serviceType: 'STANDARD', parties: [{ kind: 'RECEIVER', name: 'Test recipient' }], addresses: [{ kind: 'DESTINATION', addressLine: 'Test street', city: 'Lahore' }] } });
  await page.addInitScript(({ own }) => {
    const accessToken = `test.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 }))}.test`;
    sessionStorage.setItem('courier.auth-session', JSON.stringify({ accessToken, refreshToken: 'test-only', user: { id: own ? 'rider-user' : 'admin', riderId: own ? 'rider-1' : undefined, organizationId: 'test', displayName: own ? 'Test rider 1' : 'Test admin', roles: own ? ['RIDER'] : ['ADMIN'], permissions: ['shipment:view', 'user:view', 'delivery:view', 'payment:view'] } }));
  }, { own });
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname.replace('/api/v1', '');
    if (request.method() !== 'GET') { writes.push({ path, body: request.postDataJSON() }); await route.fulfill({ json: { success: true } }); return; }
    if (path === '/rider-payments') { await route.fulfill({ json: riders }); return; }
    if (/^\/rider-payments\/rider-\d+$/.test(path)) {
      const id = path.split('/').pop()!, rider = riders.find((row) => row.id === id)!;
      if (delayed && id === 'rider-1') await new Promise((resolve) => setTimeout(resolve, 700));
      if (failure && id === 'rider-1') { await route.fulfill({ status: 500, json: { message: 'Test payment service unavailable' } }); return; }
      await route.fulfill({ json: { rider: { ...rider, organization: { currencyCode: 'PKR' } }, entries: [entry(`${id}-unpaid`, 'PENDING'), entry(`${id}-sent`, 'SENT')], totals: rider.totals, missing: [], missingCount: 0, unpricedCount: 0, log: [{ id: 'log-1', action: 'rider-payment.sent', actorId: 'admin-other', createdAt: '2026-10-12T11:00:00Z', newValues: { reference: 'Bank transfer 123', amount: '100.00' } }], total: 2, page: 1, pages: 1 } }); return;
    }
    if (path === '/notifications/inbox') { await route.fulfill({ json: { items: [], unread: 0 } }); return; }
    if (path === '/auth/config') { await route.fulfill({ json: { googleClientId: null, emailEnabled: false } }); return; }
    if (path === '/dispatches/summary') { await route.fulfill({ json: { counts: { today: 0, pending: 0, active: 0, delivered: 0, total: 0 }, recent: [] } }); return; }
    await route.fulfill({ json: [] });
  });
  await page.goto('/');
  await page.getByRole('button', { name: 'Payments', exact: true }).first().click();
  await expect(page.locator('.payment-account-row').first()).toBeVisible();
  return writes;
}

test('account details use a separate page, Back returns to clean list, and payment records collapse', async ({ page }) => {
  await setup(page);
  await page.locator('.payment-account-row').first().click();
  await expect(page).toHaveURL(/\/payments\/riders\/rider-1$/);
  await expect(page.locator('.payment-account-row')).toHaveCount(0);
  await expect(page.locator('.payment-account-details')).toHaveCount(1);
  const record = page.locator('.payment-record').first();
  await expect(record.locator('.payment-record-details')).toBeHidden();
  await record.locator('summary').first().click();
  await expect(record.locator('.payment-record-details')).toBeVisible();
  await record.locator('summary').first().click();
  await expect(record.locator('.payment-record-details')).toBeHidden();
  await page.getByRole('link', { name: 'Back to accounts' }).click();
  await expect(page).toHaveURL(/\/payments$/);
  await expect(page.locator('.payment-account-details')).toHaveCount(0);
  await expect(page.locator('.payment-account-row')).toHaveCount(24);
  await page.locator('.payment-account-row').nth(1).click();
  await expect(page).toHaveURL(/\/payments\/riders\/rider-2$/);
  await expect(page.locator('.payment-account-details')).toHaveAttribute('id', 'payment-account-rider-2');
  await expect(page.locator('.payment-record')).toHaveCount(2);
});
test('errors on another account never retain the previous account records', async ({ page }) => {
  await setup(page, false, true, true);
  await page.locator('.payment-account-row').nth(1).click();
  await expect(page.locator('.payment-account-details')).toHaveAttribute('id', 'payment-account-rider-2');
  await page.getByRole('link', { name: 'Back to accounts' }).click();
  await page.locator('.payment-account-row').first().click();
  await expect(page.getByText('Test payment service unavailable')).toBeVisible();
  await expect(page.locator('.payment-account-details')).toHaveCount(0);
  await expect(page.locator('.payment-record')).toHaveCount(0);
});
test('many accounts and separate detail page remain usable on mobile', async ({ page }) => {
  await setup(page); await expect(page.locator('.payment-account-row')).toHaveCount(24);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.payment-account-row').first().focus(); await page.keyboard.press('Enter');
  await expect(page.locator('.payment-account-details')).toBeVisible();
  await expect(page.getByRole('list', { name: 'Payment process' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/payments-mobile.png' });
  await page.getByRole('link', { name: 'Back to accounts' }).click();
  await page.setViewportSize({ width: 1360, height: 900 });
  await page.getByLabel('Search riders').fill('Test rider 24');
  await expect(page.locator('.payment-account-row')).toHaveCount(1);
  await page.locator('.payment-account-row').click();
  await expect(page.locator('.payment-account-details')).toHaveAttribute('id', 'payment-account-rider-24');
  await page.screenshot({ path: 'test-results/payments-desktop.png' });
});
test('fee, bonus, adjustment and pay operations preserve request payloads and open account', async ({ page }) => {
  const writes = await setup(page);
  await page.locator('.payment-account-row').first().click();
  await expect(page.locator('.payment-account-details')).toBeVisible();
  await page.locator('.payment-setting > summary').filter({ hasText: 'Delivery fee:' }).click();
  await page.getByLabel('Saved fee per completed delivery').fill('125.50');
  await page.locator('.payment-setting').first().getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => writes.find((write) => write.path.endsWith('/default-fee'))?.body.amount).toBe('125.50');
  await expect(page).toHaveURL(/\/payments\/riders\/rider-1$/);
  await page.getByText('Add bonus', { exact: true }).click();
  const bonus = page.locator('.payment-setting').nth(1);
  await bonus.getByLabel('Add rider bonus').fill('20.00'); await bonus.getByLabel('Reason').fill('Test bonus');
  await bonus.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => writes.find((write) => write.path.endsWith('/entries'))?.body.amount).toBe('20.00');
  const record = page.locator('.payment-record').first(); await record.locator('summary').first().click();
  await record.getByText('Adjust this entry (optional)', { exact: true }).click();
  await record.getByLabel('Edit unpaid fee / bonus').fill('105.00'); await record.getByLabel('Reason').fill('Test adjustment');
  await record.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(() => writes.find((write) => write.path.includes('/entries/rider-1-unpaid'))?.body.amount).toBe('105.00');
  page.on('dialog', (dialog) => dialog.accept());
  await expect(page.getByRole('button', { name: 'Save', exact: true }).first()).toBeEnabled();
  await record.getByRole('checkbox').check();
  const selectedPayment = page.locator('form').filter({ has: page.getByRole('button', { name: 'Pay selected', exact: true }) });
  await selectedPayment.getByRole('button', { name: 'Pay selected', exact: true }).click();
  await expect.poll(() => writes.find((write) => write.path.endsWith('/pay'))?.body.ids).toEqual(['rider-1-unpaid']);
  const pay = page.locator('form').filter({ has: page.getByRole('button', { name: 'Pay all unpaid', exact: true }) });
  await pay.getByRole('button', { name: 'Pay all unpaid', exact: true }).click();
  await expect.poll(() => writes.some((write) => write.path.endsWith('/pay-all'))).toBe(true);
});
test('rider receipt and dispute actions remain available inside expanded records', async ({ page }) => {
  const writes = await setup(page, true); await page.locator('.payment-account-row').click(); page.on('dialog', (dialog) => dialog.accept());
  const record = page.locator('.payment-record').nth(1);
  await record.locator('summary').first().click();
  await record.getByRole('button', { name: 'Yes, I received it' }).click();
  await expect.poll(() => writes.find((write) => write.body.decision === 'confirm')?.path).toContain('/receipt');
  await record.getByLabel('If not received, explain the problem').fill('Test non-receipt');
  await record.getByRole('button', { name: /Not received/ }).click();
  await expect.poll(() => writes.find((write) => write.body.decision === 'dispute')?.body.reason).toBe('Test non-receipt');
});
