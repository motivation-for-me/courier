import { Body, Controller, Get, Param, Post, Put, Query } from '@nestjs/common';
import { CurrentUser } from '../../common/current-user.decorator';
import { AuthenticatedUser } from '../../common/auth.types';
import { RequirePermission } from '../../common/permissions.decorator';
import { FinancialEntryDto, ShopPricingDto, ShopSettlementDto } from './dto/financial.dto';
import { ShopFinancialsService } from './shop-financials.service';

@Controller('shops/:shopId/financials')
export class ShopFinancialsController {
  constructor(private readonly financials: ShopFinancialsService) {}

  @Get('summary') @RequirePermission('payment:view')
  summary(@Param('shopId') shopId: string, @Query('from') from: string | undefined, @Query('to') to: string | undefined, @CurrentUser() actor: AuthenticatedUser) { return this.financials.summary(shopId, actor, from, to); }

  @Get('transactions') @RequirePermission('payment:view')
  transactions(@Param('shopId') shopId: string, @Query('from') from: string | undefined, @Query('to') to: string | undefined, @CurrentUser() actor: AuthenticatedUser) { return this.financials.transactions(shopId, actor, from, to); }

  @Get('pricing') @RequirePermission('payment:view')
  pricing(@Param('shopId') shopId: string, @CurrentUser() actor: AuthenticatedUser) { return this.financials.pricing(shopId, actor); }

  @Put('pricing') @RequirePermission('payment:settle')
  savePricing(@Param('shopId') shopId: string, @Body() input: ShopPricingDto, @CurrentUser() actor: AuthenticatedUser) { return this.financials.savePricing(shopId, input, actor); }

  @Post('transactions') @RequirePermission('payment:settle')
  addEntry(@Param('shopId') shopId: string, @Body() input: FinancialEntryDto, @CurrentUser() actor: AuthenticatedUser) { return this.financials.addEntry(shopId, input, actor); }

  @Post('settlements') @RequirePermission('payment:settle')
  settle(@Param('shopId') shopId: string, @Body() input: ShopSettlementDto, @CurrentUser() actor: AuthenticatedUser) { return this.financials.settle(shopId, input, actor); }
}
