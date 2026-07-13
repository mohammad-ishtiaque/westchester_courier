import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response } from 'express';

// Catches EVERYTHING (Nest HttpExceptions thrown via e.g. `throw new BadRequestException(...)`,
// Mongoose validation/cast errors, and anything else) and formats it into the same
// { success: false, message, errorMessages: [...] } shape the Express template used,
// so the frontend's error-handling code doesn't need to change.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong';
    let errorMessages: { path: string; message: string }[] = [];

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const b = body as { message?: string | string[] };
        if (Array.isArray(b.message)) {
          // class-validator's ValidationPipe throws with message: string[]
          message = 'Validation failed';
          errorMessages = b.message.map((m) => ({ path: '', message: m }));
        } else {
          message = b.message ?? message;
        }
      }
    } else if (exception instanceof Error) {
      // Mongoose ValidationError
      if (exception.name === 'ValidationError') {
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Validation error';
        const err = exception as unknown as {
          errors: Record<string, { path: string; message: string }>;
        };
        errorMessages = Object.values(err.errors).map((e) => ({
          path: e.path,
          message: e.message,
        }));
      } else if (exception.name === 'CastError') {
        statusCode = HttpStatus.BAD_REQUEST;
        message = 'Invalid id format';
      } else if ((exception as { code?: number }).code === 11000) {
        // Mongo duplicate key error
        statusCode = HttpStatus.CONFLICT;
        message = 'Duplicate value entered';
      } else {
        message = exception.message || message;
      }
    }

    if (statusCode === HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    }

    response.status(statusCode).json({
      success: false,
      statusCode,
      message,
      ...(errorMessages.length > 0 && { errorMessages }),
    });
  }
}
