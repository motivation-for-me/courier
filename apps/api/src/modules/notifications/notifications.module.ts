import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { PersistedNotificationProvider } from './notification-provider';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({ imports: [PrismaModule], controllers: [NotificationsController], providers: [PersistedNotificationProvider, NotificationsService], exports: [PersistedNotificationProvider] })
export class NotificationsModule {}
