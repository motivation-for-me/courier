import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class EmailRequestDto {
  @IsEmail() @MaxLength(254) email!: string;
}
export class EmailTokenDto {
  @IsString() @MinLength(32) @MaxLength(128) token!: string;
}
export class ResetPasswordDto extends EmailTokenDto {
  @IsString() @MinLength(12) @MaxLength(72) password!: string;
}
export class ChangePasswordDto {
  @IsString() @MinLength(8) @MaxLength(72) currentPassword!: string;
  @IsString() @MinLength(12) @MaxLength(72) password!: string;
}
export class GoogleLoginDto {
  @IsString() @MinLength(20) @MaxLength(10000) credential!: string;
}
