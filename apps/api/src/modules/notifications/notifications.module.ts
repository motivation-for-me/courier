import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { PersistedNotificationProvider } from './notification-provider';

@Module({ imports: [PrismaModule], providers: [PersistedNotificationProvider], exports: [PersistedNotificationProvider] })
export class NotificationsModule {}
