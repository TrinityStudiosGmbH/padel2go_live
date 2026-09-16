# Plan: Admin-Aufräumen, Sichtbarkeits-System, Adressänderung

**Datum:** 2026-09-17 · **Status:** Entwurf, wartet auf Freigabe

## Anforderungen

1. **Adresse** überall auf „Am Neudeck 12, 81541 München“ ändern.
2. **Sichtbarkeit/Features** sauber neu aufsetzen: ein Ort, ein Modell, jeder Schalter wirkt tatsächlich.
3. **Admin-Panel** von losen Enden und ungenutzten Feldern befreien, ohne Funktion zu verlieren; echte Bugs beheben.

## Befund (Kurzfassung)

**Sichtbarkeit heute:** vier unabhängige Schichten (Login, Route-Guards, sieben 3-stufige Feature-Flags, Inhalts-Flags wie `is_online`/`is_published`) plus zwei tote Reste (PIN-Sperre, `feature_app_launched`). Von sieben Feature-Schaltern greifen nur drei (Lobbies, League, P2G). Events/Friends/Matching bewirken nichts, Marketplace versteckt nur den Nav-Link, die Route bleibt offen. Courts haben einen eigenen Schalter mit anderer Logik (Admin sieht immer). „Aus“ sieht dreimal anders aus: freundliche „Bald verfügbar“-Seite, stiller Redirect, oder gar nichts.

**Admin-Panel:** Routen, Sidebar und Rollen-Katalog sind konsistent (27 Seiten). Aber: PayPal-Karte ohne Funktion, Touchpoint-Slides ohne Konsument (die Seite `/fuer-partner` existiert nicht mehr), PIN-Sperre ohne Wirkung, Moderator-Rolle ohne Prüfung, sechs Spalten die nie gelesen werden, Credits-Einstellungen doppelt (Features + P2G Points), eine KPI „Ausstehende Freigaben“ ohne Aktion. Dazu vier echte Rollen-Bugs: delegierte Rollen können keine Bilder hochladen (Storage-Policy verlangt Voll-Admin), und drei Seiten fehlen Tabellen im Rechte-Mapping.

---

## Phase 1 — Adresse (klein, zuerst)

Alle 22 Vorkommen von „Am Neudeck 10“ → „Am Neudeck 12“:
- `src/pages/Impressum.tsx` (2×), `src/pages/Datenschutz.tsx`
- `src/locales/{de,en}/agb.json`, `datenschutz.json`, `widerruf.json`
- `supabase/functions/_shared/email.ts` (Mail-Footer), `_shared/legal.ts` (Widerruf), `_shared/agb-text.ts` (AGB-Anhang)
- `docs/email-templates/*.html` (3 Auth-Templates → danach im Supabase-Dashboard neu einfügen)
- Beispieldaten in `admin-mail-test` und `booking-ics`: dort auf eine neutrale Musteradresse
- `docs/mobile-app/COMPLIANCE-CHANGES-2026-07-26.md`

Danach: Edge Functions deployen (alle Mail-Functions teilen `email.ts`), Auth-Templates manuell nachziehen.
Hinweis: „Stand: Juli 2026“ in AGB/Datenschutz bleibt, Adressänderung ist keine inhaltliche Änderung. Falls gewünscht → „Stand: September 2026“.

## Phase 2 — Sichtbarkeit neu

**Ein Modell für alles:** jede Funktion hat genau einen Zustand `visible | demo | hidden`
- `visible` = für alle
- `demo` = nur Admins sehen sie (mit blauem „Admin-Vorschau“-Banner), alle anderen sehen die „Bald verfügbar“-Seite
- `hidden` = niemand, auch Admins nicht (Admins nutzen `demo` zur Vorschau)

**Eine Wirkung:** ein Schalter steuert immer Nav-Link (öffentlich + eingeloggt), Route und In-Page-CTAs. „Aus“ zeigt immer dieselbe „Bald verfügbar“-Seite (bestehendes Courts-Design), nie einen stillen Redirect.

**Funktionen (neu, vollständig verdrahtet):**

| Schalter | ersetzt | steuert |
|---|---|---|
| `booking` | `feature_courts_public_enabled` | `/booking`, `/booking/locations/*`, **`/booking/checkout`** (heute offen), Nav-Links |
| `marketplace` | bleibt | `/marketplace*` (heute offen), öffentliche Nav, Dashboard-Nav, Dashboard-Home-Link |
| `events` | tot → verdrahten | `/events`, `/events/*`, `/dashboard/events`, Nav-Links |
| `lobbies`, `league`, `p2g` | bleiben | wie heute, plus Einstiegspunkte (QuickEarnTiles, BookingSuccess) |
| `friends` | tot → verdrahten | `/dashboard/friends`, `/dashboard/chat`, Einstiegspunkte |

**Gelöscht:** `matching` (keine Seite), `rewards` (kein Konsument), die acht alten `feature_*_enabled`-Booleans, `feature_app_launched`, `pin_lock_*` (+ `usePinAccess`, `PinGate`, `LockedContentOverlay`, Edge Function `validate-pin`). Doppelte Coming-Soon-Zweige in `DashboardLeague`/`DashboardP2GPoints` entfallen (der Guard übernimmt). Orphan `DashboardBooking.tsx`, `DashboardMarketplace.tsx` löschen.

**Technik:** eine Migration (`feature_booking_state` anlegen und aus dem Courts-Boolean befüllen, tote Spalten droppen), `useFeatureToggles` wird die einzige Quelle, `RequireFeature` bekommt die Coming-Soon-Seite statt Redirect und wird auch auf öffentliche Routen gelegt, `useCourtsVisibility` wird ein dünner Wrapper. `types.ts` für `site_settings` nachziehen, damit die `as any`-Casts verschwinden.

**Admin-Seite „Sichtbarkeit“** (ersetzt „Features“):
1. Karte **Funktionen**: die sieben Schalter, jeweils 3-Stufen-Auswahl, mit Klartext „Wirkt auf: …“ und Link zur Seite.
2. Karte **Inhalte**: kein Schalter, sondern Status-Übersicht mit Zahlen und Links, damit klar ist, dass Inhalte anderswo ein-/ausgeschaltet werden: Standorte online/offline (`/admin/courts`), Courts aktiv, Events veröffentlicht (`/admin/events`), Artikel veröffentlicht, Produkte aktiv/Entwurf (`/admin/marketplace`).
3. Karte **Launch-Datum**: bleibt; zusätzlich Countdown nach Ablauf ausblenden (`hasLaunched` wird heute nicht genutzt, der Hero zeigt sonst 0d 0h 0m).
4. Credits-Einstellungen wandern **nur** nach P2G Points (Duplikat entfällt).

## Phase 3 — Admin-Aufräumen (sichere Löschungen)

1. PayPal-Karte + Typ + State in `AdminIntegrations`; Felder `resend.from_email` und `stripe.mode` (nichts liest sie).
2. Touchpoint-Slides komplett: Seite, Sidebar, Route, Hook, `TouchpointCarousel`, gesamter Ordner `src/components/partner/`, Rollen-Katalog-Zeilen, `translate-content`-Eintrag. Tabelle bleibt (kein Datenverlust), Drop optional später.
3. Moderator-Aktion in `AdminUsers`.
4. Nie gelesene Felder: `partner_tiles.region` + `partner_type`, `locations.lat/lng`, `locations.amenities`, `event_artists.spotify_url` (Formulare + Typen; Spalten-Drop optional später).
5. Tote Imports/Konstanten (13 Stellen aus `tsc --noUnusedLocals`), Typfehler `AdminQrPanel.tsx:130`, Lint `AdminRoles.tsx:258`.
6. `lovable-tagger` aus `package.json`/`vite.config.ts`.
7. KPI „Ausstehende Freigaben“ auf dem P2G-Dashboard entfernen, dazu die verwaisten `admin-credits`-Actions (`approve_reward` etc.).
8. Kleinkram aus ADMIN-UX-NOTES: Tausendertrennzeichen Overview, Partner-Kacheln-Hinweistext, `Math.floor`-Hinweis Marketplace, Header-Glocke ohne Funktion (entfernen).

## Phase 4 — Echte Bugs (Rollen & Rechte)

Eine Migration:
1. Storage-Policy für Bucket `media`: Upload/Update/Delete auch für Nutzer mit einer delegierten Admin-Seite (`has_admin_page`), nicht nur Voll-Admins. Sonst scheitert jeder Bild-Upload delegierter Rollen.
2. `admin_page_tables` ergänzen: `qr_sections` (qr-panel), `marketplace_categories`/`marketplace_brands` (marketplace), `marketplace_redemptions` auf `write`, `match_analyses` (p2g-points); die inerten `media`-Zeilen entfernen.
3. `/admin/utilization` auf `is_delegatable = false` setzen oder die RPCs auf `has_admin_page('utilization')` erweitern (Empfehlung: RPCs erweitern).

## Phase 5 — Doku

`CLAUDE.md` (RequireAppLaunched, Flag-Liste, nicht existierende Functions, Seitenzahl), `docs/ADMIN-PANEL-REFERENZ.md` (Pricing, Roles, Einstellungen, Sichtbarkeit), `docs/API_DOCUMENTATION.md` (send-invite-notification).

---

## Entscheidungen, die ich brauche

| # | Frage | Empfehlung |
|---|---|---|
| A | `/admin/club-owners` (Legacy-Modell `club_owner_assignments`) entfernen? Aktuelles Modell ist `/admin/clubs`. | Entfernen, falls keine Live-Zuweisung mehr darauf liegt (prüfe ich vorher per Query). |
| B | Standort-Galerie (`gallery_image_urls`): Upload existiert, wird nirgends gezeigt. Entfernen oder auf der Buchungsseite anzeigen? | Entfernen (kein Speculative Code); Anzeige als eigenes Feature später. |
| C | PIN-Sperre für „Für Vereine“: komplett entfernen? Sie ist heute wirkungslos, die Seite ist offen. | Entfernen. |
| D | `CameraTestSimulator` (schreibt Zufalls-Matches in echte Wallets): auf Superadmin beschränken oder entfernen? | Auf Superadmin beschränken und Warnbanner. |
| E | „Aus“ auch für Admins unsichtbar (konsistent, Vorschau über „Nur Admin“)? | Ja. |
| F | AGB/Datenschutz „Stand“ mit Adressänderung aktualisieren? | Nein, nur Adresse. |

## Risiken
- **MITTEL** Phase 2 berührt Routing und Nav; falscher Zustand könnte Buchung/Shop für alle verstecken. Mitigation: Migration übernimmt aktuelle Werte 1:1, Test aller drei Zustände pro Funktion vor Push.
- **MITTEL** Storage-Policy-Änderung (Phase 4) ist sicherheitsrelevant. Mitigation: nur Bucket `media`, nur mit gültiger Seitenzuweisung.
- **NIEDRIG** Spalten-Drops sind irreversibel. Mitigation: in Phase 3 nur UI/Typen entfernen, Drops als separate spätere Migration.

## Aufwand
Phase 1: 30 min · Phase 2: 4–5 h · Phase 3: 2 h · Phase 4: 1 h · Phase 5: 30 min · Verifikation: 1 h · **~9–10 h**
