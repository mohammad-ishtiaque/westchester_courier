import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';
// Usage: @Roles(Role.ADMIN, Role.SUPER_ADMIN) — same idea as the template's
// auth(config.auth_level.admin) middleware, just declared as a decorator instead
// of called as a function in the route definition.
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
