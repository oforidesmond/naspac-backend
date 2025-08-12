import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest(err: any, user: any, info: any, context: any) {
    if (err || !user) {
      const message = info?.message || 'Invalid or missing token';
      throw new UnauthorizedException({ success: false, message });
    }
    return user;
  }
}