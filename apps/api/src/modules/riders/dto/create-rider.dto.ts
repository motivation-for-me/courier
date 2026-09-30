import { Transform } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min, MinLength } from 'class-validator';
import { normalizePakistanPhone, pakistanPhonePattern } from '../../../common/phone';

export class CreateRiderDto {
  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;

  @IsOptional()
  @Transform(({ value }) => normalizePakistanPhone(value))
  @Matches(pakistanPhonePattern, { message: 'phone must be a valid Pakistan mobile number' })
  phone?: string;

  @IsString()
  @Matches(/^[A-Za-z0-9-]{2,24}$/)
  employeeCode!: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;

  @IsOptional() @IsArray() @IsString({ each: true }) serviceAreas?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(100) dailyCapacity?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) deliveryFee?: number;
  @IsOptional() @IsIn(['AVAILABLE', 'BUSY', 'OFF_DUTY']) availability?: string;
}

export class UpdateRiderDto {
  @IsOptional() @IsString() @MinLength(2) displayName?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @Transform(({ value }) => normalizePakistanPhone(value)) @Matches(pakistanPhonePattern, { message: 'phone must be a valid Pakistan mobile number' }) phone?: string;
  @IsOptional() @Matches(/^[A-Za-z0-9-]{2,24}$/) employeeCode?: string;
  @IsOptional() @IsString() vehicleNumber?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) serviceAreas?: string[];
  @IsOptional() @IsInt() @Min(1) @Max(100) dailyCapacity?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) deliveryFee?: number;
  @IsOptional() @IsIn(['AVAILABLE', 'BUSY', 'OFF_DUTY']) availability?: string;
}

export class EnableMyRiderAccessDto {
  @IsString()
  @Matches(/^[A-Za-z0-9-]{2,24}$/)
  employeeCode!: string;
}
