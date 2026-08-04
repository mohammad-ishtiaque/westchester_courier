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

### C. Admin Driver Approval

#### 4. `PATCH /admin/drivers/:id/approve`
* **Prerequisites**: Must send `Authorization: Bearer <adminAccessToken>` and pass the target Driver's `_id` in URL params.
* **Headers**: `Authorization: Bearer <adminAccessToken>`
* **Request Body**: None.
* **Response**:
```json
{
  "message": "Driver registration approved successfully",
  "data": {
    "_id": "66af123...",
    "name": "John Driver",
    "isProfileCompleted": true,
    "isApproved": true,
    "approvalStatus": "APPROVED"
  }
}
```

#### 5. `PATCH /admin/drivers/:id/reject`
* **Prerequisites**: Admin token. Passes target Driver's `_id` in URL params.
* **Headers**: `Authorization: Bearer <adminAccessToken>`, `Content-Type: application/json`
* **Request Body**:
  * **Optional Data**:
    * `reason`: string (Reason for rejection)
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

### D. Deliveries & Live Driver Tracking

#### 6. `POST /deliveries` (Admin Create Delivery)
* **Prerequisites**: Admin token.
* **Headers**: `Authorization: Bearer <adminAccessToken>`, `Content-Type: application/json`
* **Request Body**:
  * **Required Data**:
    * `customerName`: string (e.g. `"Jane Smith"`)
    * `customerPhone`: string (e.g. `"+19145550123"`)
    * `pickupAddress`: string (e.g. `"100 Main St, White Plains, NY"`)
    * `dropoffAddress`: string (e.g. `"200 Mamaroneck Ave, White Plains, NY"`)
  * **Optional Data**:
    * `pickupLng`: number
    * `pickupLat`: number
    * `dropoffLng`: number
    * `dropoffLat`: number
    * `packageDescription`: string
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
    "customerPhone": "+19145550123",
    "status": "PENDING"
  }
}
```

#### 7. `PATCH /deliveries/:id/location` (Driver Update Live Location)
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
}
```
