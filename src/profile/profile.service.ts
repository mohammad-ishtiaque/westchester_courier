import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Admin, AdminDocument } from '../admin/schemas/admin.schema';
import { Role } from '../common/enums/role.enum';
import { TokenPayload } from '../common/interfaces/token-payload.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';

// Backs every Figma "Settings"/profile screen (driver + admin) — one service, two
// collections, routed by the role already carried in the JWT (same pattern as
// AuthService.findProfile). No separate "AdminProfileController" and
// "DriverProfileController" needed since the shape of "view/edit my own profile"
// is identical for both roles.
@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
  ) {}

  private isAdminRole(role: Role) {
    return role === Role.ADMIN || role === Role.SUPER_ADMIN;
  }

  async getMe(user: TokenPayload) {
    const profile = this.isAdminRole(user.role)
      ? await this.adminModel.findById(user.userId)
      : await this.userModel.findById(user.userId);

    if (!profile) throw new NotFoundException('Profile not found');
    return { message: 'Profile fetched successfully', data: profile };
  }

  async updateMe(user: TokenPayload, dto: UpdateProfileDto) {
    const profile = this.isAdminRole(user.role)
      ? await this.adminModel.findById(user.userId)
      : await this.userModel.findById(user.userId);
    if (!profile) throw new NotFoundException('Profile not found');

    if (dto.name != null) profile.name = dto.name;
    if (dto.phoneNumber != null) profile.phoneNumber = dto.phoneNumber;
    if (dto.address != null) profile.address = dto.address;
    if (dto.profileImage != null) profile.profile_image = dto.profileImage;

    await profile.save();
    return { message: 'Profile updated successfully', data: profile };
  }
}
