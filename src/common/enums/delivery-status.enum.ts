// Derived from the Figma admin Orders table (colored status pills) and the driver
// Map/Details/Proof-of-Delivery screens — NOT copied from an exact field list (the
// design tool couldn't give me exact label text for the admin dashboard, see project
// notes). Flagged here in case the real labels differ once you check against Figma
// directly — renaming this enum's values is a one-line change, nothing depends on
// the string values except what's stored in the DB already.
export enum DeliveryStatus {
  PENDING = 'PENDING',       // created, not yet accepted by a driver
  ACCEPTED = 'ACCEPTED',     // driver accepted, not yet picked up
  REJECTED = 'REJECTED',     // driver rejected — goes back to PENDING for reassignment
  PICKED_UP = 'PICKED_UP',   // driver has the package
  IN_TRANSIT = 'IN_TRANSIT', // en route to dropoff
  DELIVERED = 'DELIVERED',   // completed, proof of delivery attached
  CANCELLED = 'CANCELLED',   // cancelled by admin/customer before delivery
}
