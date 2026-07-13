import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { VehicleService } from './vehicle.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Role } from '../common/enums/role.enum';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { AssignVehicleDto } from './dto/assign-vehicle.dto';
import { QueryVehicleDto } from './dto/query-vehicle.dto';

// Every route here is admin-only — vehicle fleet management has no driver-facing
// screen in the Figma design we've reviewed.
@Roles(Role.ADMIN, Role.SUPER_ADMIN)
@Controller('vehicles')
export class VehicleController {
  constructor(private readonly vehicleService: VehicleService) {}

  @Post()
  create(@Body() dto: CreateVehicleDto) {
    return this.vehicleService.create(dto);
  }

  @Get()
  findAll(@Query() query: QueryVehicleDto) {
    return this.vehicleService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.vehicleService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateVehicleDto) {
    return this.vehicleService.update(id, dto);
  }

  @Patch(':id/assign')
  assign(@Param('id') id: string, @Body() dto: AssignVehicleDto) {
    return this.vehicleService.assign(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.vehicleService.remove(id);
  }
}
