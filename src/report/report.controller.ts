import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ReportService } from './report.service';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { TokenPayload } from '../common/interfaces/token-payload.interface';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { QueryReportDto } from './dto/query-report.dto';
import { buildDiskStorage, imageFileFilter } from '../common/utils/upload.util';

@Controller('reports')
export class ReportController {
  constructor(private readonly reportService: ReportService) {}

  @Roles(Role.DRIVER)
  @Post()
  @UseInterceptors(
    FileInterceptor('photo', {
      storage: buildDiskStorage('reports'),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  create(
    @CurrentUser() driver: TokenPayload,
    @Body() dto: CreateReportDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (file) {
      dto.photo = file.path.replace(/\\/g, '/');
    }
    return this.reportService.create(dto, driver);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get()
  findAll(@Query() query: QueryReportDto) {
    return this.reportService.findAll(query);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reportService.findOne(id);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateReportStatusDto) {
    return this.reportService.updateStatus(id, dto);
  }
}
