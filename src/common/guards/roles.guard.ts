import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { Role } from '../enums/role.enum';
import { TokenPayload } from '../interfaces/token-payload.interface';

// Runs AFTER JwtAuthGuard (Nest runs guards in the order they're provided) so
// request.user already exists. Equivalent to the template's
// `roles.length && !roles.includes(verifyUser.role)` check.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user: TokenPayload = request.user;

    if (!user || !requiredRoles.includes(user.role)) {
      throw new ForbiddenException(
        'Access Forbidden: You do not have permission to perform this action',
      );
    }
    return true;
  }
}
