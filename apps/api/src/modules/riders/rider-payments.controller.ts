import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RiderPaymentsService } from './rider-payments.service';
import { RiderMoneyDto, RiderPayDto, RiderReceiptDto, RiderPayAllDto } from './rider-payments.dto';

@Controller('rider-payments')
export class RiderPaymentsController {
  constructor(private readonly payments: RiderPaymentsService) {}
  @Get() list(@CurrentUser() actor: AuthenticatedUser) { return this.payments.directory(actor); }
  @Post('entries/:entryId/receipt') receipt(@CurrentUser() actor: AuthenticatedUser, @Param('entryId') entryId: string, @Body() input: RiderReceiptDto) { return this.payments.receipt(actor, entryId, input); }
  @Get(':id') detail(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Query('page') page?: string, @Query('status') status?: string) { return this.payments.detail(actor, id, page, status); }
  @Post(':id/entries') record(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: RiderMoneyDto) { return this.payments.record(actor, id, input); }
  @Patch(':id/entries/:entryId') amend(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Param('entryId') entryId: string, @Body() input: RiderMoneyDto) { return this.payments.amend(actor, id, entryId, input); }
  @Post(':id/pay') pay(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: RiderPayDto) { return this.payments.pay(actor, id, input); }
  @Post(':id/default-fee') fee(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: RiderMoneyDto) { return this.payments.saveDefaultFee(actor, id, input); }
  @Post(':id/sync-fees') sync(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string) { return this.payments.saveDefaultFee(actor, id); }
  @Post(':id/pay-all') payAll(@CurrentUser() actor: AuthenticatedUser, @Param('id') id: string, @Body() input: RiderPayAllDto) { return this.payments.pay(actor, id, { ids: [], reference: input.reference }, true); }
}
