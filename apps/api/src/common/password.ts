import { BadRequestException } from '@nestjs/common';

export function requirePasswordBytes(password: string) {
  if (Buffer.byteLength(password, 'utf8') > 72) throw new BadRequestException('Password must be at most 72 UTF-8 bytes.');
}
