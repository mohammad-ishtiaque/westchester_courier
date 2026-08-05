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

@Injectable()
export class DeliveryService {
  constructor(
    @InjectModel(Delivery.name) private readonly deliveryModel: Model<DeliveryDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
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
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
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

    if (dto.driverId) {
      const driver = await this.userModel.findOne(this.getDriverQuery(dto.driverId));
      if (!driver) throw new NotFoundException('Driver not found');
      if (!driver.isApproved) {
        throw new BadRequestException('Cannot assign an unapproved driver to a delivery');
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
      createdBy: admin.userId,
      assignedDriver: assignedDriverId,
      status: initialStatus,
    });

    return {
      message: 'Delivery created successfully',
      data: {
        ...delivery.toObject(),
        trackingUrl: this.formatTrackingUrl(trackingToken),
      },
    };
  }

  async findAllForAdmin(query: QueryDeliveryDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;

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
    if (delivery.status !== DeliveryStatus.UNASSIGNED && delivery.status !== DeliveryStatus.ASSIGNED) {
      throw new BadRequestException('Only UNASSIGNED or ASSIGNED deliveries can be edited by admin');
    }

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
      delivery.status !== DeliveryStatus.UNASSIGNED &&
      delivery.status !== DeliveryStatus.ASSIGNED &&
      delivery.status !== DeliveryStatus.REJECTED
    ) {
      throw new BadRequestException('Cannot assign driver once delivery has been accepted or is in progress');
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
    if (delivery.status !== DeliveryStatus.ASSIGNED) {
      throw new BadRequestException('Can only remove driver before the driver accepts the delivery');
    }

    delivery.assignedDriver = null;
    delivery.status = DeliveryStatus.UNASSIGNED;
    await delivery.save();

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
    return { message: 'Delivery cancelled successfully' };
  }

  async updateStatus(id: string, user: TokenPayload, dto: UpdateDeliveryStatusDto) {
    if (user.role === Role.ADMIN || user.role === Role.SUPER_ADMIN) {
      const delivery = await this.findByIdOrThrow(id);
      delivery.status = dto.status;
      if (dto.reason) delivery.rejectionReason = dto.reason;
      await delivery.save();
      return {
        message: `Delivery status updated to ${dto.status} by admin`,
        data: delivery,
      };
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
      return {
        _id: obj._id,
        orderNumber: obj.orderNumber,
        status: obj.status,
        customerName: obj.customerName,
        customerPhone: obj.customerPhone,
        pickupAddress: obj.pickupAddress,
        preferrablePickupTime: obj.preferrablePickupTime,
        pickupDate: obj.pickupDate,
        receiverName: obj.receiverName,
        receiverPhone: obj.receiverPhone,
        dropoffAddress: obj.dropoffAddress,
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
      delivery.status !== DeliveryStatus.OUT_FOR_DELIVERY
    ) {
      throw new BadRequestException('Delivery must be IN_TRANSIT or OUT_FOR_DELIVERY before proof of delivery can be submitted');
    }
    delivery.status = DeliveryStatus.DELIVERED;
    delivery.proofOfDeliveryImage = dto.proofOfDeliveryImage;
    delivery.recipientName = dto.recipientName;
    delivery.deliveredAt = new Date();
    await delivery.save();
    return { message: 'Delivery completed successfully', data: delivery };
  }

  // ---------- Public Customer Live Tracking ----------

  async getTrackingInfoByToken(tokenOrOrderNumber: string) {
    const delivery = await this.deliveryModel
      .findOne({
        $or: [{ trackingToken: tokenOrOrderNumber }, { orderNumber: tokenOrOrderNumber }],
      })
      .populate('assignedDriver', 'name phoneNumber profile_image locationCoordinates');

    if (!delivery) {
      throw new NotFoundException('Delivery tracking information not found');
    }

    const driver: any = delivery.assignedDriver;
    const trackingUrl = this.formatTrackingUrl(delivery.trackingToken);

    return {
      message: 'Live tracking details fetched successfully',
      data: {
        orderNumber: delivery.orderNumber,
        status: delivery.status,
        title: delivery.title,
        parcelType: delivery.parcelType,
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
        trackingToken: delivery.trackingToken,
        trackingUrl,
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

