import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { AuthenticatedUser } from '../../common/auth.types';

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  list(actor: AuthenticatedUser) {
    return this.prisma.notification.findMany({
      where: { organizationId: actor.organizationId, OR: [{ recipientId: actor.id }, { recipientId: null }] },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async read(id: string, actor: AuthenticatedUser) {
    const notification = await this.prisma.notification.findFirst({ where: { id, organizationId: actor.organizationId, OR: [{ recipientId: actor.id }, { recipientId: null }] } });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { status: 'READ' } });
  }

  async readAll(actor: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({ where: { organizationId: actor.organizationId, status: { not: 'READ' }, OR: [{ recipientId: actor.id }, { recipientId: null }] }, data: { status: 'READ' } });
    return { success: true, count: result.count };
  }
}
