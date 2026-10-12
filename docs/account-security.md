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

The API service in `vercel.json` explicitly includes the PDFKit package and font assets from both workspace-local and hoisted dependency locations. PDF rendering uses the normal Node `pdfkit` entry point, loaded only for PDF requests. Deploy the updated configuration together with the API; an older deployment importing `pdfkit/js/pdfkit.standalone.js` can crash before login with `MODULE_NOT_FOUND`. After deployment, check `/api/v1/auth/config`, `/api/v1/health/ready`, password sign-in and a shipment PDF download.

1. Ensure every account that needs access has a real email inbox. Correct old placeholder addresses through trusted administrative/database tooling before enforcing verification.
2. Configure Resend, its verified sender, the website URL, and Google client ID.
3. Apply `20261012090000_account_security` using `npm run db:migrate`; generate Prisma Client and deploy the API and web together.
4. At sign-in, use **Send verification email** and open the link to verify the administrator email. Existing passwords continue to work after verification.
5. Test forgotten password, single-use/expired links, Google sign-in, shop access changes, and session revocation against the deployed services.

The migration remains required for the account fields and shop access controls even while external authentication is disabled. Provider credentials are not required for this temporary password-only deployment. The setup steps above describe later activation. Email and OAuth credentials are required to validate those external flows end to end.

## Shop access

Open **Management → Shops → select shop → Access**. Create a login, enable/disable it, set shipment and PDF permissions, set a new password, or send verification/reset emails. Disabled accounts remain visible for re-enabling. Permission changes invalidate old access and refresh sessions immediately. Shop permissions never grant access to another shop or company; admin/rider privileges cannot be assigned through this editor. Password changes are audited without recording passwords.

All users can change their own password in **Account settings** by supplying the current password. Forgotten passwords require a single-use email link. Resetting a password revokes existing sessions and other reset links. An admin setting a shop password does not verify the shop email.

## Security behavior

- Verification and reset links use random tokens; only SHA-256 hashes are stored. Links expire after 30 minutes and are consumed atomically.
- Tokens are placed in URL fragments and removed from the address bar after the page reads them. Opening a link does not consume it; the user must submit the confirmation form.
- Google credentials are checked by Google's authentication library for signature, issuer, audience and expiry. Unverified Google email is rejected.
- Google sign-in requires an existing active account. First-time matching by email is restricted to Google-authoritative Gmail or Workspace identities; other addresses use the email/password flow. Subsequent Google sign-ins use Google's stable subject identifier.
- The API loads current account activity, roles, shop permissions, email verification and session version on every authenticated request. Access tokens cannot preserve old privileges after an admin update.
- Public email requests use generic account-existence responses and rate limits. Provider/configuration failures are surfaced as operational errors.
