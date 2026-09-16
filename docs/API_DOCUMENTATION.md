# PADEL2GO - Technical API Documentation

**Version:** 1.0  
**Last Updated:** 2025-01-23  
**For:** External Development Team (Android/iOS App)

---

## Table of Contents

1. [Connection Details](#1-connection-details)
2. [Authentication](#2-authentication)
3. [Database Tables](#3-database-tables)
4. [Edge Functions (API Endpoints)](#4-edge-functions-api-endpoints)
5. [Storage Buckets](#5-storage-buckets)
6. [Security Notes](#6-security-notes)
7. [SDK Links](#7-sdk-links)
8. [Code Examples](#8-code-examples)

---

## 1. Connection Details

### Supabase Project

| Property | Value |
|----------|-------|
| **Project URL** | `https://kfjfxfeidgjksxsubtjw.supabase.co` |
| **Anon Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmamZ4ZmVpZGdqa3N4c3VidGp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMzA0OTksImV4cCI6MjA4MTYwNjQ5OX0.thFeuCi_xNYjJBhOul24wgzWW4FxUV69_VZfoFt7MSY` |

> ⚠️ **Note:** The Anon Key is public and safe to use in mobile apps. Security is enforced through Row Level Security (RLS) policies on all tables.

---

## 2. Authentication

### Method: Supabase Auth (Email/Password)

The platform uses **email/password authentication**. Upon successful registration, the following records are automatically created for each user:

- `profiles` - User profile data
- `wallets` - Credit balance (play_credits, reward_credits)
- `skill_stats` - Skill level and AI ranking
- `ai_player_analytics` - AI analysis data

### Auth Endpoints

All auth is handled through the Supabase SDK:

```kotlin
// Android (Kotlin) - Sign Up
supabase.auth.signUpWith(Email) {
    email = "user@example.com"
    password = "securePassword123"
}

// Android (Kotlin) - Sign In
supabase.auth.signInWith(Email) {
    email = "user@example.com"
    password = "securePassword123"
}
```

```swift
// iOS (Swift) - Sign Up
try await supabase.auth.signUp(
    email: "user@example.com",
    password: "securePassword123"
)

// iOS (Swift) - Sign In
try await supabase.auth.signIn(
    email: "user@example.com",
    password: "securePassword123"
)
```

### Session Management

- Access tokens expire after 1 hour
- Refresh tokens are valid for 7 days
- The SDK handles token refresh automatically
- Store session securely (Keychain on iOS, EncryptedSharedPreferences on Android)

---

## 3. Database Tables

### 3.1 User-Related Tables

#### `profiles`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `user_id` | uuid | No | Primary key, references auth.users |
| `username` | text | Yes | Unique username (3-30 chars, lowercase) |
| `display_name` | text | Yes | Display name |
| `age` | integer | Yes | User age |
| `avatar_url` | text | Yes | Avatar image URL |
| `skill_self_rating` | integer | Yes | Self-rated skill (1-10), default: 5 |
| `games_played_self` | integer | Yes | Self-reported games played |
| `referral_code` | text | Yes | Unique referral code (auto-generated) |
| `shipping_address_line1` | text | Yes | Shipping address |
| `shipping_city` | text | Yes | City |
| `shipping_postal_code` | text | Yes | Postal code |
| `shipping_country` | text | Yes | Country (default: 'DE') |
| `email_verified_at` | timestamptz | Yes | Email verification timestamp |
| `phone_verified_at` | timestamptz | Yes | Phone verification timestamp |
| `profile_completed_at` | timestamptz | Yes | Profile completion timestamp |
| `created_at` | timestamptz | No | Record creation time |
| `updated_at` | timestamptz | No | Last update time |

**RLS Policies:**
- Users can view/update their own profile
- Admins can view all profiles

---

#### `wallets`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `user_id` | uuid | No | Primary key |
| `play_credits` | integer | No | Play credits balance (default: 0) |
| `reward_credits` | integer | No | Reward credits balance (default: 0) |
| `lifetime_credits` | integer | No | Total credits earned (default: 0) |
| `last_game_credits` | integer | Yes | Credits from last game |
| `last_game_date` | timestamptz | Yes | Date of last game |
| `updated_at` | timestamptz | No | Last update time |

**RLS Policies:**
- Users can view their own wallet (read-only)
- Wallet updates happen through Edge Functions only

---

#### `skill_stats`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `user_id` | uuid | No | Primary key |
| `skill_level` | integer | Yes | Calculated skill level (default: 0) |
| `ai_rank` | integer | Yes | AI-calculated ranking |
| `last_ai_update` | timestamptz | Yes | Last AI analysis timestamp |

---

### 3.2 Booking Tables

#### `locations`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `name` | text | No | Location name |
| `slug` | text | No | URL-friendly identifier |
| `address` | text | Yes | Street address |
| `city` | text | Yes | City |
| `postal_code` | text | Yes | Postal code |
| `country` | text | Yes | Country code (default: 'DE') |
| `lat` | numeric | Yes | Latitude |
| `lng` | numeric | Yes | Longitude |
| `timezone` | text | No | Timezone (default: 'Europe/Berlin') |
| `description` | text | Yes | Description |
| `amenities` | text[] | Yes | Array of amenities |
| `main_image_url` | text | Yes | Main image URL |
| `gallery_image_urls` | text[] | Yes | Gallery image URLs |
| `opening_hours_json` | jsonb | No | Opening hours per day |
| `is_online` | boolean | No | Is location active (default: false) |
| `is_24_7` | boolean | No | 24/7 open (default: false) |
| `vending_enabled` | boolean | No | Has vending machines |
| `ai_analysis_enabled` | boolean | No | AI analysis available |
| `rewards_enabled` | boolean | No | Rewards system active |

**Opening Hours JSON Structure:**
```json
{
  "monday": {"open": "06:00", "close": "23:00"},
  "tuesday": {"open": "06:00", "close": "23:00"},
  "wednesday": {"open": "06:00", "close": "23:00"},
  "thursday": {"open": "06:00", "close": "23:00"},
  "friday": {"open": "06:00", "close": "23:00"},
  "saturday": {"open": "06:00", "close": "23:00"},
  "sunday": {"open": "06:00", "close": "23:00"}
}
```

---

#### `courts`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `location_id` | uuid | No | Foreign key to locations |
| `name` | text | No | Court name (e.g., "Court 1") |
| `is_active` | boolean | No | Is court available (default: true) |
| `created_at` | timestamptz | No | Creation timestamp |

---

#### `court_prices`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `court_id` | uuid | Yes | Foreign key to courts |
| `duration_minutes` | integer | No | Duration in minutes (60, 90, 120) |
| `price_cents` | integer | No | Price in cents |

---

#### `bookings`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `user_id` | uuid | No | Booking owner |
| `location_id` | uuid | No | Location reference |
| `court_id` | uuid | No | Court reference |
| `start_time` | timestamptz | No | Booking start |
| `end_time` | timestamptz | No | Booking end |
| `status` | enum | No | Status (see below) |
| `price_cents` | integer | Yes | Total price in cents |
| `currency` | text | Yes | Currency (default: 'EUR') |
| `payment_mode` | text | Yes | 'full' or 'split' |
| `hold_expires_at` | timestamptz | Yes | Payment deadline |
| `cancelled_at` | timestamptz | Yes | Cancellation timestamp |
| `created_at` | timestamptz | No | Creation timestamp |

**Booking Status Enum:**
- `pending` - Initial state
- `pending_payment` - Awaiting payment
- `confirmed` - Payment complete
- `cancelled` - Booking cancelled
- `expired` - Payment timeout

---

#### `booking_participants`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `booking_id` | uuid | No | Booking reference |
| `inviter_user_id` | uuid | No | Who sent the invite |
| `invited_user_id` | uuid | No | Who was invited |
| `invited_username` | text | No | Username of invitee |
| `status` | enum | No | Participant status |
| `share_fraction` | numeric | Yes | Cost share (default: 0.25) |
| `share_price_cents` | integer | Yes | Amount to pay |
| `paid_at` | timestamptz | Yes | Payment timestamp |

**Participant Status Enum:**
- `pending_invite` - Invite sent
- `accepted` - Invite accepted
- `declined` - Invite declined
- `paid` - Payment complete

---

### 3.3 Rewards System

#### `reward_definitions`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `key` | text | No | Primary key (e.g., 'booking_paid') |
| `title` | text | No | Display title |
| `description` | text | Yes | Description |
| `category` | text | No | Category (booking, social, etc.) |
| `points_rule` | jsonb | No | Points calculation rule |
| `is_active` | boolean | Yes | Is reward active |
| `expiry_days` | integer | Yes | Days until expiry |
| `caps` | jsonb | Yes | Rate limiting caps |
| `lock_policy` | jsonb | Yes | When reward becomes available |

**Points Rule Examples:**
```json
// Fixed points
{"type": "fixed", "value": 50}

// Percentage of amount
{"type": "percentage", "value": 5, "min": 10, "max": 100}
```

---

#### `reward_instances`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `user_id` | uuid | No | User who earned reward |
| `definition_key` | text | No | Reference to reward_definitions |
| `status` | text | No | Status (PENDING, AVAILABLE, CLAIMED, REVERSED, EXPIRED) |
| `points` | integer | No | Points value |
| `source_type` | text | No | What triggered it (booking, referral, etc.) |
| `source_id` | text | No | Reference ID |
| `available_at` | timestamptz | Yes | When reward becomes claimable |
| `claimed_at` | timestamptz | Yes | When claimed |
| `expires_at` | timestamptz | Yes | Expiration date |
| `metadata` | jsonb | Yes | Additional data |

---

#### `points_ledger`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `user_id` | uuid | No | User reference |
| `entry_type` | text | No | Type (claim, spend, admin_adjust) |
| `delta_points` | integer | No | Points change (+/-) |
| `balance_after` | integer | No | Balance after transaction |
| `description` | text | Yes | Description |
| `reward_instance_id` | uuid | Yes | Related reward instance |
| `created_at` | timestamptz | Yes | Transaction time |

---

### 3.4 Events & Marketplace

#### `events`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `title` | text | No | Event title |
| `slug` | text | Yes | URL-friendly identifier |
| `description` | text | Yes | Event description |
| `location_id` | uuid | No | Location reference |
| `venue_name` | text | Yes | Venue name |
| `address_line1` | text | Yes | Address |
| `city` | text | Yes | City |
| `postal_code` | text | Yes | Postal code |
| `start_at` | timestamptz | Yes | Event start |
| `end_at` | timestamptz | Yes | Event end |
| `image_url` | text | Yes | Event image |
| `ticket_url` | text | No | Ticket purchase URL |
| `price_cents` | integer | Yes | Ticket price |
| `price_label` | text | Yes | Price display text |
| `capacity` | integer | Yes | Max attendees |
| `event_type` | text | Yes | Type (party, tournament, etc.) |
| `highlights` | text[] | Yes | Event highlights |
| `featured` | boolean | No | Featured event |
| `is_published` | boolean | No | Published status |

---

#### `marketplace_items`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `name` | text | No | Item name |
| `description` | text | Yes | Description |
| `category` | text | No | Category |
| `credit_cost` | integer | No | Cost in reward credits |
| `image_url` | text | Yes | Item image |
| `partner_name` | text | Yes | Partner/brand name |
| `product_type` | text | No | Type (rental, voucher, product) |
| `stock_quantity` | integer | Yes | Available stock |
| `is_active` | boolean | Yes | Is available |
| `sort_order` | integer | Yes | Display order |

**Categories:**
- `Courtbooking` - Court time rewards
- `Equipment` - Padel equipment
- `Events` - Event tickets
- `Other` - Other rewards

---

#### `marketplace_redemptions`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `user_id` | uuid | No | User who redeemed |
| `item_id` | uuid | No | Item redeemed |
| `credit_cost` | integer | No | Credits spent |
| `status` | text | No | Status (success, failed, pending) |
| `fulfillment_status` | text | No | Fulfillment (pending, shipped, delivered) |
| `reference_code` | text | Yes | Redemption code |
| `shipping_address_line1` | text | Yes | Shipping address |
| `shipping_city` | text | Yes | City |
| `shipping_postal_code` | text | Yes | Postal code |
| `shipping_country` | text | Yes | Country |
| `created_at` | timestamptz | Yes | Redemption time |

---

### 3.5 Notifications

#### `notifications`

| Column | Type | Nullable | Description |
|--------|------|----------|-------------|
| `id` | uuid | No | Primary key |
| `user_id` | uuid | No | Recipient |
| `type` | text | No | Notification type |
| `title` | text | No | Title |
| `message` | text | No | Message body |
| `cta_url` | text | Yes | Call-to-action URL |
| `metadata` | jsonb | Yes | Additional data |
| `read_at` | timestamptz | Yes | When read |
| `created_at` | timestamptz | Yes | Creation time |

**Notification Types:**
- `BOOKING_CONFIRMED` - Booking confirmation
- `BOOKING_CANCELLED` - Booking cancellation
- `INVITE_RECEIVED` - Player invite
- `INVITE_ACCEPTED` - Invite acceptance
- `INVITE_DECLINED` - Invite decline
- `REWARD_AVAILABLE` - Reward ready to claim
- `REWARD_CLAIMED` - Reward claimed
- `MARKETPLACE_REDEEMED` - Item redeemed

---

## 4. Edge Functions (API Endpoints)

### Base URL
```
https://kfjfxfeidgjksxsubtjw.supabase.co/functions/v1/
```

### Authentication Header
```
Authorization: Bearer <access_token>
```

> Get the access token from `supabase.auth.session?.accessToken`

---

### 4.1 Booking & Payment

#### `create-checkout-session` 🔒

Creates a Stripe Checkout session for booking payment.

**Method:** POST  
**Auth:** Required

**Request Body:**
```json
{
  "bookingId": "uuid",
  "successUrl": "https://app.padel2go.eu/booking/success?session_id={CHECKOUT_SESSION_ID}",
  "cancelUrl": "https://app.padel2go.eu/booking/cancel"
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

---

#### `create-participant-checkout` 🔒

Creates Stripe Checkout for a participant paying their share.

**Method:** POST  
**Auth:** Required

**Request Body:**
```json
{
  "participant_id": "uuid"
}
```

**Response:**
```json
{
  "url": "https://checkout.stripe.com/..."
}
```

---

#### `stripe-webhook` 🌐

Handles Stripe webhook events. **Do not call directly.**

**Events Handled:**
- `checkout.session.completed` - Updates booking/participant status
- `checkout.session.expired` - Marks booking as expired

---

### 4.2 Rewards System

#### `rewards-api` 🔒

Fetches reward data for the authenticated user.

**Method:** POST  
**Auth:** Required

**Actions:**

**Get Summary:**
```json
{
  "action": "summary"
}
```
Response:
```json
{
  "balance": 150,
  "claimableCount": 3,
  "pendingCount": 1
}
```

**Get List:**
```json
{
  "action": "list"
}
```
Response:
```json
{
  "claimable": [...],
  "pending": [...],
  "history": [...]
}
```

**Get Definitions:**
```json
{
  "action": "definitions"
}
```

**Get Ledger:**
```json
{
  "action": "ledger",
  "limit": 50,
  "offset": 0
}
```

---

#### `rewards-claim` 🔒

Claims an available reward and credits points to wallet.

**Method:** POST  
**Auth:** Required

**Request Body:**
```json
{
  "rewardInstanceId": "uuid"
}
```

**Response:**
```json
{
  "success": true,
  "points": 50,
  "newBalance": 200
}
```

---

#### `rewards-trigger` 🌐

Internal function to trigger reward creation. Called by webhooks.

**Request Body:**
```json
{
  "eventType": "bookingPaid",
  "userId": "uuid",
  "data": {
    "bookingId": "uuid",
    "amountCents": 3500
  }
}
```

---

### 4.3 Marketplace

#### `marketplace-redeem` 🔒

Redeems a marketplace item using reward credits.

**Method:** POST  
**Auth:** Required

**Request Body:**
```json
{
  "itemId": "uuid",
  "shippingAddress": {
    "addressLine1": "Musterstraße 123",
    "city": "Berlin",
    "postalCode": "10115",
    "country": "DE"
  }
}
```

**Response:**
```json
{
  "success": true,
  "redemption": {
    "id": "uuid",
    "referenceCode": "P2G-ABC123",
    "creditCost": 100,
    "newBalance": 100
  }
}
```

**Error Response:**
```json
{
  "error": "Insufficient credits"
}
```

---

### 4.4 User Functions

#### `user-search` 🔒

Searches for users by username.

**Method:** GET  
**Auth:** Required

**Query Parameters:**
- `query` (required): Search string (min 2 chars)
- `limit` (optional): Max results (default: 10)

**Example:**
```
GET /user-search?query=max&limit=5
```

**Response:**
```json
{
  "users": [
    {
      "user_id": "uuid",
      "username": "maxmuster",
      "display_name": "Max Mustermann",
      "avatar_url": "https://..."
    }
  ]
}
```

---

#### `referral-api` 🔒

Handles referral system operations.

**Get Referral Link:**
```
GET /referral-api/link
```
Response:
```json
{
  "code": "ABC12345",
  "link": "https://padel2go.eu/ref/ABC12345",
  "stats": {
    "totalReferrals": 5,
    "completedReferrals": 3
  }
}
```

**Attribute Referral (on signup):**
```
POST /referral-api/attribution
```
```json
{
  "referralCode": "ABC12345"
}
```

---

### 4.5 Notifications

#### `send-contact-email` 🌐

Handles contact form submissions.

**Method:** POST  
**Auth:** Not required

**Request Body:**
```json
{
  "name": "Max Mustermann",
  "email": "max@example.com",
  "reason": "support",
  "message": "Ich habe eine Frage..."
}
```

---

## 5. Storage Buckets

### Available Buckets

| Bucket | Public | Purpose |
|--------|--------|---------|
| `avatars` | Yes | User profile pictures |
| `media` | Yes | General media files |

### Upload Example (Kotlin)

```kotlin
val bucket = supabase.storage.from("avatars")
val path = "${userId}/avatar.jpg"

bucket.upload(path, imageBytes) {
    upsert = true
    contentType = ContentType.Image.JPEG
}

val publicUrl = bucket.publicUrl(path)
```

### Upload Example (Swift)

```swift
let bucket = supabase.storage.from("avatars")
let path = "\(userId)/avatar.jpg"

try await bucket.upload(
    path: path,
    file: imageData,
    options: FileOptions(contentType: "image/jpeg", upsert: true)
)

let publicUrl = try bucket.getPublicURL(path: path)
```

---

## 6. Security Notes

### Row Level Security (RLS)

All tables have RLS enabled. Key policies:

| Table | Read | Write |
|-------|------|-------|
| `profiles` | Own only | Own only |
| `wallets` | Own only | Edge Functions only |
| `bookings` | Own + Admin | Own + Admin |
| `locations` | Public (is_online=true) | Admin only |
| `courts` | Public | Admin only |
| `events` | Public (is_published=true) | Admin only |
| `marketplace_items` | Public (is_active=true) | Admin only |
| `notifications` | Own only | Edge Functions only |

### Important Security Guidelines

1. **Never use Service Role Key in mobile apps** - Only use the Anon Key
2. **All sensitive operations go through Edge Functions** - Wallet updates, reward claims, etc.
3. **Validate all input server-side** - Edge Functions validate before database operations
4. **Token handling** - Store tokens securely, refresh before expiry

### Admin Role Check

```sql
-- Database function to check admin role
has_role(auth.uid(), 'admin'::app_role)
```

---

## 7. SDK Links

### Official Supabase SDKs

| Platform | SDK | Documentation |
|----------|-----|---------------|
| **iOS (Swift)** | [supabase-swift](https://github.com/supabase/supabase-swift) | [Docs](https://supabase.com/docs/reference/swift/introduction) |
| **Android (Kotlin)** | [supabase-kt](https://github.com/supabase-community/supabase-kt) | [Docs](https://supabase.com/docs/reference/kotlin/introduction) |
| **Flutter** | [supabase-flutter](https://github.com/supabase/supabase-flutter) | [Docs](https://supabase.com/docs/reference/dart/introduction) |
| **React Native** | [supabase-js](https://github.com/supabase/supabase-js) | [Docs](https://supabase.com/docs/reference/javascript/introduction) |

---

## 8. Code Examples

### 8.1 Android (Kotlin) - Complete Setup

```kotlin
// build.gradle.kts (app level)
dependencies {
    implementation(platform("io.github.jan-tennert.supabase:bom:2.0.0"))
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:auth-kt")
    implementation("io.github.jan-tennert.supabase:storage-kt")
    implementation("io.ktor:ktor-client-android:2.3.5")
}

// SupabaseClient.kt
object SupabaseClient {
    val client = createSupabaseClient(
        supabaseUrl = "https://kfjfxfeidgjksxsubtjw.supabase.co",
        supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmamZ4ZmVpZGdqa3N4c3VidGp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMzA0OTksImV4cCI6MjA4MTYwNjQ5OX0.thFeuCi_xNYjJBhOul24wgzWW4FxUV69_VZfoFt7MSY"
    ) {
        install(Auth)
        install(Postgrest)
        install(Storage)
    }
}

// Fetch locations
suspend fun getLocations(): List<Location> {
    return SupabaseClient.client.from("locations")
        .select()
        .decodeList<Location>()
}

// Fetch user bookings
suspend fun getUserBookings(): List<Booking> {
    return SupabaseClient.client.from("bookings")
        .select()
        .eq("user_id", SupabaseClient.client.auth.currentUserOrNull()?.id)
        .decodeList<Booking>()
}

// Call Edge Function
suspend fun claimReward(rewardInstanceId: String): ClaimResponse {
    val response = SupabaseClient.client.functions.invoke(
        function = "rewards-claim",
        body = mapOf("rewardInstanceId" to rewardInstanceId)
    )
    return response.body<ClaimResponse>()
}
```

### 8.2 iOS (Swift) - Complete Setup

```swift
// Package.swift
dependencies: [
    .package(url: "https://github.com/supabase/supabase-swift.git", from: "2.0.0")
]

// SupabaseClient.swift
import Supabase

let supabase = SupabaseClient(
    supabaseURL: URL(string: "https://kfjfxfeidgjksxsubtjw.supabase.co")!,
    supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtmamZ4ZmVpZGdqa3N4c3VidGp3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYwMzA0OTksImV4cCI6MjA4MTYwNjQ5OX0.thFeuCi_xNYjJBhOul24wgzWW4FxUV69_VZfoFt7MSY"
)

// Fetch locations
func getLocations() async throws -> [Location] {
    try await supabase.from("locations")
        .select()
        .execute()
        .value
}

// Fetch user bookings
func getUserBookings() async throws -> [Booking] {
    guard let userId = supabase.auth.currentUser?.id else {
        throw AuthError.notAuthenticated
    }
    
    return try await supabase.from("bookings")
        .select()
        .eq("user_id", value: userId)
        .execute()
        .value
}

// Call Edge Function
func claimReward(rewardInstanceId: String) async throws -> ClaimResponse {
    try await supabase.functions.invoke(
        "rewards-claim",
        options: FunctionInvokeOptions(
            body: ["rewardInstanceId": rewardInstanceId]
        )
    )
}
```

### 8.3 Booking Flow Example

```kotlin
// 1. Get available courts for a location
val courts = supabase.from("courts")
    .select()
    .eq("location_id", locationId)
    .eq("is_active", true)
    .decodeList<Court>()

// 2. Check availability (via booking_availability view)
val bookedSlots = supabase.from("booking_availability")
    .select()
    .eq("location_id", locationId)
    .gte("start_time", selectedDate.atStartOfDay())
    .lte("end_time", selectedDate.plusDays(1).atStartOfDay())
    .decodeList<BookingSlot>()

// 3. Create booking
val booking = supabase.from("bookings")
    .insert(mapOf(
        "user_id" to currentUserId,
        "location_id" to locationId,
        "court_id" to courtId,
        "start_time" to startTime.toString(),
        "end_time" to endTime.toString(),
        "status" to "pending_payment",
        "price_cents" to priceCents,
        "payment_mode" to "full"
    ))
    .select()
    .decodeSingle<Booking>()

// 4. Create checkout session
val checkoutResponse = supabase.functions.invoke(
    function = "create-checkout-session",
    body = mapOf(
        "bookingId" to booking.id,
        "successUrl" to "padel2go://booking/success",
        "cancelUrl" to "padel2go://booking/cancel"
    )
)
val checkoutUrl = checkoutResponse.body<CheckoutResponse>().url

// 5. Open Stripe Checkout in browser/webview
openUrl(checkoutUrl)
```

---

## Contact

For technical questions, contact: **contact@padel2go.eu**

---

*Documentation generated for PADEL2GO Mobile App Development*
