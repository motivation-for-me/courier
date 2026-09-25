import { Type } from 'class-transformer';
import { IsArray, IsEmail, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

class PartyDto {
  @IsIn(['SENDER', 'RECEIVER'])
  kind!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @Matches(/^\+?[1-9]\d{7,14}$/)
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

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PackageDto)
  packages!: PackageDto[];

  @IsOptional()
  @IsNumber()
  @Min(0)
  codAmount?: number;
}
