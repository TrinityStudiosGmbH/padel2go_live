# CLAUDE.md — PADEL2GO

## Project
German padel court booking + community platform. Pre-launch phase as of April 2026.
**Owner:** Florian Steinfelder (Managing Partner, non-technical)

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + TypeScript + Vite |
| Routing | React Router DOM v7 |
| UI | Tailwind CSS + shadcn/ui |
| State | TanStack React Query |
| Backend | Supabase (PostgreSQL + Auth + Edge Functions on Deno) |
| Payments | Stripe Checkout + Webhooks |
| Email | Resend |
| Animations | Framer Motion |

---

## Architecture

### Auth & Route Guards
- `RequireAuth` — wraps all routes needing login. Shows spinner while loading, redirects to `/auth?redirect=<path>` if no user.
- `RequireFeature feature="…"` — the ONE guard for function visibility (see below). Hidden → renders the shared "Bald verfügbar" page (never a silent redirect). Admin preview → small blue pill bottom-left.
- `RequireProfileComplete` — inside `RequireAuth`, sends anyone without `profiles.profile_completed_at` to `/willkommen` (one-time profile onboarding: username, display name, age, self-rated skill, matches played, optional avatar), then back to the original target. Finishing calls the `complete-profile` edge function, which sets the timestamp once and fires the `PROFILE_COMPLETED` reward.
- Avatars: `UserAvatar` (`src/components/UserAvatar.tsx`) is the single avatar component — falls back to the person's initials on a stable per-name colour gradient instead of a grey placeholder.
- Sign-in: email/password plus Google and Apple OAuth (`useAuth().signInWithProvider`). Providers must be enabled in the Supabase dashboard; the UI reports "not enabled" cleanly if they are not.
- `AdminLayout` + `useAdminAuth` — every `/admin/*` page gates itself: `user_roles` table, hardcoded superadmin email bypass for `fsteinfelder@padel2go.eu`, plus per-page delegated roles (`my_admin_pages()`). `isSuperAdmin` exists for tools that write real data (camera simulator).

### Sichtbarkeit (feature visibility)
One model for everything. `site_settings` (single row, id = `global`) has one column per function, `feature_<name>_state` ∈ `visible | demo | hidden`:
- `visible` → everyone · `demo` → admins only (with preview pill), everyone else sees "Bald verfügbar" · `hidden` → nobody, admins included
- Functions: `booking`, `marketplace`, `events`, `lobbies`, `league`, `p2g`, `friends` (list in `src/hooks/useFeatureToggles.ts`)
- One state controls nav link (public + dashboard), route (`RequireFeature` in `App.tsx`) and in-page entry points (`canSee()`).
- `feature_courts_public_enabled` is derived from `feature_booking_state` by a DB trigger (kept for the mobile app only — never set it directly).
- Content visibility (`locations.is_online`, `courts.is_active`, `events.is_published`, `articles.is_published`, `marketplace_items.is_active/status`) is separate and lives where the content is edited; Admin → Sichtbarkeit only shows the counts.
- `launch_date` is display-only (homepage countdown, "Events kommen bald" text). There is no master launch switch and no PIN lock anymore.

Admin UI: `/admin/features` ("Sichtbarkeit"). Hook: `useFeatureToggles()` → `canSee`, `stateOf`, `isPreview`.

### Edge Functions
Located in `supabase/functions/`. Pattern: try `Deno.env.get("KEY")` first, then fall back to `site_integration_configs` DB table.
Key functions: `create-checkout-session`, `stripe-webhook`, `send-booking-confirmation`, `send-contact-email`, `admin-credits`, `admin-mail-test`, `booking-ics`. All outgoing mail uses the shell in `_shared/email.ts` (logo header, fonts, footer).

### Admin Panel
25 pages at `/admin/*`, catalogued in `admin_pages` (custom roles). Protected by `AdminLayout` + `useAdminAuth`. Every outgoing mail can be test-sent from Einstellungen → E-Mail-Test.

---

## Development Workflow

### Before starting any task
1. Read the relevant files first — never suggest changes without reading current code
2. For features touching DB schema: check existing migrations before writing new ones
3. For tasks touching auth/routing/visibility: re-read `RequireAuth`, `RequireFeature`, `useFeatureToggles`, `App.tsx`

### Code Rules
- **No speculative code** — only build what was asked, no future-proofing
- **No visual changes** unless explicitly requested
- **No new files** unless absolutely necessary — prefer editing existing ones
- **No error handling** for impossible scenarios — trust framework guarantees
- **No comments** unless logic is non-obvious
- **No backwards-compat shims** — if something is unused, delete it
- Security-first: no SQL injection, XSS, command injection — validate at system boundaries only

### Mobile
All layouts must work on 320px–375px screens. Use `sm:` prefixes for anything that would break at mobile widths (3+ column grids, large fixed sizes, etc.).

### TypeScript
- Prefer strict types; use `as any` only as last resort with a comment
- New DB columns not yet in `types.ts`: cast with `(data as any)?.column` temporarily

### Supabase Migrations
- File naming: `YYYYMMDDHHMMSS_descriptive_name.sql`
- Always use `IF NOT EXISTS` for ADD COLUMN
- After writing migration, remind Florian to run it in Supabase SQL editor

---

## Key Files

```
src/
  App.tsx                          — Route definitions, all guards wired here
  components/
    RequireAuth.tsx                — Login gate
    RequireFeature.tsx             — Visibility gate + shared „Bald verfügbar" page
    RequireProfileComplete.tsx     — One-time profile onboarding gate (→ /willkommen)
    UserAvatar.tsx                 — Avatar with initials fallback (used everywhere)
    Navigation.tsx                 — Public nav (switches to DashboardNavigation when logged in)
    DashboardNavigation.tsx        — Logged-in nav, respects feature flags
    Footer.tsx                     — 4-column footer: Brand | Plattform | Unternehmen | Rechtliches
    admin/AdminSidebar.tsx         — Admin nav links
  hooks/
    useAuth.ts                     — Supabase auth session
    useAdminAuth.ts                — Admin role check
    useFeatureToggles.ts           — Visibility states (visible/demo/hidden) from site_settings
    useClubAuth.ts                 — Club owner role check
  pages/admin/
    AdminFeatures.tsx              — „Sichtbarkeit": function states, content status, launch date
    AdminIntegrations.tsx          — Configure Stripe / Resend / DeepL / App URL
  integrations/supabase/
    client.ts                      — Supabase JS client
    types.ts                       — Auto-generated DB types (update after migrations)
supabase/
  functions/                       — Deno edge functions
  migrations/                      — SQL migration files
```

---

## Git
- Remote `origin` → https://github.com/TrinityStudiosGmbH/padel2go_live.git
- Remote `padel2go` → https://github.com/TrinityStudiosGmbH/padel2go-edit-8beb07f0.git
- Beide Repos sind aus der Org `PADEL2GO` nach `TrinityStudiosGmbH` umgezogen (URLs am 2026-08-14 nachgezogen)
- Push to both after significant changes
- Use `/commit` for structured commit messages

---

## Pending Migrations (not yet run in production)
- `20260917130000_visibility_and_roles.sql` — feature_booking_state, storage policy for delegated roles, page-table mapping
- `20260917130100_drop_dead_visibility_columns.sql` — run AFTER the web app with the new visibility system is deployed
