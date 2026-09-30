import { IsIn, IsString, MinLength } from 'class-validator';

export class CorrectStatusDto {
  @IsIn(['DRAFT', 'CONFIRMED', 'ASSIGNED_TO_RIDER', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'DELIVERY_FAILED', 'RETURNED', 'CANCELLED'])
  status!: 'DRAFT' | 'CONFIRMED' | 'ASSIGNED_TO_RIDER' | 'DISPATCHED' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'DELIVERY_FAILED' | 'RETURNED' | 'CANCELLED';

  @IsString()
  @MinLength(10, { message: 'reason must contain at least 10 characters' })
  reason!: string;
}
