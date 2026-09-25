import { IsArray, IsString, IsUUID } from 'class-validator';

export class ManifestItemsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  consignmentIds!: string[];
}

export class ReceiveManifestDto {
  @IsArray()
  @IsUUID('4', { each: true })
  receivedConsignmentIds!: string[];

  @IsString()
  remarks!: string;
}
