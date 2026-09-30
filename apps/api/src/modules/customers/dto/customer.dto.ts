import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';
import { normalizePakistanPhone, pakistanPhonePattern } from '../../../common/phone';

export class CreateCustomerDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(({ value }) => normalizePakistanPhone(value))
  @Matches(pakistanPhonePattern, { message: 'phone must be a valid Pakistan mobile number' })
  phone?: string;
}

export class CreateCustomerAddressDto {
  @IsString()
  @IsNotEmpty()
  label!: string;

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

export class UpdateCustomerDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @Transform(({ value }) => normalizePakistanPhone(value))
  @Matches(pakistanPhonePattern, { message: 'phone must be a valid Pakistan mobile number' })
  phone?: string;
}
