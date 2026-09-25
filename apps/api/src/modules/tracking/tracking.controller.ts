import { Controller, Get, Param } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

@Controller('tracking')
export class TrackingController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('public/:cnNumber')
  async publicTracking(@Param('cnNumber') cnNumber: string) {
    const shipment = await this.prisma.consignment.findFirst({ where: { cnNumber }, select: { cnNumber: true, status: true, serviceType: true, currentStatusAt: true, events: { orderBy: { eventTime: 'asc' }, select: { eventType: true, eventTime: true, remarks: true } } } });
    if (!shipment) return { found: false };
    return { found: true, shipment };
  }
}
