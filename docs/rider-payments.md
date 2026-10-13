# Rider payments

Payments is a separate section for administrators and riders, available on desktop and mobile. Management remains for account/parcel setup. The old shop finance panel and rider finance summary are removed from those screens; existing COD/shop accounting records are preserved.

## Workflow

1. Set a rider's default delivery fee during account setup or in Payments. Changes apply to future completed deliveries. Completion snapshots the agreed fee and organization currency into one unique earning per parcel, including deliveries performed by an Admin+Rider account.
2. Open Payments, select a rider and review completed parcels, unpaid fees and missing fee records. Enter actual agreed fees for older deliveries missing earnings; the system verifies the completing rider and prevents duplicate parcel earnings. Zero fees remain visible for review.
3. Add a bonus with an amount and reason. It becomes a separate unpaid earning. Edit only unpaid fees/bonuses, with a reason and an audit record. Totals include bonuses automatically, separately for each currency. Missing fee records are counted separately, never assumed to be paid or assigned a guessed amount.
4. Select up to 100 unpaid entries in one currency. Enter a bank reference or cash payment note. After actually paying the rider, use Pay. This records a manual payment; it does not transfer money. The selected amounts become SENT and are locked against editing; the rider receives an in-app notification linking to Payments.
5. The rider confirms each received entry using Yes, I received it. Only then does it become PAID, with administrator sender, rider confirmer, reference and both timestamps retained. Administrators receive a confirmation notification. A rider reporting non-receipt marks the entry DISPUTED, notifying administrators; it remains uncleared. After resolving the issue, the administrator can record it as sent again, with a new reference. Earlier attempts remain in the audit log. Do not resend money without checking the existing payment reference.

Historical PAID entries are retained and labelled as legacy records if no rider confirmation exists; the system does not fabricate two-party confirmation. Inactive riders remain visible to administrators for outstanding payment reconciliation. An Admin+Rider user cannot mark their own payment as sent: a different administrator must do that.

## Deployment and verification

Apply migration `20261013090000_rider_payment_confirmation`, generate Prisma Client, and deploy API and web together. No real payments or production data were modified during implementation. Validate a delivered parcel earning, a bonus, fee editing, Pay, receipt confirmation and non-receipt from separate admin/rider accounts. Notifications here are in-app; phone push is not configured.

Entries paginate at 50; totals cover all records. Missing completed deliveries show the next 50 and expose further items as fees are recorded. Payment activity shows the latest 50 actions. Monetary arithmetic uses Prisma Decimal on the server and integer cents in the browser. Paid/sent records cannot be edited, and conditional transitions inside serializable transactions prevent double settlement. Authorization is enforced by the API on every action, scoped to organization and rider.
