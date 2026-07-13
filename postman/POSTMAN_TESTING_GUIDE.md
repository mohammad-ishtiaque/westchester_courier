# Auth + Delivery Modules — Testing Guide

This covers how to run the API locally, import and run the Postman collection, the exact order dependencies between endpoints, and what's been verified so far vs. what's still pending. Covers both the Auth module and the Delivery module (the core domain — everything the driver app and admin Orders screen revolve around).

## 1. Run the API locally

```
cd westchester-nestjs
npm install
cp .env.example .env    # then fill in your real MONGO_URL, JWT secrets, etc.
npm run start:dev
```

The server listens on `PORT` from `.env` (defaults to 8001). You'll see `Westchester Courier API running on port 8001` once it's up.

If `MONGO_URL` is unreachable, the app will still start (Mongoose buffers commands and retries the connection), but every request that touches the database will hang for up to 30 seconds before failing — if that happens, double check the connection string first.

## 2. Import the Postman collection

The collection lives at `postman/westchester-auth.postman_collection.json` in this project. In Postman: **Import → File** → select it. It's self-contained — no separate environment file needed, all variables are collection-scoped with sensible defaults (`baseUrl` defaults to `http://localhost:8001`).

Every endpoint in `auth.controller.ts`, `delivery.controller.ts`, `profile.controller.ts`, `driver-management.controller.ts`, `vehicle.controller.ts`, `customer.controller.ts`, `analytics.controller.ts`, and `cms.controller.ts` is represented — 84 requests total across 13 folders:

- **Auth: Happy Path** (8 requests) — all 8 Auth routes (register, resend-activation-code, activate-account, login, forgot-password, verify-otp, reset-password, change-password).
- **Auth: Negative Cases** (7 requests) — wrong password, wrong/expired codes, missing/invalid auth token, password mismatch, invalid role.
- **Delivery: Admin Setup** (2 requests) — registers and activates a throwaway ADMIN account, since Delivery's admin routes need an admin token distinct from the driver token the Auth folder already captured.
- **Delivery: Admin Create & Assign** (5 requests) — all the admin-only Delivery routes: create, get-by-id, assign-to-driver, list-all, update.
- **Delivery: Driver Fulfillment** (7 requests) — all the driver-only Delivery routes: get-stats, get-my-deliveries, accept, mark-picked-up, mark-in-transit, update-location, submit-proof-of-delivery.
- **Delivery: Reject & Cancel Flow** (4 requests) — a second, separate delivery used to test reject (driver-side) and cancel (admin-side) without disturbing the first delivery's completed happy path.
- **Delivery: Negative Cases** (3 requests) — wrong-role access (403), acting on a delivery not assigned to you (403), malformed ID (400).
- **Profile: Settings** (4 requests) — get/update profile as both a driver and an admin, confirming the role-based routing (User vs. Admin collection) works both directions. No dependency on the Delivery folders — just needs both tokens already captured.
- **Driver Management: Admin CRUD** (10 requests) — the admin dashboard's Drivers table: create, get-by-id, list, update, block, unblock, duplicate-email rejection, delete. Creates three throwaway drivers (A, B, C) so later assignment/deletion tests don't collide with each other.
- **Vehicle Management: Admin CRUD** (12 requests) — the admin dashboard's Vehicles table: create, list, get-by-id, update, assign-to-driver, reassign, delete, plus negative cases proving a vehicle can't be deleted while assigned and a driver can't be deleted while holding a vehicle.
- **Customer: Admin Read-Only** (3 requests) — list customers (grouped from Delivery records) and look one up by phone, plus a 404 negative case. Read-only, no separate Customer login exists.
- **Analytics: Admin Dashboard** (3 requests) — the dashboard's KPI overview and time-series chart, plus a validation negative case (chart `days` capped at 90).
- **CMS: Terms, Privacy, About, FAQ, Contact** (16 requests) — five public-read/admin-write singleton content docs (get → admin upsert → get-again to confirm the write persisted, for each of the five), plus one negative case proving a driver token can't write CMS content.

Run the folders in the order listed above — each one depends on variables (JWTs, IDs, OTP codes) captured by the ones before it. Driver Management, Vehicle Management, Customer, Analytics, and CMS's admin-write requests all reuse the `adminAccessToken` captured back in **Delivery: Admin Setup**, so that folder must run first even if you skip the Delivery folders themselves. Customer and Analytics also expect at least one Delivery to already exist (from **Delivery: Admin Create & Assign**) to return non-empty data.

## 3. Order of operations — what depends on what

This is the part that matters most: several endpoints only make sense after another one has run. Each request's Description tab in Postman repeats this, but here's the full dependency graph in one place.

**Registration → activation branch:** Register Driver is the entry point — nothing else works until an account exists. It returns a 6-digit `devActivationCode` (see the dev-mode note below) which Activate Account needs. Resend Activation Code is optional — only needed if the original code expired (3-minute window) or you want a fresh one; it requires the account to already exist and be inactive. Activate Account is the one endpoint that both activates the account AND logs you in — it returns real `accessToken`/`refreshToken`, so a separate Login call isn't strictly required to keep testing, but Login is there to verify a *returning* user's login works independently.

**Password reset branch:** Forgot Password requires the account to exist (doesn't need to be activated). It returns `devVerificationCode`, which Verify OTP consumes to set `isVerified: true` — a one-time flag. Reset Password requires that flag to be true, and clears it again after use, meaning if you want to reset the password a second time you must redo Forgot Password → Verify OTP first, in that order, every time.

**Protected route:** Change Password is the only endpoint behind the JWT guard. It needs a valid `accessToken` (from Activate Account or Login) in the `Authorization: Bearer` header, and — because the collection runs Reset Password before it — its `oldPassword` is set to `testNewPassword` (whatever Reset Password just set), not the original `testPassword`. It resets the password back to `testPassword` at the end, so the whole "Happy Path" folder is safely re-runnable.

**Data needed per endpoint**, summarized:

| Endpoint | Needs from a prior step | New data you provide |
|---|---|---|
| Register | — | name, email, password, confirmPassword, role |
| Resend Activation Code | existing inactive account | email |
| Activate Account | `devActivationCode` from Register | email, activationCode |
| Login | active account (post-Activate) | email, password |
| Forgot Password | existing account | email |
| Verify OTP | `devVerificationCode` from Forgot Password | email, code |
| Reset Password | `isVerified:true` from Verify OTP | email, newPassword, confirmPassword |
| Change Password | `accessToken` from Activate Account/Login | oldPassword, newPassword, confirmPassword |

**Delivery module dependency graph:** Create Delivery (admin) is the entry point — nothing else works until a delivery exists. Assign Driver requires both a created delivery AND a driver's `userId`, which the collection gets by decoding the driver's JWT payload from the Auth folder (no separate "get my profile" endpoint exists yet — that's the Settings module, not built yet). Once assigned, the delivery is still `PENDING` — the driver must explicitly Accept it before any further state transitions are allowed. State transitions are strictly linear and enforced server-side: `PENDING → ACCEPTED → PICKED_UP → IN_TRANSIT → DELIVERED`, each guarded so you can't skip a step (e.g. you cannot mark something in-transit if it was never marked picked-up). Reject is the one branch off this line — it's only available from `PENDING`, and it un-assigns the driver rather than deleting the delivery, so an admin can reassign it. Cancel is admin-only and works from any status except `DELIVERED`. Update Location and Get Delivery Details work at any point in the lifecycle and don't gate on status.

| Delivery Endpoint | Needs from a prior step | New data you provide |
|---|---|---|
| Create Delivery (admin) | admin token | customerName, customerPhone, pickupAddress, dropoffAddress (+ optional lng/lat, packageDescription) |
| Get Delivery Details | a created delivery | — |
| Assign Driver (admin) | created delivery + driver's userId | driverId |
| List All Deliveries (admin) | — | optional status/page/limit query params |
| Update Delivery (admin) | delivery still PENDING | any Create field, all optional |
| Get My Deliveries (driver) | delivery assigned to this driver | optional status/page/limit query params |
| Accept (driver) | delivery assigned + PENDING | — |
| Mark Picked Up (driver) | delivery ACCEPTED | — |
| Mark In Transit (driver) | delivery PICKED_UP | — |
| Update Location (driver) | delivery assigned to this driver | lng, lat |
| Submit Proof of Delivery (driver) | delivery IN_TRANSIT | proofOfDeliveryImage (URL), recipientName |
| Reject (driver) | delivery assigned + PENDING | optional reason |
| Cancel (admin) | delivery not yet DELIVERED | — |

**A note on the schema itself:** the exact field names above (`customerName`, `pickupAddress`, the `DeliveryStatus` enum values, etc.) are my best interpretation of what the Figma admin Orders table and driver Details/Map/Proof-of-Delivery screens need — the design tool couldn't give me exact extracted field labels for the admin dashboard (see the project's Figma access notes). Worth a quick check against the actual design before this goes further, since renaming fields now is cheap and renaming them after the mobile/admin frontends are built against this API is not.

**Driver Management dependency graph:** all routes are admin-only and live under `/admin/drivers`, distinct from `/profile/me` (which is a driver managing their own account). Create Driver is the entry point — it makes the account active immediately (no OTP), since an admin is vouching for the driver directly rather than the driver self-registering. Block/Unblock only flip the `Auth.isBlocked` flag (the same flag Auth's login check reads — a blocked driver's `/auth/login` will start failing immediately). Delete is blocked with a 400 if the driver still has a vehicle assigned (`User.assignedVehicle` set) — you must reassign or free the vehicle first via Vehicle Management.

| Driver Management Endpoint | Needs from a prior step | New data you provide |
|---|---|---|
| Create Driver (admin) | admin token | name, email, password, optional phoneNumber |
| List All Drivers (admin) | — | optional search/page/limit query params |
| Get Driver By Id (admin) | a created driver | — |
| Update Driver (admin) | a created driver | any Create field, all optional |
| Block Driver (admin) | a created driver | — |
| Unblock Driver (admin) | a blocked driver | — |
| Remove Driver (admin) | driver has no `assignedVehicle` | — |

**Vehicle Management dependency graph:** all routes are admin-only and live under `/vehicles` — there's no driver-facing vehicle screen in the Figma design reviewed so far. Create Vehicle is the entry point. Assign Driver is the interesting one: it keeps a two-way reference in sync in a single call — the vehicle's `assignedDriver` and the driver's `assignedVehicle` are updated together, and if either side already had a prior assignment, that prior link is cleared automatically (so reassigning Vehicle A from Driver A to Driver B frees Driver A with no separate "unassign" call needed). Delete is blocked with a 400 if the vehicle currently has an `assignedDriver` — reassign it away first, same pattern as Driver deletion.

| Vehicle Endpoint | Needs from a prior step | New data you provide |
|---|---|---|
| Create Vehicle (admin) | admin token | make, vehicleModelName, plateNumber, optional year/vehicleType |
| List All Vehicles (admin) | — | optional status/page/limit query params |
| Get Vehicle By Id (admin) | a created vehicle | — |
| Update Vehicle (admin) | a created vehicle | any Create field or status, all optional |
| Assign Vehicle to Driver (admin) | created vehicle + created driver | driverId |
| Remove Vehicle (admin) | vehicle has no `assignedDriver` | — |

**Why no explicit "unassign" endpoint:** `AssignVehicleDto.driverId` is required, so freeing a vehicle currently means either reassigning it to a different driver or deleting/recreating it. If the admin dashboard needs a true "unassign, leave empty" action on the Vehicles table, that's a one-line addition (`driverId?` optional, `null` clears it) — flag it if the Figma "Add/Edit Vehicle" form shows an explicit "Unassign" button and I'll add it.

**Customer dependency graph:** there's no separate, login-capable Customer entity in this app — the Figma design has no customer-facing mobile screens, only the driver app and the admin dashboard. The admin "Customers" screen is read-only, derived by grouping `Delivery.customerName`/`Delivery.customerPhone` by phone number (the natural unique key). Both routes need at least one Delivery to already exist.

| Customer Endpoint | Needs from a prior step | New data you provide |
|---|---|---|
| List All Customers (admin) | admin token + ≥1 delivery exists | optional search/page/limit query params |
| Get Customer By Phone (admin) | a delivery with that `customerPhone` | — |

**Analytics dependency graph:** both routes are read-only aggregations over the Delivery/User/Vehicle collections — no new data is written. `deliveriesByStatus` and `completionRate` come from a single Delivery aggregation; `totalDrivers`/`totalVehicles` are plain counts (every document in the User collection is a Driver profile — Admins live in their own collection). There's no Payment/pricing model in this app, so the chart endpoint proxies the Figma "revenue chart" with delivery-volume-over-time instead of actual revenue — worth confirming against Figma whether real payment figures are needed, since that would mean adding a Payment/Invoice model first.

| Analytics Endpoint | Needs from a prior step | New data you provide |
|---|---|---|
| Get Overview (admin) | admin token | — |
| Get Chart (admin) | admin token | optional `days` query param (1-90, default 7) |

**CMS dependency graph:** five independent singleton documents (Terms & Conditions, Privacy Policy, About Us, FAQ, Contact Us), each following the same upsert pattern as the Express reference template's `manage` module — the first write creates the one-and-only document for that collection, every write after that updates it in place (never creates a second one). GETs are public (`@Public()`, no JWT needed) so the app's Settings/About/FAQ screens can read them without login; PATCHes are admin-only. Terms & Conditions and Privacy Policy are confirmed against the Figma admin dashboard; About Us/FAQ/Contact Us are carried over from the reference template as likely matches for the driver app's 9-variant Settings screen but aren't individually confirmed — flag if any turn out unused so they can be dropped.

| CMS Endpoint | Needs from a prior step | New data you provide |
|---|---|---|
| Get [Terms/Privacy/About/FAQ/Contact] (public) | — | — |
| Admin - Upsert [Terms/Privacy/About/FAQ/Contact] | admin token | description |

## 4. Dev-mode OTP convenience — read this before testing

In non-production environments (`NODE_ENV !== 'production'`), Register/Resend/Forgot Password return the OTP code directly in the response body (`devActivationCode` / `devVerificationCode`), instead of only emailing it. This is what makes the whole flow testable in Postman without a real inbox — the Tests script on each request automatically captures these into collection variables for the next request to use.

**This must never reach production.** It's gated behind an environment check in `AuthService`, but flag it in code review anyway — an accidentally-`NODE_ENV=development` production deploy would leak OTP codes in API responses. If you want real email delivery to actually verify (not just simulate), fill in the `SMTP_*` vars in `.env` — `MailService` will send real emails once those are set, alongside the dev-mode codes still appearing (both happen simultaneously in dev, so you can verify email delivery AND keep the Postman flow working at the same time).

## 5. What's been tested and verified so far

**Unit tests (run right now, no database needed):** `npm test` runs 71 tests across 9 suites, all passing. `src/auth/auth.service.spec.ts` (17 tests) covers password mismatch rejection, duplicate-email handling (both active and inactive), role routing (Driver → User collection, Admin → Admin collection), wrong/expired activation codes, inactive/blocked account login rejection, wrong password rejection, OTP verification gating on password reset, and old-password verification on change-password. `src/delivery/delivery.service.spec.ts` (16 tests) covers every status-transition guard (accept/pickup/transit/proof-of-delivery each rejecting from the wrong prior state), ownership enforcement (a driver can't touch another driver's delivery; an admin bypasses that check entirely), reject clearing the driver assignment, cancel refusing to touch a DELIVERED order, driver-stats aggregation, and pagination math. `src/profile/profile.service.spec.ts` (5 tests) covers role-based routing to the correct collection and confirms partial updates only touch fields actually sent. `src/vehicle/vehicle.service.spec.ts` (9 tests) covers create, not-found handling, delete-while-assigned rejection, and both branches of the two-way assign sync (fresh assignment, and reassignment that frees the previous driver + previous vehicle). `src/driver-management/driver-management.service.spec.ts` (11 tests) covers duplicate-email rejection, active-on-create behavior, block/unblock, delete-while-assigned-a-vehicle rejection, and the Auth-field merge on get-by-id. `src/customer/customer.service.spec.ts` (4 tests) covers the grouped/paginated aggregation shape, search-filter injection into the `$match` stage, and the 404/summary branches of the by-phone lookup. `src/analytics/analytics.service.spec.ts` (4 tests) covers completion-rate math (including the zero-deliveries edge case) and that the chart fills every day in range, including zero-order days. `src/cms/cms.service.spec.ts` (5 tests) covers the create-vs-update upsert branch and confirms the five content collections stay fully independent of each other.

**Structural/compile verification:** `npm run build` compiles clean across both modules. The full dependency-injection graph (Config → Mongoose → Auth/User/Admin/Delivery models → JWT → Guards → Controllers) was confirmed to wire up correctly by booting the app against both a reachable and deliberately-unreachable MongoDB URL.

**Not yet verified — needs your real `MONGO_URL`:** actual database reads/writes (does `Auth.create()` really persist correctly, do unique-email constraints actually fire, does the Mongoose `pre('save')` password-hashing hook run against a real connection), real email delivery if you configure SMTP, and the full Postman collection run end-to-end against a live server. This is the next step once you share a database connection string — see the note in chat about using a disposable/dev cluster rather than a production one.

## 6. Real-time / Socket.IO testing — template for later

There's no Socket.IO/chat module built yet (the reference template's `chat` module and `socket.ts` haven't been ported to NestJS). This section is a placeholder documenting *how* to test it in Postman once it exists, so nothing needs to be re-explained later.

Postman has a native Socket.IO request type (distinct from a regular HTTP request — look for "New → Socket.IO Request" in Postman, not the WebSocket request type, since the reference template uses the `socket.io` library specifically, not raw WebSockets). The general procedure will be:

1. Create a Socket.IO request pointed at the server's base URL (same host/port as the REST API — Socket.IO shares the HTTP server by default).
2. Under "Auth" or the connection config, pass the JWT the same way the client app would (commonly as an `auth` payload or a query param — depends on how the NestJS Gateway is configured to authenticate socket connections, which isn't built yet).
3. Connect, then use the "Events" panel to both emit events (matching the reference template's `EnumSocketEvent` values — `start_chat`, `send_message`, `update_location`, `online_status`) and listen for the server's responses/broadcasts.
4. Because Socket.IO is stateful (a live connection, not a request/response pair), the "flow" here is less about ordering requests and more about ordering *emitted events within one open connection* — e.g., you'd emit `start_chat` before `send_message` makes sense, and you'd want a second Socket.IO connection open (a different Postman tab, simulating the other chat participant) to actually see a message arrive in real time.

This section will get filled in with concrete request configs, exact event payloads, and a two-connection test flow once the Chat/real-time module is actually built.
