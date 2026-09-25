import { IsNumber, IsOptional, IsString, Matches, Min } from 'class-validator';

export class AssignRiderDto {
  @IsString()
  riderId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class CreateOtpDto {
  @IsString()
  purpose!: string;
}

export class VerifyOtpDto {
  @Matches(/^\d{6}$/)
  code!: string;
}

export class CompleteDeliveryDto {
  @Matches(/^\d{6}$/)
  otp!: string;

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
