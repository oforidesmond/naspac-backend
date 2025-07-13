import { HttpException, HttpStatus, Module } from '@nestjs/common';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { PrismaService } from 'prisma/prisma.service';
import { MulterModule } from '@nestjs/platform-express';
import { HttpModule, HttpService } from '@nestjs/axios';
import { SupabaseStorageService } from 'src/documents/supabase-storage.service';

@Module({
  imports: [
    HttpModule,
    MulterModule.register({
      limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
        files: 2, // Max 2 files (postingLetter, appointmentLetter)
      },
      fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/pdf') {
          cb(null, true);
        } else {
          cb(new HttpException('Only PDF files are allowed', HttpStatus.BAD_REQUEST), false);
        }
      },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, PrismaService, SupabaseStorageService],
  exports: [UsersService, HttpModule],
})
export class UsersModule {}
