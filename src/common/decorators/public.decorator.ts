import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';
// Marks a route as not requiring a JWT — used because our JwtAuthGuard is applied
// globally (every route protected by default), which is the safer default for an
// app with admin + driver roles. Opt out per-route with @Public().
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
