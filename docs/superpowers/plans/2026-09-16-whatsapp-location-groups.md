# Implementation Plan: WhatsApp-Gruppe pro Standort

**Datum:** 2026-09-16
**Status:** Entwurf — wartet auf Freigabe

## Anforderungen (Restatement)

Jeder Standort bekommt eine eigene PADEL2GO-WhatsApp-Gruppe (Updates, Mitspieler finden). Der Admin pflegt pro Standort den Einladungslink. Das Frontend zeigt überall dort einen WhatsApp-Button, wo ein Link hinterlegt ist:

1. **Location-Teaser („Bald bei dir“, Homepage)** — neues Admin-Feld neben „Vereins-Website (URL)“; Button auf der Teaser-Kachel.
2. **Buchbare Standorte (`/booking`)** — neues Admin-Feld im Standort-Formular; WhatsApp-Button auf der Standort-Kachel.
3. **Erste Buchungsmaske (`/booking/locations/:slug`, Stepper-Schritt 1)** — Hinweis „Spielpartner gesucht? Tritt der WhatsApp-Gruppe bei“ mit Button.

Kein Link hinterlegt → nichts wird angezeigt. Zwei getrennte Datenquellen (Teaser-Tabelle und Standort-Tabelle), weil die Teaser-Standorte noch keine `locations`-Zeile haben.

## Ist-Zustand (gelesen)

| Bereich | Datei | Befund |
|---|---|---|
| Teaser-Daten | `src/hooks/useLocationTeasers.ts` | `LocationTeaser` handgeschrieben, `club_url` vorhanden, `select("*")` |
| Teaser-Admin | `src/pages/admin/AdminLocationTeasers.tsx` | `TeaserForm` + `payload` + `openEdit`; URL-Feld „Vereins-Website“ im 2-Spalten-Grid |
| Teaser-Kachel | `src/components/LocationTeasersSection.tsx` | Club-Link unten in der Karte (`ArrowRight`) |
| Standort-Admin | `src/components/admin/courts/LocationForm.tsx` | Payload bereits `as any` (wegen `tennis_image_url`) |
| Standort-Typ (Admin) | `src/components/admin/courts/types.ts` | `Location` handgeschrieben |
| Standort-Typ (Public) | `src/types/database.ts` | `DbLocation` handgeschrieben, `select("*")` in `Booking.tsx` und `useBookingLocation.ts` |
| Standort-Kachel | `src/components/booking/LocationCard.tsx` | Footer: Öffnungszeiten links, „Auswählen“ rechts |
| Buchungsmaske | `src/pages/BookingLocation.tsx` | Header → Grid (SlotPicker + TennisTeaser | Summary) |
| WhatsApp-Helfer | `src/components/WhatsAppBusiness.tsx` | `WhatsAppIcon` + Business-Nummer-Helfer vorhanden |
| i18n | `src/locales/{de,en}/index.json`, `booking.json` | Namespaces `locationTeasers`, `locationCard`, `summary` |
| DB | `supabase/migrations/…location_teasers…` | RLS: Public liest aktive Teaser, Admin verwaltet; `locations` analog |

## Phasen

### Phase 1 — Datenbank
Neue Migration `supabase/migrations/20260916120000_whatsapp_group_links.sql`:

```sql
ALTER TABLE public.location_teasers
  ADD COLUMN IF NOT EXISTS whatsapp_group_url text;
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS whatsapp_group_url text;
COMMENT ON COLUMN public.location_teasers.whatsapp_group_url IS 'Einladungslink zur PADEL2GO-WhatsApp-Gruppe des Standorts (chat.whatsapp.com/...)';
COMMENT ON COLUMN public.locations.whatsapp_group_url IS 'Einladungslink zur PADEL2GO-WhatsApp-Gruppe des Standorts (chat.whatsapp.com/...)';
```

Keine RLS-Änderung nötig: bestehende Policies gelten spaltenübergreifend. Der Link ist öffentlich gedacht.
`types.ts` (generiert) wird nicht neu erzeugt — Casts wie bei `tennis_image_url` (CLAUDE.md-Regel).

### Phase 2 — Gemeinsamer Button
In `src/components/WhatsAppBusiness.tsx` (kein neues File) ergänzen:

```tsx
export function WhatsAppGroupButton({ href, label, compact, className }: {...})
```
- `<a target="_blank" rel="noopener noreferrer">` mit `WhatsAppIcon`.
- Zwei Varianten: `compact` = Icon-Quadrat (Kachel-Footer, `aria-label`), sonst Pill mit Icon + Text.
- Farbe: WhatsApp-Grün (`#25D366`) als Rahmen/Text auf dunklem Grund, Hover leicht gefüllt — Styling an bestehende `WhatsAppIcon`-Verwendungen (FaqKontakt/Footer) angleichen.

### Phase 3 — Location-Teaser (Homepage)
1. `useLocationTeasers.ts`: `whatsapp_group_url: string | null` im Interface.
2. `AdminLocationTeasers.tsx`:
   - `TeaserForm`/`emptyForm`/`payload`/`openEdit` um `whatsapp_group_url` erweitern.
   - Neues `Input` „WhatsApp-Gruppe (Einladungslink)“, Placeholder `https://chat.whatsapp.com/…`, im selben Grid wie „Vereins-Website“ (Grid ist `auto-fit`, nimmt drittes Feld auf).
   - Boundary-Check beim Speichern: nicht-leer und nicht `https://` → `toast.error("WhatsApp-Link muss mit https:// beginnen")`, kein Save.
   - Listenansicht: kleines WhatsApp-Icon neben dem Titel, wenn Link gesetzt (optional, 1 Zeile).
3. `LocationTeasersSection.tsx`: Club-Link und WhatsApp-Button in eine `flex flex-wrap gap-x-4 gap-y-2`-Zeile; `WhatsAppGroupButton` nur bei gesetztem Link.
4. i18n `index.json` (de/en): `locationTeasers.whatsappJoin` = „WhatsApp-Gruppe beitreten“ / „Join WhatsApp group“.

### Phase 4 — Buchbare Standorte (Admin + Kachel)
1. `courts/types.ts` (`Location`) und `types/database.ts` (`DbLocation`): `whatsapp_group_url: string | null`.
2. `LocationForm.tsx`: State + Payload + `Input` „WhatsApp-Gruppe (Einladungslink)“ direkt unter „Beschreibung“; gleicher `https://`-Check wie im Teaser-Admin.
   - Prüfen, ob `AdminCourts.tsx` die Standorte mit `select("*")` lädt — sonst Spalte in die Select-Liste aufnehmen.
3. `LocationCard.tsx`: im Footer rechts neben „Auswählen“ die `compact`-Variante des Buttons (32px-Quadrat). Öffnungszeiten links bleiben `truncate`, damit 320px hält.
4. i18n `booking.json` (de/en): `locationCard.whatsapp` = „WhatsApp-Gruppe“ / „WhatsApp group“ (für `aria-label`/`title`).

### Phase 5 — Erste Buchungsmaske
1. Neues `src/components/booking/BookingWhatsAppTeaser.tsx` (Muster: `BookingTennisTeaser.tsx`): schmale Karte mit Icon-Tile, Titel, Untertitel, CTA-Button.
2. `BookingLocation.tsx`: direkt unter `BookingLocationHeader`, oberhalb des Grids, nur bei `location.whatsapp_group_url`. Damit sichtbar auf Desktop und Mobile, unabhängig von Login/Slot-Auswahl.
3. i18n `booking.json` (de/en), Namespace `whatsappTeaser`:
   - `title`: „Spielpartner gesucht?“ / „Need a buddy?“
   - `description`: „Tritt der PADEL2GO-WhatsApp-Gruppe für {{name}} bei — Updates, Mitspieler & spontane Matches.“ / „Join the PADEL2GO WhatsApp group for {{name}} — updates, partners & spontaneous matches.“
   - `cta`: „Gruppe beitreten“ / „Join group“

### Phase 6 — Verifikation
- `npm run lint` und `npm run build` grün.
- Browser: Admin-Teaser speichern → Homepage-Kachel zeigt Button; Admin-Standort speichern → `/booking`-Kachel und `/booking/locations/:slug` zeigen Button/Teaser; ohne Link nichts sichtbar.
- Mobile 320px: Kachel-Footer und Teaser-Karte brechen nicht um.
- Florian erinnern: Migration im Supabase SQL-Editor ausführen.

## Abhängigkeiten
- Migration muss **vor** dem Admin-Speichern laufen, sonst „column does not exist“. Lesen (`select("*")`) ist ohne Migration unkritisch (Spalte fehlt → Button bleibt aus).

## Risiken
- **MITTEL** — Reihenfolge Migration/Deploy (siehe oben). Mitigation: Migration zuerst ausführen, dann pushen.
- **NIEDRIG** — Admin trägt falschen Link ein (z. B. `wa.me` statt Gruppenlink). Mitigation: nur `https://`-Check; kein Domain-Zwang, damit auch Community-Links anderer Art funktionieren.
- **NIEDRIG** — Kachel-Footer wird bei 320px eng. Mitigation: Icon-only-Variante, Öffnungszeiten bleiben `truncate`.
- **NIEDRIG** — Generierte `types.ts` bleibt veraltet. Mitigation: bestehende Cast-Konvention.

## Geschätzte Komplexität: NIEDRIG–MITTEL
- DB + Typen: 15 min
- Admin (Teaser + Standort): 45 min
- Frontend (3 Stellen + Button): 60 min
- i18n + Verifikation: 30 min
- Gesamt: ~2.5 h

## Betroffene Dateien
- neu: `supabase/migrations/20260916120000_whatsapp_group_links.sql`
- neu: `src/components/booking/BookingWhatsAppTeaser.tsx`
- `src/components/WhatsAppBusiness.tsx`
- `src/hooks/useLocationTeasers.ts`
- `src/pages/admin/AdminLocationTeasers.tsx`
- `src/components/LocationTeasersSection.tsx`
- `src/components/admin/courts/types.ts`
- `src/components/admin/courts/LocationForm.tsx`
- `src/types/database.ts`
- `src/components/booking/LocationCard.tsx`
- `src/pages/BookingLocation.tsx`
- `src/locales/de/index.json`, `src/locales/en/index.json`
- `src/locales/de/booking.json`, `src/locales/en/booking.json`
