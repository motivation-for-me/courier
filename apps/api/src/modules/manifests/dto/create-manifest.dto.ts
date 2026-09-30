import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateManifestDto {
  @IsString()
  @IsNotEmpty()
  manifestNumber!: string;

  @IsOptional()
  @IsString()
  originHubId?: string;

  @IsOptional()
  @IsString()
  destinationHubId?: string;

  @IsOptional()
  @IsString()
  originBranchId?: string;

  @IsOptional()
  @IsString()
  destinationBranchId?: string;
}
