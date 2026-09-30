import { IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';

export class UploadPaymentProofDto {
  @IsUUID()
  paymentId!: string;

  @IsString()
  storageKey!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  checksum?: string;
}
