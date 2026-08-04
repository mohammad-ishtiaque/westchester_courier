import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DeliveryService } from './delivery.service';
import { Roles } from '../common/decorators/roles.decorator';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import type { TokenPayload } from '../common/interfaces/token-payload.interface';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { RejectDeliveryDto } from './dto/reject-delivery.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { ProofOfDeliveryDto } from './dto/proof-of-delivery.dto';
import { QueryDeliveryDto } from './dto/query-delivery.dto';

@Controller('deliveries')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  // ---------- Public Customer Tracking ----------

  @Public()
  @Get('track/:token')
  trackDelivery(@Param('token') token: string) {
    return this.deliveryService.getTrackingInfoByToken(token);
  }

  // ---------- Admin ----------

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Post()
  create(@CurrentUser() admin: TokenPayload, @Body() dto: CreateDeliveryDto) {
    return this.deliveryService.create(admin, dto);
  }


  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get()
  findAll(@Query() query: QueryDeliveryDto) {
    return this.deliveryService.findAllForAdmin(query);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: UpdateDeliveryDto) {
    return this.deliveryService.update(id, dto);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id/assign')
  assignDriver(@Param('id') id: string, @Body() dto: AssignDriverDto) {
    return this.deliveryService.assignDriver(id, dto);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id/remove-driver')
  removeDriver(@Param('id') id: string) {
    return this.deliveryService.removeDriver(id);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id/status')
  changeStatus(@Param('id') id: string, @Body('status') status: any) {
    return this.deliveryService.changeStatus(id, status);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Patch(':id/cancel')
  cancel(@Param('id') id: string) {
    return this.deliveryService.cancel(id);
  }

  // ---------- Driver ----------

  @Roles(Role.DRIVER)
  @Get('stats/summary')
  getDriverStats(@CurrentUser() driver: TokenPayload) {
    return this.deliveryService.getDriverStats(driver);
  }

  @Roles(Role.DRIVER)
  @Get('my')
  findMine(@CurrentUser() driver: TokenPayload, @Query() query: QueryDeliveryDto) {
    return this.deliveryService.findMine(driver, query);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.deliveryService.findOne(id, user);
  }

  @Roles(Role.DRIVER)
  @Patch(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() driver: TokenPayload) {
    return this.deliveryService.accept(id, driver);
  }

  @Roles(Role.DRIVER)
  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @CurrentUser() driver: TokenPayload,
    @Body() dto: RejectDeliveryDto,
  ) {
    return this.deliveryService.reject(id, driver, dto);
  }

  @Roles(Role.DRIVER)
  @Patch(':id/driver-to-pickup')
  markDriverToPickup(@Param('id') id: string, @CurrentUser() driver: TokenPayload) {
    return this.deliveryService.markDriverToPickup(id, driver);
  }

  @Roles(Role.DRIVER)
  @Patch(':id/picked-up')
  markPickedUp(@Param('id') id: string, @CurrentUser() driver: TokenPayload) {
    return this.deliveryService.markPickedUp(id, driver);
  }

  @Roles(Role.DRIVER)
  @Patch(':id/in-transit')
  markInTransit(@Param('id') id: string, @CurrentUser() driver: TokenPayload) {
    return this.deliveryService.markInTransit(id, driver);
  }

  @Roles(Role.DRIVER)
  @Patch(':id/out-for-delivery')
  markOutForDelivery(@Param('id') id: string, @CurrentUser() driver: TokenPayload) {
    return this.deliveryService.markOutForDelivery(id, driver);
  }

  @Roles(Role.DRIVER)
  @Patch(':id/location')
  updateLocation(
    @Param('id') id: string,
    @CurrentUser() driver: TokenPayload,
    @Body() dto: UpdateLocationDto,
  ) {
    return this.deliveryService.updateLocation(id, driver, dto);
  }

  @Roles(Role.DRIVER)
  @Patch(':id/proof-of-delivery')
  submitProofOfDelivery(
    @Param('id') id: string,
    @CurrentUser() driver: TokenPayload,
    @Body() dto: ProofOfDeliveryDto,
  ) {
    return this.deliveryService.submitProofOfDelivery(id, driver, dto);
  }
}
