import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Report, ReportDocument } from './schemas/report.schema';
import { Delivery, DeliveryDocument } from '../delivery/schemas/delivery.schema';
import { CreateReportDto } from './dto/create-report.dto';
import { UpdateReportStatusDto } from './dto/update-report-status.dto';
import { QueryReportDto } from './dto/query-report.dto';
import type { TokenPayload } from '../common/interfaces/token-payload.interface';

@Injectable()
export class ReportService {
  constructor(
    @InjectModel(Report.name) private readonly reportModel: Model<ReportDocument>,
    @InjectModel(Delivery.name) private readonly deliveryModel: Model<DeliveryDocument>,
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
    const report = await this.reportModel.findByIdAndUpdate(
      id,
      { status: dto.status },
      { new: true }
    );
    if (!report) {
      throw new NotFoundException('Report not found');
    }
    return { message: 'Report status updated successfully', data: report };
  }
}
