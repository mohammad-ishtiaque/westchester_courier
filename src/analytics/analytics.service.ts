import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Delivery, DeliveryDocument } from '../delivery/schemas/delivery.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Vehicle, VehicleDocument } from '../vehicle/schemas/vehicle.schema';
import { DeliveryStatus } from '../common/enums/delivery-status.enum';

// Backs the admin dashboard's top-level KPI cards + chart. There's no Payment/pricing
// model in this app (no revenue figures exist to aggregate), so the Figma "revenue chart"
// is proxied here with delivery-volume-over-time instead — flagged in the testing guide.
// If a Payment/Invoice model gets added later, swap the $sum in getChart() for an actual
// revenue field instead of order counts.
@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Delivery.name) private readonly deliveryModel: Model<DeliveryDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Vehicle.name) private readonly vehicleModel: Model<VehicleDocument>,
  ) {}

  async getOverview() {
    const [facetResult] = await this.deliveryModel.aggregate([
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          total: [{ $count: 'count' }],
          distinctCustomers: [{ $group: { _id: '$customerPhone' } }, { $count: 'count' }],
        },
      },
    ]);

    const totalDeliveries = facetResult.total[0]?.count ?? 0;
    const deliveriesByStatus: Record<string, number> = Object.values(DeliveryStatus).reduce(
      (acc, status) => ({ ...acc, [status]: 0 }),
      {},
    );
    for (const row of facetResult.byStatus) {
      deliveriesByStatus[row._id] = row.count;
    }
    const delivered = deliveriesByStatus[DeliveryStatus.DELIVERED] ?? 0;
    const completionRate = totalDeliveries ? Number(((delivered / totalDeliveries) * 100).toFixed(1)) : 0;
    const totalCustomers = facetResult.distinctCustomers[0]?.count ?? 0;

    // Every doc in the User collection is a Driver profile (Admins live in their own
    // collection — see AuthService's role routing), so a plain count is correct here.
    const [totalDrivers, totalVehicles] = await Promise.all([
      this.userModel.countDocuments({}),
      this.vehicleModel.countDocuments({}),
    ]);

    return {
      message: 'Analytics overview fetched successfully',
      data: {
        totalDeliveries,
        deliveriesByStatus,
        completionRate,
        totalDrivers,
        totalVehicles,
        totalCustomers,
      },
    };
  }

  async getChart(days: number) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since = new Date(today);
    since.setDate(since.getDate() - (days - 1));

    const rows = await this.deliveryModel.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          totalOrders: { $sum: 1 },
          deliveredOrders: { $sum: { $cond: [{ $eq: ['$status', DeliveryStatus.DELIVERED] }, 1, 0] } },
        },
      },
    ]);
    const byDate = new Map(rows.map((r) => [r._id, r]));

    const series: Array<{ date: string; totalOrders: number; deliveredOrders: number }> = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(since);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const row = byDate.get(key);
      series.push({ date: key, totalOrders: row?.totalOrders ?? 0, deliveredOrders: row?.deliveredOrders ?? 0 });
    }

    return { message: 'Analytics chart data fetched successfully', data: series };
  }
}
