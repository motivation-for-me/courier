import { IsOptional, IsString, IsUUID } from 'class-validator';

export class AssignPickupDto {
  @IsUUID()
  assigneeId!: string;

  @IsOptional()
  @IsString()
  remarks?: string;
}

export class FailPickupDto {
  @IsString()
  reason!: string;
}
