import { Role } from '../enums/role.enum';

export interface TokenPayload {
  authId: string;
  userId: string;
  email: string;
  role: Role;
}
