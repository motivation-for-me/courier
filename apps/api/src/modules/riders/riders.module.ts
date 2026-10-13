import { Module } from '@nestjs/common';
import { RidersController } from './riders.controller';
import { RidersService } from './riders.service';
import { RiderPaymentsController } from './rider-payments.controller';
import { RiderPaymentsService } from './rider-payments.service';

@Module({ controllers: [RidersController, RiderPaymentsController], providers: [RidersService, RiderPaymentsService] })
export class RidersModule {}
