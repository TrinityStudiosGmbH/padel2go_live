# PADEL2GO Admin-Panel — Vollreferenz aller Seiten & Submasken

**Stand:** 03.08.2026 · **Quelle:** vollständige Code-Analyse aller Seiten unter `src/pages/admin/` inkl. sämtlicher eingebundener Dialog-/Formular-Komponenten (`src/components/admin/**`).

**Rahmen für alle Seiten:** Jede Admin-Seite ist in `AdminLayout` gekapselt (Sidebar + `AdminHeader` + `LegalFooterLinks`). Zugriffsschutz via `useAdminAuth`: Ladespinner während der Prüfung; ohne Login → Redirect `/auth`; ohne Admin-Rolle → Redirect `/`. Die Sidebar (`AdminSidebar.tsx`) listet die 25 Menüpunkte in der Reihenfolge dieses Dokuments.

## Änderungen seit 03.08.2026 (Stand 17.09.2026)

- **Entfernt:** „Club Owners“ (`/admin/club-owners`, Legacy-Modell `club_owner_assignments` war leer — Clubs laufen über `/admin/clubs`), „Touchpoint Slides“ (`/admin/touchpoint-slides`, die Partner-Seite `/fuer-partner` existiert nicht mehr), PayPal-Karte unter Integrationen, Felder `resend.from_email` und `stripe.mode`, Rolle „Moderator“, Standort-Felder Breiten-/Längengrad, Galerie und `amenities`, Partner-Kachel-Felder Typ und Region, Artist-Feld Spotify, KPI „Ausstehende Freigaben“ (P2G), Header-Glocke ohne Funktion, PIN-Sperre unter Einstellungen (war wirkungslos).
- **Umbenannt:** „Features“ → **„Sichtbarkeit“** (`/admin/features`): sieben Funktions-Schalter mit je einem Zustand (Für alle / Nur Admins / Aus), der Nav-Link, Route und Buttons gemeinsam steuert; darunter eine Status-Übersicht der Inhalte (Standorte, Courts, Events, Artikel, Produkte) mit Links zu den Pflegeseiten; Launch-Datum ist reine Anzeige. Die Credits-Regeln liegen nur noch unter P2G Points.
- **Neu:** Einstellungen → **E-Mail-Test** (jede ausgehende Mail mit Beispieldaten an eine beliebige Adresse, Vorschau im Dialog). Kamera-Testsimulator nur noch für den Superadmin.
- **Rollen:** delegierte Rollen dürfen jetzt in den `media`-Bucket hochladen; `qr_sections`, `marketplace_categories/brands`, `marketplace_redemptions` (write) und `match_analyses` sind im Seiten-Mapping; „Auslastung“ ist nicht mehr delegierbar (RPCs prüfen auf Voll-Admin).
- Die Abschnitte unten beschreiben den Stand vom 03.08.2026 und sind für die entfernten Seiten/Felder überholt.

## Inhaltsverzeichnis

| # | Seite | Route |
|---|---|---|
| 1 | Overview | `/admin` |
| 2 | Buchungen | `/admin/bookings` |
| 3 | Courts & Standorte | `/admin/courts` |
| 4 | Auslastung | `/admin/utilization` |
| 5 | Clubs | `/admin/clubs` |
| 6 | Club Owners | `/admin/club-owners` |
| 7 | Events | `/admin/events` |
| 8 | Marketplace | `/admin/marketplace` |
| 9 | P2G Points | `/admin/p2g-points` |
| 10 | Vouchers | `/admin/vouchers` |
| 11 | Location Teasers | `/admin/location-teasers` |
| 12 | SkyPadel Galerie | `/admin/skypadel-gallery` |
| 13 | Partner-Kacheln | `/admin/partner-tiles` |
| 14 | Touchpoint Slides | `/admin/touchpoint-slides` |
| 15 | QR-Panel | `/admin/qr-panel` |
| 16 | News / Artikel | `/admin/news` |
| 17 | Farben | `/admin/farben` |
| 18 | Benutzer | `/admin/users` |
| 19 | Mitteilungen | `/admin/notifications` |
| 20 | Newsletter | `/admin/newsletter` |
| 21 | Analytics | `/admin/analytics` |
| 22 | Visuals | `/admin/visuals` |
| 23 | Integrationen | `/admin/integrations` |
| 24 | Features | `/admin/features` |
| 25 | Einstellungen | `/admin/settings` |

---

## Gemeinsame Submaske: „TranslatableField“ (DE/EN-Feldpaar)
**Datei:** `src/components/admin/TranslatableField.tsx` · **Zweck:** Wiederverwendbares Zwei-Spalten-Feld (Deutsch = Quelle, Englisch = DeepL-Ziel) — eingesetzt in Location Teasers, SkyPadel Galerie, Partner-Kacheln, Touchpoint Slides und QR-Panel. Wird inline gerendert (kein eigener Dialog).

| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Feld DE | Input oder Textarea | je nach Aufrufer | Badge „DE“ (Primary) vor dem Label; immer editierbar |
| Feld EN | Input oder Textarea | nein | Badge „EN“. **Deaktiviert**, solange nicht gesperrt UND EN leer — Placeholder dann „Wird nach dem Speichern automatisch befüllt“ |
| Sperr-Umschalter | Toggle über dem EN-Feld | – | **„auto“** (Unlock, grau): „Automatisch übersetzt — beim nächsten Speichern überschrieben. Klicken zum Sperren.“ · **„gesperrt“** (Lock, bernstein): „Manuell gesperrt — beim nächsten Speichern nicht überschrieben. Klicken zum Entsperren.“ |
| Hinweis „auto-translate“ | Badge (Sparkles) | – | sichtbar solange nicht gesperrt und EN leer |

**Übersetzungs-Pipeline** (`useTranslateContent`): nach dem Speichern ruft die Seite die Edge Function `translate-content` mit `{table, id, fields}`. Toasts: „Übersetzung aktualisiert“ · „Manuell gesperrt — nicht überschrieben“ · „DeepL nicht konfiguriert — EN-Felder bleiben leer. Im Admin → Integrationen einrichten.“ · „Übersetzung fehlgeschlagen: Edge Function ist veraltet. Neu deployen: supabase functions deploy translate-content“ · „Übersetzung fehlgeschlagen: {Fehler}“.

---

## Overview — `/admin`
**Datei:** `src/pages/admin/AdminOverview.tsx` · **Zweck:** Dashboard-Startseite des Admin-Panels mit Buchungs-/Nutzer-/Court-KPIs, Club-Kontingent-Kennzahlen, den letzten Buchungen und einer Standort-Übersicht.

### Rahmen / Layout
- Gerendert in `AdminLayout` (`src/components/admin/AdminLayout.tsx`): Sidebar (`AdminSidebar`) + Header (`AdminHeader`) + `LegalFooterLinks`.
- Zugriffsschutz: `useAdminAuth` — Ladezustand = Spinner; kein User → Redirect `/auth`; kein Admin → Redirect `/`.
- Seitentitel: **„Dashboard“**, Untertitel: „Willkommen im PADEL2GO Admin Panel“.

### Sektion: KPI-Kacheln (4 Karten, Grid 1/2/4 Spalten)
| Kachel-Titel | Wert (Quelle) | Beschreibungstext darunter | Icon |
|---|---|---|---|
| **Buchungen heute** | `count` aus `bookings`, `start_time` heute, `status = confirmed` | aktuelles Datum, Format „EEEE, d. MMMM“ (deutsch) | Calendar |
| **Buchungen diese Woche** | `count` aus `bookings` innerhalb der aktuellen Woche, `status = confirmed` | „Gesamt für aktuelle Woche“ | TrendingUp |
| **Registrierte Benutzer** | `count` aller Zeilen in `profiles` | „Gesamt Spieler“ | Users |
| **Aktive Courts** | `count` aus `courts` mit `is_active = true` | „an {n} Standorten“ (n = Anzahl `locations`) | MapPin |

### Sektion: Club-KPI-Kacheln (3 Karten)
| Kachel-Titel | Wert (Quelle) | Beschreibungstext | Icon |
|---|---|---|---|
| **Club-Buchungen heute** | `bookings` mit `club_id IS NOT NULL`, heute, confirmed | „Über Club-Kontingente“ | Building2 |
| **Club-Buchungen Woche** | dito, aktuelle Woche | „Aktuelle Woche“ | Building2 |
| **Kontingent-Nutzung** | Summe(`club_quota_ledger.minutes_used` − `minutes_refunded`, aktueller Monat) ÷ Summe(`club_court_assignments.monthly_free_minutes`) in % | „{genutzt} / {verfügbar} Min“ | Percent |

### Sektion: Card „Letzte Buchungen“
- **Filter „Court wählen“** (Select, 200 px): Option `Alle Courts` (Default) + Courts **gruppiert nach Standortname** (nur aktive Courts). Ohne Filter: die **5** letzten Buchungen (nach `created_at`), mit Court-Filter **10**.
- Tabelle: **Datum / Uhrzeit** (`dd.MM.yyyy` + `HH:mm – HH:mm`) · **Court** (nur ohne Filter: Court-Name + Standort) · **Status** (Pill-Badge).
- **Status-Badge-Werte:** `confirmed` → „Bestätigt“ (primary), `cancelled` → „Storniert“ (destructive), `pending` → „Ausstehend“ (muted), `pending_payment` → „Zahlung offen“ (amber), `expired` → „Abgelaufen“ (muted).
- Leerzustände: „Keine Buchungen für diesen Court“ / „Keine Buchungen vorhanden“.

### Sektion: Card „Standorte Übersicht“
- Liste aller `locations`: Standortname (fett) + Adresse, rechts „{n} Courts“ (aktive Courts). Leerzustand: „Keine Standorte konfiguriert“.

### Submasken
- **Keine.** Rein lesende Seite; einzige Interaktion ist der Court-Select.

---

## Buchungen — `/admin/bookings`
**Datei:** `src/pages/admin/AdminBookings.tsx` · **Zweck:** Wochenweise Verwaltung aller Court-Buchungen (Kalender- und Listenansicht) inkl. Club-Buchungsdetails, Stornierung einzelner Buchungen und globalem Buchungs-Reset.

### Hauptansicht — Kopfbereich
- Titel **„Buchungen“**; Untertitel: „{n} Buchungen in dieser Woche“ + ggf. „({m} Club-Buchungen)“.
- Button **„Buchungen Reset“** (destruktiv) → Dialog „Buchungen löschen?“.
- Tabs (Default = Kalender): **„Kalender“** · **„Liste“**.

### Sektion: Filterkarte
**Wochennavigation:** `‹` (Woche zurück) · Anzeige „{dd. MMM} - {dd. MMM yyyy}“ (Wochenstart Montag) · `›` (Woche vor) · Button **„Diese Woche“**.

**Standard-Filter:**
| Filter | Typ | Optionen | Default |
|---|---|---|---|
| Standort | Select | `Alle Standorte` + alle `locations` | Alle Standorte |
| Status | Select | `Alle Status`, `Bestätigt`, `Ausstehend`, `Storniert` | **Bestätigt** |

**Club-Filter:** Checkbox **„Nur Club-Buchungen“** (filtert `booking_origin = "club"`) + Select „Club wählen“ (`Alle Clubs` + aktive Clubs).

### Sektion: Kalenderansicht — Card „Wochenübersicht (Mo - Fr)“
Inhalt = `BookingWeekCalendar` (siehe Submaske). Ladezustand: „Laden…“.

### Sektion: Listenansicht — Card „Buchungsliste ({Anzahl})“
- Suchfeld „Suchen…“ — filtert clientseitig über Court-Name, Standort, `display_name`/`username`, Club-Name, `booked_for_member_name`, Club-Bucher.
- Tabelle mit **11 Spalten**:
  | Spalte | Inhalt / mögliche Werte |
  |---|---|
  | **Typ** | Badge `Club` (Building2-Icon) bei `booking_origin = "club"`, sonst Badge `User` |
  | **Datum & Zeit** | `dd.MM.yyyy` + `HH:mm - HH:mm` |
  | **Standort** | `locations.name` |
  | **Court** | `courts.name` |
  | **Benutzer** | Display-Name/Username; bei Gast: Gastname + Badge **„Gast“**, E-Mail als `mailto:`-Link, Telefon; sonst „-“ |
  | **Club** | Club-Name oder „-“ |
  | **Gebucht von** | Club-Bucher oder „-“ |
  | **Für Mitglied** | `booked_for_member_name` oder „-“ |
  | **Kontingent** | „{allocation_minutes} Min“ + grünes Badge **„Frei“** bei `is_free_allocation` |
  | **Status** | „Bestätigt“ / „Storniert“ / „Ausstehend“ |
  | **Aktionen** | Button **„Details“** (Detail-Drawer); nur bei confirmed: XCircle-Button → Storno-Bestätigung |

### Submaske: „Wochenkalender“ (`BookingWeekCalendar`)
**Datei:** `src/components/admin/bookings/BookingWeekCalendar.tsx` · **Öffnet via:** Tab „Kalender“.
- Raster: Zeitspalte + 7 Tagesspalten; Zeitachse **06:00–23:00** (Zeilenhöhe 48 px).
- Buchungsblock: Court-Name (Club-Buchung mit Building2-Icon) + „HH:mm - HH:mm“; Höhe = Dauer.
- **Farbcodierung:** normal: confirmed = primary, pending = gelb, cancelled = destruktiv/durchgestrichen; Club-Buchung confirmed = violett.
- **Tooltip (Hover):** ggf. Badge „Club“, „{Court} @ {Standort}“, Datum/Zeit, „Benutzer: …“, „Club: …“, „Für: …“, Status-Badge.
- Klick auf Block → Detail-Drawer.

### Submaske: „Buchungsdetails“ (Sheet/Drawer)
**Datei:** `src/components/admin/bookings/BookingDetailDrawer.tsx` · **Öffnet via:** Kalenderblock-Klick oder „Details“-Button in der Liste.
| Feld / Block | Inhalt |
|---|---|
| Status-Badge + ggf. Club-Badge | „Bestätigt“ / „Storniert“ / „Ausstehend“ |
| Buchungs-ID | „#“ + erste 8 Zeichen |
| Datum & Uhrzeit | „EEEE, dd. MMMM yyyy“ + „HH:mm - HH:mm Uhr“ |
| Ort | Standortname + Court-Name |
| Benutzer | Display-Name, „@username“, gekürzte User-ID |
| „Erstellt am“ | `dd.MM.yyyy HH:mm` |
| „Club-Buchungsdetails“ (nur Club) | „Club“, „Gebucht von“, „Für Mitglied“ |
| „Gast-Buchung (ohne Konto)“ | Gastname, E-Mail (`mailto:`), Telefon |
| „Kontingent“ | „{n} Minuten“ + Badge **„Freies Kontingent“** bei `is_free_allocation` |
- **Aktion:** Button **„Buchung stornieren“** (nur bei confirmed) → Storno-Bestätigung.

### Submaske: Bestätigungsdialog „Buchung stornieren?“
**Warntext:** „Diese Aktion kann nicht rückgängig gemacht werden. Die Buchung wird als storniert markiert.“ Buttons „Abbrechen“ / „Stornieren“. Wirkung: `status = cancelled` + `cancelled_at`.

### Submaske: Bestätigungsdialog „Buchungen löschen?“
**Öffnet via:** „Buchungen Reset“. Warntexte: „⚠️ ACHTUNG: Diese Aktion ist UNWIDERRUFLICH!“ + Liste der gelöschten Daten (Buchungen, Teilnehmer-Einladungen, Spieler-Zuordnungen, Zahlungsdaten).
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| **„Nur abgelaufene/stornierte Buchungen löschen“** | Checkbox | nein | **Default: an.** Aktiv → nur `cancelled`/`expired`; sonst **alle** Buchungen |
- Buttons „Abbrechen“ / **„Endgültig löschen“** („Lösche…“ während Ausführung). Wirkung: Edge Function `admin-credits`, Action `reset_all_bookings`.

---

## Courts & Standorte — `/admin/courts`
**Datei:** `src/pages/admin/AdminCourts.tsx` · **Zweck:** Zentrale Verwaltung von Standorten, deren Courts (inkl. Preise, Status, Features), Standort-Analytics und der KI-Kamera-Anbindung.

### Hauptansicht — Kopfbereich
- Titel **„Courts & Standorte“**; Untertitel: „{x} Standorte ({y} online) • {z} Courts ({a} aktiv)“.
- Primärbutton **„Neuer Standort“** → Dialog.
- **Tabs:** „Standorte“ (Zähler) · „Courts“ (Zähler) · „Analytics“ · „KI-Kameras“.

### Tab „Standorte“ — Standort-Karten (`AdminLocationCard`)
- Kopf: Hauptbild, Name, Badge **„Online“/„Offline“**, optional Badge **„24/7“**, Adresszeile.
- **Feature-Badges:** „Rewards“, „KI“, „Automat“ + dynamisch alle aktiven `features_json`-Merkmale (WC, Dusche, Umkleide, Flutlicht, Parkplätze, Schlägerverleih, Ballverleih, WLAN, Barrierefrei, Indoor, Outdoor, Gastronomie).
- **Aktionen:** Switch **„Online“** (sofort), Button **„Bearbeiten“**, Trash2 → „Standort löschen?“.
- **Inline-Feature-Switches** (sofort speichernd): **„Rewards“**, **„KI-Analyse“**, **„Automaten“**.
- **Court-Block:** „Courts ({n})“ + **Anzahl-Courts-Selektor**; je Court: Name, Badge „Inaktiv“, `€`-Button (Preis-Dialog), „Aktiv“-Switch.

### Tab „Courts“ — Court-Karten (`AdminCourtCard`)
- Bildkopf 21:9 (Standortbild), Badge „Online“ (grün) / „Offline“ (rot).
- Name + „{Standort} • {Stadt}“; **Preis-Badge** „ab {Preis}€“ (60-Min-Preis) oder Warnbadge **„Preise fehlen“** (bei < 3 Preiseinträgen).
- Status-Switch (`is_active`), Buttons „Bearbeiten“ (→ Court-Edit-Dialog) und Trash2 (→ „Court löschen?“).

### Tab „Analytics“ (`LocationAnalyticsTab`)
- **Filter:** „Standort“ (Alle + Liste) · **„Zeitraum“**: Buttons **7T / 30T / 90T / Alle** (Default 7T).
- **KPI-Kacheln (6):** Buchungen gesamt · Letzte 7 Tage · Letzte 3 Tage · Umsatz gesamt · Auslastung (gebuchte Std ÷ Courts × 12 h × Tage) · Storno-Rate.
- Charts: **„Buchungen pro Tag“** (Balken), **„Umsatz-Trend“** (Linie), **„Buchungen pro Court“** (Top 6, Fortschrittsbalken), **„Status-Verteilung“** (Donut: Bestätigt/Abgeschlossen/Storniert/Ausstehend/Zahlung ausstehend).
- Card **„Letzte Buchungen“**: 10 neueste — Court · Datum · Uhrzeit · Status-Badge · Preis.

### Tab „KI-Kameras“ (3 Blöcke)
**„Kamera Sessions“** (`CameraSessionsTab`): Untertabs **„Aktiv ({n})“** (Auto-Refresh 10 s; PENDING/ACTIVE/PROCESSING) und **„Historie“** (COMPLETED/FAILED, max. 50). Status-Badges: „Wartend“/„Aktiv“/„Verarbeitung“/„Abgeschlossen“/„Fehler“. Session-Karte: Court + Standort, Session-ID (gekürzt), Spielerzähler „{n}/4“, „Gestartet vor …“, ggf. Fehlermeldung. Button „Aktualisieren“.

**„Kamera API Keys“** (`CameraApiKeysTab`): Key-Karten mit Name, Badge Aktiv/Inaktiv, Standort, Switch, Löschen (confirm „API Key wirklich löschen?“), „Erstellt“/„Zuletzt verwendet“. Button **„Neuer API Key“**.

**„Match-Simulation (Test-Modus)“** (`CameraTestSimulator`): siehe Submaske.

### Submaske: „Neuer Standort“ / „Standort bearbeiten“ (Dialog, `LocationForm`)
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| **Hauptbild** | Upload (`image/*`) | nein | Dropzone „Hauptbild hochladen“; Storage `media/locations/…`; Vorschau mit X-Button |
| **Galerie** | Upload (mehrfach) | nein | 4-spaltiges Raster + Plus-Kachel |
| **Name \*** | Text | **ja** | erzeugt beim Anlegen automatisch den Slug (Umlaut-Ersetzung) |
| **Slug \*** | Text | **ja** | frei überschreibbar; im Edit-Modus keine Auto-Neuerzeugung |
| **Beschreibung** | Textarea | nein | — |
| **Straße und Hausnummer / PLZ / Stadt** | Text | nein | — |
| **Land** | Text | nein | **Default „DE“** |
| **Breitengrad / Längengrad (optional)** | Number | nein | — |
| **Online** | Switch | nein | „Im Frontend sichtbar“ |
| **24/7 geöffnet** | Switch | nein | blendet Öffnungszeiten aus |
| **Rewards / KI-Analyse** | Switch | nein | **Default: an** |
| **Automaten** | Switch | nein | Default: aus |
| **Ausstattung & Merkmale** | 12 Switches | nein | WC, Dusche, Umkleide, Flutlicht, Parkplätze, Schlägerverleih, Ballverleih, WLAN, Barrierefrei, Indoor, Outdoor, Gastronomie |
| **Öffnungszeiten** (nur ohne 24/7) | 2 × `time` je Wochentag Mo–So | nein | **Defaults 06:00 / 23:00** |
- Speichern-Button „Erstellen“/„Aktualisieren“ — deaktiviert ohne Name oder Slug.

### Submaske: Bestätigungsdialog „Standort löschen?“
Warntext: „„{Name}“ und alle zugehörigen Courts werden unwiderruflich gelöscht.“

### Submaske: „Anzahl Courts“ (Inline-Selektor, `CourtCountSelector`)
- Minus/Plus-Buttons um die aktive Court-Anzahl (max. **2**). Erhöhen reaktiviert inaktive Courts bzw. legt „Court {n}“ neu an; Verringern sagt offene Lobbies ab, storniert zukünftige Buchungen und löscht den Court hart. Fehler-Toast „Court kann nicht entfernt werden“ bei aktiven Abhängigkeiten.

### Submaske: „💰 Preise für {Court-Name}“ (Dialog, `CourtPriceDialog`)
| Feld | Typ | Default |
|---|---|---|
| **60 Min.** (€) | Number, step 0.01 | 24 |
| **90 Min.** (€) | Number | 36 |
| **120 Min.** (€) | Number | 40 |
- Warnhinweis wenn nicht genau 3 Preise: „Preise müssen gesetzt sein, damit der Court buchbar ist.“ Speichern ersetzt alle Preise (in Cent).

### Submaske: „Court bearbeiten“ (Dialog, `AdminCourtEditDialog`)
| Feld | Typ | Details |
|---|---|---|
| **Court Name** | Text | aktueller Name |
| **Kurz-Label (optional)** | Text | „z.B. Outdoor · Flutlicht“ — „Wird bei der Court-Auswahl im Booking angezeigt.“ |
| **Court ist online** | Switch | toggelt `is_active` |
| **Preise 60/90/120 Min.** | Number (€) | Defaults 24/36/40, DB-Werte überschreiben |

### Submaske: Bestätigungsdialog „Court löschen?“
Warntext: „„{Court-Name}“ wird unwiderruflich gelöscht.“ Kaskade: Lobbies absagen → Buchungen stornieren → Court löschen.

### Submaske: „Neuen API Key erstellen“ (Dialog)
**Schritt 1:** Felder **Name** (Pflicht, „z.B. Bamberg Court 1 Cam“) + **Standort** (Pflicht, Select). **Schritt 2:** einmalige Anzeige des Keys `p2g_cam_…` (Auge-Toggle, Kopieren-Button), Warnung „⚠️ Dieser Key wird nur einmal angezeigt. Speichere ihn sicher!“ (serverseitig nur SHA-256-Hash gespeichert).

### Submaske: „Match-Simulation (Test-Modus)“ (Inline-Karte)
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| **API Key auswählen** | Select | ja | aktive Kamera-Keys „{Name} ({Standort})“ |
| **API Key Wert eingeben** | Passwort | ja | „p2g_cam_xxxx-…“ — Klartext nötig |
| **Court auswählen** | Select | ja | aktive Courts des Key-Standorts |
| **Team 1 / Team 2** | je 2 Spieler-Selects | mind. 2 gesamt | bis zu 100 Profile mit Username; keine Doppel-Auswahl |
| **Endstand Team 1 / Team 2** | Number 0–10 | ja | Defaults 6 / 4 |
- Button **„Match simulieren“** → `camera-webhook/start-session` + `match-complete` mit Mock-Analysen; Ergebnisblock „Simulation erfolgreich!“ mit vergebenen Credits. **Hinweis: „Credits werden real vergeben!“**

### Hinweis
`AddCourtDialog.tsx` („Neuer Court“) existiert, wird aber aktuell **nirgends gerendert** — Court-Anlage läuft über den „Anzahl Courts“-Selektor.

---

## Auslastung — `/admin/utilization`
**Datei:** `src/pages/admin/AdminUtilization.tsx` · **Zweck:** Monatsbezogene Kapazitätsauswertung aller Online-Courts (KPIs, Standort-Vergleich, 6-Monats-Verlauf, Detailtabelle je Court). Rein lesend.

### Hauptansicht
- Titel **„Auslastung“**, Untertitel „Kapazität aller Online-Courts im PADEL2GO-Netzwerk“.
- **Monatsnavigation:** `‹` / „MMMM yyyy“ / `›` (Zukunft gesperrt). Datenquelle: RPCs `get_court_utilization` + `get_network_utilization_trend(6)`.

### KPI-Kacheln (6)
**Courts online** ({n} Standorte) · **Netzwerk-Auslastung** (gebuchte ÷ mögliche Minuten, %) · **Gebuchte Stunden** („von {möglich} möglich“) · **Umsatz** (bestätigte Buchungen) · **Top Court** · **Schwächster Court**.

### Charts
- **„Auslastung pro Standort“** — Balken, Ampelfarben: **< 40 % rot, 40–75 % amber, > 75 % grün**.
- **„Netzwerk-Verlauf (letzte 6 Monate bis heute)“** — Linie, X = „MMM yy“.

### Card „Alle Courts“
- Filter: Standort (Alle + Liste) · Sortierung: **„Auslastung ↓“ / „Gebuchte Stunden ↓“ / „Umsatz ↓“ / „Standort / Court“**.
- Tabelle (8 Spalten): Standort (+ Stadt) · Court · **Auslastung** (Fortschrittsbalken mit Ampelfarbe + %) · Gebucht (h) · Möglich (h) · Buchungen · Umsatz (€) · Status („Aktiv“/„Inaktiv“).
- Zustände: „Lädt…“ · Fehlermeldung · „Keine Online-Courts gefunden.“

### Submasken
- **Keine.**

---

## Clubs — `/admin/clubs`
**Datei:** `src/pages/admin/AdminClubs.tsx` · **Zweck:** Vereine/Clubs anlegen und pflegen sowie deren Court-Kontingente und Club-Mitglieder (Manager/Staff) verwalten.

### Hauptansicht
- H1 „Clubs“ (Icon Building2), Untertitel: „Verwalten Sie Clubs, Court-Zuweisungen und Mitglieder“ · Button **„Neuer Club“** (Plus).
- **Suche:** „Suchen nach Club-Name, Beschreibung oder Email...“ — filtert clientseitig über `name`, `description`, `primary_contact_email`.
- **Card links „Clubs ({n})“:** Auswahlliste; pro Eintrag Club-Name (fett), Badge **„Inaktiv“** bei `is_active = false`, darunter „{n} Courts“ (Zuweisungen) + „{n} User“ (aktive Mitglieder). Zustände: „Laden...“ / „Keine Clubs gefunden“.
- **Card rechts (Detail):** ohne Auswahl Leerzustand „Wählen Sie einen Club aus der Liste aus“. Mit Auswahl: Club-Name + **Switch** (`is_active`, Toast „Status aktualisiert“), Beschreibung (Fallback „Keine Beschreibung“), Kontakt-E-Mail, Button **„Bearbeiten“**, Trash2-Button → `confirm()` **„Club wirklich löschen? Alle Zuweisungen werden entfernt.“** → Toast „Club gelöscht“.

#### Tab „Courts ({n})“ (Standard-Tab) — „Court-Zuweisungen & Kontingente“
- Button **„Court hinzufügen“** → Submaske „Court zuweisen“. Leerzustand: „Noch keine Courts zugewiesen“.
- Tabelle: **Court** · **Standort** · **Kontingent** (Inline-Editor: Minus-Button −1 h [deaktiviert bei 0] · Number-Input in Stunden, min 0 / max 120, Übernahme bei onBlur/Enter, gespeichert als `monthly_free_minutes = h × 60`, Toast „Kontingent aktualisiert“ · Plus-Button +1 h · „h/Monat“) · **Löschen** (Trash2, ohne Rückfrage, Toast „Court-Zuweisung gelöscht“).

#### Tab „Mitglieder ({n aktive})“ — „Club-Mitglieder“
- Button **„Benutzer hinzufügen“** → Submaske. Leerzustand: „Noch keine Mitglieder hinzugefügt“.
- Tabelle: **Benutzer** (display_name → username → „Unbekannt“, + „@username“) · **Rolle** (Badge **„Manager“** oder **„Staff“**) · **Status** (Switch `is_active`, Toast „Benutzer-Status aktualisiert“) · **Hinzugefügt** (`dd.MM.yyyy`) · **Entfernen** (UserMinus → `confirm("Benutzer wirklich aus dem Club entfernen?")`, Toast „Benutzer entfernt“).

**Hilfe-Card „So richten Sie einen Club ein:“** — 5 nummerierte Schritte (Club anlegen → auswählen → Courts + Kontingent → Mitglieder → Mitglieder werden zum Club-Portal weitergeleitet).

### Submaske: „Neuer Club“ / „Club bearbeiten“
**Öffnet via:** Button „Neuer Club“ bzw. „Bearbeiten“.
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Club Name * | Text | ja | „z.B. TC Musterstadt“; Fehler „Club-Name ist erforderlich“ bei leer |
| Beschreibung | Textarea (3 Zeilen) | nein | „Kurze Beschreibung des Clubs...“; leer → `null` |
| Kontakt-Email | E-Mail | nein | „kontakt@tennisclub.de“; leer → `null` |
- Aktionen: „Abbrechen“ · „Erstellen“/„Aktualisieren“ („Speichern...“ während Mutation) → Toast „Club erstellt“/„Club aktualisiert“.

### Submaske: „Court zuweisen“
**Öffnet via:** „Court hinzufügen“ im Tab Courts. Beschreibung: „Weisen Sie dem Club ‚{Name}‘ einen Court mit Monatskontingent zu.“
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Court | Select „Court auswählen...“ | ja | nur aktive, dem Club **noch nicht** zugewiesene Courts; Label „{Court} ({Standort})“. Hinweis bei leer: „Alle verfügbaren Courts sind bereits zugewiesen.“ |
| Monatskontingent (Stunden) | Number, min 0 / max 120 | ja | Default **40 h**; Hilfetext „= {Minuten} Minuten pro Monat“ |
- Fehler: „Bitte wählen Sie einen Court aus“; Duplikat (23505) → „Dieser Court ist bereits diesem Club zugewiesen“; Erfolg → „Court-Zuweisung erstellt“.

### Submaske: „Benutzer zu Club hinzufügen“
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Benutzer suchen | Text mit Live-Suche | ja | ab **2 Zeichen**, `ilike` auf `username`/`display_name`, max. **10** Treffer; Auswahl als Chip mit X |
| Rolle im Club | Select | ja | **Manager** / **Staff**; Default **Staff** |
- Fehler: „Bitte wählen Sie einen Benutzer aus“; Duplikat → „Dieser Benutzer ist bereits Mitglied dieses Clubs“; Erfolg → „Benutzer hinzugefügt“.

> **Code-Hinweis:** Konstante `WEEKDAYS` in der Datei ist ungenutzt (Altlast).

---

## Club Owners — `/admin/club-owners`
**Datei:** `src/pages/admin/AdminClubOwners.tsx` · **Zweck:** Einzelnen Benutzern mit der Rolle `club_owner` einen Court plus Monats-Freikontingent zuweisen (Legacy-Modell parallel zu „Clubs“).

### Hauptansicht
- H1 „Club Owners“, Untertitel „Verwalten Sie Club-Owner-Zuweisungen und Kontingente“ · Button **„Neue Zuweisung“**.
- **Suche:** „Suchen nach Name, Court oder Standort...“ (clientseitig über Name/Username/Court/Standort).
- **Card „Zuweisungen“** („{n} Zuweisung(en)“): Tabelle **Club Owner** (gelbes Badge „Club“ + Name/Username/ID-Kurzform) · **Court** · **Standort** · **Kontingent** („{h}h / Monat“) · **Erstellt** (`dd.MM.yyyy`) · **Löschen** (Trash2, **ohne Bestätigung**, Toast „Zuweisung gelöscht“).
- **Hilfe-Card „So richten Sie einen Club Owner ein:“** — 5 Schritte (Rolle `club_owner` unter „Benutzer“ vergeben → Zuweisung → Kontingent → Club Panel).

> **Bug-Hinweis:** Tabellen-Body rendert 7 Zellen pro Zeile bei nur 6 Header-Spalten (eine leere Zelle zu viel) — „Erstellt“ und Aktionen rutschen optisch eine Spalte nach rechts.
> **Code-Hinweis:** Konstante `WEEKDAYS_LEGACY` ungenutzt.

### Submaske: „Club Owner Zuweisung“
**Öffnet via:** „Neue Zuweisung“. Beschreibung: „Weisen Sie einem Club Owner einen Court zu und legen Sie das Kontingent fest.“
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Club Owner | Select „Benutzer auswählen...“ | ja | nur Profile mit Rolle `club_owner`; Hinweis bei leer: „Keine Benutzer mit der Rolle ‚club_owner‘ gefunden. Weisen Sie zuerst einem Benutzer die Rolle zu.“ |
| Court | Select „Court auswählen...“ | ja | **alle** aktiven Courts (auch bereits zugewiesene) |
| Monatskontingent (Stunden) | Number, min 0 / max 200 | ja | Default **40 h**; Hilfetext „= {Minuten} Minuten pro Monat“ |
- Aktionen: „Abbrechen“ · „Erstellen“ („Erstelle...“). Fehler „Bitte wählen Sie einen Benutzer und Court aus“; Erfolg „Zuweisung erfolgreich erstellt“.

---

## Events — `/admin/events`
**Datei:** `src/pages/admin/AdminEvents.tsx` · **Zweck:** Events anlegen, veröffentlichen, hervorheben, löschen und per DeepL ins Englische übersetzen — inkl. Artists, Brands und Highlights.

### Hauptansicht
- H1 „Events“, Untertitel „{n} veröffentlicht, {n} Entwürfe“.
- Button **„Alle übersetzen“** (nur wenn Events existieren): übersetzt sequenziell `title`, `description`, `price_label`, `highlights` je Event nach EN (Edge Function `translate-content`); Laufanzeige „Übersetze {done}/{total} …“; gesperrte/leere Felder werden übersprungen (idempotent); Abschluss-Toast „{n} Einträge übersetzt“.
- Button **„Neues Event“** → EventForm-Dialog.
- **Filter:** Suche „Suche nach Titel oder Stadt...“ + Select: **Alle Events** / **Veröffentlicht** / **Entwürfe**.
- **Event-Tabelle:** **Event** (48×48-Bild oder Calendar-Platzhalter; Titel, Stadt, Badge mit Event-Typ-Label) · **Standort** · **Datum** („dd. MMM yyyy“) · **Featured** (Switch, Toast „Featured-Status aktualisiert“) · **Status** (Switch `is_published` + Badge **„Live“**/„Entwurf“) · **Tickets** (Link „Link“ auf `ticket_url`, neuer Tab) · **Aktionen** (Edit → EventForm; Trash2 → „Event löschen?“).
- Zustände: „Laden...“ / „Keine Events gefunden“.

### Submaske: „Event löschen?“
Warntext: **„{Titel}“ wird unwiderruflich gelöscht.** Buttons „Abbrechen“ / „Löschen“ → Toast „Event gelöscht“.

### Submaske: „Neues Event erstellen“ / „Event bearbeiten“ (`EventForm`)
**Datei:** `src/components/admin/events/EventForm.tsx` (Dialog 3xl, scrollbar).
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Event-Bild | Upload (`image/*`) | nein | „Klicken zum Hochladen“; Storage `media/events/…`; Vorschau mit X-Button |
| Standort * | Select „Standort wählen“ | **ja** | **Auto-Fill beim Wechsel:** `venue_name` (nur wenn leer), Adresse, PLZ, Stadt aus Standortdaten |
| Event-Typ | Select | nein | Default `party`. Optionen: **Party / Social Event**, **Open-Play-Night**, **Turnier**, **Corporate Event**, **Workshop / Clinic**, **Season Opening**, **Pop-Up Event**, **Sonstiges** |
| Titel * | Text | **ja** | ohne Titel bleibt Speichern deaktiviert |
| Slug (auto-generiert) | Text, **readonly** | – | nur im Edit-Modus sichtbar |
| Venue / Location Name | Text | nein | „z.B. Padel Club Berlin“ |
| Beschreibung | Textarea | nein | — |
| Adresse / PLZ / Stadt | Text | nein | — |
| Startdatum / Enddatum | `datetime-local` | nein | als ISO gespeichert |
| Externer Ticket-Link (optional) | URL | nein | „Leer lassen = Buchung über die Plattform“; Hinweis: „Ohne Link wird das Event direkt über PADEL2GO gebucht (kein externer Anbieter).“ |
| Kapazität | Number | nein | leer → `null` |
| Preis-Anzeige | Text | nein | freies Label „z.B. €15 / Gratis für Members“ |
| **Highlights & Features** | `HighlightsInput` | nein | s. u. |
| **Artists & Performer** | `ArtistManager` | nein | s. u. |
| **Partner & Brands** | `BrandManager` | nein | s. u. |
| Featured Event | Switch | nein | „Wird als Haupt-Event auf der Events-Seite hervorgehoben“ |
| Veröffentlicht | Switch | nein | „Event wird im Frontend angezeigt“ |
- Submit „Event erstellen“/„Event aktualisieren“ — deaktiviert ohne Titel **und** Standort. Leere Textfelder → `null`; Artists/Brands werden beim Speichern **komplett gelöscht und neu eingefügt** (Einträge ohne Namen verworfen). Nach dem Speichern automatische DeepL-Übersetzung mit Ergebnis-Toasts (u. a. „DeepL nicht konfiguriert — …“).

#### Bereich „Highlights & Features“ (`HighlightsInput`)
- Gesetzte Highlights als Badges mit X · Eingabefeld „Eigenes Highlight hinzufügen...“ (Enter/Plus; Duplikate ignoriert) · „Vorschläge:“ max. 8 Chips aus: DJ, Live-Musik, Food Trucks, Bar & Drinks, Pro-Coaching, Turnier, Anfänger-freundlich, Networking, Gewinnspiele, Goodie Bags, After-Party, VIP Area.

#### Bereich „Artists & Performer“ (`ArtistManager`)
- Button „Artist hinzufügen“; pro Karte: Sortiergriff (nur visuell, **kein** Drag-and-Drop), **Artist-Bild** (Upload 64×64, `media/artists/…`), **Name*** (ohne Name wird verworfen), **Rolle** (Select: DJ [Default], Live Act, Host / Moderator, Trainer / Coach, Pro-Spieler, Influencer, Sonstige), **Instagram** („@username“), **Spotify** (URL), **Website**; Papierkorb entfernt sofort.

#### Bereich „Partner & Brands“ (`BrandManager`)
- Button „Brand hinzufügen“; pro Karte: **Logo** (Upload, weißer Hintergrund, `media/brands/…`), **Name***, **Typ** (Select: Sponsor [Default], Partner, Medienpartner, Equipment-Partner, Food & Drinks, Sonstige), **Website**, **Instagram**; Papierkorb entfernt sofort.

---

## Marketplace — `/admin/marketplace`
**Datei:** `src/pages/admin/AdminMarketplace.tsx` · **Zweck:** Zentrale Verwaltung aller Shop-Produkte inkl. Kategorien/Marken-Taxonomie, Umsatz-Analytics, Bestellabwicklung, Versand, Stornierungen/Erstattungen und Retouren.

### Hauptansicht

**Kopfbereich** — H1 „Marketplace Verwaltung“, Untertitel „Produkte, Kategorien und Marken verwalten“. Buttons:
| Button | Wirkung |
|---|---|
| „Kategorien“ (outline) | öffnet Submaske „Kategorien verwalten“ |
| „Marken“ (outline) | öffnet Submaske „Marken verwalten“ |
| „Alle übersetzen“ (outline) | übersetzt sequenziell alle Produkte (`name`, `subtitle`, `description`, `long_description`, `meta_title`, `meta_description`) und Kategorien (`name`) DE → EN via DeepL; Laufanzeige „Übersetze {done}/{total} …“; idempotent; Toast „{n} Einträge übersetzt“ |
| „Neues Produkt“ | öffnet Produkt-Dialog |

**Sektion „Umsätze & Analytics“** (Daten: Edge Function `admin-credits`, Action `marketplace_analytics`)
- 3 KPI-Karten: **„Umsatz (bezahlt)“** (EUR) · **„Bestellungen“** (Anzahl) · **„Eingelöste Punkte“**.
- Karte **„Empfehlungen (Referrals)“**: Tabelle Nutzer · Geworben · Punkte · Wert (€). Leerzustand „Noch keine Empfehlungen.“

**Filter-Karte:** Kategorie („Alle Kategorien“ + dynamisch) · Status („Alle“ / „Aktiv“ / „Inaktiv“).

**Karte „Produkte ({n})“**
| Spalte | Inhalt |
|---|---|
| Bild | 48×48 Thumbnail, Fallback Platzhalter-Icon |
| Name | Produktname; bei `is_featured` vorangestellter Stern |
| Kategorie | Badge: Katalog-Kategorie, sonst Legacy-Label („Courtbuchung“, „Equipment“, „Sonstiges“, „Events“) |
| Marke | Markenname → `partner_name` → „-“ |
| Preis | EUR, rechtsbündig |
| Status | Badge „Live“ / „Entwurf“ |
| Aktiv | Switch → sofort (Toast „Produkt aktiviert/deaktiviert“) |
| Aktionen | Stift = Bearbeiten (lädt Galerie nach) · Papierkorb = Löschbestätigung |

**Sektion „Bestellungen“**
- Button **„Belege exportieren (CSV)“**: liest `receipts` sortiert nach Belegnummer; semikolon-getrennte CSV mit BOM (deutsches Excel), Dateiname `p2g-belege-YYYY-MM-DD.csv`; Spalten `Belegnummer;Typ;Datum;Beschreibung;Brutto;Rabatt;Zahlbetrag;Netto;USt-Satz;USt-Betrag;Währung`. Ohne Daten: „Keine Belege vorhanden“.
- Darunter `MarketplaceOrdersSection` (siehe Submasken „Bestellungen & Versand“ und „Retouren & Widerrufe“).

### Submaske: „Neues Produkt erstellen“ / „Produkt bearbeiten“
**Öffnet via:** „Neues Produkt“ bzw. Stift-Icon. Dialog max. 2xl, scrollbar. „Alle Felder mit * sind Pflichtfelder.“

**Block „Per URL oder Datei ausfüllen (AI)“** — im Edit-Modus **„Per URL oder Datei neu generieren (AI)“**
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Produkt-URL | Text | nein | „https://… Produktseite (Hersteller oder Shop)“; Enter startet Import; Validierung `https?://`; Fehler „Bitte eine gültige Produkt-URL eingeben (https://…)“ |
| „Ausfüllen“ | Button | – | deaktiviert bei leer/laufend |
| Datei-Upload | `.pdf,.html,.htm` | nein | „Oder Produkt-Datei hochladen (PDF-Datenblatt / HTML-Seite):“; Fehler „Bitte eine PDF- oder HTML-Datei auswählen“ / „Datei zu groß (max. 15 MB)“ |
- **KI-Verhalten** (`generate-product-from-url`, erhält Kategorien-/Markennamen zum Matching): befüllt `name` (max. 80 Z.), `subtitle` (60), `description` (200), `long_description` (100–220 Wörter, eigenständig), `meta_title` (60), `meta_description` (155), Preis/UVP, Marke + Kategorie (Namens-Match), `product_identifier` (GTIN/EAN/SKU), Hersteller, Warnhinweise, Materialzusammensetzung, bis 10 Specs, bis 6 Bilder.
- **Erhalten bleibt:** manuell angefasster Slug; gesetztes Titelbild; gefüllte Galerie (wird nur befüllt, wenn leer — dann max. 5 Bilder). Leere KI-Werte überschreiben nichts.
- Hinweistexte: Erstellen „Zieht Name, Beschreibung, Specs, Preis, Marke & Bilder automatisch …“; Bearbeiten „Überschreibt die Felder mit den neuen Daten aus der Quelle (Slug, Titelbild und vorhandene Galerie bleiben erhalten …). Nichts wird gespeichert, bis du unten speicherst.“ Toast: „Produktdaten übernommen – bitte prüfen, Credits & Preis kontrollieren“.

**Felder des Produktformulars**
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Titelbild * | Upload (`image/*`) + URL-Feld | **ja** | 2:3-Vorschau; Hinweis „Empfohlenes Format: Hochformat 2:3 (z. B. 1200 × 1800 px) — Bilder werden im Shop in 2:3 zugeschnitten.“ + „Oder URL direkt eingeben:“; Storage `media/marketplace/` |
| Weitere Bilder (Galerie) | Multi-Upload | nein | 2:3-Kacheln; je Bild X = Entfernen, Pfeile = „Nach vorne“/„Nach hinten“; „Reihenfolge steuert die Galerie auf der Produktseite (Titelbild zuerst). Empfohlenes Format: Hochformat 2:3.“ |
| Name * | Text | **ja** | generiert Slug (solange nicht manuell bearbeitet) |
| Slug (URL) | Text | nein | slugifiziert; Vorschau `/marketplace/{slug}`; manuelles Bearbeiten friert Auto-Generierung ein |
| Untertitel | Text | nein | „Kurzer Zusatz, z.B. „Kontrolle & Power für Fortgeschrittene““ |
| Produktkategorie | Select | nein | „— keine —“ + Kategorien (inaktive mit „ (inaktiv)“) |
| Marke | Select | nein | „— keine —“ + Marken; Auswahl setzt „Marken-/Partner-Text“ |
| Preis (€) * | Number, min 0.01 | **ja** | Fehler bei ≤ 0: „Bitte gib einen gültigen Preis in Euro an“; intern Cent |
| UVP (€) | Number | nein | „Streichpreis“ |
| Punkte-Rabatt (max. Points) | Number, min 0 | nein | Default 0. „Fixer Betrag an Points, den jeder Käufer bei diesem Produkt als Rabatt einlösen kann … 0 = kein Punkterabatt.“ Bei > 0 €-Gegenwert-Anzeige (100 Points/€, genauer Wert laut P2G-Einstellung) |
| Kurzbeschreibung * | Textarea (2) | **ja** | „Kurze Beschreibung für Produktkarten...“ |
| Langbeschreibung | Textarea (4) | nein | — |
| Spezifikationen | dynamische Zeilen | nein | je Zeile „Merkmal (z.B. Gewicht)“ + „Wert (z.B. 365 g)“ + Papierkorb; Button „Merkmal hinzufügen“; leere Zeilen verworfen |
| Marken-/Partner-Text (Anzeige) | Text | nein | wird bei Markenwahl vorbelegt |
| Bestand (optional) | Number, min 0 | nein | leer = „Unbegrenzt“ |
| Sortierung | Number | nein | Default 0 |
| Status | Select | nein | „Live“ (Default) / „Entwurf“ |
| Featured (hervorheben) | Switch | nein | „Zeigt das Produkt prominent im Shop.“ |

**Untersektion „Produktsicherheit & Kennzeichnung (GPSR)“:** Hersteller Name / E-Mail / Anschrift · Hinweis „EU-Verantwortlicher: Nur nötig, wenn der Hersteller außerhalb der EU sitzt.“ · EU-Verantwortlicher Name / E-Mail / Anschrift · Produkt-ID / Charge · Warnhinweise (Textarea) · Materialzusammensetzung („Pflicht bei Textilien.“) · Lieferzeit min/max Werktage (Defaults **2**/**4**) · Grundpreis-Menge + -Einheit („Nur bei Ware nach Maß/Gewicht.“).

**Untersektion „SEO (optional)“:** Meta-Titel · Meta-Beschreibung.

**Fußzeile:** „Abbrechen“ · „Erstellen“/„Speichern“. Validierung: „Bitte fülle alle Pflichtfelder aus (Name, Beschreibung, Titelbild)“. Nach dem Speichern: Galerie-Sync + automatische EN-Übersetzung (fire-and-forget). Produkttyp immer `purchase`.

### Submaske: „Produkt löschen?“
Warntext: „Möchtest du „{Name}“ wirklich löschen? … Hat das Produkt bereits Bestellungen, wird es stattdessen nur deaktiviert – Bestellhistorie und Belege bleiben erhalten.“

### Submaske: „Kategorien verwalten“ (`CatalogManagerDialog`, kind=category)
„Produktkategorien für den Shop (z.B. Schläger, Bälle, Bekleidung).“
- **Neuer Eintrag** (Text, „z.B. Schläger“; Enter/Plus legt an; Slug auto; sofortige EN-Übersetzung des Namens) · je Zeile: Name + Slug, **Aktiv-Switch**, Stift (Inline-Edit mit Check/X, Enter speichert + Neuübersetzung), Papierkorb (`confirm` „„{Name}“ wirklich löschen?“). Leerzustand „Noch keine Einträge.“

### Submaske: „Marken verwalten“ (`CatalogManagerDialog`, kind=brand)
„Marken für die Produkte (z.B. Adidas, Babolat, Bullpadel). Klick auf den Kreis lädt ein Logo hoch — es erscheint auf den Produktkarten und der Produktseite.“
- Wie Kategorien, zusätzlich: **Logo-Kreis** (Klick = Upload/Ändern, Storage `media/marketplace/brand-logos/`; ohne Logo Bild-Plus-Icon) + Button **„Logo entfernen“** (nur bei gesetztem Logo). Markennamen werden **nicht** übersetzt (Eigennamen).

### Submaske: „Bestellungen & Versand“ (Inline, `MarketplaceOrdersSection`)
Titel + Badge „{n} offen“. **Filter** (Default „Offen (zu versenden)“): Offen · Versendet · Geliefert · Storniert / Erstattet · Alle.
| Spalte | Inhalt |
|---|---|
| Datum | `TT.MM.JJJJ` |
| Bestellnr. | `reference_code` oder ID-Kurzform |
| Kunde | Gastname bzw. „Konto-Nutzer“/„Gast“ + Gast-E-Mail |
| Produkt | Thumb 32×32 + Name + „Menge: {n}“ |
| Lieferadresse | Straße / PLZ Ort / Land oder „Keine Versandadresse“ |
| Bezahlt | EUR; bei Punkten „{n} P. eingelöst“ + „Stand: {vorher} → {nachher} P.“ |
| Status | Badge „Erstattet“ / „Storniert“ / „Offen“ / „Versendet“ / „Geliefert“; bei Sendungsnr. Zusatz „{Carrier} · {Nr.} · {Datum}“ |
| Aktionen | Status-Select (Offen/Versendet/Geliefert; bei erstattet deaktiviert) · Button „Stornieren“ (nur bezahlte) · Versandzeile |
- **Versandzeile** (nur bezahlt + offen + Adresse): Select Versanddienstleister (**DHL** [Default], DPD, GLS, Hermes, Andere) + Feld „Sendungsnummer“ + Button **„Versenden + Mail“** (deaktiviert ohne Nummer; markiert versendet **und** sendet Versandbestätigung; Toast „Als versendet markiert & Versandbestätigung gesendet“).
- **Bestätigungsdialog „Bestellung stornieren & erstatten?“:** dynamischer Text („{Produkt}“ ({Bestellnr.}) wird storniert. + „Der bezahlte Betrag **{Betrag}** wird über Stripe zurückerstattet.“ + „Eingelöste Punkte werden dem Konto gutgeschrieben.“ + „Der Lagerbestand wird zurückgebucht. Diese Aktion kann nicht rückgängig gemacht werden.“) → „Stornieren & erstatten“.

### Submaske: „Retouren & Widerrufe“ (Inline)
Badge „{n} offen“ (Status „Angemeldet“). Leerzustand „Keine Retouren vorhanden.“
| Spalte | Details |
|---|---|
| Datum | Anmeldedatum |
| Bestellung | Bestellnr. + Produkt + Gast-E-Mail |
| Grund | Kundentext oder „—“ |
| Status | Select: **Angemeldet** / **Ware eingegangen** / **Erstattet** / **Abgelehnt** (sofort gespeichert, Toast „Retoure aktualisiert“) |
| Interne Notiz | Inline-Text, speichert bei onBlur |
- Fußnote: „Erstattung wie gewohnt über den Stornieren-Button der Bestellung auslösen.“

---

## P2G Points — `/admin/p2g-points`
**Datei:** `src/pages/admin/AdminP2GPoints.tsx` · **Zweck:** Konfiguration des Punkte-Wechselkurses und der Payback-Raten sowie Verwaltung der Benutzer-Wallets und Expert Levels. (Tab-Zustand via URL-Param `?tab=`.)

**Tabs:** „Einstellungen“ (Default) · „Benutzer-Wallets“ · „Expert Levels“. *(Hinweis: `P2GDashboardTab`/`P2GMatchesSection` existieren im Ordner, sind aber nicht eingebunden.)*

### Tab „Einstellungen“ → Karte „P2G Punktewert“
Status-Badge „Aktiv“/„Inaktiv“; Beschreibung: „Wechselkurs für P2G Punkte als Zahlungsmittel beim Buchungs-Checkout.“
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Master-Schalter | Switch | – | `feature_credits_payment_enabled`, speichert sofort; Toast „Punkte-Zahlung aktiviert/deaktiviert“ |
| Punkte pro Euro | Number, min 1 | ja | Default **100**; „Wie viele P2G Punkte einem Euro entsprechen.“ |
| Max. Rabatt durch Punkte (%) | Number 1–100 | ja | Default **50**; „Wie viel Prozent des Buchungspreises maximal mit Punkten bezahlt werden kann.“ *(Hinweis: gilt seit 2026-08-03 nicht mehr für den Marketplace — dort zählt der fixe Punkte-Deckel pro Produkt.)* |
| Live-Berechnung | Anzeige | – | „100 Punkte = {Wert} €“ |
| „Einstellungen speichern“ | Button | – | Toast „Punktewert-Einstellungen gespeichert“ |

### Tab „Einstellungen“ → Karte „Payback pro Buchung“
„Feste Punkte-Rückvergütung je Buchungslänge — wird mit dem Expert-Level-Multiplikator multipliziert. Kein Payback bei Zahlung mit Gutscheincode.“
| Feld | Typ | Default |
|---|---|---|
| Payback für 60 Min (Punkte) | Number, min 0 | **100** |
| Payback für 90 Min (Punkte) | Number, min 0 | **150** |
| Payback für 120 Min (Punkte) | Number, min 0 | **200** |
- Live-Hinweis mit ×1,5-Beispiel + „Bei Stornierung wird das gutgeschriebene Payback automatisch zurückgebucht.“ Button „Payback-Raten speichern“.

### Tab „Benutzer-Wallets“ (`P2GWalletsTab`)
- **Karte „Benutzer-Wallets“** (links): Suche „Suchen nach Name, Username oder ID...“ (clientseitig); Tabelle Benutzer (Avatar + Name + @username/ID) · Reward · Play · Lifetime; Zeilenklick wählt aus.
- **Karte „Benutzer Details“** (rechts): Avatar + Name; Kacheln „Reward Credits“ + „Play Credits“; Buttons **„Hinzufügen“** / **„Abziehen“**; Abschnitt „Letzte Transaktionen“ (Delta mit Vorzeichen, Beschreibung, `TT.MM`; Leerzustand „Keine Transaktionen“).

#### Dialog „Credits hinzufügen“ / „Credits abziehen“ / „Credits auf Wert setzen“
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Modus | Umschalter | ja | „Anpassen (+/-)“ (Default) oder „Auf Wert setzen“ |
| Credit-Typ | Select | ja | „Reward Credits“ (Default) / „Play Credits“ |
| Betrag | Number | ja (Modus Anpassen) | > 0; bei „Abziehen“ negiert |
| Zielwert | Number | ja (Modus Setzen) | ≥ 0 |
| Lifetime Credits (optional) | Number | nein (nur Setzen) | „Unverändert lassen wenn leer“ |
| Grund | Textarea | **ja** | „Interner Vermerk...“; ohne Grund deaktiviert („Grund ist erforderlich“) |
- Backend: `admin-credits` Actions `adjust_credits` / `set_credits`. Toast „Credits erfolgreich angepasst“.

### Tab „Expert Levels“ (`P2GExpertLevelsTab`)
**Karte „Expert Levels verwalten“** — „Schwellenwerte, Multiplikator, Namen, Farben und Perks der Expert Levels konfigurieren“ · Button „Neues Level“.
- Tabelle: Nr. (`sort_order`) · Name · Von · Bis (∞ wenn leer) · × Mult. · Gradient (Farbbalken) · Emoji · Perks (Anzahl-Badge) · Aktion (Stift / Papierkorb mit `confirm` „Level „{Name}“ wirklich löschen?“).

#### Dialog „Neues Expert Level“ / „Expert Level bearbeiten“
Vorschau-Block (Gradient-Karte mit Emoji, Name, Punktebereich, erste 2 Perks + „+{n} weitere“).
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Name | Text | **ja** | ohne Namen Speichern deaktiviert |
| Emoji | Select | nein | 🌱 🎾 ⚡ 🔥 💎 👑 🏆 🌟 ✨ 🚀; Default neu: **✨** |
| Min Punkte | Number | ja | Default neu: höchster Max-Wert + 1 |
| Max Punkte | Number | nein | „∞ (leer lassen)“ → `null` |
| Payback-Multiplikator | Number, step 0.05, min 1 | ja | Default **1**; „z. B. 1,5 = +50% Punkte pro Buchung“ |
| Reihenfolge | Number | ja | Default: höchste + 1 |
| Gradient | Select | nein | Grau (Default) · Orange · Blau · Grün · Rot-Orange · Lila · Cyan-Violett · Gold |
| Beschreibung | Textarea | nein | — |
| Perks (einer pro Zeile) | Textarea (5, mono) | nein | Zähler „{n} Perks definiert“; leere Zeilen verworfen |

---

## Vouchers — `/admin/vouchers`
**Datei:** `src/pages/admin/AdminVouchers.tsx` · **Zweck:** Gutscheincodes (gratis / prozentual / Festbetrag) für Buchungen anlegen, limitieren, befristen und aktiv/inaktiv schalten.

### Hauptansicht
- H1 „Voucher Codes“, Untertitel „Gutscheincodes für kostenlose Buchungen verwalten“ · Button **„Neuer Voucher“** (setzt Formular zurück + **generiert automatisch einen Code**).
- **Tabelle** (nach `created_at` absteigend):
  | Spalte | Inhalt |
  |---|---|
  | Code | Monospace + Kopier-Button → Toast „Code kopiert!“ |
  | Beschreibung | oder „–“ |
  | Rabatt | Badge: „{n} %“ · „{x,xx} €“ · **„Gratis“** |
  | Status | **„Inaktiv“** (secondary) · **„Abgelaufen“** (destructive, `valid_until` überschritten) · **„Aufgebraucht“** (outline, `current_uses >= max_uses`) · **„Aktiv“** (grün) — Prüfreihenfolge exakt so |
  | Nutzungen | „{current_uses}/{max_uses oder ∞}“ |
  | Gültig bis | `dd.MM.yyyy HH:mm` oder „Unbegrenzt“ |
  | Aktionen | Switch (`is_active`, direkt) · Pencil → Edit-Dialog · Trash2 → „Voucher löschen?“ |
- Zustände: „Laden...“ / „Noch keine Voucher erstellt“.

### Submaske: „Voucher löschen?“
Warntext: **Der Code {CODE} wird unwiderruflich gelöscht.** → Toast „Voucher gelöscht“.

### Submaske: „Neuen Voucher erstellen“ / „Voucher bearbeiten“
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Code | Text + Button „Generieren“ | **ja** | auto-UPPERCASE; Generator: 8 Zeichen aus `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`crypto.getRandomValues`); Fehler „Code ist erforderlich“ |
| Beschreibung (optional) | Text | nein | „z.B. Promo-Aktion März“ |
| Rabatt-Typ | Select | ja | **Gratis (100 % Rabatt)** [Default] / **Prozentualer Rabatt** / **Festbetrag-Rabatt**; Wechsel leert den Wert |
| Rabatt in % | Number 1–99 | bei Typ „Prozentual“ | „(1–99, für 100 % → Typ ‚Gratis‘ wählen)“ |
| Rabatt in € | Number, min 0.50, step 0.01 | bei Typ „Festbetrag“ | „(wird vom Courtpreis abgezogen)“; gespeichert in **Cent** |
| Max. Nutzungen | Number min 1 + Button „Einmalig“ | nein | „Leer lassen für unbegrenzte Nutzungen.“; „Einmalig“ setzt 1 |
| Gültig ab | `datetime-local` | nein | leer → beim Anlegen = jetzt |
| Gültig bis (optional) | `datetime-local` | nein | leer → unbegrenzt |
| Aktiv | Switch | nein | Default **an** |
- Validierung: „Code ist erforderlich“ · „Rabattwert erforderlich“. Toasts „Voucher erstellt“/„Voucher aktualisiert“; Fehler mit Original-Meldung (z. B. doppelter Code).

---

## Location Teasers — `/admin/location-teasers`
**Datei:** `src/pages/admin/AdminLocationTeasers.tsx` · **Zweck:** Kommende Standorte („Bald bei dir“) auf der Homepage anlegen, sortieren, ein-/ausblenden und zweisprachig pflegen.

### Hauptansicht
- H1 „Location Teasers“, Untertitel „Kommende Standorte auf der Homepage verwalten“ · Button **„Neuer Teaser“**.
- **Liste** (inkl. inaktiver, sortiert nach `sort_order`): Vorschaubild 80×56 (oder Platzhalter) · Titel + „· {Stadt}“ · **Badge „Inaktiv“** (rot) bei `is_active = false` · erwartetes Datum (Freitext) · Stift-Button (Edit) + Papierkorb.
- **Löschen:** `confirm` **„Teaser wirklich löschen?“** → Toast „Teaser gelöscht“.
- Kein Filter/Suche/Drag-&-Drop (Sortierung nur über Zahlenfeld im Dialog). Leerzustand: „Noch keine Teaser vorhanden.“

### Submaske: „Neuer Teaser“ / „Teaser bearbeiten“
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Titel * | TranslatableField (Input) | Sternchen, aber **keine technische Validierung** | DeepL-Feld `title` |
| Stadt | TranslatableField (Input) | nein | leer → `NULL`; DeepL `city` |
| Beschreibung | TranslatableField (Textarea 3) | nein | DeepL `description` |
| Vereins-Website (URL) | Input | nein | „https://…“; keine URL-Validierung |
| Erwartetes Datum | TranslatableField (Input) | nein | **Freitext, kein Datepicker** — „z.B. Sommer 2026“; DeepL `expected_date` |
| Bild | Upload (`image/*`) | nein | Upload sofort beim Auswählen → `media/location-teasers/{uuid}.{ext}`; Vorschau; **keine Größen-/Formatprüfung** |
| Sortierung | Number | nein | Default **0** |
| Aktiv (auf Homepage sichtbar) | Switch | – | Default **an** |
- Speichern: „Teaser erstellt“/„Teaser aktualisiert“, danach DeepL-Lauf (`title`, `description`, `city`, `expected_date`).

---

## SkyPadel Galerie — `/admin/skypadel-gallery`
**Datei:** `src/pages/admin/AdminSkyPadelGallery.tsx` · **Zweck:** Bildergalerie der Seite „Für Vereine“ verwalten (Upload, Alt-Texte DE/EN, Reihenfolge, Aktiv-Status).

### Hauptansicht
- H1 „SkyPadel Galerie“, Untertitel „Bilder für die „Für Vereine“-Seite verwalten“ · Button **„Bilder hochladen“** (Mehrfachauswahl; sequenzieller Upload nach `media/skypadel-gallery/…`, `sort_order` = Max + 1; Toast „{n} Bild(er) hochgeladen“; **keine Größen-/MIME-Prüfung**).
- **Liste** (inkl. inaktiver, nach `sort_order`): GripVertical-Icon (**rein dekorativ — kein Drag & Drop**) · Thumbnail 112×80 · Alt-Text-Inline-Editor · **„Reihenfolge:“** (Number, speichert **onBlur**) · **„Aktiv:“** (Switch, sofort) · Papierkorb.
- **Löschen:** `confirm` **„Bild wirklich löschen?“** → Toast „Bild gelöscht“. **Datei bleibt im Storage.**

### Submaske: „Alt-Text“ (Inline-Editor `GalleryAltTextEditor`)
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Alt-Text (DE/EN + Sperre) | TranslatableField | nein | „Alt-Text (optional)“; leer → `NULL`; Sperre = `alt_text_en_locked` |
| Speichern | Button | – | **nur sichtbar bei Änderung** an DE/EN/Sperre |
- Nach Speichern: Update + DeepL-Lauf für `alt_text`.

---

## Partner-Kacheln — `/admin/partner-tiles`
**Datei:** `src/pages/admin/AdminPartnerTiles.tsx` · **Zweck:** Partner-Logos, Hintergrundfarben, Typ, Website, Region und zweisprachige Beschreibungen für die Partner-Kacheln der Homepage pflegen.

### Hauptansicht
- H1 „Partner-Kacheln“, Untertitel „Verwalte die Partner-Logos und Hintergrundfarben auf der Homepage.“
- **Liste** (inkl. inaktiver, nach `sort_order`); alle Felder speichern **sofort** (Ausnahme: Beschreibung):
| Element | Typ | Details |
|---|---|---|
| Logo-Vorschau | 80×80 | Hintergrund = `bg_color` (Fallback `#FFFFFF`) |
| Name / Slug | Nur-Text | hier **nicht editierbar** |
| Typ | Select (180 px) | **„Equipment-Partner“** (`equipment`) · **„Standortpartner“** (`local`) — sofort |
| Website-URL | Input `url` | speichert **onBlur**, nur bei Änderung; leer → `NULL` |
| Hintergrundfarbe | nativer Color-Picker | Default `#FFFFFF`; speichert bei jeder Änderung |
| „Sort:“ | Number (64 px) | speichert bei jeder Eingabe; ungültig → 0 |
| Aktiv | Switch | Toasts „Aktiviert“/„Deaktiviert“ |
| Logo-Upload | Button + Upload | `media/partner-tiles/{id}-{timestamp}.{ext}`, upsert; Toast „Logo hochgeladen“; **keine Größenbegrenzung** |
| Löschen | Papierkorb | `confirm` **„Partner wirklich löschen?“** |
- Untere Zeile: **„Region“** (Input, „z.B. Bamberg“, onBlur — **nur bei Typ Standortpartner**) + **„Beschreibung“** (Inline-Editor).

### Submaske: „Neuen Partner hinzufügen“ (Card oberhalb der Liste)
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Name | Input | **ja** | „z.B. Red Bull“ |
| Slug | Input | **ja** | „z.B. redbull“; **keine Auto-Slugifizierung, keine Eindeutigkeitsprüfung im UI** |
| Typ | Select | – | Equipment-Partner (Default) / Standortpartner |
- Validierung: „Name und Slug erforderlich“. Defaults: `bg_color = #FFFFFF`, `sort_order` = Max + 1. Toast „Partner hinzugefügt“.

### Submaske: „Beschreibung“ (Inline-Editor `PartnerDescriptionEditor`)
- TranslatableField (Textarea 3, DE/EN + Sperre), „Beschreibung des Partners…“; Speichern-Button **nur bei Änderung** sichtbar; danach DeepL-Lauf für `description`.

---

## Touchpoint Slides — `/admin/touchpoint-slides`
**Datei:** `src/pages/admin/AdminTouchpointSlides.tsx` · **Zweck:** Bilder und zweisprachige Texte für das Karussell „Wo deine Marke auf PADEL2GO trifft“ auf der Partner-Seite verwalten.

### Hauptansicht
- H1 „Partner Touchpoint Slides“, Untertitel „Bilder und Texte für das Karussell auf der Partner-Seite („Wo deine Marke auf PADEL2GO trifft“).“
- **Liste** (inkl. inaktiver, nach `sort_order`): **Bildbereich** 192×128 (Hover-Overlay „Bild“ → Upload nach `media/partner-touchpoints/…`, Toast „Bild hochgeladen“, **keine Größenprüfung**) · Text-Inline-Editor · **„Reihenfolge“** (Number, onBlur) · Switch mit Label **„Aktiv“/„Inaktiv“** · Papierkorb (`confirm` **„Slide wirklich löschen?“**).
- Leerzustand: „Noch keine Slides. Füge den ersten hinzu.“

### Submaske: „Neuer Slide“ (Card oberhalb der Liste)
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Titel | Input | **ja** | „Titel (z. B. Branding am Court)“; leer → Toast „Titel erforderlich“ |
| Beschreibung | Textarea (2) | nein | „Beschreibung (optional)“; leer → `NULL` |
- `sort_order` = Max + 1; kein Bild beim Anlegen. Toast „Slide hinzugefügt“ + DeepL-Lauf (`title`, `description`).

### Submaske: „Titel“ / „Beschreibung“ (Inline-Editor `TouchpointTextEditor`)
- Titel (TranslatableField Input, **DE-Pflicht** — leer → „Titel erforderlich“) + Beschreibung (TranslatableField Textarea 2). Speichern-Button **nur sichtbar bei Änderung** an einem der sechs Werte (Titel/Beschreibung je DE/EN/Sperre).

---

## QR-Panel — `/admin/qr-panel`
**Datei:** `src/pages/admin/AdminQrPanel.tsx` · **Zweck:** Sektionen, zweisprachige Texte und DE/EN-Downloads (PDF/Bild) der Visitenkarten-Landingpage `/qr` verwalten.

### Hauptansicht
- H1 „QR-Panel“, Untertitel: „Inhalte für die Visitenkarten-Landingpage /qr. Sektionen, Texte und PDFs verwalten. Änderungen sind sofort live.“ · Link **„Live-Seite öffnen“** (neuer Tab).
- Sektionsliste inkl. versteckter Sektionen, sortiert nach `sort_order`, dann `created_at`. Leerzustand: „Noch keine Sektion. Leg oben eine an.“

### Submaske: Neue Sektion anlegen (Leiste oben)
- Feld „Neue Sektion (z.B. 'Pressekit')“ (Pflicht; **Enter** legt an) + Button „Hinzufügen“. Automatik: Slug aus Titel (Umlaut-Ersetzung, max. 60 Zeichen, bei Kollision Suffix `-2`, `-3` …), `sort_order` = Max + 1. Toast „Sektion angelegt“.

### Submaske: „SectionEditor“ (eine Card pro Sektion)
**Kopfzeile:** Slug als Code-Chip (`/pressekit`) · Switch **„Sichtbar“/„Versteckt“** (sofort) · ChevronUp/Down „Nach oben“/„Nach unten“ (an den Enden deaktiviert; schreibt `sort_order` aller Sektionen neu) · Papierkorb (`confirm` **„Sektion „{Titel}“ wirklich löschen? Dateien werden mit entfernt.“** — löscht auch beide Storage-Dateien).

**Textfelder:** Titel (TranslatableField Input, „z.B. Für Vereine“) · Beschreibung (TranslatableField Textarea 3, „Worum geht es in dieser Sektion?“) · Button **„Texte speichern“** → Toast „Gespeichert“ + DeepL-Lauf (`title`, `description`).

**Datei-Uploads** — zwei Spalten mit Sprachbadge **DE** / **EN**:
| Zustand | Anzeige / Aktion |
|---|---|
| Keine Datei | gestrichelter Button **„PDF hochladen (max 25 MB)“** |
| Datei vorhanden | Kachel mit Dateiname (Tooltip = voller Name), Größe („x,y MB“ / „n KB“), **X** („Entfernen“); darunter Link **„Öffnen“** + Button **„Ersetzen“** |
- **Validierung:** max. **25 MB** („Datei ist zu groß (max. 25 MB).“); erlaubt **PDF, PNG, JPG, WEBP** („Nur PDF / PNG / JPG / WEBP erlaubt.“).
- Upload: `media/qr-panel/{slug}/{de|en}-{timestamp}.{ext}`, upsert; alte Datei wird danach gelöscht; Toast „Datei (DE/EN) hochgeladen“. Entfernen: `confirm` „Datei (DE/EN) wirklich entfernen?“ → Felder auf `NULL` + Storage-Löschung.

---

## News / Artikel — `/admin/news`
**Datei:** `src/pages/admin/AdminNews.tsx` · **Zweck:** Redaktionsverwaltung aller Artikel für /news, Startseite und Dashboard — inkl. KI-Generator, Sprach-Diktat, Autoren, Zweisprachigkeit (DE/EN) und Drag-&-Drop-Sortierung.

### Hauptansicht
- H1 „News / Artikel“, Untertitel „Artikel für /news, die Startseite und das Dashboard verwalten — Reihenfolge per Drag & Drop“.
- Buttons: **„Alle übersetzen“** (sequenziell `title`, `excerpt`, `body_html`, `title_highlight`, `lead`; „Übersetze {done}/{total} …“) · **„Neuer Artikel“**.

**Karte „Wochen-News-Generator (KI)“**
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Quelle 1–3 | Text (URL) | mind. 1 Quelle gesamt | „https://… (Quelle {n} – optional)“ |
| Quell-Dateien | Multi-Upload `.pdf,.html,.htm,.txt` | nein | Chips mit X; Fehler „Bitte nur PDF-, HTML- oder TXT-Dateien“ / „max. 15 MB“ / „Maximal 3 Quellen (URLs + Dateien) pro Durchlauf“ |
| Schreibstil | Select | nein | „Standard (kein eigener Stil)“ (Default) + gespeicherte Stile |
| „Schreibstile verwalten“ | Button | – | öffnet Schreibstil-Dialog |
| „Artikel generieren“ | Button | – | deaktiviert ohne Quelle; „Artikel werden generiert…“ |
- **KI-Verhalten** (`generate-news-from-urls`): pro Quelle ein **Entwurf** (`is_published: false`, `ai_generated: true`, `source_url` bei URLs) mit `title` (60), `title_highlight` (30, optional), `excerpt` (120), `lead` (280), `body_html`, `topic` (eines von 5, Fallback „Inside P2G“), `slug`, `reading_minutes`, `seo_title` (60), `seo_description` (155) + Auto-EN. Schreibstil steuert nur Ton/Satzbau/Struktur, nie Inhalte. Quelltexte < 300 Zeichen werden abgelehnt. Toasts: „{n} Artikel als Entwurf erstellt“ („Jetzt Titelbild hinterlegen und veröffentlichen.“) / „Fehlgeschlagen: {URL}“.

**Karte „Autoren“ (`AuthorManager`)** — „Erscheinen als „Geschrieben von“ auf der Artikelseite — Foto anklicken zum Hochladen.“
- Je Autor: **Foto** (Klick auf Avatar = Upload; bei verknüpftem Account gesperrt mit Tooltip „Profilbild kommt aus dem verknüpften Account …“) · **Name** (Inline, onBlur) · **Rolle** / **Rolle EN** (Inline) · **Löschen** (`confirm` „Autor „{Name}“ löschen? Artikel behalten dann keinen Autor.“). Neuanlage-Zeile: Name (Pflicht) + Rolle (optional) + „Anlegen“.

**Filterleiste:** Status-Chips „Alle“ / „Live“ / „Entwurf“ · Topic-Chips „Alle Topics“ + Inside P2G (#C7F011) · Events (#B06BFF) · Marketplace (#FF8A1F) · Community (#FF4D4D) · Business (#2FE0C0). Bei aktivem Filter: „Sortieren per Drag & Drop nur ohne aktive Filter“.

**Artikelliste** (Drag & Drop, nur ungefiltert; Toast „Reihenfolge gespeichert“): Greifer · 4:5-Cover · Titel (Flammen-Icon bei Highlight) · Topic-Badge · Badge „Übersetzt“ (wenn `title_en` + `body_html_en`) · Sichtbarkeit („Alle“ / „Nur eingeloggte Nutzer“ / „Nur Besucher“) · Likes/Views · **Live/Entwurf-Switch** (stempelt beim ersten Live-Schalten den Veröffentlichungszeitpunkt) · Übersetzen-Button · Stift · Papierkorb (`confirm` „Artikel wirklich löschen?“).

### Submaske: „Neuer Artikel“ / „Artikel bearbeiten“
Dialog 6xl; links Formular, rechts sticky **Live-Vorschau** (4:5-Card + Artikel-Kopf; im EN-Tab EN-Texte mit DE-Fallback).

**Block „Per Sprache diktieren (KI)“ (`VoiceInArticle`)**
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| „Aufnahme starten“ / „Stopp“ | Button | – | Web-Speech-API **de-DE**, kontinuierlich; Diktate werden angehängt; ohne Browser-Support deaktiviert |
| Transkript | Textarea (4) | mind. 10 Zeichen | auch manuell editierbar |
| „Artikel mit KI erstellen“ | Button | – | „Erstelle Artikel…“; Fehler „Bitte etwas mehr einsprechen oder eingeben (mind. 10 Zeichen).“ |
- Befüllt **nur** Titel (max. 80 Z.), Kurzbeschreibung, Inhalt (`body_html`, erlaubte Tags p/h3/ul/li/strong/em, serverseitig bereinigt); übrige Felder bleiben unverändert. Toast „Artikel-Entwurf erstellt — bitte prüfen und ggf. anpassen.“

**Sprach-Tabs „Deutsch“ / „English“** — EN-Hinweis: „Leere Felder zeigen … automatisch die deutsche Fassung. Von Hand geänderte Felder werden gesperrt …“
| Feld (DE) | Typ | Pflicht | Limit |
|---|---|---|---|
| Titel * | Text | **ja** | 60 Zeichen (Zähler rot bei Überschreitung); erzeugt Slug |
| Titel-Highlight | Text | nein | 30 — „Wird in der H1 in Topic-Farbe + kursiv angehängt.“ |
| Kurzbeschreibung (Vorschau) | Textarea (2) | nein | 120 |
| Lead (Einstiegsabsatz) | Textarea (3) | nein | 280 |
| Inhalt | Tiptap-Editor | nein | s. u. |
- EN-Tab: Title / Title-Highlight / Excerpt / Lead / Content (EN) — gleiche Limits, Platzhalter = deutsche Werte. **Sperr-Logik:** manuell geänderte EN-Felder erhalten `*_locked` und werden von der Auto-Übersetzung nicht mehr überschrieben; Leeren hebt die Sperre auf.

**Inhalts-Editor (`ArticleEditor`, Tiptap):** B (Fett) · I (Kursiv) · H2 · H3 · Aufzählung · Nummerierte Liste · **Link** (Prompt „Link-URL (leer lassen zum Entfernen):“; `rel="noopener noreferrer"`) · **Bild** (Upload `image/*` in den Artikel-Bildspeicher).

**Weitere Felder**
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Slug (URL) | Text | nein | Vorschau `/news/{slug}`; Slug-Konflikt = eigene Fehlermeldung |
| Quelle / Link (optional) | URL | nein | „Wird als „Zur Quelle“-Link unter dem Artikel angezeigt.“ |
| Titelbild (4:5 Hochformat, min. 1080×1350) | Upload | nein | Hinweis: wichtige Bildelemente in die obere Hälfte; Artikelseite nutzt Farb-Shader als Hero |
| Alt-Text (Barrierefreiheit) | Text | nein | — |
| Topic | Select | ja | Inside P2G (Default) · Events · Marketplace · Community · Business |
| Sichtbar für | Select | ja | Alle (Default) · Nur eingeloggte Nutzer · Nur Besucher |
| Autor | Select | nein | „Kein Autor“ (Default) + Autoren |
| Lesezeit (Minuten) | Number, min 1 | ja | Default **3**; Link „Vorschlag aus Wortzahl: {n} Min übernehmen“ (~200 Wörter/Min) |
| Standort-Verknüpfung | Select | nein | „Zeigt die Standort-Karte in der Artikel-Sidebar.“ |
| Highlight (obere Rail) + Position | Switch + Number | nein | Position nur bei aktivem Highlight |
| Veröffentlicht (für Nutzer sichtbar) | Switch | nein | Default aus |
- Aufklappbereiche: **„Call-to-Action im Artikel (optional)“** (CTA-Titel, CTA-Untertitel, Buttontext [Default „Court buchen“], Button-Link) · **„SEO (optional)“** (SEO-Titel, SEO-Beschreibung).
- Fußzeile: „Speichern“ (volle Breite); nach dem Speichern Auto-Übersetzung DE→EN. Toasts „Artikel erstellt“ / „Artikel aktualisiert“.

### Submaske: „Schreibstile für den KI-Generator“ (`WritingStyleManager`)
„Speichere eigene Texte oder Artikel als Stil-Vorlage. Die KI übernimmt daraus Tonalität, Satzbau und Struktur — nie Inhalte. …“
- **Übersicht:** je Stil Name + „{n} Zeichen Beispieltext“ · „Bearbeiten“ · Papierkorb (sofort, Toast „Schreibstil gelöscht“) · Button „Neuen Schreibstil anlegen“. Leerzustand: „Noch keine Schreibstile gespeichert. …“
- **Formular** („Zurück zur Übersicht“): **Name*** („z. B. „Locker & direkt“ oder „Sachlich / Pressestil““) · **Beispieltexte*** (Textarea 14 Zeilen; „mehrere Texte einfach durch Leerzeilen trennen“; Zähler „{n} Zeichen — die KI nutzt bis zu 8.000 Zeichen als Stil-Referenz.“). Aktionen „Abbrechen“ / „Stil anlegen“ bzw. „Speichern“.

---

## Farben (App & Web) — `/admin/farben`
**Datei:** `src/pages/admin/AdminColors.tsx` · **Zweck:** Zentrale Akzentfarbe („Farbwelt“) je App-/Website-Section setzen oder auf den Code-Standard zurücksetzen. Persistenz: `site_visuals.image_url` für Key `app.theme.{section}`.

### Hauptansicht
- H1 „Farben (App & Website)“; Beschreibung: Farbwelten pro Section steuern Shader-Hintergrund und alle Akzente — gilt zentral für App **und** Website (gleiche Datenbasis, wirkt sofort in beiden). „Standard“ setzt auf den Code-Standardwert zurück.
- **7 Zeilen** (eine Card je Section):
| Section-Key | Label | Standardfarbe |
|---|---|---|
| `home` | Mein P2G | `#C7F011` |
| `booking` | Buchen | `#2F7BFF` |
| `events` | Events | `#A855F7` |
| `news` | News | `#C7F011` |
| `market` | Marketplace | `#FF8A00` |
| `profile` | Profil | `#9AA3AE` |
| `admin` | Admin | `#F43F5E` |
- Fußnote: News nutzt intern zusätzlich das feste Topic-Farbsystem (bleibt im Code); „Profil“ und „Admin“ betreffen aktuell nur die App.

### Submaske: Farbzeile (inline, `SectionColorRow`)
| Feld / Aktion | Typ | Details |
|---|---|---|
| Farbkreis + Label + Hex | Anzeige | Kreis 40 px, Hex in Großbuchstaben |
| Swatch-Palette | 10 Farb-Buttons | `#C7F011` `#2F7BFF` `#A855F7` `#FF8A00` `#FF4D4D` `#2FE0C0` `#F43F5E` `#FACC15` `#22C55E` `#9AA3AE`; aktiver Wert mit weißem Ring; Klick speichert **sofort** |
| `#HEX` | Input (Monospace) | **Enter** übernimmt; führendes „#“ wird ergänzt |
| „Setzen“ | Button | Validierung `^#[0-9a-fA-F]{6}$` → sonst „Bitte gültigen Hex-Code angeben, z. B. #2F7BFF“ |
| „Standard“ | Button (RotateCcw) | setzt auf `NULL` → Code-Default; deaktiviert wenn bereits Standard; Tooltip „Standard: {Hex}“ |
- Toasts: „{Label}: Farbe gespeichert“ / „{Label}: zurückgesetzt auf Standard“. Kein Bestätigungsdialog.

---

## Benutzer — `/admin/users`
**Datei:** `src/pages/admin/AdminUsers.tsx` · **Zweck:** Vollständige Benutzerverwaltung: Accounts durchsuchen, Rollen vergeben, Detailprofil (Matches/Buchungen/Wallet) einsehen, Accounts endgültig löschen. (Der Detail-Dialog ist komplett inline implementiert; Backend = Edge Function `admin-credits`.)

### Hauptansicht
- H1 „Benutzer“, Untertitel „Vollständige Benutzerverwaltung“; rechts Gesamtzahl.
- **Suche:** „Suchen nach Name, Username oder ID...“ — **300 ms Debounce**, serverseitig (`admin-credits` → `list_all_users`) über **E-Mail**, `display_name`, `username`, **User-ID**.
- **Card „Benutzerliste ({total})“** — serverseitig paginiert, **25 pro Seite**:
  | Spalte | Inhalt |
  |---|---|
  | Benutzer | Avatar (Initialen-Fallback), Anzeigename oder „Unbekannt“, darunter E-Mail |
  | Username | „@{username}“ oder „-“ |
  | Credits | Coins-Icon + Summe `reward_credits + play_credits` |
  | Rollen | Badges: **Admin** · **Mod** · **🎾 Club** · **User** (wenn keine Rolle) |
  | Registriert | `dd.MM.yyyy` |
  | Aktionen | Eye → Detail-Dialog · **Rollen-Dropdown** · Trash2 → Lösch-Dialog |
- **Rollen-Dropdown** (ohne Bestätigungsabfrage, Toast „Rolle aktualisiert“): „Admin machen/entfernen“ · „Moderator machen/entfernen“ · „🎾 Club Owner machen/entfernen“.
- **Pagination:** „Seite {n}“ + „Zurück“/„Weiter“ (Weiter deaktiviert ohne `hasMore`).

### Submaske: Benutzer-Detail-Dialog (Titel = Avatar + „{Name} @{username}“)
**Öffnet via:** Eye-Button. Max. 4xl, scrollbar. Nachgeladen: bis 20 Matches, 20 Buchungen, 30 Ledger-Einträge, `skill_stats`, exakte Gesamtzahlen. **Alle Tabs rein lesend.**

**Tabs:** „Übersicht“ (Default) · „Matches“ · „Buchungen“ · „Wallet“

**Tab „Übersicht“:** 4 Kacheln (**Reward Credits**, **Play Credits**, **Matches**, **Buchungen**) · Card **„Profil-Informationen“** (User ID [8 Zeichen], Registriert `dd.MM.yyyy HH:mm`, Skill Level „{selbst}/10“ + Badge „AI: {skill_level}“, Alter, Referral Code, Lifetime Credits) · Card **„Verifizierungsstatus“** (E-Mail / Telefon / Profil vollständig — grüner Haken oder graues X) · Card **„Lieferadresse“** (nur wenn `shipping_address_line1` gesetzt: Straße, PLZ Ort, Land).

**Tab „Matches“:** letzte 20 — „Match #{8 Zeichen}“, Zeitstempel; rechts Badge **WIN**/**LOSS**, „AI: {score}“, „+{credits_awarded}“.

**Tab „Buchungen“:** letzte 20 — „{Court} @ {Standort}“, Zeitraum; rechts Preis „{x.xx} €“ + Status-Badge (**Bestätigt** = confirmed/completed, **Storniert**, **Ausstehend** = pending/pending_payment, sonst Rohstatus).

**Tab „Wallet“:** 3 Kacheln (**Reward Credits**, **Play Credits**, **Lifetime**) · Card **„Transaktionshistorie“** (bis 30 Ledger-Einträge: TrendingUp/Down, Beschreibung bzw. `entry_type`, Zeitstempel + `credit_type`-Badge, Delta mit Vorzeichen, „→ {balance_after}“).

**Fußzeile:** **„Benutzer löschen“** (destruktiv) · „Schließen“.

### Submaske: „Benutzer endgültig löschen?“
**Öffnet via:** Trash2 in der Liste oder „Benutzer löschen“ im Detail-Dialog.
- Text: „Du bist dabei, den Benutzer **{Name}** zu löschen.“ · Warnung: **„Diese Aktion ist unwiderruflich! Folgende Daten werden gelöscht:“** — Profil/Kontodaten, Wallet + Credits, Buchungen + Zahlungen, Matches + Analysen, Rewards + Transaktionen, Benachrichtigungen + Streaks.
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Bestätigungstext | Text | **ja** | „Gib **DELETE** ein, um zu bestätigen:“ — exakter Vergleich, case-sensitiv |
- Buttons: „Abbrechen“ · **„Endgültig löschen“** (deaktiviert bis exakt `DELETE`; „Lösche...“ während Ausführung). Backend: `admin-credits` Action `delete_user` mit `confirmPhrase`. Toasts „Benutzer erfolgreich gelöscht“ / Fehler.

---

## Mitteilungen — `/admin/notifications`
**Datei:** `src/pages/admin/AdminNotifications.tsx` · **Zweck:** In-App-Broadcasts an alle oder ausgewählte Benutzer senden, bearbeiten und löschen. (Backend: Edge Function `admin-notifications-api`.)

### Hauptansicht
- H1 „Mitteilungen“, Untertitel „Sende individuelle Mitteilungen an Benutzer“; zweispaltig.
- **Card „Gesendete Mitteilungen“** („Verlauf der letzten 50 Mitteilungen“): Tabelle **Datum** (`dd.MM.yy HH:mm`) · **Titel** (gekürzt) · **Empfänger** (Badge **„Alle ({n})“** bzw. **„{n} User“**) · **Läuft ab** (rot + „ (abgelaufen)“ bei Vergangenheit; sonst „—“; abgelaufene Zeilen gedimmt) · **Aktionen** (Stift/Papierkorb).

### Submaske: „Neue Mitteilung erstellen“ (Inline-Formular, linke Card)
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Titel * | Input | **ja** | „z.B. Neues Event in deiner Nähe!“ |
| Nachricht * | Textarea (4) | **ja** | „Schreibe hier deine Nachricht…“ |
| Empfänger | RadioGroup | – | **„Alle Benutzer ({n})“** (Default) · **„Bestimmte Benutzer“** |
| Benutzerauswahl | Combobox | ja (mind. 1, bei „Bestimmte“) | „Benutzer auswählen…“; Suche „Suche nach Name oder Username…“; max. **20** Treffer; Auswahl als Badges mit X |
| Zeitlich begrenzt anzeigen | Checkbox | nein | — |
| Läuft ab am | `datetime-local` | ja, wenn Checkbox aktiv | `min` = jetzt |
| CTA-Button hinzufügen | Checkbox | nein | — |
| Button-Text / Button-URL | Input | ja, wenn CTA aktiv | „z.B. Jetzt Tickets sichern“ / „https://…“ (keine URL-Validierung) |
| „Mitteilung senden“ | Button | – | „Wird gesendet...“ während Versand |
- Validierungs-Toasts: „Bitte Titel und Nachricht ausfüllen“ · „Bitte mindestens einen Benutzer auswählen“ · „Bitte Button-Text und URL ausfüllen“ · „Bitte Ablaufdatum auswählen“. Erfolg: **„Mitteilung an {n} Benutzer gesendet“**.

### Submaske: „Mitteilung bearbeiten“ (Dialog)
- Beschreibung: **„Änderungen werden für alle Empfänger sichtbar“**. Felder wie oben (vorbefüllt), aber: **Empfängerkreis nicht änderbar**; „Läuft ab am“ ohne `min` (Vergangenheit möglich); keine Pflicht-Prüfung. Buttons „Abbrechen“/„Speichern“. Toast „Mitteilung aktualisiert“.

### Submaske: „Mitteilung löschen?“
- Warntext: „Diese Mitteilung wird für alle **{n}** Empfänger unwiderruflich gelöscht.“ → Toast „Mitteilung gelöscht“.

---

## Newsletter — `/admin/newsletter`
**Datei:** `src/pages/admin/AdminNewsletter.tsx` · **Zweck:** Newsletter aus Inhaltsblöcken komponieren, live als E-Mail vorschauen, testen und an alle bestätigten Abonnenten versenden — inkl. Kampagnenverlauf.

### Hauptansicht
- H1 „Newsletter“, Untertitel „Komponiere den PADEL2GO-Newsletter und versende ihn an bestätigte Abonnenten.“ · Button **„Neuer Entwurf“** (leert Betreff, Preheader, Blöcke, Kampagnenbindung).
- **3 KPI-Karten:** „Bestätigte Abonnenten“ (grün) · „Ausstehende Bestätigung“ (amber) · „Abgemeldet“ (rot).

**Karte „Inhalt“** — „Bestehenden Entwurf bearbeiten“ / „Neuen Entwurf komponieren“
| Feld | Typ | Pflicht | Details |
|---|---|---|---|
| Betreff | Text | **ja** | ohne Betreff: „Bitte einen Betreff eingeben“ |
| Vorschautext (Preheader) | Text | nein | „Kurzer Text, der in der Inbox-Vorschau erscheint“; unsichtbarer Preheader im HTML |
| Blöcke | Liste | nein | Leerzustand „Noch keine Blöcke — füge unten Inhalte hinzu.“ |
- **Block-Leiste:** „Überschrift“ · „Text“ · „Bild“ · „Button“ (hängt je einen leeren Block an).
- **Jeder Block:** Typ-Badge + Pfeil-hoch/-runter (verschieben; an den Enden deaktiviert) + Papierkorb (sofort).
  - **Überschrift:** 1 Textfeld — rendert als H2 in Lime #C7F011, 20 px, fett.
  - **Text:** Textarea „Textabsatz… (Zeilenumbrüche bleiben erhalten)“ — Umbrüche als `<br>`, HTML escaped.
  - **Bild:** Upload-Fläche „Bild hochladen“/„Bild ersetzen“ (Storage `media/newsletter/…`) + „Alt-Text (optional)“ — volle Breite, 12 px Radius.
  - **Button:** „Button-Text“ + „https://…“ — rendert als zentrierte Lime-Pille.

**Karte „Live-Vorschau“** — „So sieht der Newsletter im Postfach aus“: gerendertes HTML im sandboxed iframe (PADEL2GO-Header, Inhalt, Footer mit Impressum + „Abmelden“).

**Aktions-Karte** (Doppelklick-Guard über alle drei):
| Button | Wirkung |
|---|---|
| „Entwurf speichern“ | legt an/aktualisiert; Toast „Entwurf gespeichert“ |
| „Test an mich“ | speichert, sendet Testmail an Admin-Adresse (Betreff-Präfix `[TEST]`); Toast „Test-Mail an {E-Mail} verschickt“ |
| „An alle senden“ | speichert, dann `confirm` **„Newsletter jetzt an ALLE bestätigten Abonnenten senden?“** → Batch-Versand. Serverseitig abgelehnt: „Kampagne wurde bereits gesendet“ / „Versand läuft bereits“ |

**Karte „Verlauf“** — letzte 20 Kampagnen: Betreff (oder „(kein Betreff)“) · „{gesendet}/{Empfänger} gesendet“ + „· {n} fehlgeschlagen“ + Versandzeitpunkt · Status-Badge (`draft` grau, `sending` amber, `sent` grün, `failed` rot) · **„Zurücksetzen“** (nur bei `sending` → zurück auf `draft`) · **„Bearbeiten“** (nur bei `draft`, lädt in den Editor).

---

## Analytics — `/admin/analytics`
**Datei:** `src/pages/admin/AdminAnalytics.tsx` · **Zweck:** Vier feste Auswertungs-Charts zu Buchungen und Nutzerwachstum. **Keine Filter, keine Zeitraumwahl, keine Exporte, keine Submasken** — reine Lese-Ansicht.

| Card | Charttyp | Inhalt |
|---|---|---|
| **Buchungen (letzte 7 Tage)** | Balken | X = Wochentagskürzel (letzte 7 Tage inkl. heute), Y = Anzahl Buchungen (**alle Status**), Lime-Balken |
| **Buchungen nach Status** | Donut | 3 Segmente mit Beschriftung „Name: Wert“: **Bestätigt** (Lime) · **Ausstehend** (Grau) · **Storniert** (Rot) |
| **Buchungen pro Standort** | Balken horizontal | Y = Standortnamen (Präfix „PADEL2GO “ entfernt), X = **nur bestätigte** Buchungen |
| **Neue Benutzer pro Woche** | Linie | 4 Wochen-Buckets, Label „KW {n}“; neue Profile je Fenster |

---

## Visuals — `/admin/visuals`
**Datei:** `src/pages/admin/AdminVisuals.tsx` · **Zweck:** Alle zentral hinterlegten Website-Bilder und Video-Slots hochladen, per Link setzen oder auf den Placeholder zurücksetzen.

### Hauptansicht
- H1 „Website Visuals“, Untertitel „Verwalte alle Bilder auf der Website. Lade neue Bilder hoch oder setze sie auf den Placeholder zurück.“
- **Gruppierung:** eine Card je `category` aus `site_visuals` (dynamisch, z. B. „Homepage“, „Homepage – Zielgruppen“, „Für Vereine – KI-Kamera“, „Für Spieler – Hero“, „Team“ …). **Ausgeschlossen:** Keys mit Präfix `app.theme.` (→ Seite „Farben“).
- **Kachel** (Raster bis 4 Spalten): quadratische Vorschau (`image_url`, sonst `placeholder_url`) · **Status-Badge** oben rechts: **„Aktiv“** (Häkchen, Primary) bei gesetztem Bild, sonst **„Placeholder“** (grau) · Label · Größenhinweis (enthält die Beschreibung „Empfohlene Größe:“, wird die Maßangabe als eigenes Chip hervorgehoben).
- **Video-Sonderfall** (Key enthält `.video`): schwarzes Panel mit Video-Icon + hinterlegter URL statt Bild.

### Submaske: Kachel-Aktionen — Bild-Modus
| Aktion | Details |
|---|---|
| **„Hochladen“ / „Ersetzen“** | Upload nach `media/visuals/{key}_{timestamp}.{ext}`, upsert; setzt `image_url`. Toasts „Bild erfolgreich hochgeladen“ / Fehler. **Keine Größen-/Formatprüfung** |
| **Zurücksetzen** (Papierkorb, nur bei gesetztem Bild) | setzt `image_url` auf `NULL` → Placeholder. **Ohne Rückfrage.** Toast „Bild zurückgesetzt“ |

### Submaske: Kachel-Aktionen — Video-Modus
| Feld / Aktion | Details |
|---|---|
| Hinweiszeile | „Link (YouTube, Vimeo, .mp4-URL)“ |
| URL-Feld + „OK“ | „https://youtu.be/…“; speichert in `image_url` (leer → `NULL`); keine Formatvalidierung |
| Trenner „oder“ + **„Video hochladen (.mp4, .webm)“** | Upload `video/*`; „Wird hochgeladen…“ |
| Zurücksetzen | nur bei gesetztem Wert; ohne Bestätigung |

---

## Integrationen — `/admin/integrations`
**Datei:** `src/pages/admin/AdminIntegrations.tsx` · **Zweck:** API-Schlüssel und Konfiguration aller externen Dienste verwalten.

### Hauptansicht / Maskierungsverhalten (zentral)
- H1 „Integrationen“, Untertitel: „… Geheime Schlüssel werden serverseitig gespeichert und sind nach dem Speichern im Browser nicht mehr lesbar.“
- **Status-Badge je Card:** **„Verbunden“** (grün) / **„Nicht konfiguriert“** (rot).
- Lesen nur über RPC `get_integration_configs_masked` — Secrets kommen als **„••••“ + letzte 4 Zeichen**; direktes SELECT nicht erlaubt.
- **Geheime Felder werden nie vorbefüllt** (leer = „nicht ändern“); nur öffentliche Werte (Publishable Key, Absender-E-Mail, App-URL, Modus) sind vorbefüllt.
- **Speicherlogik:** leere/maskierte Werte werden übersprungen; nicht neu eingegebene Secrets **gehen beim Speichern verloren** (voller Upsert) → Warn-Toast **„Geheime Felder wurden entfernt“** mit Feldliste. Nichts geändert → Info-Toast **„Keine Änderungen“**. Erfolg → „Gespeichert“.
- **SecretInput:** Passwortfeld mit Augen-Toggle; Placeholder **„Beim Speichern neu eingeben“**.

### Card „Stripe“ — „Zahlungsabwicklung für Courtbuchungen“ (Verbunden = Secret **und** Webhook-Secret gesetzt)
| Feld | Typ | Details |
|---|---|---|
| Secret Key | SecretInput | Hinweis wenn hinterlegt: „Schlüssel hinterlegt — beim Speichern neu eingeben, sonst wird er entfernt“; sonst „sk_live_… oder sk_test_…“ |
| Webhook Secret | SecretInput | „whsec_…“ |
| Publishable Key (öffentlich) | Input | „pk_live_… oder pk_test_…“; vorbefüllt |
| Modus | Select | **„Test (Testmodus)“** (Default) · **„Live (Echtbetrieb)“** |

### Card „Resend“ — „Buchungsbestätigungen, Einladungen und Kontaktmails“
- **API Key** (SecretInput, „re_…“) · **Absender-E-Mail** (E-Mail, vorbefüllt; Hinweis: Versand läuft zentral über **info@padel2go-official.de**, nur API-Key eintragen genügt).

### Card „App-Konfiguration“ — „Basis-URL und allgemeine Einstellungen“
- **App URL** (URL, vorbefüllt; „Wird für Weiterleitungen nach der Zahlung und in E-Mails verwendet.“).

### Card „Anthropic (KI)“ — „KI-Texterstellung für News-Artikel (Voice-In im News-Editor)“
- **API Key** (SecretInput, „sk-ant-…“).

### Card „DeepL“ — „Automatische DE→EN Übersetzung von Admin-Inhalten (Partner-Tiles, Vereine, Galerie, Touchpoints)“
- **API Key** (SecretInput; Hinweis „…:fx (Free) oder ohne :fx (Pro)“) + Erläuterungstext zur Auto-Übersetzung beim Speichern.

### Card „PayPal“ — „Alternative Zahlungsmethode“ (**deaktiviert**, 60 % Deckkraft)
- Badge **„Demnächst verfügbar“**; Client ID / Client Secret (Placeholder „Noch nicht verfügbar“), Modus-Select `disabled` (Sandbox/Live), Speichern-Button `disabled`.

### Abschluss-Card „Sicherheitshinweis“
- Zwei Absätze: Secrets serverseitig, nur maskierte Vorschau, beim erneuten Speichern neu eingeben; alternativ **Supabase Edge Function Secrets** (haben Vorrang).

---

## Features — `/admin/features`
**Datei:** `src/pages/admin/AdminFeatures.tsx` · **Zweck:** Launch-Datum, Court-Sichtbarkeit, den 3-Stufen-Status aller sieben App-Features sowie die Credits-als-Zahlungsmittel-Regeln steuern. Alle Werte in `site_settings` (id = `global`).

### Card „Launch-Datum“
- Beschreibung: „Treibt den Countdown auf der Startseite und alle „Coming Soon“-Placeholder …“
- Feld **„Datum & Uhrzeit“** (`datetime-local`, Pflicht — leer → „Bitte ein Launch-Datum wählen“) + „Speichern“ → Toast **„Launch-Datum gespeichert – gilt für Countdown & alle Placeholder“**.

### Card „Courts für User sichtbar“ (Sonder-Toggle, farbiger Rahmen grün/blau)
- Badge **„Sichtbar“** (grün) / **„Nur Admins“** (blau); dynamischer Text (aktiv: „… sichtbar und buchbar.“; inaktiv: „Nur Admins sehen die buchbaren Courts. User und Besucher sehen … ein „Bald verfügbar“. …“) · Switch → `feature_courts_public_enabled`. Toasts: „Feature aktiviert – jetzt für alle User sichtbar“ / „Feature deaktiviert – Coming Soon Overlay wird angezeigt“.

### Die 7 Feature-Karten
| # | Titel | Beschreibung | Route | DB-Spalte |
|---|---|---|---|---|
| 1 | **Lobbies** | „Spontane Spielrunden erstellen und beitreten. …“ | `/lobbies` | `feature_lobbies_state` |
| 2 | **Liga** | „Rangliste und Spieler-Statistiken. …“ | `/dashboard/league` | `feature_league_state` |
| 3 | **Events** | „Padel-Events mit DJ, Food & Community. …“ | `/dashboard/events` | `feature_events_state` |
| 4 | **Matching** | „KI-gestütztes Spieler-Matching nach Level und Verfügbarkeit.“ | `/dashboard/matching` | `feature_matching_state` |
| 5 | **P2G-Punkte** | „Sammle P2G-Punkte durch Buchungen und KI-Matches. …“ | `/dashboard/p2g-points` | `feature_p2g_state` |
| 6 | **Marktplatz** | „Exklusiver Shop für Mitglieder. …“ | `/marketplace` | `feature_marketplace_state` |
| 7 | **Freunde** | „Freunde einladen, Freundeslisten verwalten und gemeinsam spielen.“ | `/dashboard/friends` | `feature_friends_state` |
- Je Karte: Status-Badge **„Live“** (grün, `visible`) / **„Demo“** (bernstein, `demo`) / **„Aus“** (grau, `hidden`) · Route-Anzeige · **Select mit genau 3 Optionen:** „Für alle sichtbar“ / „Demo (nur Admin)“ / „Aus“ (Default bei fehlendem DB-Wert: `hidden`). Toasts je Zustand.

### Card „Credits als Zahlungsmittel“
- Beschreibung: „Spieler können P2G Credits beim Checkout einlösen, um einen Teil der Buchung zu bezahlen.“
| Feld | Typ | Details |
|---|---|---|
| Aktivierung | Switch | `feature_credits_payment_enabled`, speichert **sofort** (separat vom Speichern-Button). Toasts „Credits-Zahlung aktiviert/deaktiviert“ |
| Max. Rabatt durch Credits (%) | Number 1–100 | Default **50**; „…(z.B. 50 = max. 50%)“ *(gilt seit 2026-08-03 nicht mehr für Marketplace-Produkte — dort fixer Punkte-Deckel pro Produkt)* |
| Credits pro Euro | Number, min 1 | Default **100**; „(z.B. 100 = 100 Credits = 1 €)“ |
| „Einstellungen speichern“ | Button | speichert `credits_payment_max_percent` + `credits_per_euro` |

### Info-Card „Wie funktionieren die 3 Zustände?“
- „**Für alle sichtbar**: Nav-Link und Route für jeden eingeloggten User. **Demo (nur Admin)**: existieren, aber nur Admins sehen sie. **Aus**: Nav-Link verborgen, Route leitet weg (auch für Admins).“

---

## Einstellungen — `/admin/settings`
**Datei:** `src/pages/admin/AdminSettings.tsx` · **Zweck:** PIN-Sperren der B2B-Seiten schalten; die übrigen Karten sind **reine UI-Attrappen ohne Backend-Anbindung**.

### Card „Inhalts-Sperre“ — **einzige persistierte Sektion**
Beschreibung: „B2B-Seiten für nicht autorisierte Besucher sperren (PIN erforderlich)“.
| Feld | Typ | Details |
|---|---|---|
| Sperre für „Für Vereine“ | Switch | „PIN-Eingabe für /fuer-vereine erforderlich“; `site_settings.pin_lock_vereine`, **Fallback `true`** |
| Sperre für „Für Partner“ | Switch | „PIN-Eingabe für /fuer-partner erforderlich“; `pin_lock_partner`, **Fallback `true`** |
- **Beim Aktivieren** wird zusätzlich `pin_lock_*_activated_at` = jetzt gesetzt → **alle bisherigen Entsperrungen werden ungültig**. Toasts: **„Sperre aktiviert – alle bisherigen Entsperrungen wurden ungültig“** / „Sperre deaktiviert“.

### Card „Allgemeine Einstellungen“ — **nur UI-Platzhalter, keine Persistenz**
- „App Name“ (defaultValue „PADEL2GO“ — kein State/Speichern) · „Standard Zeitzone“ (Europe/Berlin, zusätzlich `disabled`) · „Wartungsmodus“ (Switch ohne Handler).

### Card „Benachrichtigungen“ — **nur UI-Platzhalter, keine Persistenz**
- Switches „Buchungsbestätigungen“, „Stornierungsbenachrichtigungen“, „Admin-Benachrichtigungen“ (alle `defaultChecked`, ohne Wirkung).

### Card „Sicherheit“ — **nur UI-Platzhalter, keine Persistenz**
- Switches „Zwei-Faktor-Authentifizierung“ (aus) und „Session-Timeout“ (`defaultChecked`) — ohne Wirkung.
