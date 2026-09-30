import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { normalizePakistanPhone, pakistanPhonePattern } from '../../../common/phone';

export class CreateShopUserDto {
  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(12)
  password!: string;

  @IsOptional()
  @Transform(({ value }) => normalizePakistanPhone(value))
  @Matches(pakistanPhonePattern, { message: 'phone must be a valid Pakistan mobile number' })
  phone?: string;
}
