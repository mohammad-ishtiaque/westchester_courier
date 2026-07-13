import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { AuthDocument } from '../../auth/schemas/auth.schema';
import { TokenPayload } from '../interfaces/token-payload.interface';

// Direct equivalent of the template's `auth.ts` middleware: reads the Bearer token,
// verifies it, confirms the Auth record still exists (covers a deleted/blocked
// account whose old token is still technically valid), then attaches the payload
// to the request as `request.user` for @CurrentUser() / RolesGuard to read.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly reflector: Reflector,
    @InjectModel('Auth') private readonly authModel: Model<AuthDocument>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest();
    const authHeader: string | undefined = request.headers.authorization;

    if (!authHeader) {
      throw new UnauthorizedException('You are not authorized for this role');
    }
    if (!authHeader.startsWith('Bearer')) {
      throw new UnauthorizedException('Invalid token format');
    }

    const token = authHeader.split(' ')[1]?.trim();

    let payload: TokenPayload;
    try {
      payload = this.jwtService.verify<TokenPayload>(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const authExists = await this.authModel.findById(payload.authId);
    if (!authExists) {
      throw new UnauthorizedException('You are not authorized');
    }

    request.user = payload;
    return true;
  }
}
