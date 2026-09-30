import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class PaymentDecisionDto {
  @IsOptional()
  @IsString()
  remarks?: string;
}

export class CodSettlementDto {
  @IsNumber()
  @Min(0)
  amount!: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}
