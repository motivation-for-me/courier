import { ServiceUnavailableException } from '@nestjs/common';

export function requireEmailConfiguration() {
  if (process.env.ACCOUNT_EMAIL_ENABLED !== 'true') throw new ServiceUnavailableException('Account email is temporarily disabled.');
  if (!process.env.RESEND_API_KEY || !process.env.EMAIL_FROM) throw new ServiceUnavailableException('Account email is not configured. Contact the administrator.');
}

export async function sendAccountEmail(email: string, purpose: 'VERIFY_EMAIL' | 'RESET_PASSWORD', token: string) {
  requireEmailConfiguration();
  const origin = process.env.APP_PUBLIC_URL || process.env.WEB_ORIGIN?.split(',')[0]?.trim();
  if (!origin) throw new ServiceUnavailableException('The account website URL is not configured.');
  const url = new URL(purpose === 'VERIFY_EMAIL' ? '/account/verify' : '/account/reset', origin);
  url.hash = new URLSearchParams({ token }).toString();
  const title = purpose === 'VERIFY_EMAIL' ? 'Verify your SwiftLog email' : 'Reset your SwiftLog password';
  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.EMAIL_FROM, to: [email], subject: title, text: `${title}\n\nOpen this link: ${url.toString()}\n\nThis link expires in 30 minutes and can be used once. If you did not request it, ignore this email.` }),
    });
  } catch { throw new ServiceUnavailableException('Account email could not be sent. Please try again later.'); }
  if (!response.ok) throw new ServiceUnavailableException('Account email could not be sent. Please try again later.');
}
