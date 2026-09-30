import { IsOptional, IsString, MinLength } from 'class-validator';

export class TransitionConsignmentDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  remarks?: string;
}
