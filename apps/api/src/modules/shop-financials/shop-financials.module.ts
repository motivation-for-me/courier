import { Module } from '@nestjs/common';
import { ShopFinancialsController } from './shop-financials.controller';
import { ShopFinancialsService } from './shop-financials.service';

@Module({ controllers: [ShopFinancialsController], providers: [ShopFinancialsService] })
export class ShopFinancialsModule {}
