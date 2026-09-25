import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { AssignRiderDto, CompleteDeliveryDto, CreateOtpDto, FailedDeliveryDto, VerifyOtpDto } from './dto/delivery.dto';
import { DeliveryService } from './delivery.service';

@Controller('delivery')
@UseGuards(AuthGuard)
export class DeliveryController {
  constructor(private readonly delivery: DeliveryService) {}

  @Post('scan')
  @RequirePermission('delivery:scan')
  scan(@Body('cnNumber') cnNumber: string, @CurrentUser() actor: AuthenticatedUser) { return this.delivery.scan(cnNumber, actor); }

  @Post(':id/assign')
  @RequirePermission('delivery:assign')
  assign(@Param('id') id: string, @Body() input: AssignRiderDto, @CurrentUser() actor: AuthenticatedUser) { return this.delivery.assign(id, input.riderId, actor, input.reason); }

  @Post(':id/otp')
  @RequirePermission('delivery:update')
  createOtp(@Param('id') id: string, @Body() input: CreateOtpDto, @CurrentUser() actor: AuthenticatedUser) { return this.delivery.createOtp(id, actor, input.purpose); }

  @Post(':id/otp/verify')
  @RequirePermission('delivery:update')
  verifyOtp(@Param('id') id: string, @Body() input: VerifyOtpDto, @CurrentUser() actor: AuthenticatedUser) { return this.delivery.verifyOtp(id, actor, input.code); }

  @Post(':id/complete')
  @RequirePermission('delivery:complete')
  complete(@Param('id') id: string, @Body() input: CompleteDeliveryDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentUser() actor: AuthenticatedUser) { return this.delivery.complete(id, actor, input.otp, input.collectedAmount, input.remarks, idempotencyKey); }

  @Post(':id/failed')
  @RequirePermission('delivery:update')
  failed(@Param('id') id: string, @Body() input: FailedDeliveryDto, @CurrentUser() actor: AuthenticatedUser) { return this.delivery.failed(id, actor, input.reason, input.remarks); }
}
