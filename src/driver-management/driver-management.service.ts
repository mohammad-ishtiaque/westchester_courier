import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Auth, AuthDocument } from '../auth/schemas/auth.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Role } from '../common/enums/role.enum';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';
import { QueryDriverDto } from './dto/query-driver.dto';

@Injectable()
export class DriverManagementService {
  constructor(
    @InjectModel(Auth.name) private readonly authModel: Model<AuthDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  // Admin-initiated — the account is created already active (isActive: true), since an
  // admin manually adding a driver is vouching for them directly. This is the one
  // deliberate difference from AuthService.register, which requires OTP activation
  // for self-service signup. Matches the Figma "Add Driver" form.
  async create(dto: CreateDriverDto) {
    const existing = await this.authModel.findOne({ email: dto.email });
    if (existing) throw new ConflictException('A user with this email already exists');

    const auth = await this.authModel.create({
      name: dto.name,
      email: dto.email,
      password: dto.password,
      role: Role.DRIVER,
      isActive: true,
    });

    const driver = await this.userModel.create({
      authId: auth._id,
      name: dto.name,
      email: dto.email,
      phoneNumber: dto.phoneNumber,
      isProfileCompleted: true,
      isApproved: true,
      approvalStatus: 'APPROVED',
    });

    return { message: 'Driver added successfully', data: driver };
  }

  async findAll(query: QueryDriverDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const authMatch: Record<string, unknown> = { role: Role.DRIVER };
    if (query.search) {
      authMatch.$or = [
        { name: { $regex: query.search, $options: 'i' } },
        { email: { $regex: query.search, $options: 'i' } },
      ];
    }

    const userMatch: Record<string, unknown> = {};
    if (query.approvalStatus) {
      userMatch.approvalStatus = query.approvalStatus.toUpperCase();
    }

    const pipeline = [
      { $match: userMatch },
      {
        $lookup: {
          from: 'auths',
          localField: 'authId',
          foreignField: '_id',
          as: 'auth',
        },
      },
      { $unwind: '$auth' },
      { $match: authMatch },
      { $sort: { createdAt: -1 as const } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                name: 1,
                email: 1,
                phoneNumber: 1,
                address: 1,
                profile_image: 1,
                driverId: 1,
                dateOfBirth: 1,
                isProfileCompleted: 1,
                isApproved: 1,
                approvalStatus: 1,
                rejectionReason: 1,
                locationCoordinates: 1,
                isOnline: 1,
                assignedVehicle: 1,
                createdAt: 1,
                isActive: '$auth.isActive',
                isBlocked: '$auth.isBlocked',
              },
            },
          ],
          totalCount: [{ $count: 'count' }],
        },
      },
    ];

    const [result] = await this.userModel.aggregate(pipeline);
    const total = result.totalCount[0]?.count ?? 0;

    return {
      message: 'Drivers fetched successfully',
      data: result.data,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const driver = await this.userModel.findById(id);
    if (!driver) throw new NotFoundException('Driver not found');
    const auth = await this.authModel.findById(driver.authId);
    return {
      message: 'Driver fetched successfully',
      data: { ...driver.toObject(), isActive: auth?.isActive, isBlocked: auth?.isBlocked },
    };
  }

  async update(id: string, dto: UpdateDriverDto) {
    const driver = await this.userModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true });
    if (!driver) throw new NotFoundException('Driver not found');
    return { message: 'Driver updated successfully', data: driver };
  }

  async approveDriver(id: string) {
    const driver = await this.userModel.findById(id);
    if (!driver) throw new NotFoundException('Driver not found');

    driver.isApproved = true;
    driver.approvalStatus = 'APPROVED';
    driver.rejectionReason = undefined;
    await driver.save();

    return { message: 'Driver registration approved successfully', data: driver };
  }

  async rejectDriver(id: string, reason?: string) {
    const driver = await this.userModel.findById(id);
    if (!driver) throw new NotFoundException('Driver not found');

    driver.isApproved = false;
    driver.approvalStatus = 'REJECTED';
    if (reason) driver.rejectionReason = reason;
    await driver.save();

    return { message: 'Driver registration rejected', data: driver };
  }

  async setBlocked(id: string, blocked: boolean) {
    const driver = await this.userModel.findById(id);
    if (!driver) throw new NotFoundException('Driver not found');

    const auth = await this.authModel.findByIdAndUpdate(driver.authId, { isBlocked: blocked }, { new: true });
    if (!auth) throw new NotFoundException('Driver credentials not found');

    return { message: blocked ? 'Driver blocked' : 'Driver unblocked', data: { isBlocked: auth.isBlocked } };
  }

  async remove(id: string) {
    const driver = await this.userModel.findById(id);
    if (!driver) throw new NotFoundException('Driver not found');
    if (driver.assignedVehicle) {
      throw new BadRequestException('Unassign this driver\'s vehicle before removing their account');
    }
    await this.authModel.deleteOne({ _id: driver.authId });
    await driver.deleteOne();
    return { message: 'Driver removed successfully' };
  }
}

