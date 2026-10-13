# Account access and authentication

The current deployment temporarily uses existing account/password sign-in. Google authentication, account email flows and mandatory email verification are **disabled by default**. Legacy account IDs do not need to be deliverable email addresses. No account is falsely marked verified.

For this deployment, leave these API variables unset or set them to `false`:

```dotenv
GOOGLE_AUTH_ENABLED=false
ACCOUNT_EMAIL_ENABLED=false
REQUIRE_EMAIL_VERIFICATION=false
```

Disabled Google and email endpoints reject requests even if credentials happen to be configured. The login screen hides Google sign-in and email recovery/verification controls. Password checks, account activity checks, shop restrictions and session revocation remain enforced.

When real email addresses and providers are ready, set `ACCOUNT_EMAIL_ENABLED=true` and `GOOGLE_AUTH_ENABLED=true` with their respective credentials. Verify account emails **before** enabling `REQUIRE_EMAIL_VERIFICATION=true`, especially administrator accounts. Mandatory verification applies to password login, token refresh and authenticated API access.

## Configuration

Set these values on the API service (keep credentials out of the web bundle):

- `RESEND_API_KEY`: Resend sending key.
- `EMAIL_FROM`: sender such as `SwiftLog <accounts@your-domain.com>`; the domain must be verified in Resend.
- `APP_PUBLIC_URL`: public website origin, e.g. `https://courier-six-henna.vercel.app`.
- `GOOGLE_CLIENT_ID`: Google OAuth **Web application** client ID. Configure the public website and local development origins as authorized JavaScript origins in Google Cloud. This uses Google Identity Services credential callbacks, not an OAuth redirect callback. No Google client secret is required for this ID-token flow.

Empty credentials show configuration errors; the application never simulates email delivery or Google authentication. `/auth/config` exposes only the public Google client ID and whether email sending is configured.

## Deployment

The separate Payments section and its required migration are documented in [rider-payments.md](rider-payments.md). Deploy the API and web together after applying `20261013090000_rider_payment_confirmation`; payment receipt confirmation depends on the new fields and enum values.

The Supabase primary database is in Mumbai (`ap-south-1`). The API function configuration and the web API proxy's `preferredRegion` therefore target Vercel Mumbai (`bom1`) to avoid routing database work through Washington. Redeploy to apply this placement, then verify both services' invocation region and compare warm request durations. Region placement reduces network distance; it does not guarantee a particular response time or remove query/cold-start costs.

The API build runs `prepare:pdf`, which copies the pinned PDFKit self-contained renderer and its license into `src/generated`. Nest copies these assets into `dist/generated`, and Vercel explicitly includes them in the API function. Fonts and PDF dependencies are embedded in this renderer; PDF downloads no longer resolve the PDFKit package from runtime `node_modules`. Missing build inputs fail the build. Development and test scripts also prepare the runtime automatically. Deploy the updated build scripts, Nest configuration and Vercel configuration together; older deployments can fail with `Cannot find module 'pdfkit'`. After deployment, check `/api/v1/auth/config`, `/api/v1/health/ready`, password sign-in and a shipment PDF download.

1. Ensure every account that needs access has a real email inbox. Correct old placeholder addresses through trusted administrative/database tooling before enforcing verification.
2. Configure Resend, its verified sender, the website URL, and Google client ID.
3. Apply `20261012090000_account_security` using `npm run db:migrate`; generate Prisma Client and deploy the API and web together.
4. At sign-in, use **Send verification email** and open the link to verify the administrator email. Existing passwords continue to work after verification.
5. Test forgotten password, single-use/expired links, Google sign-in, shop access changes, and session revocation against the deployed services.

The migration remains required for the account fields and shop access controls even while external authentication is disabled. Provider credentials are not required for this temporary password-only deployment. The setup steps above describe later activation. Email and OAuth credentials are required to validate those external flows end to end.

## Parcel QR and public tracking

New dispatch PDFs encode `/scan/{CN}`. This page offers rider access and customer tracking without embedding credentials or a customer-detail token. Rider access continues to the scanned parcel after normal sign-in; the administrator provides the rider account ID/password through account setup. The delivery scan API requires authentication, delivery scan permission and an active assignment to the signed-in rider within their organization. Authorized riders see contacts, delivery addresses, items, status history and recorded locations, with server-authorized delivery actions. Recorded locations represent shipment events, not live GPS.

Customer tracking links remain available from the shipment list. The public tracking API never returns the receiver phone number, including when a signed customer link is used. Public HTML also omits the receiver phone. Existing printed QR codes continue using their original tracking URLs; download/reprint the PDF for the rider QR flow.

## Shop access

Management → All accounts provides a paginated organization-wide account directory, including disabled accounts, role filtering and search by name/email/phone. It exposes account identity and verification status, never password hashes, sessions or provider identifiers. The API independently requires an administrator role and `user:view`. Google sign-in continues to require an existing active account and must match its current administrator-managed email, even for a previously linked Google identity. Google sign-in remains disabled unless explicitly configured and enabled.

Delivery commands use serializable transactions with a 10-second acquisition wait and 30-second execution limit, replacing Prisma's five-second default for completion, failure and status updates. Completion preserves atomic shipment/payment/event/notification writes and idempotent replay. A transaction error rolls back the command; live database latency and connection failures still require production monitoring.

Open **Management → Shops → select shop → Access**. Create a login, enable/disable it, set shipment and PDF permissions, set a new password, or send verification/reset emails. Disabled accounts remain visible for re-enabling. Permission changes invalidate old access and refresh sessions immediately. Shop permissions never grant access to another shop or company; admin/rider privileges cannot be assigned through this editor. Password changes are audited without recording passwords.

All users can change their own password in **Account settings** by supplying the current password. Forgotten passwords require a single-use email link. Resetting a password revokes existing sessions and other reset links. An admin setting a shop password does not verify the shop email.

## Security behavior

- Verification and reset links use random tokens; only SHA-256 hashes are stored. Links expire after 30 minutes and are consumed atomically.
- Tokens are placed in URL fragments and removed from the address bar after the page reads them. Opening a link does not consume it; the user must submit the confirmation form.
- Google credentials are checked by Google's authentication library for signature, issuer, audience and expiry. Unverified Google email is rejected.
- Google sign-in requires an existing active account. First-time matching by email is restricted to Google-authoritative Gmail or Workspace identities; other addresses use the email/password flow. Subsequent Google sign-ins use Google's stable subject identifier.
- The API loads current account activity, roles, shop permissions, email verification and session version on every authenticated request. Access tokens cannot preserve old privileges after an admin update.
- Public email requests use generic account-existence responses and rate limits. Provider/configuration failures are surfaced as operational errors.
