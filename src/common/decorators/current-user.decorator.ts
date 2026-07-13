import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { TokenPayload } from '../interfaces/token-payload.interface';

// Usage: changePassword(@CurrentUser() user: TokenPayload) instead of reaching into
// req.user manually the way the template's controllers did.
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): TokenPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.user;
  },
);
