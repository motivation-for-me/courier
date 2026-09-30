import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';

export interface NotificationRequest {
  organizationId: string;
  recipientId?: string;
  channel: string;
  template: string;
  payload?: Record<string, unknown>;
}

export interface NotificationProvider {
  send(request: NotificationRequest): Promise<{ id: string; status: string }>;
}

@Injectable()
export class PersistedNotificationProvider implements NotificationProvider {
  constructor(private readonly prisma: PrismaService) {}

  async send(request: NotificationRequest) {
    const notification = await this.prisma.notification.create({ data: { ...request, payload: request.payload as Prisma.InputJsonValue, status: 'QUEUED' } });
    return { id: notification.id, status: notification.status };
  }
}
