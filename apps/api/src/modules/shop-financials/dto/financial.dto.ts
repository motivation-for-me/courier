import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength, ValidateNested } from 'class-validator';
import { FinancialEntryCategory, FinancialEntryType } from '@prisma/client';

export class ShopPricingDto {
  @IsString() @MinLength(3) currencyCode!: string;
  @IsNumber() @Min(0) shipmentCharge!: number;
  @IsNumber() @Min(0) codFeeFixed!: number;
  @IsNumber() @Min(0) codFeePercent!: number;
  @IsNumber() @Min(0) returnCharge!: number;
  @IsBoolean() deductChargesFromCod!: boolean;
}

export class FinancialEntryDto {
  @IsUUID() consignmentId!: string;
  @IsEnum(FinancialEntryCategory) category!: FinancialEntryCategory;
  @IsEnum(FinancialEntryType) type!: FinancialEntryType;
  @IsNumber() amount!: number;
  @IsBoolean() deductFromShop!: boolean;
  @IsString() @MinLength(4) reason!: string;
  @IsOptional() @IsString() reference?: string;
}

export class SettlementAllocationDto {
  @IsUUID() consignmentId!: string;
  @IsNumber() @Min(0.01) amount!: number;
}

export class ShopSettlementDto {
  @IsNumber() @Min(0.01) amount!: number;
  @IsString() @MinLength(3) currencyCode!: string;
  @IsDateString() paidAt!: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() remarks?: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SettlementAllocationDto) allocations!: SettlementAllocationDto[];
}
