import { IsOptional, IsString, Matches, MinLength } from 'class-validator';
export class CreateBranchDto { @IsString() @MinLength(2) name!: string; @Matches(/^[A-Za-z0-9-]{2,16}$/) code!: string; }
export class UpdateBranchDto { @IsOptional() @IsString() @MinLength(2) name?: string; @IsOptional() @Matches(/^[A-Za-z0-9-]{2,16}$/) code?: string; }
