# Account management and Recycle Bin

Management → All accounts provides search and role filters, account creation, editing, password replacement, sign-in access, and deletion. Management → Recycle Bin provides account/rider/shipment filters, name/CN search, pagination, and restore.

Only administrators in the same organization can use these endpoints. Password hashes, tokens, and Google identifiers are never returned. Legacy account IDs remain supported. Email changes clear email verification and the linked Google identity. Email/password changes and disabling access revoke sessions. Administrators cannot delete or disable themselves or leave the organization without an active administrator.

Deleting an account retains its roles, profile, delivery records, payments, and audit history. It disables login, increments the authentication version, revokes sessions and unused email links, and adds a Recycle Bin entry. Deleting a rider also deletes the linked login into the same entry. Reassign active deliveries and pickups first. Restore reinstates the previous active/disabled settings, including the linked rider, and requires a new login. A shop account cannot be restored while its shop is deleted. Disabling an account is separate from deletion and does not put it in the bin.

Deleting a shipment retains the shipment and its history, ends active assignments, and cancels active pickups. Restore makes the record visible again without restarting assignments or pickups; arrange these explicitly as needed. No payment or earning records are deleted or reversed by either operation.

Deploy the API and web together. The API build runs `prisma migrate deploy`; migration `20261013100000_recycle_bin` adds deletion timestamps and the bin table. Already soft-deleted shipments are imported into the bin. Previously inactive accounts/riders are not automatically classified as deleted because the old schema did not distinguish disabling from deletion.

Notification “View shipment” and shipment-list “Details” now consume the queued CN and immediately load its tracking history. Public tracking privacy remains unchanged.

After deployment, verify with two test accounts: open a shipment notification, create/edit/delete an account, check the deleted login is rejected, filter the bin, restore, and sign in again. Delete/restore a test shipment and verify its history remains while its previous assignment stays ended.
