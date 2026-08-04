import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Delivery, DeliveryDocument } from '../delivery/schemas/delivery.schema';
import { DeliveryStatus } from '../common/enums/delivery-status.enum';
import { QueryCustomerDto } from './dto/query-customer.dto';

// There is no separate, login-capable Customer entity in this app — the Figma design
// has no customer-facing mobile screens, only a driver app + admin dashboard. The admin
// dashboard's "Customers" screen is a READ-ONLY view derived from Delivery.customerName /
// Delivery.customerPhone, grouped by phone number (the natural unique key for a customer,
// since name alone can collide). If a real Customer accounts/auth system is ever needed,
// this module is the place to migrate from — the aggregation groups below define exactly
// what fields a dedicated Customer schema would need.
@Injectable()
export class CustomerService {
  constructor(
    @InjectModel(Delivery.name) private readonly deliveryModel: Model<DeliveryDocument>,
  ) {}

  async findAll(query: QueryCustomerDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const match: Record<string, unknown> = {};
    if (query.search) {
      match.$or = [
        { customerName: { $regex: query.search, $options: 'i' } },
        { customerPhone: { $regex: query.search, $options: 'i' } },
      ];
    }

    const pipeline: any[] = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$customerPhone',
          customerName: { $first: '$customerName' },
          totalOrders: { $sum: 1 },
          lastOrderAt: { $max: '$createdAt' },
          lastAddress: { $first: '$dropoffAddress' },
        },
      },
      { $sort: { lastOrderAt: -1 } },
      {
        $facet: {
          data: [{ $skip: (page - 1) * limit }, { $limit: limit }],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await this.deliveryModel.aggregate(pipeline);
    const total = result.totalCount[0]?.count ?? 0;

    return {
      message: 'Customers fetched successfully',
      data: result.data.map((c: any) => ({
        customerPhone: c._id,
        customerName: c.customerName,
        totalOrders: c.totalOrders,
        lastOrderAt: c.lastOrderAt,
        lastAddress: c.lastAddress,
      })),
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(phone: string) {
    const deliveries = await this.deliveryModel.find({ customerPhone: phone }).sort({ createdAt: -1 });
    if (!deliveries.length) throw new NotFoundException('Customer not found');

    const totalOrders = deliveries.length;
    const deliveredOrders = deliveries.filter((d) => d.status === DeliveryStatus.DELIVERED).length;

    return {
      message: 'Customer fetched successfully',
      data: {
        customerPhone: phone,
        customerName: deliveries[0].customerName,
        totalOrders,
        deliveredOrders,
        lastOrderAt: (deliveries[0] as any).createdAt,
        orders: deliveries,
      },
    };
  }

  async getSuggestions(search?: string) {
    const match: Record<string, unknown> = {};
    if (search && search.trim()) {
      match.$or = [
        { customerName: { $regex: search.trim(), $options: 'i' } },
        { customerPhone: { $regex: search.trim(), $options: 'i' } },
      ];
    }

    const pipeline: any[] = [
      { $match: match },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: '$customerPhone',
          customerName: { $first: '$customerName' },
          customerEmail: { $first: '$customerEmail' },
          customerPhone: { $first: '$customerPhone' },
          pickupContact: { $first: '$pickupContact' },
          pickupAddress: { $first: '$pickupAddress' },
          pickupNote: { $first: '$pickupNote' },
          preferrablePickupTime: { $first: '$preferrablePickupTime' },
          receiverName: { $first: '$receiverName' },
          receiverPhone: { $first: '$receiverPhone' },
          dropoffAddress: { $first: '$dropoffAddress' },
          lastOrderAt: { $max: '$createdAt' },
          totalOrders: { $sum: 1 },
        },
      },
      { $sort: { lastOrderAt: -1 } },
      { $limit: 10 },
    ];

    const results = await this.deliveryModel.aggregate(pipeline);

    return {
      message: 'Customer suggestions fetched successfully',
      data: results.map((c: any) => ({
        customerPhone: c.customerPhone || c._id,
        customerName: c.customerName,
        customerEmail: c.customerEmail,
        pickupContact: c.pickupContact,
        pickupAddress: c.pickupAddress,
        pickupNote: c.pickupNote,
        preferrablePickupTime: c.preferrablePickupTime,
        receiverName: c.receiverName,
        receiverPhone: c.receiverPhone,
        dropoffAddress: c.dropoffAddress,
        lastOrderAt: c.lastOrderAt,
        totalOrders: c.totalOrders,
      })),
    };
  }
}
