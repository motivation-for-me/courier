import { Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { CreateConsignmentDto } from './dto/create-consignment.dto';
import { TransitionConsignmentDto } from './dto/transition-consignment.dto';
import { ConsignmentsService } from './consignments.service';
import { AdminStatusDto } from './dto/admin-status.dto';
import { CorrectStatusDto } from './dto/correct-status.dto';

@Controller(['consignments', 'dispatches'])
@UseGuards(AuthGuard)
export class ConsignmentsController {
  constructor(private readonly consignments: ConsignmentsService) {}

  @Post()
  @RequirePermission('shipment:create')
  create(@Body() input: CreateConsignmentDto, @Headers('idempotency-key') idempotencyKey: string | undefined, @CurrentUser() actor: AuthenticatedUser) {
    return this.consignments.create(input, actor, idempotencyKey);
  }

  @Get()
  @RequirePermission('shipment:view')
  list(@CurrentUser() actor: AuthenticatedUser, @Query('search') search?: string) {
    return this.consignments.list(actor, search);
  }

  @Get(':id')
  @RequirePermission('shipment:view')
  get(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) {
    return this.consignments.get(id, actor);
  }

  @Post(':id/verify')
  @RequirePermission('shipment:verify')
  verify(@Param('id') id: string, @Body() input: TransitionConsignmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.consignments.transition(id, 'verify', actor, input.remarks);
  }

  @Post(':id/confirm')
  @RequirePermission('shipment:verify')
  confirm(@Param('id') id: string, @Body() input: TransitionConsignmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.consignments.transition(id, 'confirm', actor, input.remarks);
  }

  @Post(':id/cancel')
  @RequirePermission('shipment:cancel')
  cancel(@Param('id') id: string, @Body() input: TransitionConsignmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.consignments.transition(id, 'cancel', actor, input.remarks);
  }

  @Post(':id/out-for-delivery')
  @RequirePermission('delivery:update')
  outForDelivery(@Param('id') id: string, @Body() input: TransitionConsignmentDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.consignments.transition(id, 'outForDelivery', actor, input.remarks);
  }

  @Post(':id/status')
  @RequirePermission('delivery:update')
  updateStatus(@Param('id') id: string, @Body() input: AdminStatusDto, @CurrentUser() actor: AuthenticatedUser) {
    return this.consignments.adminStatus(id, input.status, actor, input.remarks);
  }

  @Patch(':id/correct-status')
  @RequirePermission('shipment:verify')
  correctStatus(@Param('id') id: string, @Body() input: CorrectStatusDto, @CurrentUser() actor: AuthenticatedUser) { return this.consignments.correctStatus(id, input.status, input.reason, actor); }

  @Delete(':id')
  @RequirePermission('shipment:cancel')
  remove(@Param('id') id: string, @CurrentUser() actor: AuthenticatedUser) { return this.consignments.remove(id, actor); }
}
