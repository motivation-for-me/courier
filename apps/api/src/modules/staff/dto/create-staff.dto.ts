import { Transform } from 'class-transformer';
import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { normalizePakistanPhone, pakistanPhonePattern } from '../../../common/phone';
export class CreateStaffDto { @IsString() @MinLength(2) displayName!: string; @IsEmail() email!: string; @MinLength(8) password!: string; @IsOptional() @Transform(({ value }) => normalizePakistanPhone(value)) @Matches(pakistanPhonePattern, { message: 'phone must be a valid Pakistan mobile number' }) phone?: string; }
export class UpdateStaffDto { @IsOptional() @IsString() @MinLength(2) displayName?: string; @IsOptional() @IsEmail() email?: string; @IsOptional() @Transform(({ value }) => normalizePakistanPhone(value)) @Matches(pakistanPhonePattern, { message: 'phone must be a valid Pakistan mobile number' }) phone?: string; }
export class UpdateStaffAccessDto { @IsArray() @ArrayUnique() @IsString({ each: true }) permissions!: string[]; @IsBoolean() riderEnabled!: boolean; @IsOptional() @IsString() employeeCode?: string; }
