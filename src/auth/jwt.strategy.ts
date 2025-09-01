import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { UsersService } from '../users/users.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name);

  constructor(
    private configService: ConfigService,
    private usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET'),
    });
  }

  async validate(payload: any) {
    const user = await this.usersService.findById(payload.sub);
    if (!user) {
      this.logger.warn(`User not found for ID: ${payload.sub}`);
      return null;
    }
  return {
    id: user.id,
    nssNumber: user.nssNumber,
    role: user.role,
    email: user.email,
    staffId: user.staffId,
    name: user.name,
    phoneNumber: user.phoneNumber,
    isTfaRequired: payload.isTfaRequired || false,
    isTfaEnabled: user.isTfaEnabled, // Include from database
  };
  }
}