# Payment screen

Payment accounts appear as compact rows with unpaid, awaiting-receipt and cleared balances per currency. Opening a row loads its details underneath; opening another row closes the previous account. Clicking the same row closes it. Account changes reset payment selection, reference, filters and pagination; successful saves keep the current account open.

Each payment record has its own expandable summary with the shipment/bonus, amount, status and recorded date. Notes, payment references, delivery details, adjustment forms and receipt actions are inside the record. Fee settings, bonus creation and activity logs are collapsed initially and can be closed normally.

In-flight responses are ignored after switching or closing an account. No backend, schema, payment calculations, validation rules or API operations were changed for this redesign.

Run `npm run test:payments --workspace @courier/web` to exercise the real frontend in headless Chrome. Tests use 24 synthetic accounts and mocked API responses; they never send real payments. They cover account and record open/close, switching, delayed/error responses, mobile overflow, keyboard activation, search, fee edits, bonus creation, amount adjustment, selected payment, pay-all, receipt confirmation and dispute. Playwright starts a local development server on port 3100 if needed; Chrome must be installed.
