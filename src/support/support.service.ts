import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Support, SupportDocument } from './schemas/support.schema';
import { CreateSupportDto } from './dto/create-support.dto';
import { QuerySupportDto } from './dto/query-support.dto';
import type { TokenPayload } from '../common/interfaces/token-payload.interface';
import { SupportStatus } from '../common/enums/support-status.enum';

@Injectable()
export class SupportService {
  constructor(
    @InjectModel(Support.name) private readonly supportModel: Model<SupportDocument>,
  ) {}

  async create(driver: TokenPayload, dto: CreateSupportDto) {
    const support = await this.supportModel.create({
      ...dto,
      driverId: driver.userId,
    });

    return {
      message: 'Support request submitted successfully',
      data: support,
    };
  }

  async findAll(query: QuerySupportDto) {
    const filter: Record<string, any> = {};

    if (query.status) {
      filter.status = query.status;
    }

    if (query.search) {
      const regex = new RegExp(query.search, 'i');
      filter.$or = [
        { name: regex },
        { email: regex },
        { message: regex },
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await Promise.all([
      this.supportModel
        .find(filter)
        .populate('driverId', 'name email phoneNumber profile_image')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.supportModel.countDocuments(filter),
    ]);

    const formattedItems = items.map((item) => {
      const doc = item.toObject() as any;
      return {
        ...doc,
        driverEmail: doc.driverId?.email || doc.email, // Fallback if no driver email
      };
    });

    return {
      message: 'Support requests fetched successfully',
      data: formattedItems,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOne(id: string) {
    const support = await this.supportModel
      .findById(id)
      .populate('driverId', 'name email phoneNumber profile_image');
      
    if (!support) {
      throw new NotFoundException('Support request not found');
    }

    const doc = support.toObject() as any;
    return {
      message: 'Support request fetched successfully',
      data: {
        ...doc,
        driverEmail: doc.driverId?.email || doc.email,
      },
    };
  }

  async resolve(id: string) {
    const support = await this.supportModel.findByIdAndUpdate(
      id,
      { status: SupportStatus.RESOLVED },
      { new: true },
    );

    if (!support) {
      throw new NotFoundException('Support request not found');
    }

    return {
      message: 'Support request marked as resolved',
      data: support,
    };
  }

  async remove(id: string) {
    const support = await this.supportModel.findByIdAndDelete(id);
    
    if (!support) {
      throw new NotFoundException('Support request not found');
    }

    return {
      message: 'Support request deleted successfully',
    };
  }
}
