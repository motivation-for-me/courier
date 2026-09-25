import { DocumentType } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class RegisterDocumentDto {
  @IsEnum(DocumentType)
  type!: DocumentType;

  @IsString()
  storageKey!: string;

  @IsString()
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(25 * 1024 * 1024)
  sizeBytes!: number;

  @IsOptional()
  @IsString()
  checksum?: string;
}
