import { ArgumentsHost, Catch, ConflictException, ExceptionFilter, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Catch(Prisma.PrismaClientKnownRequestError, Prisma.PrismaClientInitializationError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: Prisma.PrismaClientKnownRequestError | Prisma.PrismaClientInitializationError, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse();
    if (exception instanceof Prisma.PrismaClientInitializationError || exception.code === 'P1001') {
      const error = new ServiceUnavailableException('The database is temporarily unavailable. Please try again shortly.');
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    if (exception.code === 'P2002') {
      const error = new ConflictException('This record already exists or the action was already completed.');
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    if (exception.code === 'P2034') {
      const error = new ConflictException('Another request updated this record. Reload and try again.');
      response.status(error.getStatus()).json(error.getResponse());
      return;
    }
    throw exception;
  }
}
