import { Module } from '@nestjs/common';
import { ConsignmentsController } from './consignments.controller';
import { ConsignmentsService } from './consignments.service';

@Module({
  controllers: [ConsignmentsController],
  providers: [ConsignmentsService],
})
export class ConsignmentsModule {}
