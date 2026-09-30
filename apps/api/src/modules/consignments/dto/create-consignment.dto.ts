import { Transform, Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { normalizePakistanPhone, pakistanPhonePattern } from '../../../common/phone';

class PartyDto {
  @IsIn(['SENDER', 'RECEIVER'])
  kind!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @Transform(({ value }) => normalizePakistanPhone(value))
  @Matches(pakistanPhonePattern, { message: 'phone must be a valid Pakistan mobile number' })
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

class AddressDto {
  @IsIn(['ORIGIN', 'DESTINATION'])
  kind!: string;

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
  @IsString()
  countryCode?: string;

  @IsOptional()
  @IsString()
  zone?: string;

  @IsOptional()
  @IsString()
  landmark?: string;

  @IsOptional()
  @IsString()
  deliveryNote?: string;
}

class PackageDto {
  @IsNumber()
  @Min(1)
  packageNumber!: number;

  @IsNumber()
  @Min(0)
  physicalWeight!: number;

  @IsNumber()
  @Min(0)
  lengthCm!: number;

  @IsNumber()
  @Min(0)
  widthCm!: number;

  @IsNumber()
  @Min(0)
  heightCm!: number;
}

class DispatchItemDto {
  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsOptional()
  @IsString()
  sku?: string;

  @IsNumber()
  @Min(1)
  quantity!: number;

  @IsString()
  @IsNotEmpty()
  unit!: string;
}

export class CreateConsignmentDto {
  @IsString()
  @IsNotEmpty()
  serviceType!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PartyDto)
  parties!: PartyDto[];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddressDto)
  addresses!: AddressDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageDto)
  packages?: PackageDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DispatchItemDto)
  items?: DispatchItemDto[];

  @IsOptional()
  @IsString()
  customerId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  codAmount?: number;
}
