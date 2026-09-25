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

## Preise & Punkte
- **Preise sind global**, je Sportart und Dauer, in `court_prices` (eine Zeile je `sport` + `duration_minutes`). In Courts & Standorte lassen sich **keine** Preise mehr setzen.
- **Ausnahmen je Standort** stehen in `location_price_exceptions` (eine Zeile je Standort + Sportart). Leeres Feld = globaler Wert. Zeile löschen = wieder Standard.
- **Zeitfenster** (`court_pricing_bands`) hängen am Standort (`location_id`), nicht mehr am Court. `location_id IS NULL` = gilt überall.
- Auflösung in `resolve_booking_rate()`: Standort-Band → Standort-Ausnahme → globales Band → globaler Standardpreis. Darüber liegt unverändert die Vereinskondition (`resolve_member_pricing`).
- **Punkte**: feste Zahl je 60 Minuten (`site_settings.payback_points_60min`, je Standort überschreibbar), 90 Min = ×1,5, 120 Min = ×2,0, Tennis = 0. Einzige Quelle ist `resolve_booking_points()` — sie speist sowohl die Checkout-Vorschau (`rewards-estimate`) als auch die Gutschrift (`stripe-webhook`).
- Punkte gibt es **nur für tatsächlich gezahltes Geld**: der Webhook prüft `session.amount_total > 0`, der 0-Euro-Weg vergibt nichts.
- **Punkte einlösen** (Marketplace): der maximale Rabatt je Produkt wird **nicht** gepflegt, sondern gerechnet — `site_settings.credits_payment_max_percent` (Anteil am Warenwert) und `credits_per_euro` (Kurs). 170 € bei 50 % und 100 Punkten/€ = 8.500 Punkte. Einzige Quelle im Frontend: `productPointsCap()` in `src/lib/marketplace.ts`, serverseitig gespiegelt in `marketplace-checkout`. Der Schalter dafür ist `feature_credits_payment_enabled`; steht er auf aus, verschwindet die gesamte Punkte-Oberfläche im Shop.
- **Expert Levels sind entfernt.** Kein Level-Multiplikator, keine Stufen im Frontend, kein `expert-levels`-Endpunkt.
- Admin: alles unter `/admin/pricing` („Preise & Punkte") in den Reitern Preise / Punkte / Wallets / Übersicht. `/admin/p2g-points` leitet dorthin um.

## Stornoregel (Buchungen)
- **Kostenlos bis 24 Stunden vor Spielbeginn, danach keine Stornierung durch den Kunden.** Die Zahl steht dreimal und muss dreimal gleich sein: `cancel_confirmed_booking()` (DB, letzte Instanz), `supabase/functions/_shared/bookingPolicy.ts` (Edge), `src/lib/bookingPolicy.ts` (Frontend).
- Frontend zeigt vor dem Klick, ob die Frist noch läuft (`canCancelFree`), und öffnet innerhalb der 24 h ein „Zu spät"-Fenster statt des Storno-Dialogs. Der Server lehnt mit `code: "too_late"` trotzdem ab.
- Die konkrete Frist steht im Checkout, unter „Meine Buchungen" und in der Bestätigungsmail („Kostenlos stornierbar bis …").
- Die Verwaltung (`cancel_booking_admin`, Admin → Buchungen) ist von der Frist ausgenommen — Kulanz.

## Ergebnisrechnung (PnL)
- **Quelle sind die Belege** (`receipts`), nicht Buchungen oder Bestellungen: Umsatz ist, was gezahlt wurde (Punkte und Gutscheine sind Entgeltminderung). `get_pnl(von, bis, basis, gliederung)` rechnet serverseitig; `basis` = `cash` (Belegdatum) oder `service` (Leistungsdatum), filtert auf die aktuelle Betriebsart.
- **Einkaufspreis** `marketplace_items.cost_cents` (netto) wird beim Verkauf in `marketplace_redemptions.unit_cost_cents` eingefroren → Wareneinsatz. Rechenhelfer in `src/lib/productPricing.ts` (`pricing.ts` gehört der Buchung); gespeichert wird immer brutto.
- **Stripe-Gebühr** `receipts.stripe_fee_cents`: der Webhook holt sie an der Balance-Transaktion (`stripeFeeCents()` in `_shared/stripe.ts`), `reconcile-payments` trägt fehlende nach (40 je Lauf).
- **Lobby-Anteile** bekommen Belege (`lobby_share`); Event-Tickets (`event_ticket`) sind als Belegart vorbereitet, ein Bezahlweg existiert noch nicht.
- **Manuelle Posten & Fixkosten** in `pnl_entries` (einmalig oder monatlich/quartalsweise/jährlich), aufgelöst durch `pnl_entry_occurrences()`. Nur Admins.
- `lobby-api` lehnt Geldaktionen ab, solange `feature_lobbies_state = hidden`.
- **Belege-Tab** `/admin/belege` liest die View `admin_receipts` (Beleg + Kategorie + Sport + Referenz). CSV der Auswahl entsteht im Browser; **ZIP** (ein PDF je Beleg + `belege.csv`) baut die Edge Function `receipts-export` — Renderer in `_shared/receiptPdf.ts`, geteilt mit `receipt-pdf`. Höchstens 500 Belege je Export, nie Testbelege.
- **Übersicht** hat den Umschalter *Gebucht/Realisiert* (`basis`): Kacheln nach `created_at` bzw. `start_time`, PnL nach Beleg- bzw. Leistungsdatum. PnL-Modell in `src/lib/pnl.ts`, Sektion `components/admin/overview/PnlSection.tsx`.
- Admin → Buchungen hält einen Realtime-Kanal auf `bookings` und lädt bei jeder Änderung nach.

## Rechnungen
- Belege liegen in `receipts` (lückenlose Nummer `P2G-<Jahr>-<nnnnnn>`, Netto/Steuer getrennt). `create_receipt()` löst Empfängername, E-Mail und Anschrift **selbst** aus Bestellung, Buchung und Profil auf — Aufrufer müssen nichts mitgeben.
- Absenderangaben (Firma, USt-IdNr., Registergericht, Bank) stehen in `billing_profile` (eine Zeile, `id = 'global'`), gepflegt unter Admin → Einstellungen → Rechnungsangaben. **Nicht** im Impressum-Text nachpflegen.
- Das PDF erzeugt die Edge Function `receipt-pdf` bei jedem Abruf neu (`verify_jwt = false`, prüft selbst: eigenes JWT oder `receipts.access_token` aus dem Mail-Link). Nichts wird abgelegt.
- Bis 250 € ohne Empfängeranschrift läuft das Dokument als Kleinbetragsrechnung nach § 33 UStDV — das deckt praktisch jede Platzbuchung ab.
- Kunden laden sie unter Konto → Bestellungen und bei den Buchungen; der Link steht zusätzlich in beiden Bestätigungsmails.
- **Testbetrieb (Stripe auf Test):** Vorgänge werden beim Anlegen als `is_test` gestempelt und bekommen Belege aus einem **eigenen Nummernkreis** `TEST-<Jahr>-<nnnnnn>` (eigener Zähler in `receipt_counters`, Schlüssel `(year, is_test)`). Der echte Kreis `P2G-…` bleibt davon unberührt. Beim Wechsel der Betriebsart löscht ein Trigger auf `site_integration_configs` alle Testbelege und nullt den Testzähler. Das PDF trägt bei Testbelegen einen roten Hinweis; der Belegexport (CSV) enthält nur echte Belege.
- **Auswertungen zeigen den Betrieb, in dem man sich befindet:** Übersicht, Analytics, Standort-Auswertung (`useStripeIsTest()` → `.eq("is_test", isTest)`) und die drei Auslastungs-RPCs (`b.is_test = public.stripe_is_test()`) filtern auf die aktuelle Betriebsart. Im Testbetrieb sieht man Testbuchungen, im Echtbetrieb echte — nie gemischt.

## Gutscheine
- `voucher_codes.scope` ∈ `booking` | `marketplace` | `both` — wird beim Anlegen gesetzt (Admin → Gutscheine, Feld „Gilt für").
- `voucher-validate` ist **offen** (kein Login nötig, Gäste inklusive) und prüft den Geltungsbereich gegen `context` (`booking`/`marketplace`). Bremse: 15 **Fehlversuche** je Stunde und IP über `rate_limit_log`, Treffer kosten nichts.
- Marketplace: Rabatt **vor** den Punkten. Der 50-%-Punktedeckel greift auf den bereits rabattierten Betrag — andersherum ließe er sich aushebeln.
- `marketplace_redemptions.discount_cents` ist der **gesamte** gewährte Rabatt (Punkte + Gutschein), `voucher_discount_cents` der darin enthaltene Gutscheinanteil. **Nicht addieren.**
- Ein Abbruch gibt die Nutzung zurück: `release_order_voucher()` hängt in `release_marketplace_order` und `expire_marketplace_hold`. Die Nutzung wird beim Anlegen der Bestellung reserviert, nicht bei der Zahlung.
- `voucher_redemptions` hält entweder `booking_id` oder `redemption_id` (Prüfregel), `user_id` darf für Gäste NULL sein.

## Performance & Skalierung
- **Bilder nie roh ausliefern.** Storage-Bilder laufen über `StorageImage`/`storageImage()` (Transformations-Endpunkt). Ein Original wiegt schnell 1,5 MB, die transformierte Fassung 60 KB.
- **`fallbackSrc` lädt erst, wenn feststeht, dass kein Bild gepflegt ist.** `SiteVisual` und `HeroBackgroundVisual` zeigen während der Abfrage bewusst nichts — vorher luden sie bei jedem Aufruf ein gebündeltes Bild, das Sekundenbruchteile später ersetzt wurde.
- **three.js darf nie statisch importiert werden.** Der Hero-Canvas liegt in `synthetic-hero-canvas.tsx`, der Seiten-Shader wird in `SectionShaderBackdrop` nachgeladen. Beide über `lazy` + `Suspense`.
- **Routen laufen über `lazyWithReload`** (`src/lib/lazyWithReload.ts`), nicht über `lazy` direkt: sonst sieht jeder, der die Seite während eines Deploys offen hat, beim nächsten Routenwechsel einen Fehlerbildschirm.
- **Ein Bild, das sich nicht verkleinern lässt, wird nicht mehr hochgeladen.** `uploadMediaFile` gab bei einem Fehler im Canvas still das Original weiter; der Transformations-Endpunkt lehnt große Quellen mit 400 ab, die Anzeige fällt aufs Original zurück, und jeder Besucher lädt zweistellige Megabyte. Ab 4 MB bricht der Upload jetzt mit einer Meldung ab. Bilder mit Transparenz gehen als WebP statt als PNG raus.
- **Gemessene Werte (20.09.2026, nach der Optimierung):** Startseite 2,1 s / 1,8 MB · Buchen 1,0 s / 120 KB · Marketplace 1,5 s / 415 KB. Vorher Startseite 3,2 s / 4,3 MB.
- **Ein Realtime-Kanal je Browsertab**, nicht je Komponente — siehe `useLobbyRealtime` in `useLobbies.ts`. Hooks, die mehrfach gerendert werden, dürfen keine eigenen Kanäle öffnen.
- **Vercel** ist eine statische Auslieferung ohne Serverless-Funktionen; dort skaliert nur Bandbreite. Der Engpass liegt bei der **Supabase-Compute-Instanz** (Buchungen serialisieren über Advisory Locks). Vor einem Upgrade die CPU-Auslastung unter *Reports → Database* ansehen.

## Pending Migrations (not yet run in production)
- `20260917130100_drop_dead_visibility_columns.sql` — run AFTER the web app with the new visibility system is deployed
- `20260919140000_integration_config_merge.sql` — am 19.09.2026 gelaufen und verifiziert
- `20260920100000_drop_item_credit_cost.sql` — am 20.09.2026 gelaufen
- `20260920160000_voucher_scope_marketplace.sql` — am 20.09.2026 gelaufen und Ende-zu-Ende verifiziert
- `20260921100000_cron_hygiene.sql` — OFFEN: meldet doppelte Cron-Jobs ab und plant die beiden nie eingeplanten Aufräumer (`cleanup_rate_limit_log`, `cleanup_expired_notifications`)
- `20260920140000_invoice_documents.sql` — am 20.09.2026 gelaufen und verifiziert
- `20260925100000_admin_cancel_booking.sql` — OFFEN: cancel_booking_admin() für die Stornierung durch die Verwaltung. Muss laufen, BEVOR die Edge Function cancel-booking neu bereitgestellt wird
- `20260925140000_test_receipts.sql` — OFFEN: Testbelege mit eigenem Nummernkreis, Trigger zum Löschen beim Moduswechsel, Auslastung je Betriebsart. Danach `receipt-pdf` neu bereitstellen
- `20260926120000_admin_receipts_page.sql` — OFFEN: Eintrag 'Belege' in admin_pages (nur für delegierte Rollen nötig, Superadmin sieht die Seite ohnehin)
- `20260926100000_pnl_foundation.sql` — OFFEN: Einkaufspreis, Stripe-Gebühr am Beleg, Belegarten lobby_share/event_ticket, pnl_entries, get_pnl(), View admin_receipts. Danach stripe-webhook, marketplace-checkout, reconcile-payments, lobby-api bereitstellen
- `20260925160000_cancellation_24h.sql` — OFFEN: Stornofrist 24 h in cancel_confirmed_booking()
- `20260925120000_cron_secret_source.sql` — OFFEN: stellt notify_push() und trigger_match_reminders() von current_setting('app.cron_secret') auf private.cron_secrets um (der Parameter lässt sich auf Supabase nicht setzen, beide liefen deshalb ins Leere) und plant den Stripe-Abgleich alle 30 Minuten ein

Die Preis- und Punkte-Migrationen (`20260918120000` bis `20260918120040` sowie
`20260918120200_drop_expert_levels.sql`) sind am 18.09.2026 in Produktion gelaufen
und verifiziert.
