import { Controller, Post, Body, UseGuards, UseInterceptors, UploadedFiles, Request, Get, ParseIntPipe, Param, HttpException, HttpStatus, UploadedFile, Patch, Delete } from '@nestjs/common';
import { UsersService } from './users.service';
import { AssignPersonnelToDepartmentDto, ChangePersonnelDepartmentDto, CreateDepartmentDto, CreateUserDto, GetPersonnelDto, UpdateDepartmentDto } from './dto/create-user.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { JwtAuthGuard } from 'src/common/guards/auth-guard';
import { RolesGuard } from 'src/common/guards/roles-guard';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { GetSubmissionStatusCountsDto, SubmitOnboardingDto, UpdateSubmissionStatusDto } from './dto/submit-onboarding.dto';
import { RateLimitGuard } from 'src/auth/rate-limit.guard';
import { SupabaseStorageService } from 'src/documents/supabase-storage.service';
import { PrismaService } from 'prisma/prisma.service';
import { UpdateStaffDto } from './dto/update-user.dto';

@Controller('users')
export class UsersController {
  constructor(
    private supabaseStorageService: SupabaseStorageService,
    private prisma: PrismaService,
    private usersService: UsersService,
  ) {}

  @Get('profile')
@UseGuards(JwtAuthGuard)
async getUserProfile(@Request() req) {
  return this.usersService.getUserProfile(req.user.id);
}

  @Post()
  @Roles('ADMIN')
  @UseGuards(JwtAuthGuard, RolesGuard)
  async createUser(@Body() createUserDto: CreateUserDto) {
    return this.usersService.createUser(createUserDto);
  }

  //upload signature and stamp
  @Post('upload-signage')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  @UseInterceptors(
    FilesInterceptor('files', 2, {
      fileFilter: (req, file, cb) => {
        if (!['image/png', 'image/jpeg'].includes(file.mimetype)) {
          return cb(new Error('Only PNG or JPEG files are allowed'), false);
        }
        cb(null, true);
      },
      limits: { fileSize: 2 * 1024 * 1024 }, // 2MB limit
    }),
  )
  async uploadSignage(
    @Request() req,
    @UploadedFiles() files: Array<Express.Multer.File>,
  ) {
    const adminId = req.user.id;

    // Validate files
    const signatureFile = files.find((f) => f.originalname.includes('signature'));
    const stampFile = files.find((f) => f.originalname.includes('stamp'));
    if (!signatureFile || !stampFile) {
      throw new HttpException(
        'Both signature and stamp files are required',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Upload signature to Supabase
    const signatureFileName = `signatures/admin-${adminId}-signature-${Date.now()}.png`;
    const signatureUrl = await this.supabaseStorageService.uploadFile(
      signatureFile.buffer,
      signatureFileName,
      'killermike',
    );

    // Upload stamp to Supabase
    const stampFileName = `stamps/admin-${adminId}-stamp-${Date.now()}.png`;
    const stampUrl = await this.supabaseStorageService.uploadFile(
      stampFile.buffer,
      stampFileName,
      'killermike',
    );

    // Update admin's User record with file paths and default dimensions
    await this.prisma.user.update({
      where: { id: adminId },
      data: {
        signage: signatureFileName,
        stamp: stampFileName,
        sigWidth: 100, // Adjust based on your requirements
        sigHeight: 50,
        stampWidth: 100,
        stampHeight: 50,
      },
    });

    return {
      message: 'Signature and stamp uploaded successfully',
      signatureUrl,
      stampUrl,
    };
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
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
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

  //check submission status
  @Post('submission-status-counts')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles('ADMIN', 'STAFF')
    async getSubmissionStatusCounts(
      @Request() req,
      @Body() dto: GetSubmissionStatusCountsDto,
    ) {
      return this.usersService.getSubmissionStatusCounts(req.user.id, dto);
  }

  @Get('staff')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  async getStaff(@Request() req) {
    return this.usersService.getStaff(req.user.id);
  }

  @Post('create-department')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  async createDepartment(@Request() req, @Body() dto: CreateDepartmentDto) {
    return this.usersService.createDepartment(req.user.id, dto);
  }

  @Get('departments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  async getDepartments(@Request() req) {
    return this.usersService.getDepartments(req.user.id);
  }

  @Post('personnel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN', 'STAFF')
  async getPersonnel(
    @Request() req,
    @Body() dto: GetPersonnelDto,
  ) {
    return this.usersService.getPersonnel(req.user.id, dto);
  }

  @Post('assign-personnel-to-department')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
async assignPersonnelToDepartment(
  @Request() req,
  @Body() dto: AssignPersonnelToDepartmentDto,
) {
  return this.usersService.assignPersonnelToDepartment(req.user.id, dto);
  }

  //report counts
  @Get('reports-counts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'STAFF')
async getReportCounts(@Request() req) {
  return this.usersService.getReportCounts(req.user.id);
  }

@Get('personnel-status')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('PERSONNEL','ADMIN', 'STAFF')
async getPersonnelStatus(@Request() req) {
  return this.usersService.getPersonnelStatus(req.user.id);
  }

  @Post('submit-verification-form')
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
@Roles('PERSONNEL')
@UseInterceptors(FileInterceptor('verificationForm', {
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'), false);
    }
    cb(null, true);
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
}))
async submitVerificationForm(
  @Request() req,
  @UploadedFile() verificationForm: Express.Multer.File,
) {
  return this.usersService.submitVerificationForm(req.user.id, verificationForm);
  }

   @Patch('staff/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
  @Roles('ADMIN')
  async updateStaff(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateStaffDto,
    @Request() req,
  ) {
    return this.usersService.updateStaff(id, dto, req.user.id);
  }

  @Patch('department/:id')
@UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
@Roles('ADMIN')
async updateDepartment(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: UpdateDepartmentDto,
  @Request() req,
) {
  return this.usersService.updateDepartment(id, dto, req.user.id);
}

@Delete('staff/:id/delete')
  @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
  @Roles('ADMIN')
  async deleteStaff(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.usersService.deleteStaff(id, req.user.id);
  }

  @Delete('department/:id')
  @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
  @Roles('ADMIN')
  async deleteDepartment(@Param('id', ParseIntPipe) id: number, @Request() req) {
    return this.usersService.deleteDepartment(id, req.user.id);
  }

  @Patch('change-department')
  @UseGuards(JwtAuthGuard, RolesGuard, RateLimitGuard)
  @Roles('ADMIN', 'STAFF')
  async changePersonnelDepartment(
    @Body() dto: ChangePersonnelDepartmentDto,
    @Request() req,
  ) {
    return this.usersService.changePersonnelDepartment(dto, req.user.id);
  }
}