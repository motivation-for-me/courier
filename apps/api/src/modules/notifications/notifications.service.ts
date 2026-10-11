import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
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

  async inbox(actor: AuthenticatedUser, unreadOnly = false) {
    const where = { organizationId: actor.organizationId, recipientId: actor.id, channel: 'IN_APP' };
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({ where: { ...where, ...(unreadOnly ? { status: 'UNREAD' } : {}) }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50 }),
      this.prisma.notification.count({ where: { ...where, status: 'UNREAD' } }),
    ]);
    return { items, unread };
  }

  async riderMessage(message: string, actor: AuthenticatedUser) {
    if (!actor.roles.includes('RIDER') || !actor.riderId) throw new ForbiddenException('Rider access is required');
    const admins = await this.prisma.user.findMany({ where: { organizationId: actor.organizationId, isActive: true, roles: { some: { role: { name: 'ADMIN' } } } }, select: { id: true } });
    if (!admins.length) throw new NotFoundException('No active administrator is available');
    await this.prisma.notification.createMany({ data: admins.map((admin) => ({ organizationId: actor.organizationId, recipientId: admin.id, channel: 'IN_APP', template: 'RIDER_MESSAGE', status: 'UNREAD', payload: { title: `Message from ${actor.displayName}`, message: message.trim(), riderId: actor.riderId } })) });
    return { success: true, recipients: admins.length };
  }

  async read(id: string, actor: AuthenticatedUser) {
    const notification = await this.prisma.notification.findFirst({ where: { id, organizationId: actor.organizationId, recipientId: actor.id } });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { status: 'READ' } });
  }

  async readAll(actor: AuthenticatedUser) {
    const result = await this.prisma.notification.updateMany({ where: { organizationId: actor.organizationId, recipientId: actor.id, status: 'UNREAD' }, data: { status: 'READ' } });
    return { success: true, count: result.count };
  }
}
