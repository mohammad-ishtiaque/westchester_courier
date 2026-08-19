import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { randomBytes } from 'crypto';
import { Delivery, DeliveryDocument } from './schemas/delivery.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { DeliveryStatus } from '../common/enums/delivery-status.enum';
import { Role } from '../common/enums/role.enum';
import { TokenPayload } from '../common/interfaces/token-payload.interface';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { RejectDeliveryDto } from './dto/reject-delivery.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { ProofOfDeliveryDto } from './dto/proof-of-delivery.dto';
import { QueryDeliveryDto } from './dto/query-delivery.dto';
import { UpdateDeliveryStatusDto } from './dto/update-delivery-status.dto';
import { GetDriverRequestsDto, RequestTypeFilter } from './dto/get-driver-requests.dto';
import { NotificationService } from '../notification/notification.service';

@Injectable()
export class DeliveryService {
  constructor(
    @InjectModel(Delivery.name) private readonly deliveryModel: Model<DeliveryDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    private readonly notificationService: NotificationService,
  ) {}

  private generateOrderNumber(): string {
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `WC-${rand}`;
  }

  private generateTrackingToken(): string {
    return randomBytes(16).toString('hex');
  }

  private formatTrackingUrl(token?: string): string | null {
    if (!token) return null;
    const rawUrl = process.env.FRONTEND_URL || 'http://localhost:2050';
    const baseUrl = rawUrl.replace(/\/+$/, '');
    return `${baseUrl}/track/${token}`;
  }

  private toGeoPoint(lng?: number, lat?: number) {
    if (lng == null || lat == null) return undefined;
    return { type: 'Point', coordinates: [lng, lat] };
  }

  // ---------- Admin ----------

  async create(admin: TokenPayload, dto: CreateDeliveryDto) {
    const trackingToken = this.generateTrackingToken();
    let initialStatus = DeliveryStatus.UNASSIGNED;
    let assignedDriverId: Types.ObjectId | null = null;

    const requestedDriverId = dto.driverId || dto.assignedDriver || dto.assignedDriverId;

    if (requestedDriverId) {
      const driver = await this.userModel.findOne(this.getDriverQuery(requestedDriverId));
      if (!driver) {
        throw new NotFoundException('Driver not found');
      }
      const driverObj = driver as any;
      if (driverObj.role && driverObj.role !== Role.DRIVER) {
        throw new BadRequestException('Assigned user is not a driver');
      }
      if (!driver.isApproved) {
        throw new BadRequestException('Cannot assign an unapproved driver to a delivery');
      }
      if (driverObj.isBlocked) {
        throw new BadRequestException('Cannot assign a blocked driver to a delivery');
      }
      if (driverObj.isActive === false) {
        throw new BadRequestException('Cannot assign an inactive driver to a delivery');
      }

      assignedDriverId = driver._id;
      initialStatus = DeliveryStatus.ASSIGNED;
    }

    const delivery = await this.deliveryModel.create({
      orderNumber: this.generateOrderNumber(),
      trackingToken,
      title: dto.title,
      parcelType: dto.parcelType,
      size: dto.size,
      weight: dto.weight,

      customerName: dto.customerName,
      customerEmail: dto.customerEmail,
      customerPhone: dto.customerPhone,

      pickupContact: dto.pickupContact,
      pickupAddress: dto.pickupAddress,
      pickupDate: dto.pickupDate ? new Date(dto.pickupDate) : undefined,
      preferrablePickupTime: dto.preferrablePickupTime,
      pickupNote: dto.pickupNote,
      pickupCoordinates: this.toGeoPoint(dto.pickupLng, dto.pickupLat),

      receiverName: dto.receiverName || dto.customerName,
      receiverPhone: dto.receiverPhone || dto.customerPhone,
      dropoffAddress: dto.dropoffAddress,
      preferrableDeliveryDate: dto.preferrableDeliveryDate ? new Date(dto.preferrableDeliveryDate) : undefined,
      deliveryNote: dto.deliveryNote,
      dropoffCoordinates: this.toGeoPoint(dto.dropoffLng, dto.dropoffLat),

      packageDescription: dto.packageDescription,
      shareDetails: dto.shareDetails !== undefined ? dto.shareDetails : true,
      createdBy: admin.userId,
      assignedDriver: assignedDriverId,
      status: initialStatus,
    });

    let resultDoc = delivery;
    if (assignedDriverId) {
      const populated = await this.deliveryModel
        .findById(delivery._id)
        .populate('assignedDriver', 'name email phoneNumber profile_image locationCoordinates');
      if (populated) resultDoc = populated;

      await this.notificationService.sendNotification({
        recipientId: assignedDriverId,
        recipientRole: Role.DRIVER,
        title: 'New Assigned',
        body: `You have been assigned a new delivery (Order ${delivery.orderNumber}).`,
        type: 'NEW_ASSIGNMENT',
        deliveryId: delivery._id,
        orderNumber: delivery.orderNumber,
      });
    }

    await this.notificationService.sendNotification({
      recipientRole: Role.ADMIN,
      title: 'Delivery Created',
      body: `Delivery ${delivery.orderNumber} created ${assignedDriverId ? 'and assigned to driver' : ''}.`,
      type: 'NEW_ASSIGNMENT',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    return {
      message: 'Delivery created successfully',
      data: {
        ...resultDoc.toObject(),
        trackingUrl: this.formatTrackingUrl(trackingToken),
      },
    };
  }

  async findAllForAdmin(query: QueryDeliveryDto) {
    const filter: Record<string, unknown> = {};

    if (query.status) {
      filter.status = query.status;
    } else {
      filter.status = { $nin: [DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED] };
    }

    if (query.search) {
      const regex = new RegExp(query.search, 'i');
      filter.$or = [
        { title: regex },
        { parcelType: regex },
        { customerName: regex },
        { customerPhone: regex },
        { customerEmail: regex },
        { recipientName: regex },
        { recipientPhone: regex },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await Promise.all([
      this.deliveryModel
        .find(filter)
        .populate('assignedDriver', 'name email phoneNumber profile_image locationCoordinates')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.deliveryModel.countDocuments(filter),
    ]);

    const formattedItems = items.map((item) => ({
      ...item.toObject(),
      trackingUrl: this.formatTrackingUrl(item.trackingToken),
    }));

    return {
      message: 'Deliveries fetched successfully',
      data: formattedItems,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getAdminJobHistory(query: QueryDeliveryDto) {
    const filter: Record<string, unknown> = {
      status: { $in: [DeliveryStatus.DELIVERED, DeliveryStatus.CANCELLED] },
    };

    if (query.status) {
      filter.status = query.status;
    }

    if (query.search) {
      const regex = new RegExp(query.search, 'i');
      filter.$or = [
        { title: regex },
        { parcelType: regex },
        { customerName: regex },
        { customerEmail: regex },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await Promise.all([
      this.deliveryModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.deliveryModel.countDocuments(filter),
    ]);

    const formattedItems = items.map((item) => {
      const obj = item.toObject() as any;
      return {
        _id: obj._id,
        title: obj.title,
        parcelType: obj.parcelType,
        size: obj.size,
        weight: obj.weight,
        customerName: obj.customerName,
        customerEmail: obj.customerEmail,
        orderTime: obj.createdAt,
        status: obj.status,
      };
    });

    return {
      message: 'Admin job history fetched successfully',
      data: formattedItems,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async update(id: string, dto: UpdateDeliveryDto) {
    const delivery = await this.findByIdOrThrow(id);

    if (dto.title != null) delivery.title = dto.title;
    if (dto.parcelType != null) delivery.parcelType = dto.parcelType;
    if ((dto as any).size != null) delivery.size = (dto as any).size;
    if (dto.weight != null) delivery.weight = dto.weight;

    if (dto.customerName != null) delivery.customerName = dto.customerName;
    if (dto.customerEmail != null) delivery.customerEmail = dto.customerEmail;
    if (dto.customerPhone != null) delivery.customerPhone = dto.customerPhone;

    if (dto.pickupContact != null) delivery.pickupContact = dto.pickupContact;
    if (dto.pickupAddress != null) delivery.pickupAddress = dto.pickupAddress;
    if (dto.pickupDate != null) delivery.pickupDate = new Date(dto.pickupDate);
    if (dto.preferrablePickupTime != null) delivery.preferrablePickupTime = dto.preferrablePickupTime;
    if (dto.pickupNote != null) delivery.pickupNote = dto.pickupNote;

    if (dto.receiverName != null) delivery.receiverName = dto.receiverName;
    if (dto.receiverPhone != null) delivery.receiverPhone = dto.receiverPhone;
    if (dto.dropoffAddress != null) delivery.dropoffAddress = dto.dropoffAddress;
    if (dto.preferrableDeliveryDate != null) delivery.preferrableDeliveryDate = new Date(dto.preferrableDeliveryDate);
    if (dto.deliveryNote != null) delivery.deliveryNote = dto.deliveryNote;

    if (dto.packageDescription != null) delivery.packageDescription = dto.packageDescription;
    if (dto.shareDetails != null) delivery.shareDetails = dto.shareDetails;

    const pickupGeo = this.toGeoPoint(dto.pickupLng, dto.pickupLat);
    if (pickupGeo) delivery.pickupCoordinates = pickupGeo;
    const dropoffGeo = this.toGeoPoint(dto.dropoffLng, dto.dropoffLat);
    if (dropoffGeo) delivery.dropoffCoordinates = dropoffGeo;

    await delivery.save();
    return {
      message: 'Delivery updated successfully',
      data: {
        ...delivery.toObject(),
        trackingUrl: this.formatTrackingUrl(delivery.trackingToken),
      },
    };
  }

  async assignDriver(id: string, dto: AssignDriverDto) {
    const delivery = await this.findByIdOrThrow(id);
    if (
      delivery.status === DeliveryStatus.DELIVERED ||
      delivery.status === DeliveryStatus.CANCELLED
    ) {
      throw new BadRequestException('Cannot assign driver to a completed or cancelled delivery');
    }

    const driver = await this.userModel.findOne(this.getDriverQuery(dto.driverId));
    if (!driver) throw new NotFoundException('Driver not found');
    if (!driver.isApproved) {
      throw new BadRequestException('Cannot assign an unapproved driver to a delivery');
    }

    delivery.assignedDriver = driver._id;
    delivery.status = DeliveryStatus.ASSIGNED;
    delivery.rejectionReason = undefined;
    await delivery.save();

    await this.notificationService.sendNotification({
      recipientId: driver._id,
      recipientRole: Role.DRIVER,
      title: 'New Assigned',
      body: `You have been assigned a new delivery (Order ${delivery.orderNumber}).`,
      type: 'NEW_ASSIGNMENT',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    await this.notificationService.sendNotification({
      recipientRole: Role.ADMIN,
      title: 'Driver Assigned',
      body: `Driver ${driver.name} assigned to delivery ${delivery.orderNumber}.`,
      type: 'NEW_ASSIGNMENT',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    return {
      message: 'Driver assigned successfully',
      data: {
        ...delivery.toObject(),
        trackingUrl: this.formatTrackingUrl(delivery.trackingToken),
      },
    };
  }

  async removeDriver(id: string) {
    const delivery = await this.findByIdOrThrow(id);
    if (
      delivery.status === DeliveryStatus.DELIVERED ||
      delivery.status === DeliveryStatus.CANCELLED
    ) {
      throw new BadRequestException('Cannot remove driver from a completed or cancelled delivery');
    }

    const previousDriverId = delivery.assignedDriver;

    delivery.assignedDriver = null;
    delivery.status = DeliveryStatus.UNASSIGNED;
    await delivery.save();

    if (previousDriverId) {
      await this.notificationService.sendNotification({
        recipientId: previousDriverId,
        recipientRole: Role.DRIVER,
        title: 'Delivery Unassigned',
        body: `You have been unassigned from delivery (Order ${delivery.orderNumber}).`,
        type: 'UNASSIGNED',
        deliveryId: delivery._id,
        orderNumber: delivery.orderNumber,
      });
    }

    return {
      message: 'Driver removed successfully',
      data: {
        ...delivery.toObject(),
        trackingUrl: this.formatTrackingUrl(delivery.trackingToken),
      },
    };
  }

  async changeStatus(id: string, status: DeliveryStatus) {
    const delivery = await this.findByIdOrThrow(id);
    delivery.status = status;
    await delivery.save();

    return {
      message: `Delivery status updated to ${status}`,
      data: {
        ...delivery.toObject(),
        trackingUrl: this.formatTrackingUrl(delivery.trackingToken),
      },
    };
  }

  async cancel(id: string) {
    const delivery = await this.findByIdOrThrow(id);
    if (delivery.status === DeliveryStatus.DELIVERED) {
      throw new BadRequestException('A delivered order cannot be cancelled');
    }
    delivery.status = DeliveryStatus.CANCELLED;
    await delivery.save();

    if (delivery.assignedDriver) {
      await this.notificationService.sendNotification({
        recipientId: delivery.assignedDriver,
        recipientRole: Role.DRIVER,
        title: 'Delivery Cancelled',
        body: `Delivery ${delivery.orderNumber} was cancelled by admin.`,
        type: 'STATUS_UPDATE',
        deliveryId: delivery._id,
        orderNumber: delivery.orderNumber,
      });
    }

    return { message: 'Delivery cancelled successfully' };
  }

  async adminUpdateStatus(id: string, user: TokenPayload, dto: UpdateDeliveryStatusDto) {
    const delivery = await this.findByIdOrThrow(id);
    delivery.status = dto.status;
    if (dto.reason) delivery.rejectionReason = dto.reason;
    await delivery.save();

    if (delivery.assignedDriver) {
      await this.notificationService.sendNotification({
        recipientId: delivery.assignedDriver,
        recipientRole: Role.DRIVER,
        title: 'Delivery Status Updated',
        body: `Delivery ${delivery.orderNumber} status was updated to ${dto.status} by admin.${dto.reason ? ` Reason: ${dto.reason}` : ''}`,
        type: 'STATUS_UPDATE',
        deliveryId: delivery._id,
        orderNumber: delivery.orderNumber,
      });
    }

    return {
      message: `Delivery status updated to ${dto.status} by admin`,
      data: {
        ...delivery.toObject(),
        trackingUrl: this.formatTrackingUrl(delivery.trackingToken),
      },
    };
  }

  async updateStatus(id: string, user: TokenPayload, dto: UpdateDeliveryStatusDto) {
    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
      return this.adminUpdateStatus(id, user, dto);
    }

    switch (dto.status) {
      case DeliveryStatus.DRIVER_ACCEPTED:
        return this.accept(id, user);
      case DeliveryStatus.REJECTED:
        return this.reject(id, user, { reason: dto.reason });
      case DeliveryStatus.DRIVER_TO_PICKUP:
        return this.markDriverToPickup(id, user);
      case DeliveryStatus.PICKED_UP:
        return this.markPickedUp(id, user);
      case DeliveryStatus.IN_TRANSIT:
        return this.markInTransit(id, user);
      case DeliveryStatus.OUT_FOR_DELIVERY:
        return this.markOutForDelivery(id, user);
      case DeliveryStatus.DELIVERED:
        if (!dto.proofOfDeliveryImage || !dto.recipientName) {
          throw new BadRequestException(
            'proofOfDeliveryImage and recipientName are required for DELIVERED status',
          );
        }
        return this.submitProofOfDelivery(id, user, {
          proofOfDeliveryImage: dto.proofOfDeliveryImage,
          recipientName: dto.recipientName,
        });
      default:
        throw new BadRequestException(`Drivers cannot set delivery status to ${dto.status}`);
    }
  }

  // ---------- Driver ----------

  async findMine(driver: TokenPayload, query: QueryDeliveryDto) {
    const driverIds = this.getDriverIdsList(driver);
    const filter: Record<string, unknown> = { assignedDriver: { $in: driverIds } };
    if (query.status) filter.status = query.status;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await Promise.all([
      this.deliveryModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.deliveryModel.countDocuments(filter),
    ]);

    const formattedItems = items.map((item) => {
      const obj = item.toObject() as any;
      const pickupLng = obj.pickupCoordinates?.coordinates?.[0];
      const pickupLat = obj.pickupCoordinates?.coordinates?.[1];
      const dropoffLng = obj.dropoffCoordinates?.coordinates?.[0];
      const dropoffLat = obj.dropoffCoordinates?.coordinates?.[1];

      return {
        _id: obj._id,
        orderNumber: obj.orderNumber,
        status: obj.status,
        title: obj.title,
        parcelType: obj.parcelType,
        size: obj.size,
        weight: obj.weight,
        customerName: obj.customerName,
        customerPhone: obj.customerPhone,
        pickupAddress: obj.pickupAddress,
        pickupCoordinates: obj.pickupCoordinates || null,
        pickupLat: pickupLat ?? null,
        pickupLng: pickupLng ?? null,
        preferrablePickupTime: obj.preferrablePickupTime,
        pickupDate: obj.pickupDate,
        receiverName: obj.receiverName,
        receiverPhone: obj.receiverPhone,
        dropoffAddress: obj.dropoffAddress,
        dropoffCoordinates: obj.dropoffCoordinates || null,
        dropoffLat: dropoffLat ?? null,
        dropoffLng: dropoffLng ?? null,
        preferrableDeliveryDate: obj.preferrableDeliveryDate,
        createdAt: obj.createdAt,
        trackingUrl: this.formatTrackingUrl(item.trackingToken),
      };
    });

    return {
      message: 'Your deliveries fetched successfully',
      data: formattedItems,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async getMyMapDeliveries(driver: TokenPayload, type?: 'pickup' | 'delivery' | 'all') {
    const driverIds = this.getDriverIdsList(driver);
    const filter: Record<string, unknown> = {
      assignedDriver: { $in: driverIds },
      status: {
        $in: [
          DeliveryStatus.DRIVER_ACCEPTED,
          DeliveryStatus.DRIVER_TO_PICKUP,
          DeliveryStatus.PICKED_UP,
          DeliveryStatus.IN_TRANSIT,
          DeliveryStatus.OUT_FOR_DELIVERY,
        ],
      },
    };

    if (type === 'pickup') {
      filter.pickupCoordinates = { $ne: null };
    } else if (type === 'delivery') {
      filter.dropoffCoordinates = { $ne: null };
    }

    const items = await this.deliveryModel
      .find(filter)
      .sort({ createdAt: -1 });

    const formattedItems = items.map((item) => {
      const obj = item.toObject() as any;
      const pickupLng = obj.pickupCoordinates?.coordinates?.[0];
      const pickupLat = obj.pickupCoordinates?.coordinates?.[1];
      const dropoffLng = obj.dropoffCoordinates?.coordinates?.[0];
      const dropoffLat = obj.dropoffCoordinates?.coordinates?.[1];

      return {
        _id: obj._id,
        orderNumber: obj.orderNumber,
        status: obj.status,
        title: obj.title,
        parcelType: obj.parcelType,
        size: obj.size,
        weight: obj.weight,
        packageDescription: obj.packageDescription,
        itemCount: obj.size || obj.parcelType || '1 Item',
        customerName: obj.customerName,
        customerPhone: obj.customerPhone,
        pickupAddress: obj.pickupAddress,
        pickupCoordinates: obj.pickupCoordinates || null,
        pickupLat: pickupLat ?? null,
        pickupLng: pickupLng ?? null,
        receiverName: obj.receiverName,
        receiverPhone: obj.receiverPhone,
        dropoffAddress: obj.dropoffAddress,
        dropoffCoordinates: obj.dropoffCoordinates || null,
        dropoffLat: dropoffLat ?? null,
        dropoffLng: dropoffLng ?? null,
        createdAt: obj.createdAt,
        trackingUrl: this.formatTrackingUrl(item.trackingToken),
      };
    });

    const pickupPoints = formattedItems
      .filter((item) => item.pickupLat != null && item.pickupLng != null)
      .map((item) => ({
        deliveryId: item._id,
        orderNumber: item.orderNumber,
        status: item.status,
        itemCount: item.itemCount,
        pointType: 'pickup',
        address: item.pickupAddress,
        coordinates: item.pickupCoordinates,
        lat: item.pickupLat,
        lng: item.pickupLng,
        customerName: item.customerName,
        customerPhone: item.customerPhone,
      }));

    const deliveryPoints = formattedItems
      .filter((item) => item.dropoffLat != null && item.dropoffLng != null)
      .map((item) => ({
        deliveryId: item._id,
        orderNumber: item.orderNumber,
        status: item.status,
        itemCount: item.itemCount,
        pointType: 'delivery',
        address: item.dropoffAddress,
        coordinates: item.dropoffCoordinates,
        lat: item.dropoffLat,
        lng: item.dropoffLng,
        receiverName: item.receiverName,
        receiverPhone: item.receiverPhone,
      }));

    let points: any[] = [];
    if (type === 'pickup') {
      points = pickupPoints;
    } else if (type === 'delivery') {
      points = deliveryPoints;
    } else {
      points = [...pickupPoints, ...deliveryPoints];
    }

    return {
      message: 'Driver map deliveries fetched successfully',
      data: formattedItems,
      points,
      pickupPoints: type === 'delivery' ? [] : pickupPoints,
      deliveryPoints: type === 'pickup' ? [] : deliveryPoints,
    };
  }

  async getDriverJobHistory(driver: TokenPayload, query: QueryDeliveryDto & { month?: number; year?: number }) {
    const driverIds = this.getDriverIdsList(driver);
    const filter: Record<string, unknown> = {
      assignedDriver: { $in: driverIds },
      status: {
        $in: [
          DeliveryStatus.DRIVER_ACCEPTED,
          DeliveryStatus.DRIVER_TO_PICKUP,
          DeliveryStatus.PICKED_UP,
          DeliveryStatus.IN_TRANSIT,
          DeliveryStatus.OUT_FOR_DELIVERY,
          DeliveryStatus.DELIVERED,
          DeliveryStatus.CANCELLED,
        ],
      },
    };

    if (query.year && query.month) {
      const targetYear = query.year;
      const targetMonth = query.month; // 1-12
      const startDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
      const endDate = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
      filter.createdAt = { $gte: startDate, $lt: endDate };
    }

    const items = await this.deliveryModel.find(filter).sort({ createdAt: -1 });

    let totalAssigned = 0;
    let totalDelivery = 0;
    let totalCanceled = 0;

    const groupedData: Record<string, any[]> = {};

    items.forEach((item) => {
      const obj = item.toObject() as any;
      totalAssigned++;
      if (obj.status === DeliveryStatus.DELIVERED) totalDelivery++;
      if (obj.status === DeliveryStatus.CANCELLED) totalCanceled++;

      const dateStr = obj.createdAt.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      if (!groupedData[dateStr]) groupedData[dateStr] = [];

      groupedData[dateStr].push({
        _id: obj._id,
        orderNumber: obj.orderNumber,
        assignDate: obj.createdAt,
        pickupAddress: obj.pickupAddress,
        dropoffAddress: obj.dropoffAddress,
        status: obj.status,
      });
    });

    const formattedData = Object.keys(groupedData).map((date) => ({
      date,
      jobs: groupedData[date],
    }));

    return {
      message: 'Driver job history fetched successfully',
      data: formattedData,
      summary: {
        totalAssigned,
        totalDelivery,
        totalCanceled,
      },
    };
  }

  async getDriverRequests(driver: TokenPayload, query: GetDriverRequestsDto) {
    const now = new Date();
    const targetYear = query.year ?? now.getFullYear();
    const targetMonth = query.month ?? now.getMonth() + 1; // 1-12

    const startDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);

    const driverIds = this.getDriverIdsList(driver);

    const monthFilter: Record<string, unknown> = {
      assignedDriver: { $in: driverIds },
      createdAt: { $gte: startDate, $lt: endDate },
    };

    const [pendingCount, acceptedCount] = await Promise.all([
      this.deliveryModel.countDocuments({
        ...monthFilter,
        status: DeliveryStatus.ASSIGNED,
      }),
      this.deliveryModel.countDocuments({
        ...monthFilter,
        status: {
          $in: [
            DeliveryStatus.DRIVER_ACCEPTED,
            DeliveryStatus.DRIVER_TO_PICKUP,
            DeliveryStatus.PICKED_UP,
            DeliveryStatus.IN_TRANSIT,
            DeliveryStatus.OUT_FOR_DELIVERY,
          ],
        },
      }),
    ]);

    const listFilter: Record<string, unknown> = { ...monthFilter };
    if (query.type === RequestTypeFilter.PENDING) {
      listFilter.status = DeliveryStatus.ASSIGNED;
    } else if (query.type === RequestTypeFilter.ACCEPTED) {
      listFilter.status = {
        $in: [
          DeliveryStatus.DRIVER_ACCEPTED,
          DeliveryStatus.DRIVER_TO_PICKUP,
          DeliveryStatus.PICKED_UP,
          DeliveryStatus.IN_TRANSIT,
          DeliveryStatus.OUT_FOR_DELIVERY,
        ],
      };
    } else {
      listFilter.status = {
        $in: [
          DeliveryStatus.ASSIGNED,
          DeliveryStatus.DRIVER_ACCEPTED,
          DeliveryStatus.DRIVER_TO_PICKUP,
          DeliveryStatus.PICKED_UP,
          DeliveryStatus.IN_TRANSIT,
          DeliveryStatus.OUT_FOR_DELIVERY,
          DeliveryStatus.DELIVERED,
        ],
      };
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await Promise.all([
      this.deliveryModel
        .find(listFilter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.deliveryModel.countDocuments(listFilter),
    ]);

    const formattedItems = items.map((item) => {
      const obj = item.toObject() as any;
      const isAccepted = obj.status !== DeliveryStatus.ASSIGNED;
      const displayDate = obj.pickupDate ? new Date(obj.pickupDate) : new Date(obj.createdAt);
      const formattedDate = displayDate.toLocaleDateString('en-US', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      return {
        _id: obj._id,
        orderNumber: obj.orderNumber,
        title: obj.title,
        parcelType: obj.parcelType,
        weight: obj.weight,
        customerName: obj.customerName,
        customerPhone: obj.customerPhone,
        pickupAddress: obj.pickupAddress,
        pickupCoordinates: obj.pickupCoordinates || null,
        preferrablePickupTime: obj.preferrablePickupTime,
        pickupDate: obj.pickupDate,
        receiverName: obj.receiverName,
        receiverPhone: obj.receiverPhone,
        dropoffAddress: obj.dropoffAddress,
        dropoffCoordinates: obj.dropoffCoordinates || null,
        preferrableDeliveryDate: obj.preferrableDeliveryDate,
        status: obj.status,
        isAccepted,
        statusLabel: isAccepted ? 'Accepted' : 'Accept',
        createdAt: obj.createdAt,
        formattedDate,
        trackingUrl: this.formatTrackingUrl(item.trackingToken),
      };
    });

    return {
      message: 'Driver requests page data fetched successfully',
      data: formattedItems,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        pendingRequestCount: pendingCount,
        acceptedCount: acceptedCount,
        filter: {
          type: query.type || RequestTypeFilter.ALL,
          month: targetMonth,
          year: targetYear,
        },
      },
    };
  }

  async findOne(id: string, user: TokenPayload) {
    const delivery = await this.deliveryModel
      .findById(id)
      .populate('assignedDriver', 'name email phoneNumber profile_image locationCoordinates');
    if (!delivery) throw new NotFoundException('Delivery not found');
    await this.assertOwnershipIfDriver(delivery, user);
    return {
      message: 'Delivery fetched successfully',
      data: {
        ...delivery.toObject(),
        trackingUrl: this.formatTrackingUrl(delivery.trackingToken),
      },
    };
  }

  async getMapDetails(id: string, user: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, user);

    const driver = delivery.assignedDriver
      ? await this.userModel.findById(delivery.assignedDriver)
      : null;

    return {
      message: 'Delivery map details fetched successfully',
      data: {
        _id: delivery._id,
        orderNumber: delivery.orderNumber,
        status: delivery.status,
        pickupAddress: delivery.pickupAddress,
        pickupCoordinates: delivery.pickupCoordinates || null,
        dropoffAddress: delivery.dropoffAddress,
        dropoffCoordinates: delivery.dropoffCoordinates || null,
        driverCurrentLocation: delivery.currentLocation || driver?.locationCoordinates || null,
        trackingToken: delivery.trackingToken,
        trackingUrl: this.formatTrackingUrl(delivery.trackingToken),
      },
    };
  }

  async accept(id: string, driver: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.ASSIGNED && delivery.status !== DeliveryStatus.UNASSIGNED) {
      throw new BadRequestException('Only an ASSIGNED delivery can be accepted');
    }
    delivery.status = DeliveryStatus.DRIVER_ACCEPTED;
    await delivery.save();

    const driverUser = await this.userModel.findById(driver.userId);

    await this.notificationService.sendNotification({
      recipientRole: Role.ADMIN,
      title: 'Delivery Accepted',
      body: `Driver ${driverUser?.name || ''} accepted delivery ${delivery.orderNumber}.`,
      type: 'DELIVERY_ACCEPTED',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    return { message: 'Delivery accepted by driver', data: delivery };
  }

  async reject(id: string, driver: TokenPayload, dto: RejectDeliveryDto) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.ASSIGNED) {
      throw new BadRequestException('Only an ASSIGNED delivery can be rejected');
    }
    delivery.status = DeliveryStatus.REJECTED;
    delivery.rejectionReason = dto.reason;
    delivery.assignedDriver = null;
    await delivery.save();

    const driverUser = await this.userModel.findById(driver.userId);

    await this.notificationService.sendNotification({
      recipientRole: Role.ADMIN,
      title: 'Delivery Rejected',
      body: `Driver ${driverUser?.name || ''} rejected delivery ${delivery.orderNumber}: ${dto.reason || 'No reason provided'}.`,
      type: 'DELIVERY_REJECTED',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    return { message: 'Delivery rejected by driver', data: delivery };
  }

  async markDriverToPickup(id: string, driver: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (
      delivery.status !== DeliveryStatus.ASSIGNED &&
      delivery.status !== DeliveryStatus.DRIVER_ACCEPTED
    ) {
      throw new BadRequestException('Delivery must be ASSIGNED or DRIVER_ACCEPTED before driver moves to pickup');
    }
    delivery.status = DeliveryStatus.DRIVER_TO_PICKUP;
    await delivery.save();

    await this.notificationService.sendNotification({
      recipientRole: Role.ADMIN,
      title: 'Driver En Route',
      body: `Driver is en route to pickup location for order ${delivery.orderNumber}.`,
      type: 'STATUS_UPDATE',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    return { message: 'Driver heading to pickup location', data: delivery };
  }

  async markPickedUp(id: string, driver: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (
      delivery.status !== DeliveryStatus.ASSIGNED &&
      delivery.status !== DeliveryStatus.DRIVER_ACCEPTED &&
      delivery.status !== DeliveryStatus.DRIVER_TO_PICKUP
    ) {
      throw new BadRequestException('Delivery must be in ASSIGNED, DRIVER_ACCEPTED, or DRIVER_TO_PICKUP state before pickup');
    }
    delivery.status = DeliveryStatus.PICKED_UP;
    await delivery.save();

    if (delivery.assignedDriver) {
      await this.notificationService.sendNotification({
        recipientId: delivery.assignedDriver,
        recipientRole: Role.DRIVER,
        title: 'Package Picked Up',
        body: `Package for order ${delivery.orderNumber} picked up successfully.`,
        type: 'STATUS_UPDATE',
        deliveryId: delivery._id,
        orderNumber: delivery.orderNumber,
      });
    }

    await this.notificationService.sendNotification({
      recipientRole: Role.ADMIN,
      title: 'Package Picked Up',
      body: `Driver picked up package for order ${delivery.orderNumber}.`,
      type: 'STATUS_UPDATE',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    return { message: 'Marked as picked up', data: delivery };
  }

  async markInTransit(id: string, driver: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.PICKED_UP) {
      throw new BadRequestException('Delivery must be PICKED_UP before it can be marked in transit');
    }
    delivery.status = DeliveryStatus.IN_TRANSIT;
    await delivery.save();

    if (delivery.assignedDriver) {
      await this.notificationService.sendNotification({
        recipientId: delivery.assignedDriver,
        recipientRole: Role.DRIVER,
        title: 'In Transit',
        body: `Order ${delivery.orderNumber} is in transit to delivery address.`,
        type: 'STATUS_UPDATE',
        deliveryId: delivery._id,
        orderNumber: delivery.orderNumber,
      });
    }

    await this.notificationService.sendNotification({
      recipientRole: Role.ADMIN,
      title: 'In Transit',
      body: `Order ${delivery.orderNumber} is now in transit.`,
      type: 'STATUS_UPDATE',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    return { message: 'Marked as in transit', data: delivery };
  }

  async markOutForDelivery(id: string, driver: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.IN_TRANSIT) {
      throw new BadRequestException('Delivery must be IN_TRANSIT before it can be marked out for delivery');
    }
    delivery.status = DeliveryStatus.OUT_FOR_DELIVERY;
    await delivery.save();

    if (delivery.assignedDriver) {
      await this.notificationService.sendNotification({
        recipientId: delivery.assignedDriver,
        recipientRole: Role.DRIVER,
        title: 'Out for Delivery',
        body: `Order ${delivery.orderNumber} is out for final delivery leg.`,
        type: 'STATUS_UPDATE',
        deliveryId: delivery._id,
        orderNumber: delivery.orderNumber,
      });
    }

    await this.notificationService.sendNotification({
      recipientRole: Role.ADMIN,
      title: 'Out for Delivery',
      body: `Order ${delivery.orderNumber} is out for delivery.`,
      type: 'STATUS_UPDATE',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    return { message: 'Marked as out for delivery', data: delivery };
  }

  async updateLocation(id: string, driver: TokenPayload, dto: UpdateLocationDto) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    
    const geoPoint = { type: 'Point', coordinates: [dto.lng, dto.lat] };
    delivery.currentLocation = geoPoint;
    await delivery.save();

    await this.userModel.findByIdAndUpdate(driver.userId, {
      locationCoordinates: geoPoint,
    });

    return { message: 'Location updated', data: { currentLocation: geoPoint } };
  }

  async submitProofOfDelivery(id: string, driver: TokenPayload, dto: ProofOfDeliveryDto) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (
      delivery.status !== DeliveryStatus.IN_TRANSIT &&
      delivery.status !== DeliveryStatus.OUT_FOR_DELIVERY &&
      delivery.status !== DeliveryStatus.DELIVERED
    ) {
      throw new BadRequestException('Delivery must be IN_TRANSIT, OUT_FOR_DELIVERY, or DELIVERED to submit proof of delivery');
    }
    delivery.status = DeliveryStatus.DELIVERED;
    if (dto.proofOfDeliveryImage) delivery.proofOfDeliveryImage = dto.proofOfDeliveryImage;
    if (dto.recipientSignatureImage) delivery.recipientSignatureImage = dto.recipientSignatureImage;
    delivery.recipientName = dto.recipientName;
    delivery.deliveredAt = new Date();
    await delivery.save();

    if (delivery.assignedDriver) {
      await this.notificationService.sendNotification({
        recipientId: delivery.assignedDriver,
        recipientRole: Role.DRIVER,
        title: 'Delivery Completed',
        body: `Order ${delivery.orderNumber} delivered successfully.`,
        type: 'STATUS_UPDATE',
        deliveryId: delivery._id,
        orderNumber: delivery.orderNumber,
      });
    }

    await this.notificationService.sendNotification({
      recipientRole: Role.ADMIN,
      title: 'Delivery Completed',
      body: `Order ${delivery.orderNumber} has been delivered successfully.`,
      type: 'STATUS_UPDATE',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    return { message: 'Delivery completed successfully', data: delivery };
  }

  // ---------- Public Customer Live Tracking ----------

  async getTrackingInfoByToken(tokenOrOrderNumber: string, withDetailsQuery?: string | boolean) {
    const delivery = await this.deliveryModel
      .findOne({
        $or: [{ trackingToken: tokenOrOrderNumber }, { orderNumber: tokenOrOrderNumber }],
      })
      .populate('assignedDriver', 'name phoneNumber profile_image locationCoordinates');

    if (!delivery) {
      throw new NotFoundException('Delivery tracking information not found');
    }

    let showDetails: boolean;
    if (withDetailsQuery !== undefined && withDetailsQuery !== null && withDetailsQuery !== '') {
      if (typeof withDetailsQuery === 'boolean') {
        showDetails = withDetailsQuery;
      } else {
        const lower = String(withDetailsQuery).toLowerCase().trim();
        showDetails = lower === 'true' || lower === '1';
      }
    } else {
      showDetails = delivery.shareDetails ?? true;
    }

    const driver: any = delivery.assignedDriver;
    const trackingUrl = this.formatTrackingUrl(delivery.trackingToken);

    if (!showDetails) {
      return {
        message: 'Live tracking details fetched successfully',
        data: {
          orderNumber: delivery.orderNumber,
          status: delivery.status,
          pickupCoordinates: delivery.pickupCoordinates || null,
          dropoffCoordinates: delivery.dropoffCoordinates || null,
          currentLocation: delivery.currentLocation || driver?.locationCoordinates || null,
          trackingToken: delivery.trackingToken,
          trackingUrl,
          withDetails: false,
          driver: driver
            ? {
                name: driver.name,
                profileImage: driver.profile_image,
                locationCoordinates: driver.locationCoordinates,
              }
            : null,
        },
      };
    }

    return {
      message: 'Live tracking details fetched successfully',
      data: {
        orderNumber: delivery.orderNumber,
        status: delivery.status,
        title: delivery.title,
        parcelType: delivery.parcelType,
        size: delivery.size,
        weight: delivery.weight,
        customerName: delivery.customerName,
        customerEmail: delivery.customerEmail,
        customerPhone: delivery.customerPhone,
        pickupContact: delivery.pickupContact,
        pickupAddress: delivery.pickupAddress,
        pickupDate: delivery.pickupDate,
        preferrablePickupTime: delivery.preferrablePickupTime,
        pickupNote: delivery.pickupNote,
        pickupCoordinates: delivery.pickupCoordinates,
        receiverName: delivery.receiverName,
        receiverPhone: delivery.receiverPhone,
        dropoffAddress: delivery.dropoffAddress,
        preferrableDeliveryDate: delivery.preferrableDeliveryDate,
        deliveryNote: delivery.deliveryNote,
        dropoffCoordinates: delivery.dropoffCoordinates,
        packageDescription: delivery.packageDescription,
        currentLocation: delivery.currentLocation || driver?.locationCoordinates || null,
        proofOfDeliveryImage: delivery.proofOfDeliveryImage || null,
        recipientSignatureImage: delivery.recipientSignatureImage || null,
        recipientName: delivery.recipientName || delivery.receiverName || null,
        deliveredAt: delivery.deliveredAt || null,
        trackingToken: delivery.trackingToken,
        trackingUrl,
        withDetails: true,
        driver: driver
          ? {
              name: driver.name,
              phoneNumber: driver.phoneNumber,
              profileImage: driver.profile_image,
              locationCoordinates: driver.locationCoordinates,
            }
          : null,
      },
    };
  }

  // ---------- Customer Suggestions (admin autocomplete) ----------

  async suggestCustomers(search?: string) {
    const matchStage: Record<string, unknown> = {};
    if (search && search.trim()) {
      const regex = new RegExp(search.trim(), 'i');
      matchStage.$or = [
        { customerName: regex },
        { customerEmail: regex },
        { customerPhone: regex },
      ];
    }

    const customers = await this.deliveryModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: { $toLower: '$customerPhone' },
          customerName: { $last: '$customerName' },
          customerEmail: { $last: '$customerEmail' },
          customerPhone: { $last: '$customerPhone' },
          orderCount: { $sum: 1 },
          lastOrderAt: { $max: '$createdAt' },
        },
      },
      { $sort: { lastOrderAt: -1 } },
      { $limit: 10 },
      {
        $project: {
          _id: 0,
          customerName: 1,
          customerEmail: 1,
          customerPhone: 1,
          orderCount: 1,
          lastOrderAt: 1,
        },
      },
    ]);

    return {
      message: 'Customer suggestions fetched successfully',
      data: customers,
    };
  }

  // ---------- shared ----------

  private getDriverQuery(dtoDriverId: string) {
    const isObjId = Types.ObjectId.isValid(dtoDriverId);
    return {
      $or: [
        ...(isObjId ? [{ _id: new Types.ObjectId(dtoDriverId) }, { authId: new Types.ObjectId(dtoDriverId) }] : []),
        { _id: dtoDriverId },
        { authId: dtoDriverId },
      ],
    };
  }

  private getDriverIdsList(driver: TokenPayload) {
    const list: any[] = [];
    if (driver.userId) {
      list.push(driver.userId);
      if (Types.ObjectId.isValid(driver.userId)) list.push(new Types.ObjectId(driver.userId));
    }
    if (driver.authId) {
      list.push(driver.authId);
      if (Types.ObjectId.isValid(driver.authId)) list.push(new Types.ObjectId(driver.authId));
    }
    return list;
  }

  async getDriverStats(driver: TokenPayload) {
    const driverIds = this.getDriverIdsList(driver);
    const driverMatch = { $in: driverIds };
    const aggregateDriverObjectIds = driverIds
      .filter((id) => id instanceof Types.ObjectId || Types.ObjectId.isValid(id))
      .map((id) => (typeof id === 'string' ? new Types.ObjectId(id) : id));

    const [pendingCount, acceptedOrInTransitCount, totalCompletedCount, completedToday, last7Days] = await Promise.all([
      this.deliveryModel.countDocuments({ assignedDriver: driverMatch, status: DeliveryStatus.ASSIGNED }),
      this.deliveryModel.countDocuments({
        assignedDriver: driverMatch,
        status: {
          $in: [
            DeliveryStatus.DRIVER_ACCEPTED,
            DeliveryStatus.DRIVER_TO_PICKUP,
            DeliveryStatus.PICKED_UP,
            DeliveryStatus.IN_TRANSIT,
            DeliveryStatus.OUT_FOR_DELIVERY,
          ],
        },
      }),
      this.deliveryModel.countDocuments({
        assignedDriver: driverMatch,
        status: DeliveryStatus.DELIVERED,
      }),
      this.deliveryModel.countDocuments({
        assignedDriver: driverMatch,
        status: DeliveryStatus.DELIVERED,
        deliveredAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      this.deliveryModel.aggregate([
        {
          $match: {
            assignedDriver: { $in: aggregateDriverObjectIds },
            status: DeliveryStatus.DELIVERED,
            deliveredAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          },
        },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$deliveredAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    return {
      message: 'Driver stats fetched successfully',
      data: {
        pendingTaskCount: pendingCount + acceptedOrInTransitCount,
        completedTaskCount: totalCompletedCount,
        pendingCount,
        activeCount: acceptedOrInTransitCount,
        completedToday,
        completedLast7Days: last7Days.map((d: any) => ({ date: d._id, count: d.count })),
      },
    };
  }

  private async findByIdOrThrow(id: string): Promise<DeliveryDocument> {
    const delivery = await this.deliveryModel.findById(id);
    if (!delivery) throw new NotFoundException('Delivery not found');
    return delivery;
  }

  private async assertOwnershipIfDriver(delivery: DeliveryDocument, user: TokenPayload) {
    if (user.role !== Role.DRIVER && user.role !== Role.ADMIN && user.role !== Role.SUPER_ADMIN) {
      throw new ForbiddenException('Invalid role');
    }
    if (user.role !== Role.DRIVER) return; // admins/super-admins bypass ownership checks

    const assignedStr = delivery.assignedDriver
      ? String((delivery.assignedDriver as any)._id || delivery.assignedDriver)
      : null;

    if (!assignedStr || (assignedStr !== user.userId && assignedStr !== user.authId)) {
      throw new ForbiddenException('This delivery is not assigned to you');
    }

    const driver = await this.userModel.findOne(this.getDriverQuery(user.userId));
    if (!driver || !driver.isApproved) {
      throw new ForbiddenException('Your driver account is pending approval by an admin');
    }
  }
}

