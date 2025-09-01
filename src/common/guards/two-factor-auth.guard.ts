import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class TwoFactorAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = await super.canActivate(context);
    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }
    if (request.user.isTfaRequired) {
      throw new UnauthorizedException('2FA verification required');
    }
    return true;
  }
}