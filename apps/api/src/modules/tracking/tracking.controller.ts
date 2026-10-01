import { Controller, Get, Param, Query } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { Public } from '../../common/public.decorator';
import { verifyPublicTrackingToken } from '../../common/public-tracking-token';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('public/:cnNumber')
  @Public()
  async publicTracking(@Param('cnNumber') cnNumber: string, @Query('key') key?: string) {
    const shipment = await this.prisma.consignment.findFirst({ where: { cnNumber, deletedAt: null }, select: { id: true, cnNumber: true, status: true, serviceType: true, currentStatusAt: true, organization: { select: { name: true } }, parties: { where: { kind: 'RECEIVER' }, select: { name: true, phone: true } }, addresses: { where: { kind: 'DESTINATION' }, select: { addressLine: true, city: true, landmark: true, deliveryNote: true } }, assignments: { where: { status: 'ACTIVE' }, take: 1, select: { rider: { select: { employeeCode: true, vehicleDetails: true, user: { select: { displayName: true, phone: true } } } } } }, events: { orderBy: { eventTime: 'asc' }, select: { eventType: true, eventTime: true, remarks: true } } } });
    if (!shipment) return { found: false };
    const detailed = verifyPublicTrackingToken(shipment.id, key);
    const publicEvents = shipment.events.map(({ eventType, eventTime }) => ({ eventType, eventTime }));
    return { found: true, shipment: { cnNumber: shipment.cnNumber, status: shipment.status, serviceType: shipment.serviceType, currentStatusAt: shipment.currentStatusAt, organization: shipment.organization, events: publicEvents, ...(detailed ? { receiver: shipment.parties[0] ?? null, destination: shipment.addresses[0] ?? null, rider: shipment.assignments[0]?.rider ?? null } : {}) } };
  }
}
