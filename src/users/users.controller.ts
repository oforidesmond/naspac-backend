import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFiles, Request, Get, ParseIntPipe, Param } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/auth-guard';
import { RolesGuard } from 'src/common/guards/roles-guard';
import { FilesInterceptor } from '@nestjs/platform-express';
import { SubmitOnboardingDto, UpdateSubmissionStatusDto } from './dto/submit-onboarding.dto';
import { RateLimitGuard } from 'src/auth/rate-limit.guard';


@Controller('users')
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Post()
  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  //submit onboarding
 @Post('submit-onboarding')
  @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
  @Roles('PERSONNEL')
  @UseInterceptors(FilesInterceptor('files', 2, {
    fileFilter: (req, file, cb) => {
      if (file.mimetype !== 'application/pdf') {
        return cb(new Error('Only PDF files are allowed'), false);
      }
      cb(null, true);
    },
    limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  }))
  async submitOnboarding(
    @Request() req,
    @Body() dto: SubmitOnboardingDto,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    // Map files to the expected structure
    const fileMap = {
      postingLetter: files.find((f) => f.originalname.includes('postingLetter')),
      appointmentLetter: files.find((f) => f.originalname.includes('appointmentLetter')),
    };
    return this.usersService.submitOnboarding(req.user.id, dto, fileMap);
  }

  //Get unversities
  @Get('ghana-universities')
  async getGhanaUniversities() {
    return this.usersService.getGhanaUniversities();
  }

  //get submissions
    @Get('submissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STAFF', 'ADMIN')
  async getSubmissions() {
    return this.usersService.getAllSubmissions();
  }

  //check for submission status
    @Get('onboarding-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('PERSONNEL')
  async getOnboardingStatus(@Request() req) {
    return this.usersService.getOnboardingStatus(req.user.id);
  }

  @Post('update-submission-status/:submissionId')
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
@Roles('ADMIN', 'STAFF') // Only ADMIN and STAFF can change submission status
async updateSubmissionStatus(
  @Request() req,
  @Param('submissionId', ParseIntPipe) submissionId: number,
  @Body() dto: UpdateSubmissionStatusDto,
) {
  return this.usersService.updateSubmissionStatus(
    req.user.id,
    submissionId,
    dto,
  );
}
}