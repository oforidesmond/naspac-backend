import { Injectable } from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import * as bcrypt from 'bcrypt';
import { PrismaService } from 'prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

async createUser(dto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        nssNumber: dto.nssNumber,
        staffId: dto.staffId,
        email: dto.email,
        password: hashedPassword,
        role: dto.role,
      },
    });
  }

  async findByNssNumberOrStaffId(identifier: string) {
    return this.prisma.user.findFirst({
      where: {
        OR: [
          { nssNumber: identifier },
          { staffId: identifier },
        ],
      },
    });
  }

  async findById(id: number) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  async updateUser(id: number, data: Partial<{ email: string; password: string }>) {
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }
    return this.prisma.user.update({ where: { id }, data });
  }
}