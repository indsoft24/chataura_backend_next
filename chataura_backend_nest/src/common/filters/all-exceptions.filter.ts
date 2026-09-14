import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply } from 'fastify';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'SERVER_ERROR';
    let message = 'Something went wrong. Please try again.';
    let errors: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        code = this.defaultCode(status);
      } else if (typeof body === 'object' && body !== null) {
        const obj = body as Record<string, unknown>;
        if (obj.error && typeof obj.error === 'object') {
          const err = obj.error as Record<string, unknown>;
          code = String(err.code ?? this.defaultCode(status));
          message = String(err.message ?? message);
          errors = err.errors;
        } else {
          code = String(obj.code ?? this.defaultCode(status));
          if (Array.isArray(obj.message)) {
            message = 'Validation failed';
            errors = obj.message;
            code = 'VALIDATION_ERROR';
          } else {
            message = String(obj.message ?? message);
          }
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    void response.status(status).send({
      success: false,
      error: {
        code,
        message,
        ...(errors !== undefined ? { errors } : {}),
      },
    });
  }

  private defaultCode(status: number): string {
    if (status === 401) return 'UNAUTHORIZED';
    if (status === 403) return 'FORBIDDEN';
    if (status === 404) return 'NOT_FOUND';
    if (status === 429) return 'TOO_MANY_REQUESTS';
    if (status >= 500) return 'SERVER_ERROR';
    return 'ERROR';
  }
}
