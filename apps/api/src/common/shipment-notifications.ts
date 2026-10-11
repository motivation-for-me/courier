import { Prisma } from '@prisma/client';

// Called inside the shipment transaction: an event and its alerts commit together.
export async function notifyShipmentDelivery(
  transaction: Prisma.TransactionClient,
  shipment: { id: string; organizationId: string; customerId: string | null; cnNumber: string },
  actorId: string,
  status: 'DELIVERED' | 'OUT_FOR_DELIVERY' | 'DELIVERY_FAILED',
  reason?: string,
) {
  const recipients = await transaction.user.findMany({
    where: {
      organizationId: shipment.organizationId, isActive: true,
      OR: [
        { roles: { some: { role: { name: 'ADMIN' } } } },
        ...(shipment.customerId ? [{ customerId: shipment.customerId, roles: { some: { role: { name: 'SHOP' } } } }] : []),
        ...(status === 'DELIVERED' ? [{ id: actorId }] : []),
      ],
    },
    select: { id: true },
  });
  const title = status === 'DELIVERED' ? 'Parcel delivered' : status === 'OUT_FOR_DELIVERY' ? 'Parcel out for delivery' : 'Delivery attempt failed';
  const message = `${shipment.cnNumber}: ${title.toLowerCase()}.${reason ? ` ${reason}` : ''}`;
  if (recipients.length) await transaction.notification.createMany({
    data: [...new Set(recipients.map((user) => user.id))].map((recipientId) => ({
      organizationId: shipment.organizationId, recipientId, channel: 'IN_APP',
      template: status === 'DELIVERED' ? 'DELIVERY_COMPLETED' : `DELIVERY_${status === 'DELIVERY_FAILED' ? 'FAILED' : status}`,
      status: 'UNREAD', payload: { title, message, consignmentId: shipment.id, cnNumber: shipment.cnNumber },
    })),
  });
}
