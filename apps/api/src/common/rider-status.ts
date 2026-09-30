import { ConsignmentStatus } from '@prisma/client';

export type RiderStatus = 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED';

export function allowedRiderStatuses(status: ConsignmentStatus, pendingCod: boolean): RiderStatus[] {
  if (status === ConsignmentStatus.DISPATCHED || status === ConsignmentStatus.DELIVERY_FAILED || status === ConsignmentStatus.DELIVERY_ATTEMPT_FAILED) return ['OUT_FOR_DELIVERY'];
  if (status === ConsignmentStatus.OUT_FOR_DELIVERY) return pendingCod ? ['DELIVERY_FAILED'] : ['DELIVERED', 'DELIVERY_FAILED'];
  return [];
}
