import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class TwoFactorAuthGuard extends AuthGuard('jwt') {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = await super.canActivate(context); // Run JWT validation

    if (!user) {
      throw new UnauthorizedException('Invalid token');
    }

    // Check if JWT requires 2FA verification
    if (request.user.isTfaRequired) {
      throw new UnauthorizedException('2FA verification required');
    }

    return true;
  }
}