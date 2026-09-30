import { Module } from '@nestjs/common';
import { TransitController } from './transit.controller';
import { TransitService } from './transit.service';

@Module({ controllers: [TransitController], providers: [TransitService] })
export class TransitModule {}
