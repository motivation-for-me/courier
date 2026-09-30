import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { AssignRiderDto, CompleteDeliveryDto, FailedDeliveryDto, RiderScanDto, RiderStatusDto } from './dto/delivery.dto';
import { DeliveryService } from './delivery.service';
import { Throttle } from '@nestjs/throttler';

@Controller('delivery')
@UseGuards(AuthGuard)
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post('scan')
  @RequirePermission('delivery:scan')
  @Throttle({ default: { limit: 5, ttl: 300_000 } })
  scan(@Body() input: RiderScanDto, @CurrentUser() actor: AuthenticatedUser) { return this.delivery.scan(input.cnNumber, actor); }

  @Post(':id/status')
  @RequirePermission('delivery:update')
  @Throttle({ default: { limit: 10, ttl: 300_000 } })
  updateStatus(@Param('id') id: string, @Body() input: RiderStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.delivery.updateRiderStatus(id, input.status, actor, input.remarks);
  }

  @Post(':id/assign')
  @RequirePermission('delivery:assign')
  assign(@Param('id') id: string, @Body() input: AssignRiderDto, @CurrentUser() actor: AuthenticatedUser) { return this.delivery.assign(id, input.riderId, actor, input.reason); }

  @Post(':id/complete')
  @RequirePermission('delivery:complete')
  complete(@Param('id') id: string, @Body() input: CompleteDeliveryDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentUser() actor: AuthenticatedUser) { return this.delivery.complete(id, actor, input.collectedAmount, input.remarks, idempotencyKey); }

  @Post(':id/failed')
  @RequirePermission('delivery:update')
  failed(@Param('id') id: string, @Body() input: FailedDeliveryDto, @CurrentUser() actor: AuthenticatedUser) { return this.delivery.failed(id, actor, input.reason, input.remarks); }
}
