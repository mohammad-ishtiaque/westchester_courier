import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Delivery, DeliveryDocument } from '../delivery/schemas/delivery.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Vehicle, VehicleDocument } from '../vehicle/schemas/vehicle.schema';
import { Report, ReportDocument } from '../report/schemas/report.schema';
import { DeliveryStatus } from '../common/enums/delivery-status.enum';

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectModel(Delivery.name) private readonly deliveryModel: Model<DeliveryDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Vehicle.name) private readonly vehicleModel: Model<VehicleDocument>,
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
  ) {}

  async getOverview() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [facetResult] = await this.deliveryModel.aggregate([
      {
        $facet: {
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
          total: [{ $count: 'count' }],
          todayTotal: [
            { $match: { createdAt: { $gte: today } } },
            { $count: 'count' }
          ],
          todayCompleted: [
            { $match: { createdAt: { $gte: today }, status: DeliveryStatus.DELIVERED } },
            { $count: 'count' }
          ]
        },
      },
    ]);

    const totalOrder = facetResult.total[0]?.count ?? 0;
    
    const deliveriesByStatus: Record<string, number> = Object.values(DeliveryStatus).reduce(
      (acc, status) => ({ ...acc, [status]: 0 }),
      {},
    );
    for (const row of facetResult.byStatus) {
      deliveriesByStatus[row._id] = row.count;
    }

    const totalCompletedOrder = deliveriesByStatus[DeliveryStatus.DELIVERED] ?? 0;
    const canceledOrder = deliveriesByStatus[DeliveryStatus.CANCELLED] ?? 0;
    const activeOrder = totalOrder - totalCompletedOrder - canceledOrder;

    const totalDriver = await this.userModel.countDocuments({});

    const todaysStatus = {
      orders: facetResult.todayTotal[0]?.count ?? 0,
      completed: facetResult.todayCompleted[0]?.count ?? 0,
    };

    const recentReportsRaw = await this.reportModel
      .find()
      .sort({ createdAt: -1 })
      .limit(5)
      .populate('driver', 'name')
      .populate('delivery', 'orderNumber');

    const recentReports = recentReportsRaw.map(r => ({
      _id: r._id,
      orderNumber: (r.delivery as any)?.orderNumber ?? 'Unknown',
      driverName: (r.driver as any)?.name ?? 'Unassigned'
    }));

    return {
      message: 'Analytics overview fetched successfully',
      data: {
        cards: {
          totalOrder,
          totalCompletedOrder,
          activeOrder,
          totalDriver
        },
        todaysStatus,
        recentReports
      },
    };
  }

  async getChart(year?: number, month?: number) {
    const now = new Date();
    const targetYear = year ?? now.getFullYear();
    const targetMonth = month ?? now.getMonth() + 1; // 1-12

    const startDate = new Date(targetYear, targetMonth - 1, 1, 0, 0, 0, 0);
    const endDate = new Date(targetYear, targetMonth, 1, 0, 0, 0, 0);
    const daysInMonth = new Date(targetYear, targetMonth, 0).getDate();

    const rows = await this.deliveryModel.aggregate([
      { $match: { createdAt: { $gte: startDate, $lt: endDate } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          completedOrders: { $sum: { $cond: [{ $eq: ['$status', DeliveryStatus.DELIVERED] }, 1, 0] } },
          canceledOrders: { $sum: { $cond: [{ $eq: ['$status', DeliveryStatus.CANCELLED] }, 1, 0] } },
        },
      },
    ]);
    const byDate = new Map(rows.map((r) => [r._id, r]));

    const series: Array<{ date: string; completedOrders: number; canceledOrders: number }> = [];
    for (let i = 0; i < daysInMonth; i++) {
      const d = new Date(startDate);
      d.setDate(d.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      const row = byDate.get(key);
      series.push({ date: key, completedOrders: row?.completedOrders ?? 0, canceledOrders: row?.canceledOrders ?? 0 });
    }

    return { message: 'Analytics chart data fetched successfully', data: series };
  }
}
