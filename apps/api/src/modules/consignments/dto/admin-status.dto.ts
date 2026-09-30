import { IsIn, IsOptional, IsString } from 'class-validator';

export class AdminStatusDto {
  @IsIn(['CONFIRMED', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED'])
  status!: 'CONFIRMED' | 'DISPATCHED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED';

  @IsOptional()
  @IsString()
  remarks?: string;
}
