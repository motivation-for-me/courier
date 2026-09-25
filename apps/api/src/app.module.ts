import { Module } from '@nestjs/common';
import { PrismaModule } from './infrastructure/prisma/prisma.module';
import { HealthModule } from './modules/health/health.module';
//import { DomainModules } from './modules/domain-modules';
import { AuthModule } from './modules/auth/auth.module';
import { PermissionGuard } from './common/permission.guard';
import { APP_GUARD } from '@nestjs/core';
import { ConsignmentsModule } from './modules/consignments/consignments.module';
import { ManifestsModule } from './modules/manifests/manifests.module';
import { DeliveryModule } from './modules/delivery/delivery.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { TrackingModule } from './modules/tracking/tracking.module';
import { ReturnsModule } from './modules/returns/returns.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { PickupsModule } from './modules/pickups/pickups.module';
import { TransitModule } from './modules/transit/transit.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [PrismaModule, HealthModule, AuthModule, ConsignmentsModule, ManifestsModule, DeliveryModule, PaymentsModule, TrackingModule, ReturnsModule, DocumentsModule, PickupsModule, TransitModule, NotificationsModule],
  providers: [{ provide: APP_GUARD, useClass: PermissionGuard }],
})
export class AppModule {}
