import { createHmac, timingSafeEqual } from 'node:crypto';

function secret() {
  const value = process.env.JWT_SECRET;
  if (!value) throw new Error('JWT_SECRET must be configured');
  return value;
}

export function createPublicTrackingToken(consignmentId: string) {
  return createHmac('sha256', secret()).update(`public-tracking:${consignmentId}`).digest('base64url');
}

export function verifyPublicTrackingToken(consignmentId: string, token?: string) {
  if (!token) return false;
  const expected = createPublicTrackingToken(consignmentId);
  const suppliedBuffer = Buffer.from(token);
  const expectedBuffer = Buffer.from(expected);
  return suppliedBuffer.length === expectedBuffer.length && timingSafeEqual(suppliedBuffer, expectedBuffer);
}
