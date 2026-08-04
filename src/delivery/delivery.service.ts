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
import { TokenPayload } from '../common/interfaces/token-payload.interface';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { UpdateDeliveryDto } from './dto/update-delivery.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';
import { RejectDeliveryDto } from './dto/reject-delivery.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { ProofOfDeliveryDto } from './dto/proof-of-delivery.dto';
import { QueryDeliveryDto } from './dto/query-delivery.dto';

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
    const delivery = await this.deliveryModel.create({
      orderNumber: this.generateOrderNumber(),
      trackingToken,
      customerName: dto.customerName,
      customerPhone: dto.customerPhone,
      pickupAddress: dto.pickupAddress,
      pickupCoordinates: this.toGeoPoint(dto.pickupLng, dto.pickupLat),
      dropoffAddress: dto.dropoffAddress,
      dropoffCoordinates: this.toGeoPoint(dto.dropoffLng, dto.dropoffLat),
      packageDescription: dto.packageDescription,
      createdBy: admin.userId,
      status: DeliveryStatus.PENDING,
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

  async update(id: string, dto: UpdateDeliveryDto) {
    const delivery = await this.findByIdOrThrow(id);
    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new BadRequestException('Only a PENDING delivery can be edited');
    }

    if (dto.customerName != null) delivery.customerName = dto.customerName;
    if (dto.customerPhone != null) delivery.customerPhone = dto.customerPhone;
    if (dto.pickupAddress != null) delivery.pickupAddress = dto.pickupAddress;
    if (dto.dropoffAddress != null) delivery.dropoffAddress = dto.dropoffAddress;
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
    if (delivery.status !== DeliveryStatus.PENDING && delivery.status !== DeliveryStatus.REJECTED) {
      throw new BadRequestException('Delivery is not in an assignable state');
    }

    const driver = await this.userModel.findById(dto.driverId);
    if (!driver) throw new NotFoundException('Driver not found');
    if (!driver.isApproved) {
      throw new BadRequestException('Cannot assign an unapproved driver to a delivery');
    }

    delivery.assignedDriver = new Types.ObjectId(dto.driverId);
    delivery.status = DeliveryStatus.PENDING;
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

  async cancel(id: string) {
    const delivery = await this.findByIdOrThrow(id);
    if (delivery.status === DeliveryStatus.DELIVERED) {
      throw new BadRequestException('A delivered order cannot be cancelled');
    }
    delivery.status = DeliveryStatus.CANCELLED;
    await delivery.save();
    return { message: 'Delivery cancelled successfully' };
  }

  // ---------- Driver ----------

  async findMine(driver: TokenPayload, query: QueryDeliveryDto) {
    const filter: Record<string, unknown> = { assignedDriver: driver.userId };
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

    const formattedItems = items.map((item) => ({
      ...item.toObject(),
      trackingUrl: this.formatTrackingUrl(item.trackingToken),
    }));

    return {
      message: 'Your deliveries fetched successfully',
      data: formattedItems,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, user);
    return {
      message: 'Delivery fetched successfully',
      data: {
        ...delivery.toObject(),
        trackingUrl: this.formatTrackingUrl(delivery.trackingToken),
      },
    };
  }

  async accept(id: string, driver: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new BadRequestException('Only a PENDING delivery can be accepted');
    }
    delivery.status = DeliveryStatus.ACCEPTED;
    await delivery.save();
    return { message: 'Delivery accepted', data: delivery };
  }

  async reject(id: string, driver: TokenPayload, dto: RejectDeliveryDto) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new BadRequestException('Only a PENDING delivery can be rejected');
    }
    delivery.status = DeliveryStatus.REJECTED;
    delivery.rejectionReason = dto.reason;
    delivery.assignedDriver = null;
    await delivery.save();
    return { message: 'Delivery rejected', data: delivery };
  }

  async markPickedUp(id: string, driver: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.ACCEPTED) {
      throw new BadRequestException('Delivery must be ACCEPTED before it can be picked up');
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

  async updateLocation(id: string, driver: TokenPayload, dto: UpdateLocationDto) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    
    const geoPoint = { type: 'Point', coordinates: [dto.lng, dto.lat] };
    delivery.currentLocation = geoPoint;
    await delivery.save();

    // Also update driver's current position in User document
    await this.userModel.findByIdAndUpdate(driver.userId, {
      locationCoordinates: geoPoint,
    });

    return { message: 'Location updated', data: { currentLocation: geoPoint } };
  }

  async submitProofOfDelivery(id: string, driver: TokenPayload, dto: ProofOfDeliveryDto) {
    const delivery = await this.findByIdOrThrow(id);
    await this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.IN_TRANSIT) {
      throw new BadRequestException('Delivery must be IN_TRANSIT before proof of delivery can be submitted');
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
        customerName: delivery.customerName,
        customerPhone: delivery.customerPhone,
        pickupAddress: delivery.pickupAddress,
        pickupCoordinates: delivery.pickupCoordinates,
        dropoffAddress: delivery.dropoffAddress,
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

  // ---------- shared ----------

  async getDriverStats(driver: TokenPayload) {
    const driverId = driver.userId;

    const [pendingCount, acceptedOrInTransitCount, completedToday, last7Days] = await Promise.all([
      this.deliveryModel.countDocuments({ assignedDriver: driverId, status: DeliveryStatus.PENDING }),
      this.deliveryModel.countDocuments({
        assignedDriver: driverId,
        status: { $in: [DeliveryStatus.ACCEPTED, DeliveryStatus.PICKED_UP, DeliveryStatus.IN_TRANSIT] },
      }),
      this.deliveryModel.countDocuments({
        assignedDriver: driverId,
        status: DeliveryStatus.DELIVERED,
        deliveredAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) },
      }),
      this.deliveryModel.aggregate([
        {
          $match: {
            assignedDriver: new Types.ObjectId(driverId),
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
    if (user.role !== 'DRIVER') return; // admins/super-admins bypass ownership checks
    if (!delivery.assignedDriver || String(delivery.assignedDriver) !== user.userId) {
      throw new ForbiddenException('This delivery is not assigned to you');
    }
    const driver = await this.userModel.findById(user.userId);
    if (!driver || !driver.isApproved) {
      throw new ForbiddenException('Your driver account is pending approval by an admin');
    }
  }
}

