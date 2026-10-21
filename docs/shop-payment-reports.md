# Shop payment reports

Open **Reports** as an admin or shop member. Admins may choose one shop or all shops in their organization. Shop members see only their linked shop, enforced on both JSON and PDF endpoints. Rider-only accounts cannot access these reports.

Choose Today, This week, a month, or a custom From/To range, then **View report**. Summaries can group by day, Monday-based week, or month. Dates use Pakistan time (`Asia/Karachi`, UTC+05:00); the end date includes the whole day. View PDF and Download PDF export the applied report filters, not unsaved filter edits.

The report counts only `PAID` shop settlements by `paidAt`. It does not filter by shipment booking date or count pending/voided amounts as received. Settlement amounts are already net of the deductions applied when the administrator recorded the payout; delivery fees are not deducted a second time. Rate changes do not change recorded payouts. Currencies remain separate, and partial payouts to the same shipment do not inflate the unique shipment count.

The screen and PDF include net received, payment count, shipment count, period totals and the shipments covered by each payout. A report with no settlements shows an explicit empty state. It does not fabricate payments from collected COD, outstanding balances or rider earnings.

In **Payments → Shops**, an admin selects a shop, reviews its automatically calculated net payable, and clicks **Pay shop** after making the payment. No reference or cash note is required. The server subtracts recorded delivery deductions and previous payouts from verified cash collections, includes shop-payable adjustments, and allocates the payout to outstanding shipments. Uncollected parcels are not paid; negative settled balances and mixed currencies require review. The amount must still match the admin's preview, so a changed balance cannot silently record a different payment. Serializable transactions protect against duplicate concurrent payouts. The payout and its audit/notification are recorded together and immediately become report data. This records a payment already made; it does not transfer money or claim shop-side receipt confirmation.

Rider payment recording no longer requires entering a cash note or bank reference. Existing historical references remain stored and readable. Rider receipt confirmation and dispute handling are unchanged. No schema migration is required; deploy API and web together.
