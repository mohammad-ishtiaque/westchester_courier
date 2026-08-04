import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DriverManagementService } from './driver-management.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { QueryDriverDto } from './dto/query-driver.dto';

// Admin-only throughout — this is the admin dashboard's "Drivers" table, distinct from
// a driver managing their OWN profile (that's the Profile module, self-service).
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('admin/drivers')
export class DriverManagementController {
  constructor(private readonly driverManagementService: DriverManagementService) {}

  @Post()
  create(@Body() dto: CreateDriverDto) {
    return this.driverManagementService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryDriverDto) {
    return this.driverManagementService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.driverManagementService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDriverDto) {
    return this.driverManagementService.update(id, dto);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.driverManagementService.approveDriver(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body('reason') reason?: string) {
    return this.driverManagementService.rejectDriver(id, reason);
  }

  @Patch(':id/block')
  block(@Param('id') id: string) {
    return this.driverManagementService.setBlocked(id, true);
  }

  @Patch(':id/unblock')
  unblock(@Param('id') id: string) {
    return this.driverManagementService.setBlocked(id, false);
  }


  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.driverManagementService.remove(id);
  }
}
