// Matches the reference template's EnumUserRole exactly — DRIVER is the mobile app role
// (Figma "Driver Side" screens), ADMIN/SUPER_ADMIN are the web Dashboard, USER is kept
// for parity/future use but isn't exercised by any screen we've seen yet.
export enum Role {
  USER = 'USER',
  DRIVER = 'DRIVER',
  ADMIN = 'ADMIN',
  SUPER_ADMIN = 'SUPER_ADMIN',
}
