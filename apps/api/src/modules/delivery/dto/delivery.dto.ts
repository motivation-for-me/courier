import { IsIn, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class RiderScanDto {
  @IsString()
  cnNumber!: string;

}

export class RiderStatusDto {
  @IsIn(['OUT_FOR_DELIVERY'])
  status!: 'OUT_FOR_DELIVERY';

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class AssignRiderDto {
  @IsString()
  riderId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CompleteDeliveryDto {
  @IsNumber()
  @Min(0)
  @IsOptional()
  collectedAmount?: number;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class FailedDeliveryDto {
  @IsString()
  reason!: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
