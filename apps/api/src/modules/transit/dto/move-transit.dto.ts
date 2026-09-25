import { IsOptional, IsString, IsUUID } from 'class-validator';

export class MoveTransitDto {
  @IsOptional()
  @IsUUID()
  hubId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}
