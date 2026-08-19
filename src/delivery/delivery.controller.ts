import { Body, Controller, Get, Param, Patch, Post, Query, UploadedFile, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { FileInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express';
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
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { GetDriverRequestsDto } from './dto/get-driver-requests.dto';
import { buildDiskStorage, imageFileFilter } from '../common/utils/upload.util';

@Controller('deliveries')
export class DeliveryController {
  constructor(private readonly deliveryService: DeliveryService) {}

  // ---------- Public Customer Tracking ----------

  @Public()
  @Get('track/:token')
  trackDelivery(
    @Param('token') token: string,
    @Query('withDetails') withDetails?: string,
  ) {
    return this.deliveryService.getTrackingInfoByToken(token, withDetails);
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
  @Get('history')
  getAdminJobHistory(@Query() query: QueryDeliveryDto) {
    return this.deliveryService.getAdminJobHistory(query);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN)
  @Get('customers/suggest')
  suggestCustomers(@Query('search') search?: string) {
    return this.deliveryService.suggestCustomers(search);
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
  @Patch(':id/admin-status')
  adminUpdateStatus(
    @Param('id') id: string,
    @CurrentUser() admin: TokenPayload,
    @Body() dto: UpdateDeliveryStatusDto,
  ) {
    return this.deliveryService.adminUpdateStatus(id, admin, dto);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DRIVER)
  @Patch(':id/status')
  @UseInterceptors(
    FileInterceptor('proofOfDeliveryImage', {
      storage: buildDiskStorage('proof-of-delivery'),
      fileFilter: imageFileFilter,
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: TokenPayload,
    @Body() dto: UpdateDeliveryStatusDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    const imagePath = file ? file.path.replace(/\\/g, '/') : dto.proofOfDeliveryImage;
    return this.deliveryService.updateStatus(id, user, {
      ...dto,
      proofOfDeliveryImage: imagePath,
    });
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

  @Roles(Role.DRIVER)
  @Get('my-map')
  getMyMapDeliveries(
    @CurrentUser() driver: TokenPayload,
    @Query('type') type?: 'pickup' | 'delivery' | 'all',
  ) {
    return this.deliveryService.getMyMapDeliveries(driver, type);
  }

  @Roles(Role.DRIVER)
  @Get('my-history')
  getDriverJobHistory(@CurrentUser() driver: TokenPayload, @Query() query: QueryDeliveryDto & { month?: number; year?: number }) {
    return this.deliveryService.getDriverJobHistory(driver, query);
  }

  @Roles(Role.DRIVER)
  @Get('requests')
  getDriverRequests(
    @CurrentUser() driver: TokenPayload,
    @Query() query: GetDriverRequestsDto,
  ) {
    return this.deliveryService.getDriverRequests(driver, query);
  }

  @Roles(Role.ADMIN, Role.SUPER_ADMIN, Role.DRIVER)
  @Get(':id/map')
  getMapDetails(@Param('id') id: string, @CurrentUser() user: TokenPayload) {
    return this.deliveryService.getMapDetails(id, user);
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
  @UseInterceptors(
    FileFieldsInterceptor(
      [
        { name: 'proofOfDeliveryImage', maxCount: 1 },
        { name: 'recipientSignatureImage', maxCount: 1 },
      ],
      {
        storage: buildDiskStorage('proof-of-delivery'),
        fileFilter: imageFileFilter,
        limits: { fileSize: 5 * 1024 * 1024 },
      },
    ),
  )
  submitProofOfDelivery(
    @Param('id') id: string,
    @CurrentUser() driver: TokenPayload,
    @Body() dto: ProofOfDeliveryDto,
    @UploadedFiles()
    files?: {
      proofOfDeliveryImage?: Express.Multer.File[];
      recipientSignatureImage?: Express.Multer.File[];
    },
  ) {
    const proofImagePath = files?.proofOfDeliveryImage?.[0]?.path?.replace(/\\/g, '/') || dto.proofOfDeliveryImage;
    const signatureImagePath = files?.recipientSignatureImage?.[0]?.path?.replace(/\\/g, '/') || dto.recipientSignatureImage;
    return this.deliveryService.submitProofOfDelivery(id, driver, {
      ...dto,
      proofOfDeliveryImage: proofImagePath,
      recipientSignatureImage: signatureImagePath,
    });
  }
}
