import { IsNotEmpty, IsString } from 'class-validator';

export class CreateReturnDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
