import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Delivery, DeliveryDocument } from './schemas/delivery.schema';
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
  ) {}

  private generateOrderNumber(): string {
    // e.g. WC-8F3K21 — short, human-readable, good enough to read aloud over the phone.
    // Collision risk is negligible for this volume; if it ever matters, switch to a
    // DB-backed sequence counter instead of random.
    const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `WC-${rand}`;
  }

  private toGeoPoint(lng?: number, lat?: number) {
    if (lng == null || lat == null) return undefined;
    return { type: 'Point', coordinates: [lng, lat] };
  }

  // ---------- Admin ----------

  async create(admin: TokenPayload, dto: CreateDeliveryDto) {
    const delivery = await this.deliveryModel.create({
      orderNumber: this.generateOrderNumber(),
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

    return { message: 'Delivery created successfully', data: delivery };
  }

  async findAllForAdmin(query: QueryDeliveryDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await Promise.all([
      this.deliveryModel
        .find(filter)
        .populate('assignedDriver', 'name email phoneNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.deliveryModel.countDocuments(filter),
    ]);

    return {
      message: 'Deliveries fetched successfully',
      data: items,
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
    return { message: 'Delivery updated successfully', data: delivery };
  }

  async assignDriver(id: string, dto: AssignDriverDto) {
    const delivery = await this.findByIdOrThrow(id);
    if (delivery.status !== DeliveryStatus.PENDING && delivery.status !== DeliveryStatus.REJECTED) {
      throw new BadRequestException('Delivery is not in an assignable state');
    }

    delivery.assignedDriver = new Types.ObjectId(dto.driverId);
    delivery.status = DeliveryStatus.PENDING;
    delivery.rejectionReason = undefined;
    await delivery.save();

    return { message: 'Driver assigned successfully', data: delivery };
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

    return {
      message: 'Your deliveries fetched successfully',
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string, user: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    this.assertOwnershipIfDriver(delivery, user);
    return { message: 'Delivery fetched successfully', data: delivery };
  }

  async accept(id: string, driver: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.PENDING) {
      throw new BadRequestException('Only a PENDING delivery can be accepted');
    }
    delivery.status = DeliveryStatus.ACCEPTED;
    await delivery.save();
    return { message: 'Delivery accepted', data: delivery };
  }

  async reject(id: string, driver: TokenPayload, dto: RejectDeliveryDto) {
    const delivery = await this.findByIdOrThrow(id);
    this.assertOwnershipIfDriver(delivery, driver);
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
    this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.ACCEPTED) {
      throw new BadRequestException('Delivery must be ACCEPTED before it can be picked up');
    }
    delivery.status = DeliveryStatus.PICKED_UP;
    await delivery.save();
    return { message: 'Marked as picked up', data: delivery };
  }

  async markInTransit(id: string, driver: TokenPayload) {
    const delivery = await this.findByIdOrThrow(id);
    this.assertOwnershipIfDriver(delivery, driver);
    if (delivery.status !== DeliveryStatus.PICKED_UP) {
      throw new BadRequestException('Delivery must be PICKED_UP before it can be marked in transit');
    }
    delivery.status = DeliveryStatus.IN_TRANSIT;
    await delivery.save();
    return { message: 'Marked as in transit', data: delivery };
  }

  async updateLocation(id: string, driver: TokenPayload, dto: UpdateLocationDto) {
    const delivery = await this.findByIdOrThrow(id);
    this.assertOwnershipIfDriver(delivery, driver);
    delivery.currentLocation = { type: 'Point', coordinates: [dto.lng, dto.lat] };
    await delivery.save();
    // NOTE: this is plain REST/poll-based for now. Once the real-time/Chat module exists,
    // this is also where we'd emit a socket event (e.g. EnumSocketEvent.UPDATE_LOCATION in
    // the reference template) so the admin Map screen updates live instead of on refresh.
    return { message: 'Location updated' };
  }

  async submitProofOfDelivery(id: string, driver: TokenPayload, dto: ProofOfDeliveryDto) {
    const delivery = await this.findByIdOrThrow(id);
    this.assertOwnershipIfDriver(delivery, driver);
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

  // ---------- shared ----------

  // Powers the Figma "Home" screen (pending-task count + a completed-deliveries chart).
  // NOTE: the exact chart metric shown in Figma couldn't be confirmed field-by-field (see
  // project notes on Figma tooling limits for the admin/driver dashboards) — this returns
  // "deliveries completed per day, last 7 days" as the best available proxy. Swap the
  // metric here if the real design tracks something else (e.g. earnings, once a
  // Payment/Earnings model exists).
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

  private assertOwnershipIfDriver(delivery: DeliveryDocument, user: TokenPayload) {
    if (user.role !== 'DRIVER') return; // admins/super-admins bypass ownership checks
    if (!delivery.assignedDriver || String(delivery.assignedDriver) !== user.userId) {
      throw new ForbiddenException('This delivery is not assigned to you');
    }
  }
}
