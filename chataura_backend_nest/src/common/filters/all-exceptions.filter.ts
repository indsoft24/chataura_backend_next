import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { renderNotFoundPage } from '../../modules/web/templates/not-found.template';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'SERVER_ERROR';
    let message = 'Something went wrong. Please try again.';
    let errors: unknown = undefined;
    let details: unknown = undefined;

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
          details = err.details;
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

    if (status === HttpStatus.NOT_FOUND && this.wantsHtmlPage(request)) {
      const path = (request?.url ?? '/').split('?')[0];
      void response
        .status(status)
        .type('text/html; charset=utf-8')
        .send(
          renderNotFoundPage({
            path,
            playStoreUrl: process.env.PLAY_STORE_URL || undefined,
          }),
        );
      return;
    }

    void response.status(status).send({
      success: false,
      error: {
        code,
        message,
        ...(errors !== undefined ? { errors } : {}),
        ...(details !== undefined ? { details } : {}),
      },
    });
  }

  /**
   * Browser page navigations to unknown website URLs get the branded 404 page.
   * API, uploads, websocket and non-HTML clients keep the JSON error contract.
   */
  private wantsHtmlPage(request: FastifyRequest | undefined): boolean {
    if (!request) return false;
    if (request.method !== 'GET' && request.method !== 'HEAD') return false;
    const accept = String(request.headers?.accept ?? '');
    if (!accept.includes('text/html')) return false;
    const path = (request.url ?? '/').split('?')[0].toLowerCase();
    const apiPrefix = `/${(process.env.API_PREFIX || 'api/v2').replace(/^\/+|\/+$/g, '').toLowerCase()}`;
    const jsonOnly = [apiPrefix, '/api', '/uploads', '/socket.io', '/ws'];
    return !jsonOnly.some((p) => path === p || path.startsWith(`${p}/`));
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
