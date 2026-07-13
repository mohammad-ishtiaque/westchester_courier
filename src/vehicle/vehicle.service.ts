import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Vehicle, VehicleDocument } from './schemas/vehicle.schema';
import { User, UserDocument } from '../user/schemas/user.schema';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { AssignVehicleDto } from './dto/assign-vehicle.dto';
import { QueryVehicleDto } from './dto/query-vehicle.dto';

@Injectable()
export class VehicleService {
  constructor(
    @InjectModel(Vehicle.name) private readonly vehicleModel: Model<VehicleDocument>,
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
  ) {}

  async create(dto: CreateVehicleDto) {
    const vehicle = await this.vehicleModel.create(dto);
    return { message: 'Vehicle added successfully', data: vehicle };
  }

  async findAll(query: QueryVehicleDto) {
    const filter: Record<string, unknown> = {};
    if (query.status) filter.status = query.status;
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const [items, total] = await Promise.all([
      this.vehicleModel
        .find(filter)
        .populate('assignedDriver', 'name email phoneNumber')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      this.vehicleModel.countDocuments(filter),
    ]);

    return {
      message: 'Vehicles fetched successfully',
      data: items,
      meta: { page, limit, total, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: string) {
    const vehicle = await this.vehicleModel.findById(id).populate('assignedDriver', 'name email phoneNumber');
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return { message: 'Vehicle fetched successfully', data: vehicle };
  }

  async update(id: string, dto: UpdateVehicleDto) {
    const vehicle = await this.vehicleModel.findByIdAndUpdate(id, dto, { new: true, runValidators: true });
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    return { message: 'Vehicle updated successfully', data: vehicle };
  }

  async remove(id: string) {
    const vehicle = await this.vehicleModel.findById(id);
    if (!vehicle) throw new NotFoundException('Vehicle not found');
    if (vehicle.assignedDriver) {
      throw new BadRequestException('Unassign this vehicle from its driver before deleting it');
    }
    await vehicle.deleteOne();
    return { message: 'Vehicle removed successfully' };
  }

  async assign(id: string, dto: AssignVehicleDto) {
    const vehicle = await this.vehicleModel.findById(id);
    if (!vehicle) throw new NotFoundException('Vehicle not found');

    const driver = await this.userModel.findById(dto.driverId);
    if (!driver) throw new NotFoundException('Driver not found');

    // Keep the two-way reference in sync: unassign this vehicle from whoever had it,
    // and clear this driver's previous vehicle (a driver has at most one vehicle at a time).
    if (vehicle.assignedDriver) {
      await this.userModel.updateOne({ _id: vehicle.assignedDriver }, { assignedVehicle: null });
    }
    if (driver.assignedVehicle) {
      await this.vehicleModel.updateOne({ _id: driver.assignedVehicle }, { assignedDriver: null });
    }

    vehicle.assignedDriver = new Types.ObjectId(dto.driverId);
    await vehicle.save();
    driver.assignedVehicle = vehicle._id as Types.ObjectId;
    await driver.save();

    return { message: 'Vehicle assigned successfully', data: vehicle };
  }
}
