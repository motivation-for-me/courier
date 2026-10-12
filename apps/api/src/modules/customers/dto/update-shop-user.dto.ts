import { ArrayUnique, IsArray, IsBoolean, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const shopPermissions = ['shipment:create', 'shipment:view', 'customer:view', 'documents:view', 'documents:create'];
export class UpdateShopUserDto {
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsIn(shopPermissions, { each: true }) permissions?: string[];
  @IsOptional() @IsString() @MinLength(12) @MaxLength(72) password?: string;
}
