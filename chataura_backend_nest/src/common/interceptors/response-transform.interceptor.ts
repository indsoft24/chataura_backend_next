import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Wraps successful controller responses in the Laravel-compatible envelope:
 * { success: true, data: ... }
 *
 * Controllers that already return { success: ... } are left untouched.
 */
@Injectable()
export class ResponseTransformInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(
      map((data) => {
        if (
          data !== null &&
          typeof data === 'object' &&
          'success' in (data as Record<string, unknown>)
        ) {
          return data;
        }
        return { success: true, data: data ?? null };
      }),
    );
  }
}
