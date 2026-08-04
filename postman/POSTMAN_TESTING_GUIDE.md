# Auth + Delivery + Driver Setup + Live Tracking — Postman Testing Guide

This guide covers how to run the API locally, import and run the Postman collection, the exact prerequisite order dependencies between API endpoints, required vs optional request parameters, and expected response payloads.

---

## 1. How to Run the API Locally

```bash
npm install
cp .env.example .env    # fill in your real MONGO_URL, JWT secrets, etc.
npm run start:dev
```

The server listens on `PORT` from `.env` (defaults to 8001). Once up, you will see `Westchester Courier API running on port 8001`.

---

## 2. Driver Onboarding & Live Tracking — End-to-End Prerequisite Order

To test the complete driver lifecycle and live customer tracking flow in Postman, execute requests in this **exact sequential order**:

```
[1. Register Driver] 
       │
       ▼
[2. Activate Account (Email OTP)]  ──> Returns JWT + isProfileCompleted: false, approvalStatus: "PENDING"
       │
       ▼
[3. Driver Profile Setup]         ──> Body: driverId, dateOfBirth, phoneNumber, lat, lng (isProfileCompleted -> true)
       │
       ▼
[4. Admin Login / Setup]          ──> Returns admin JWT
       │
       ▼
[5. Admin Approves Driver]        ──> PATCH /admin/drivers/:id/approve (isApproved -> true, approvalStatus -> "APPROVED")
       │
       ▼
[6. Admin Creates Delivery]       ──> Returns delivery + trackingToken & trackingUrl
       │
       ▼
[7. Admin Assigns Delivery]       ──> Assigns approved driver to delivery
       │
       ▼
[8. Driver Accepts Delivery]      ──> PATCH /deliveries/:id/accept (Status: ACCEPTED)
       │
       ▼
[9. Driver Marks Picked Up]       ──> PATCH /deliveries/:id/picked-up (Status: PICKED_UP)
       │
       ▼
[10. Driver Marks In Transit]     ──> PATCH /deliveries/:id/in-transit (Status: IN_TRANSIT)
       │
       ▼
[11. Driver Updates Location]     ──> PATCH /deliveries/:id/location (Body: lat, lng) -> Syncs delivery & driver coordinates
       │
       ▼
[12. Customer Live Track Link]    ──> GET /deliveries/track/:token (UNAUTHENTICATED public endpoint)
```

---

## 3. API Endpoints — Required/Optional Data & Prerequisites

### A. Authentication & Onboarding

#### 1. `POST /auth/register`
* **Prerequisites**: None.
* **Headers**: `Content-Type: application/json`
* **Request Body**:
  * **Required Data**:
    * `name`: string (e.g. `"John Driver"`)
    * `email`: string (e.g. `"john.driver@example.com"`)
    * `password`: string (e.g. `"Password123!"`)
    * `confirmPassword`: string (e.g. `"Password123!"`)
    * `role`: string (`"DRIVER"`, `"USER"`, `"ADMIN"`, `"SUPER_ADMIN"`)
* **Response**:
```json
{
  "message": "Account created successfully. Please check your email",
  "data": {
    "isActive": false,
    "devActivationCode": "123456"
  }
}
```

#### 2. `POST /auth/activate-account`
* **Prerequisites**: Must run `POST /auth/register` first.
* **Headers**: `Content-Type: application/json`
* **Request Body**:
  * **Required Data**:
    * `email`: string
    * `activationCode`: string (6-digit code returned from register)
* **Response**:
```json
{
  "message": "Activation code verified successfully.",
  "data": {
    "accessToken": "eyJhbGci...",
    "refreshToken": "eyJhbGci...",
    "user": {
      "id": "66af123...",
      "email": "john.driver@example.com",
      "role": "DRIVER",
      "isProfileCompleted": false,
      "isApproved": false,
      "approvalStatus": "PENDING"
    }
  }
}
```

---

### B. Driver Profile Setup

#### 3. `PATCH /profile/driver-setup`
* **Prerequisites**: Driver MUST complete email activation (`activateAccount`) first and send `Authorization: Bearer <driverAccessToken>`.
* **Content-Type**: `multipart/form-data` (**NOT** `application/json`)
* **Headers**: `Authorization: Bearer <driverAccessToken>`

> In Postman → select **Body → form-data**. Do NOT use raw/JSON.

| Field | Type | Required | Description | Example |
|---|---|---|---|---|
| `driverId` | Text | ✅ Required | Driver License/ID Number | `DL-987654` |
| `dateOfBirth` | Text | ✅ Required | ISO 8601 date string | `1995-05-15` |
| `phoneNumber` | Text | ✅ Required | Phone number with country code | `+19145550199` |
| `lat` | Text | ✅ Required | Latitude float (-90 to 90) | `41.03398` |
| `lng` | Text | ✅ Required | Longitude float (-180 to 180) | `-73.76291` |
| `profileImage` | **File** | ⬜ Optional | Driver profile photo (jpeg/png/gif/webp, max 5MB) | *(select a file)* |
| `address` | Text | ⬜ Optional | Home/current address | `123 Main St, White Plains, NY` |

> **Important for `lat` / `lng`**: In form-data all values are strings. The backend uses `@Transform` to coerce them to numbers automatically — just enter the numeric value as a plain text field (e.g. `41.03398`). Do **not** wrap in quotes.

* **Response**:
```json
{
  "message": "Driver profile setup completed successfully. Awaiting admin approval.",
  "data": {
    "_id": "66af123...",
    "name": "John Driver",
    "email": "john.driver@example.com",
    "driverId": "DL-987654",
    "dateOfBirth": "1995-05-15T00:00:00.000Z",
    "phoneNumber": "+19145550199",
    "profile_image": "uploads/profile-images/1722000000000-123456.jpg",
    "address": "123 Main St, White Plains, NY",
    "isProfileCompleted": true,
    "isApproved": false,
    "approvalStatus": "PENDING",
    "locationCoordinates": {
      "type": "Point",
      "coordinates": [-73.76291, 41.03398]
    }
  }
}
```
> The `profile_image` value is stored as a file path string. To load the image in a browser or app, prepend the server base URL: `http://localhost:8001/uploads/profile-images/filename.jpg`


---

---

### C. Admin Driver Management & Approval Flow

This flow connects the admin dashboard screens ("New Driver Request" and "Manage Drivers") with the backend APIs.

```
[1. New Driver Request Screen] ──> GET /admin/drivers?approvalStatus=PENDING
                                         │
                                  (Click "Accept")
                                         │
                                         ▼
                                   PATCH /admin/drivers/:id/approve
                                         │
                                         ▼
[2. Manage Drivers Screen] ─────> GET /admin/drivers?approvalStatus=APPROVED
                                         │
                                   (Click "View")
                                         │
                                         ▼
[3. Driver Info Modal] ─────────> GET /admin/drivers/:id
```

---

#### 4. `GET /admin/drivers?approvalStatus=PENDING` (New Driver Request Table - Figma Screen 3)
* **Description**: Backs the **"New Driver Request"** page (when admin clicks **"New request"** button). Displays all driver accounts awaiting admin approval.
* **Prerequisites**: Admin token.
* **Headers**: `Authorization: Bearer <adminAccessToken>`
* **Query Parameters**:
  * `approvalStatus`: `'PENDING'` (Filters for pending driver requests)
  * `search`: string (Optional search by name, email, or phone number)
  * `page`: number (Default: `1`)
  * `limit`: number (Default: `20`)
* **Response**:
```json
{
  "message": "Drivers fetched successfully",
  "data": [
    {
      "_id": "66af123...",
      "name": "Marvin McKinney",
      "email": "Jackson.Graham@Example.Com",
      "phoneNumber": "(308) 555-0121",
      "address": "Lansing, Illinois",
      "driverId": "ID: 43756",
      "dateOfBirth": "1987-12-30T00:00:00.000Z",
      "profile_image": "uploads/profile-images/marvin.jpg",
      "isProfileCompleted": true,
      "isApproved": false,
      "approvalStatus": "PENDING",
      "createdAt": "2019-12-04T21:42:00.000Z"
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 30,
    "totalPages": 2
  }
}
```

---

#### 5. `PATCH /admin/drivers/:id/approve` (Accept Driver Request - "Accept" Button)
* **Description**: Action triggered when Admin clicks the blue **"Accept"** button next to a driver in the New Driver Request table. Approves the driver's profile so they can log in, accept deliveries, and appear in the active drivers list.
* **Prerequisites**: Admin token. Passes target Driver's `_id` in URL params.
* **Headers**: `Authorization: Bearer <adminAccessToken>`
* **Request Body**: None.
* **Response**:
```json
{
  "message": "Driver registration approved successfully",
  "data": {
    "_id": "66af123...",
    "name": "Marvin McKinney",
    "email": "Jackson.Graham@Example.Com",
    "isProfileCompleted": true,
    "isApproved": true,
    "approvalStatus": "APPROVED"
  }
}
```

---

#### 6. `GET /admin/drivers` (Manage Drivers Table - Figma Screen 1)
* **Description**: Backs the main **"Manage Drivers"** table showing active drivers.
* **Prerequisites**: Admin token.
* **Headers**: `Authorization: Bearer <adminAccessToken>`
* **Query Parameters**:
  * `approvalStatus`: string (Optional: `'APPROVED'`, `'PENDING'`, `'REJECTED'`. Omit or set `'APPROVED'` for active drivers)
  * `search`: string (Optional search by name, email, or phone number)
  * `page`: number (Default: `1`)
  * `limit`: number (Default: `20`)
* **Response**:
```json
{
  "message": "Drivers fetched successfully",
  "data": [
    {
      "_id": "66af123...",
      "name": "Marvin McKinney",
      "email": "Jackson.Graham@Example.Com",
      "phoneNumber": "(308) 555-0121",
      "address": "Lansing, Illinois",
      "driverId": "ID: 43756",
      "dateOfBirth": "1987-12-30T00:00:00.000Z",
      "profile_image": "uploads/profile-images/marvin.jpg",
      "isProfileCompleted": true,
      "isApproved": true,
      "approvalStatus": "APPROVED",
      "isOnline": false,
      "createdAt": "2019-12-04T21:42:00.000Z",
      "isActive": true,
      "isBlocked": false
    }
  ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 120,
    "totalPages": 6
  }
}
```

---

#### 7. `GET /admin/drivers/:id` (Driver Info Modal - Figma Screen 2 "View" Button)
* **Description**: Triggered when Admin clicks the **"View"** button on any driver in the Manage Drivers table. Returns driver info + total completed deliveries.
* **Prerequisites**: Admin token. Target Driver's `_id` in URL params.
* **Headers**: `Authorization: Bearer <adminAccessToken>`
* **Response**:
```json
{
  "message": "Driver fetched successfully",
  "data": {
    "_id": "66af123...",
    "authId": "66af120...",
    "name": "Marvin McKinney",
    "email": "Jackson.Graham@Example.Com",
    "phoneNumber": "(308) 555-0121",
    "driverId": "5646544",
    "dateOfBirth": "2000-06-16T00:00:00.000Z",
    "address": "Lansing, Illinois",
    "profile_image": "uploads/profile-images/marvin.jpg",
    "isProfileCompleted": true,
    "isApproved": true,
    "approvalStatus": "APPROVED",
    "isOnline": false,
    "createdAt": "2026-09-21T00:00:00.000Z",
    "isActive": true,
    "isBlocked": false,
    "totalCompletedDeliveries": 121
  }
}
```

---

#### 8. `PATCH /admin/drivers/:id/reject` (Reject Driver Request)
* **Prerequisites**: Admin token. Target Driver's `_id` in URL params.
* **Headers**: `Authorization: Bearer <adminAccessToken>`, `Content-Type: application/json`
* **Request Body**:
  * `reason`: string (Optional reason for rejection)
* **Response**:
```json
{
  "message": "Driver registration rejected",
  "data": {
    "_id": "66af123...",
    "isApproved": false,
    "approvalStatus": "REJECTED",
    "rejectionReason": "Documents unclear"
  }
}
```

---

#### 9. `PATCH /admin/drivers/:id/block` & `PATCH /admin/drivers/:id/unblock` (Block / Unblock Driver)
* **Prerequisites**: Admin token. Target Driver's `_id` in URL params.
* **Headers**: `Authorization: Bearer <adminAccessToken>`
* **Response**:
```json
{
  "message": "Driver blocked",
  "data": { "isBlocked": true }
}
```

---

### D. Deliveries & Live Driver Tracking

#### 6. `POST /deliveries` (Admin Create Delivery)
* **Prerequisites**: Admin token.
* **Headers**: `Authorization: Bearer <adminAccessToken>`, `Content-Type: application/json`
* **Request Body**:
  * **Step 1: Customer Information**:
    * `customerName`: string (**Required**, e.g. `"Jane Smith"`)
    * `customerPhone`: string (**Required**, e.g. `"+19145550123"`)
    * `customerEmail`: string (Optional, e.g. `"jane.smith@example.com"`)
  * **Step 2: Pickup Details**:
    * `pickupAddress`: string (**Required**, e.g. `"100 Main St, White Plains, NY"`)
    * `pickupContact`: string (Optional, e.g. `"Building Security / Gate 2"`)
    * `pickupDate`: string (Optional, ISO string format e.g. `"2026-08-10T10:00:00.000Z"`)
    * `preferrablePickupTime`: string (Optional, e.g. `"10:00 AM - 12:00 PM"`)
    * `pickupNote`: string (Optional, e.g. `"Ring doorbell twice"`)
    * `pickupLng`: number (Optional, e.g. `-73.76291`)
    * `pickupLat`: number (Optional, e.g. `41.03398`)
  * **Step 3: Delivery Details**:
    * `dropoffAddress`: string (**Required**, e.g. `"200 Mamaroneck Ave, White Plains, NY"`)
    * `receiverName`: string (Optional, defaults to `customerName`)
    * `receiverPhone`: string (Optional, defaults to `customerPhone`)
    * `preferrableDeliveryDate`: string (Optional, ISO string format e.g. `"2026-08-10T14:00:00.000Z"`)
    * `deliveryNote`: string (Optional, e.g. `"Leave at front reception"`)
    * `dropoffLng`: number (Optional, e.g. `-73.76500`)
    * `dropoffLat`: number (Optional, e.g. `41.03600`)
  * **Package & Assignment (Optional)**:
    * `title`: string (e.g. `"Document Envelope"`)
    * `parcelType`: string (e.g. `"Documents"`)
    * `weight`: string (e.g. `"2 lbs"`)
    * `packageDescription`: string (e.g. `"Fragile Box"`)
    * `driverId`: string (Optional MongoDB ObjectId of assigned driver)
* **Example JSON Body**:
```json
{
  "customerName": "Jane Smith",
  "customerEmail": "jane.smith@example.com",
  "customerPhone": "+19145550123",
  "pickupContact": "Building Security / Gate 2",
  "pickupAddress": "100 Main St, White Plains, NY",
  "pickupDate": "2026-08-10T10:00:00.000Z",
  "preferrablePickupTime": "10:00 AM - 12:00 PM",
  "pickupNote": "Ring doorbell twice",
  "pickupLng": -73.76291,
  "pickupLat": 41.03398,
  "receiverName": "Bob Johnson",
  "receiverPhone": "+19145550999",
  "dropoffAddress": "200 Mamaroneck Ave, White Plains, NY",
  "preferrableDeliveryDate": "2026-08-10T14:00:00.000Z",
  "deliveryNote": "Leave at front reception",
  "dropoffLng": -73.76500,
  "dropoffLat": 41.03600,
  "title": "Document Package",
  "parcelType": "Box",
  "weight": "5 lbs",
  "packageDescription": "Handle with care"
}
```
* **Response**:
```json
{
  "message": "Delivery created successfully",
  "data": {
    "_id": "66b2345...",
    "orderNumber": "WC-8F3K21",
    "trackingToken": "a1b2c3d4e5f6...",
    "trackingUrl": "http://localhost:3000/track/a1b2c3d4e5f6...",
    "customerName": "Jane Smith",
    "customerEmail": "jane.smith@example.com",
    "customerPhone": "+19145550123",
    "pickupContact": "Building Security / Gate 2",
    "pickupAddress": "100 Main St, White Plains, NY",
    "pickupDate": "2026-08-10T10:00:00.000Z",
    "preferrablePickupTime": "10:00 AM - 12:00 PM",
    "pickupNote": "Ring doorbell twice",
    "receiverName": "Bob Johnson",
    "receiverPhone": "+19145550999",
    "dropoffAddress": "200 Mamaroneck Ave, White Plains, NY",
    "preferrableDeliveryDate": "2026-08-10T14:00:00.000Z",
    "deliveryNote": "Leave at front reception",
    "status": "UNASSIGNED"
  }
}
```

#### 7. `GET /deliveries/:id` (Fetch Single Delivery Details)
* **Prerequisites**: Admin token or assigned Driver token.
* **Headers**: `Authorization: Bearer <token>`
* **Response**: Populates `assignedDriver` with driver details matching the Figma **"Driver Information"** card:
```json
{
  "message": "Delivery fetched successfully",
  "data": {
    "_id": "66b2345...",
    "orderNumber": "WC-8F3K21",
    "trackingToken": "a1b2c3d4e5f6...",
    "trackingUrl": "http://localhost:3000/track/a1b2c3d4e5f6...",
    "customerName": "Jane Smith",
    "customerPhone": "+19145550123",
    "pickupAddress": "100 Main St, White Plains, NY",
    "dropoffAddress": "200 Mamaroneck Ave, White Plains, NY",
    "status": "ASSIGNED",
    "assignedDriver": {
      "_id": "66af123...",
      "name": "Dianne Russell",
      "email": "michael.mitc@example.com",
      "phoneNumber": "0929 555 0309",
      "profile_image": "uploads/profile-images/dianne.jpg"
    }
  }
}
```

#### 8. `PATCH /deliveries/:id/remove-driver` (Admin Remove Assigned Driver)
* **Description**: Admin removes the assigned driver from an unaccepted delivery, changing `status` back to `UNASSIGNED`.
* **Rules & Constraints**:
  * ✅ Allowed when delivery `status` is `ASSIGNED` (before the driver accepts).
  * ❌ **Forbidden / 400 Bad Request**: Once the driver accepts the delivery (`status` becomes `DRIVER_ACCEPTED` or in progress), the admin **cannot** remove the driver.
* **Prerequisites**: Admin token.
* **Headers**: `Authorization: Bearer <adminAccessToken>`
* **Response**:
```json
{
  "message": "Driver removed successfully",
  "data": {
    "_id": "66b2345...",
    "orderNumber": "WC-8F3K21",
    "assignedDriver": null,
    "status": "UNASSIGNED"
  }
}
```

#### 9. `PATCH /deliveries/:id/accept` (Screen 1: Accept Request - Green Button)
* **Description**: Driver accepts an assigned delivery order.
* **Prerequisites**: Driver token. Delivery `status` must be `ASSIGNED`.
* **Headers**: `Authorization: Bearer <driverAccessToken>`
* **Response**: Moves `status` -> `DRIVER_ACCEPTED` (Screen 2: Assigned green dot).
```json
{
  "message": "Delivery accepted by driver",
  "data": {
    "_id": "66b2345...",
    "orderNumber": "WC-8F3K21",
    "status": "DRIVER_ACCEPTED"
  }
}
```

#### 10. `PATCH /deliveries/:id/reject` (Screen 1: Reject Request - Red Button)
* **Description**: Driver rejects an assigned delivery order and optionally provides a rejection reason.
* **Prerequisites**: Driver token. Delivery `status` must be `ASSIGNED`.
* **Headers**: `Authorization: Bearer <driverAccessToken>`, `Content-Type: application/json`
* **Request Body**:
```json
{
  "reason": "Too far from current location"
}
```
* **Response**: Moves `status` -> `REJECTED`, sets `rejectionReason`, and clears `assignedDriver = null` so admin can re-assign to another driver.
```json
{
  "message": "Delivery rejected by driver",
  "data": {
    "_id": "66b2345...",
    "orderNumber": "WC-8F3K21",
    "status": "REJECTED",
    "rejectionReason": "Too far from current location",
    "assignedDriver": null
  }
}
```

#### 11. `PATCH /deliveries/:id/driver-to-pickup` (Screen 2: Arrive at Pickup - Blue Button)
* **Description**: Driver starts moving towards the pickup location.
* **Headers**: `Authorization: Bearer <driverAccessToken>`
* **Response**: Moves `status` -> `DRIVER_TO_PICKUP` (Screen 3: At Pickup green dot).

#### 12. `PATCH /deliveries/:id/picked-up` (Screen 3: Confirm Pickup - Blue Button)
* **Description**: Driver arrives at pickup and confirms package pickup.
* **Headers**: `Authorization: Bearer <driverAccessToken>`
* **Response**: Moves `status` -> `PICKED_UP`.

#### 13. `PATCH /deliveries/:id/in-transit` (Screen 4: Arrived at Delivery - Blue Button)
* **Description**: Driver starts transit towards delivery location.
* **Headers**: `Authorization: Bearer <driverAccessToken>`
* **Response**: Moves `status` -> `IN_TRANSIT` (Screen 4: In Transit green dot).

#### 14. `PATCH /deliveries/:id/out-for-delivery` (Screen 5: Complete Delivery - Blue Button)
* **Description**: Driver arrives at dropoff location.
* **Headers**: `Authorization: Bearer <driverAccessToken>`
* **Response**: Moves `status` -> `OUT_FOR_DELIVERY` (Screen 5: At Drop green dot).

#### 15. `PATCH /deliveries/:id/proof-of-delivery` (Screen 6 & 7: Submit Proof of Delivery - Green Button)
* **Description**: Driver submits photo proof & recipient name. Accepts `multipart/form-data` file upload so driver can upload an actual image file directly.
* **Headers**: `Authorization: Bearer <driverAccessToken>` (Content-Type header auto-set by Postman/Client for multipart/form-data)
* **Body Format**: `multipart/form-data`
  * `recipientName`: text (e.g. `Jenny Wilson`)
  * `proofOfDeliveryImage`: file (image file upload, stored to disk as `uploads/proof-of-delivery/...` and string path saved in MongoDB)
* **Response**: Moves `status` -> `DELIVERED` (Screen 7: All 5 dots green & Job Completed).
```json
{
  "message": "Delivery completed successfully",
  "data": {
    "_id": "66b2345...",
    "orderNumber": "WC-8F3K21",
    "status": "DELIVERED",
    "proofOfDeliveryImage": "https://example.com/proof-photos/sample.jpg",
    "recipientName": "Jenny Wilson",
    "deliveredAt": "2026-08-04T20:38:00.000Z"
  }
}
```

#### 16. `PATCH /deliveries/:id/location` (Driver Update Live Location)
* **Prerequisites**: Approved Driver token (`isApproved: true`). Delivery must be assigned to driver.
* **Headers**: `Authorization: Bearer <driverAccessToken>`, `Content-Type: application/json`
* **Request Body**:
  * **Required Data**:
    * `lat`: number (Latitude float, e.g. `41.03450`)
    * `lng`: number (Longitude float, e.g. `-73.76310`)
* **Response**:
```json
{
  "message": "Location updated",
  "data": {
    "currentLocation": {
      "type": "Point",
      "coordinates": [-73.76310, 41.03450]
    }
  }
}
```

#### 8. `GET /deliveries/track/:token` (Public Customer Live Tracking)
* **Prerequisites**: None! (Public endpoint `@Public()`). Customer accesses this using `trackingToken` or `orderNumber` from shareable tracking URL.
* **Headers**: None.
* **Response**:
```json
{
  "message": "Live tracking details fetched successfully",
  "data": {
    "orderNumber": "WC-8F3K21",
    "status": "IN_TRANSIT",
    "customerName": "Jane Smith",
    "customerPhone": "+19145550123",
    "pickupAddress": "100 Main St, White Plains, NY",
    "pickupCoordinates": {
      "type": "Point",
      "coordinates": [-73.76291, 41.03398]
    },
    "dropoffAddress": "200 Mamaroneck Ave, White Plains, NY",
    "dropoffCoordinates": {
      "type": "Point",
      "coordinates": [-73.76500, 41.03600]
    },
    "packageDescription": "Fragile Box",
    "currentLocation": {
      "type": "Point",
      "coordinates": [-73.76310, 41.03450]
    },
    "trackingToken": "a1b2c3d4e5f6...",
    "trackingUrl": "http://localhost:3000/track/a1b2c3d4e5f6...",
    "driver": {
      "name": "John Driver",
      "phoneNumber": "+19145550199",
      "profileImage": "https://example.com/driver.jpg",
      "locationCoordinates": {
        "type": "Point",
        "coordinates": [-73.76310, 41.03450]
    }
  }
}
```

---

### E. Admin Customers & Autofill Suggestions

#### 9. `GET /admin/customers/suggestions` (Customer Suggestions for Create Order Form Auto-fill)
* **Prerequisites**: Admin token.
* **Headers**: `Authorization: Bearer <adminAccessToken>`
* **Query Parameters**:
  * `q` or `search`: string (Optional search term matching customer name or phone number, e.g. `?q=Jane` or `?q=914`)
* **Response**:
```json
{
  "message": "Customer suggestions fetched successfully",
  "data": [
    {
      "customerPhone": "+19145550123",
      "customerName": "Jane Smith",
      "customerEmail": "jane.smith@example.com",
      "pickupContact": "Building Security / Gate 2",
      "pickupAddress": "100 Main St, White Plains, NY",
      "pickupNote": "Ring doorbell twice",
      "preferrablePickupTime": "10:00 AM - 12:00 PM",
      "receiverName": "Bob Johnson",
      "receiverPhone": "+19145550999",
      "dropoffAddress": "200 Mamaroneck Ave, White Plains, NY",
      "lastOrderAt": "2026-08-10T10:00:00.000Z",
      "totalOrders": 3
    }
  ]
}
```

#### 10. `GET /admin/customers` (List Customers)
* **Prerequisites**: Admin token.
* **Query Parameters**: `search` (optional), `page` (optional), `limit` (optional).
* **Response**:
```json
{
  "message": "Customers fetched successfully",
  "data": [
    {
      "customerPhone": "+19145550123",
      "customerName": "Jane Smith",
      "totalOrders": 3,
      "lastOrderAt": "2026-08-10T10:00:00.000Z",
      "lastAddress": "200 Mamaroneck Ave, White Plains, NY"
    }
  ],
  "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1 }
}
```

#### 11. `GET /admin/customers/:phone` (Customer Details & Order History)
* **Prerequisites**: Admin token. Passes customer's phone number URL encoded in params.
* **Response**:
```json
{
  "message": "Customer fetched successfully",
  "data": {
    "customerPhone": "+19145550123",
    "customerName": "Jane Smith",
    "totalOrders": 3,
    "deliveredOrders": 2,
    "lastOrderAt": "2026-08-10T10:00:00.000Z",
    "orders": [...]
  }
}
```

