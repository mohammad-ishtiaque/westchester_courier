import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ApiResponse } from '../interfaces/api-response.interface';

// Every controller just returns `{ message, data }` (or nothing). This interceptor
// wraps that into the same { success, statusCode, message, data } shape the Express
// template's sendResponse.ts produced, so the frontend contract doesn't change.
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T>> {
    const http = context.switchToHttp();
    const response = http.getResponse();
    const statusCode = response.statusCode;

    return next.handle().pipe(
      map((result) => {
        // Controllers may return { message, data, meta } or just data directly
        const isEnvelope =
          result && typeof result === 'object' && ('message' in result || 'data' in result || 'meta' in result);

        const message = isEnvelope ? result.message : undefined;
        const data = isEnvelope ? result.data : result;
        const meta = isEnvelope ? result.meta : undefined;

        return {
          success: true,
          statusCode,
          ...(message != null && { message }),
          ...(meta != null && { meta }),
          ...(data != null && { data }),
        };
      }),
    );
  }
}
