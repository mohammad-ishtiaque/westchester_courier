import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportDocument } from './schemas/report.schema';
import { Delivery, DeliveryDocument } from '../delivery/schemas/delivery.schema';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { QueryReportDto } from './dto/query-report.dto';
import type { TokenPayload } from '../common/interfaces/token-payload.interface';
import { NotificationService } from '../notification/notification.service';
import { Role } from '../common/enums/role.enum';

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Delivery.name) private readonly deliveryModel: Model<DeliveryDocument>,
    private readonly notificationService: NotificationService,
  ) {}

  async create(dto: CreateReportDto, driver: TokenPayload) {
    const delivery = await this.deliveryModel.findById(dto.deliveryId);
    if (!delivery) {
      throw new NotFoundException('Delivery not found');
    }
    
    // Check if the delivery is actually assigned to this driver
    if (delivery.assignedDriver?.toString() !== driver.userId) {
      throw new BadRequestException('You can only report issues for deliveries assigned to you');
    }

    const report = new this.reportModel({
      ...dto,
      delivery: dto.deliveryId,
      driver: driver.userId,
    });
    
    await report.save();

    await this.notificationService.sendNotification({
      recipientRole: Role.ADMIN,
      title: 'Issue Reported',
      body: `Driver reported an issue for order ${delivery.orderNumber}: ${dto.title}`,
      type: 'ISSUE_REPORTED',
      deliveryId: delivery._id,
      orderNumber: delivery.orderNumber,
    });

    return { message: 'Issue reported successfully', data: report };
  }

  async findAll(query: QueryReportDto) {
    const { page = 1, limit = 10, status } = query;
    const filter = status ? { status } : {};

    const [reports, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('driver', 'name email profile_image')
        .populate('delivery', 'orderNumber status'),
      this.reportModel.countDocuments(filter),
    ]);

    return {
      message: 'Reports fetched successfully',
      data: reports,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const report = await this.reportModel
      .findById(id)
      .populate('driver', 'name email phoneNumber profile_image')
      .populate('delivery', 'orderNumber createdAt status');
    
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    return { message: 'Report details fetched successfully', data: report };
  }

  async updateStatus(id: string, dto: UpdateReportStatusDto) {
    const report = await this.reportModel.findById(id);
    if (!report) {
      throw new NotFoundException('Report not found');
    }

    report.status = dto.status;
    await report.save();

    if (dto.deliveryStatus && report.delivery) {
      const delivery = await this.deliveryModel.findById(report.delivery);
      if (delivery) {
        delivery.status = dto.deliveryStatus;
        if (dto.reason) {
          delivery.rejectionReason = dto.reason;
        }
        await delivery.save();

        if (delivery.assignedDriver) {
          await this.notificationService.sendNotification({
            recipientId: delivery.assignedDriver,
            recipientRole: Role.DRIVER,
            title: 'Delivery Status Updated',
            body: `Delivery ${delivery.orderNumber} status was changed to ${dto.deliveryStatus} upon resolving report.${dto.reason ? ` Reason: ${dto.reason}` : ''}`,
            type: 'STATUS_UPDATE',
            deliveryId: delivery._id,
            orderNumber: delivery.orderNumber,
          });
        }
      }
    }

    const updatedReport = await this.reportModel
      .findById(id)
      .populate('driver', 'name email phoneNumber profile_image')
      .populate('delivery', 'orderNumber createdAt status');

    return { message: 'Report status updated successfully', data: updatedReport };
  }
}
