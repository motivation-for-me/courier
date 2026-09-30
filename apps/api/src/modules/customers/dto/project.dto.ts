import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, IsUUID, Matches } from 'class-validator';
import { normalizePakistanPhone, pakistanPhonePattern } from '../../../common/phone';

export class CreateProjectDto {
  @IsOptional()
  @IsUUID()
  customerId?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  siteName?: string;

  @IsOptional()
  @IsString()
  contactName?: string;

  @IsOptional()
  @Transform(({ value }) => normalizePakistanPhone(value))
  @Matches(pakistanPhonePattern, { message: 'contactPhone must be a valid Pakistan mobile number' })
  contactPhone?: string;

  @IsString()
  @IsNotEmpty()
  addressLine!: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  region?: string;

  @IsOptional()
  @Matches(/^[A-Z]{2}$/)
  countryCode?: string;
}
