import { ArrayMaxSize, ArrayMinSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

export class RiderMoneyDto {
  @IsString() @Matches(/^(0|[1-9]\d{0,9})(\.\d{1,2})?$/) amount!: string;
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(3) @MaxLength(500) reason!: string;
  @IsOptional() @IsUUID() consignmentId?: string;
}
export class RiderPayDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ArrayUnique() @IsUUID('4', { each: true }) ids!: string[];
  @Transform(({ value }) => typeof value === 'string' ? value.trim() : value) @IsString() @MinLength(3) @MaxLength(200) reference!: string;
}
export class RiderReceiptDto {
  @IsIn(['confirm', 'dispute']) decision!: 'confirm' | 'dispute';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}
