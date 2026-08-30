import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { User, UserDocument } from '../user/schemas/user.schema';
import { Admin, AdminDocument } from '../admin/schemas/admin.schema';
import { Auth, AuthDocument } from '../auth/schemas/auth.schema';
import { Role } from '../common/enums/role.enum';
import { TokenPayload } from '../common/interfaces/token-payload.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { SetupDriverProfileDto } from './dto/setup-driver-profile.dto';
import { DeleteAccountDto } from './dto/delete-account.dto';

@Injectable()
export class ProfileService {
  constructor(
    @InjectModel(User.name) private readonly userModel: Model<UserDocument>,
    @InjectModel(Admin.name) private readonly adminModel: Model<AdminDocument>,
    @InjectModel(Auth.name) private readonly authModel: Model<AuthDocument>,
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

  async setupDriverProfile(user: TokenPayload, dto: SetupDriverProfileDto, profileImagePath?: string) {
    if (user.role !== Role.DRIVER) {
      throw new ForbiddenException('Only users with DRIVER role can set up a driver profile');
    }

    const driver = await this.userModel.findById(user.userId);
    if (!driver) throw new NotFoundException('Driver profile not found');

    driver.driverId = dto.driverId;
    driver.dateOfBirth = new Date(dto.dateOfBirth);
    driver.phoneNumber = dto.phoneNumber;
    if (profileImagePath != null) driver.profile_image = profileImagePath;
    if (dto.address != null) driver.address = dto.address;
    driver.locationCoordinates = {
      type: 'Point',
      coordinates: [dto.lng, dto.lat],
    };
    driver.isProfileCompleted = true;

    await driver.save();
    return { message: 'Driver profile setup completed successfully. Awaiting admin approval.', data: driver };
  }

  async updateMe(user: TokenPayload, dto: UpdateProfileDto, profileImagePath?: string) {
    const profile = this.isAdminRole(user.role)
      ? await this.adminModel.findById(user.userId)
      : await this.userModel.findById(user.userId);
    if (!profile) throw new NotFoundException('Profile not found');

    if (dto.name != null) profile.name = dto.name;
    if (dto.phoneNumber != null) profile.phoneNumber = dto.phoneNumber;
    if (dto.address != null) profile.address = dto.address;
    if (profileImagePath != null) profile.profile_image = profileImagePath;
    else if (dto.profileImage != null) profile.profile_image = dto.profileImage;

    if (!this.isAdminRole(user.role)) {
      const userProfile = profile as unknown as UserDocument;
      if (dto.driverId != null) userProfile.driverId = dto.driverId;
      if (dto.dateOfBirth != null) userProfile.dateOfBirth = new Date(dto.dateOfBirth);
      if (dto.lng != null && dto.lat != null) {
        userProfile.locationCoordinates = {
          type: 'Point',
          coordinates: [dto.lng, dto.lat],
        };
      }
    }

    await profile.save();
    return { message: 'Profile updated successfully', data: profile };
  }

  async deleteMe(user: TokenPayload, dto: DeleteAccountDto) {
    if (!dto || !dto.password) {
      throw new BadRequestException('Password is required to delete your account');
    }

    const auth = (user.authId ? await this.authModel.findById(user.authId).select('+password') : null)
      || await this.authModel.findOne({ email: user.email }).select('+password');

    if (!auth) {
      throw new NotFoundException('Account credentials not found');
    }

    const isMatch = await bcrypt.compare(dto.password, auth.password);
    if (!isMatch) {
      throw new BadRequestException('Incorrect password. Account deletion failed.');
    }

    const isAdmin = this.isAdminRole(user.role);
    const profile = isAdmin
      ? await this.adminModel.findByIdAndDelete(user.userId)
      : await this.userModel.findByIdAndDelete(user.userId);

    await this.authModel.deleteOne({ _id: auth._id });

    return {
      success: true,
      message: 'Account deleted successfully',
      data: profile,
    };
  }
}

