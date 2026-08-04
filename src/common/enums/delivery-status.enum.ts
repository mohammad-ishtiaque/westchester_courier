// Derived from the Figma admin Orders table (colored status pills) and the driver
// Map/Details/Proof-of-Delivery screens — NOT copied from an exact field list (the
// design tool couldn't give me exact label text for the admin dashboard, see project
// notes). Flagged here in case the real labels differ once you check against Figma
// directly — renaming this enum's values is a one-line change, nothing depends on
// the string values except what's stored in the DB already.
export enum DeliveryStatus {
  UNASSIGNED = 'UNASSIGNED',             // created by admin, no driver assigned yet
  ASSIGNED = 'ASSIGNED',                 // admin assigned driver, awaiting driver acceptance
  DRIVER_ACCEPTED = 'DRIVER_ACCEPTED',   // driver accepted the delivery order
  DRIVER_TO_PICKUP = 'DRIVER_TO_PICKUP', // driver en route to pickup address
  PICKED_UP = 'PICKED_UP',               // driver picked up package from sender
  IN_TRANSIT = 'IN_TRANSIT',             // driver en route to delivery address
  OUT_FOR_DELIVERY = 'OUT_FOR_DELIVERY', // driver out for final delivery leg
  DELIVERED = 'DELIVERED',               // package delivered, proof attached
  REJECTED = 'REJECTED',                 // driver rejected — available for reassignment
  CANCELLED = 'CANCELLED',               // cancelled by admin
}

