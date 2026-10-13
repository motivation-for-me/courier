# Payment screen

Payment accounts appear as compact rows with unpaid, awaiting-receipt and cleared balances per currency at `/payments`. Each row links to its own page at `/payments/riders/[riderId]`; account details are never mixed into the directory. “Back to accounts” returns to the directory. Changing account pages resets payment selection, reference, filters and pagination; successful saves keep the current account page open.

Each payment record has its own expandable summary with the shipment/bonus, amount, status and recorded date. Notes, payment references, delivery details, adjustment forms and receipt actions are inside the record. Fee settings, bonus creation and activity logs are collapsed initially and can be closed normally.

In-flight responses are ignored after leaving an account page. The payment process line shows Unpaid → Payment sent → Rider confirms → Cleared. No backend, schema, payment calculations, validation rules or API operations were changed for this redesign.

Run `npm run test:payments --workspace @courier/web` to exercise the real frontend in headless Chrome. Tests use 24 synthetic accounts and mocked API responses; they never send real payments. They cover separate account-page navigation, Back, record open/close, error isolation, mobile overflow, keyboard activation, search, fee edits, bonus creation, amount adjustment, selected payment, pay-all, receipt confirmation and dispute. Playwright starts a local development server on port 3100 if needed; Chrome must be installed.
