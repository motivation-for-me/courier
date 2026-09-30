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
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { CustomersModule } from './modules/customers/customers.module';
import { AuthGuard } from './modules/auth/auth.guard';
import { RidersModule } from './modules/riders/riders.module';
import { BranchesModule } from './modules/branches/branches.module';
import { StaffModule } from './modules/staff/staff.module';
import { ShopFinancialsModule } from './modules/shop-financials/shop-financials.module';

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]), PrismaModule, HealthModule, AuthModule, BranchesModule, StaffModule, CustomersModule, ShopFinancialsModule, RidersModule, ConsignmentsModule, ManifestsModule, DeliveryModule, PaymentsModule, TrackingModule, ReturnsModule, DocumentsModule, PickupsModule, TransitModule, NotificationsModule],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}
