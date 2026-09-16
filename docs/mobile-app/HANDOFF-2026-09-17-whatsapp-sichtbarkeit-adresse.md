# HANDOFF Mobile-App — WhatsApp-Gruppen, Sichtbarkeits-System, Adresse, Kalender (Stand 17.09.2026)

Kontext: Expo/React-Native-App, gleiches Supabase-Projekt und gleicher Anon-Key wie die Website
(Grundsetup siehe `HANDOFF-ios-expo-app.md`, Sichtbarkeits-Grundlagen in `BACKEND-VISIBILITY-CONFIG.md`,
die §2 und §4 dort sind durch dieses Dokument **überholt**).

Der folgende Block ist als Prompt für Claude Code im App-Repo gedacht — 1:1 einfügen.

---

```
Du arbeitest im Repo der PADEL2GO Mobile-App (Expo / React Native, Supabase-Client mit Anon-Key,
gleiches Projekt wie die Website). Das Web-Backend hat sich am 16./17.09.2026 in vier Punkten
geändert. Baue alle vier in die App ein. Lies zuerst die betroffenen Screens/Hooks, ändere dann
minimal-invasiv, keine spekulativen Erweiterungen. Am Ende: Typecheck, Lint, App im Simulator
gegen die Live-Daten prüfen (Checkliste unten).

═══════════════════════════════════════════════════════════════════════════
1. WHATSAPP-GRUPPE PRO STANDORT
═══════════════════════════════════════════════════════════════════════════

Backend (bereits live):
  locations.whatsapp_group_url        text, nullable   — buchbare Standorte
  location_teasers.whatsapp_group_url text, nullable   — „Bald bei dir“-Teaser
Beide Spalten sind über den Anon-Key lesbar (RLS unverändert: locations nur is_online=true bzw.
Admin; teasers nur is_active=true). Ein Wert ist ein Einladungslink (https://chat.whatsapp.com/…),
NULL/leer heißt: keine Gruppe, nichts anzeigen.

Einbauen:
  a) Standort-Kachel (Liste der buchbaren Standorte): kompakter WhatsApp-Button (Icon, 32×32,
     WhatsApp-Grün #25D366 als Rahmen/Icon auf dunklem Grund) neben dem „Auswählen“/Weiter-Button.
     Öffnet den Link extern (Linking.openURL). Nur rendern, wenn whatsapp_group_url gesetzt ist.
  b) Erste Buchungsmaske (Standort gewählt, Slot-Auswahl): direkt unter dem Standort-Header ein
     Hinweis-Element:
        Titel:  „Spielpartner gesucht?“
        Text:   „Tritt der PADEL2GO-WhatsApp-Gruppe für {Standortname} bei — Updates,
                 Mitspieler & spontane Matches.“
        Button: „Gruppe beitreten“ (WhatsApp-Icon)
     Sichtbar unabhängig von Login/Slot-Status, nur wenn Link gesetzt.
  c) Falls die App die Homepage-Teaser („Bald bei dir“) zeigt: dort ebenfalls ein Button
     „WhatsApp-Gruppe beitreten“ neben „Zum Verein“ (club_url).
  d) Texte in beiden Sprachen (de/en): „WhatsApp-Gruppe beitreten“ / „Join WhatsApp group“,
     „Spielpartner gesucht?“ / „Need a buddy?“, „Gruppe beitreten“ / „Join group“.

Beim Laden der Standorte `select('*')` beibehalten oder `whatsapp_group_url` in die Spaltenliste
aufnehmen. Kein Fallback auf eine globale Nummer — die Standort-Gruppe ist das einzige Ziel.

═══════════════════════════════════════════════════════════════════════════
2. SICHTBARKEITS-SYSTEM — EIN MODELL FÜR ALLES (ersetzt §2 und §4 des alten Specs)
═══════════════════════════════════════════════════════════════════════════

Quelle: site_settings, eine Zeile, id = 'global', mit dem Anon-Key lesbar:
  select feature_booking_state, feature_marketplace_state, feature_events_state,
         feature_lobbies_state, feature_league_state, feature_p2g_state, feature_friends_state,
         launch_date
  from site_settings where id = 'global'

Jede Funktion hat genau EINEN Zustand (text):
  'visible' → für alle
  'demo'    → nur Admins sehen sie (mit dezentem Vorschau-Hinweis); alle anderen sehen die
              „Bald verfügbar“-Ansicht
  'hidden'  → niemand, auch Admins nicht
Unbekannter/fehlender Wert → wie 'hidden' behandeln.

  canSee(feature)     = state === 'visible' || (state === 'demo' && isAdmin)
  isPreview(feature)  = state === 'demo' && isAdmin
isAdmin wie bisher berechnen (user_roles.role = 'admin' oder Superadmin-Mail, siehe alter Spec §1).

Funktionen und was sie in der App steuern (Nav-Eintrag + Screen + jeder Einstieg dorthin,
IMMER zusammen — nie nur den Tab ausblenden und den Screen erreichbar lassen):
  booking      Standortliste, Standort-Detail/Slots, Checkout, „Court buchen“-CTAs.
               ERSETZT den bisherigen Boolean feature_courts_public_enabled und dessen Regel
               „Admin sieht immer“. Ab jetzt: booking='demo' = Admin-Vorschau, booking='hidden' =
               auch Admin sieht nichts. Der alte Boolean wird per DB-Trigger aus dem neuen Zustand
               abgeleitet (true genau bei 'visible') und bleibt nur übergangsweise lesbar —
               NICHT mehr abfragen, auf feature_booking_state umstellen.
  marketplace  Shop-Tab, Produktliste, Produktdetail, Checkout, Shop-Kacheln im Dashboard.
  events       Events-Tab, Event-Liste, Event-Detail, Anmeldung, Event-Kacheln im Dashboard.
  lobbies      Lobby-Buttons in Buchung/Buchungsbestätigung, Lobby-Screens.
  league       Liga/Rangliste-Screen und Einstiege.
  p2g          P2G-Punkte-Screen und Einstiege (Punkte-Badge im Header bleibt).
  friends      Freunde- und Chat-Screens und Einstiege.

Ausgeblendet = EINE gemeinsame „Bald verfügbar“-Ansicht (Icon, Titel „Bald verfügbar“, ein
Satz pro Funktion, Button „Zurück“), kein stiller Redirect. Texte pro Funktion (de):
  booking:     „Die Court-Buchung ist noch in der finalen Testphase. Wir schalten sie in Kürze
                frei – schau bald wieder vorbei!“
  marketplace: „Der PADEL2GO Shop öffnet in Kürze. Schau bald wieder vorbei!“
  events:      „Unsere Events werden gerade vorbereitet. Schau bald wieder vorbei!“
  lobbies:     „Lobbies sind noch nicht freigeschaltet. Bald kannst du hier offene Spielrunden
                finden.“
  league:      „Die Liga ist noch nicht freigeschaltet. Bald findest du hier Ranglisten und
                Statistiken.“
  p2g:         „P2G-Punkte sind noch nicht freigeschaltet. Bald sammelst du hier Punkte für
                Buchungen und Matches.“
  friends:     „Freunde & Chat sind noch nicht freigeschaltet. Schau bald wieder vorbei!“
Admin-Vorschau (isPreview): kleiner blauer Hinweis „Admin-Vorschau: {Funktion} · nur Admins
sehen das“, unten am Screen, nicht blockierend.

Entfallen — aus der App streichen, falls referenziert:
  feature_matching_state, feature_rewards_state, alle feature_*_enabled-Booleans,
  feature_app_launched, pin_lock_*. Ein Screen /matching existiert nicht.
launch_date bleibt reine Anzeige (Countdown; nach dem Datum keinen Countdown mehr zeigen,
hasLaunched = launch_date <= now). Es schaltet nichts frei.

Inhalte sind davon unabhängig und bleiben wie im alten Spec §3, §5–7:
  locations.is_online (RLS), courts.is_active (clientseitig filtern!), events.is_published,
  articles.is_published + audience (clientseitig), marketplace_items.is_active (RLS) +
  status != 'draft' (clientseitig).

Cache: Zustände beim App-Start laden, bei App-Resume neu laden (staleTime ~5 min reicht).

═══════════════════════════════════════════════════════════════════════════
3. ADRESSE
═══════════════════════════════════════════════════════════════════════════
Überall „PADEL2GO UG (haftungsbeschränkt), Am Neudeck 12, 81541 München“ (vorher Neudeck 10):
Impressum, Datenschutz, AGB, Widerrufsbelehrung, Kontakt/Über-uns, Store-Metadaten, falls die App
eigene Rechtstexte hält. Wenn die App die Web-Seiten per WebView einbindet: nichts zu tun.
Hausnummer per Grep über das ganze Repo prüfen („Neudeck 10“ darf nirgends mehr vorkommen).

═══════════════════════════════════════════════════════════════════════════
4. KALENDER-EXPORT FÜR BUCHUNGEN (optional, wenn die App „Zum Kalender hinzufügen“ hat)
═══════════════════════════════════════════════════════════════════════════
Neue öffentliche Edge Function GET {SUPABASE_URL}/functions/v1/booking-ics?b={booking_id}&t={token}
liefert die .ics der Buchung (Content-Type text/calendar). Der Token ist ein HMAC, den nur der
Server erzeugt — die App bekommt ihn NICHT und kann ihn nicht berechnen. Deshalb in der App
weiterhin den nativen Kalender (expo-calendar) direkt füttern; die Function ist nur für den Link
in der Bestätigungs-Mail. Google-Link-Format falls gewünscht:
  https://calendar.google.com/calendar/render?action=TEMPLATE&text=…&dates=YYYYMMDDTHHMMSSZ/…&location=…&details=…

═══════════════════════════════════════════════════════════════════════════
5. NICHT MEHR GEPFLEGTE FELDER (nicht mehr anzeigen / nicht mehr darauf bauen)
═══════════════════════════════════════════════════════════════════════════
Der Admin kann folgende Spalten nicht mehr befüllen; bestehende Werte sind veraltet:
  locations.lat, locations.lng          → keine Karten-Koordinaten mehr. Falls die App eine Karte
                                          oder Entfernung darauf baut: auf Adresse + Geocoding
                                          umstellen oder Feature entfernen (bitte melden).
  locations.gallery_image_urls          → nur main_image_url / tennis_image_url verwenden
  locations.amenities                   → features_json verwenden
  partner_tiles.partner_type / region   → Partner-Kacheln nicht mehr danach gruppieren
  event_artists.spotify_url             → nicht anzeigen
  club_owner_assignments (Legacy)       → Club-Zugehörigkeit nur über clubs + club_users +
                                          club_court_assignments

═══════════════════════════════════════════════════════════════════════════
CHECKLISTE (im Simulator gegen Live-Daten, mit und ohne Login, einmal als Admin)
═══════════════════════════════════════════════════════════════════════════
[ ] Standort mit WhatsApp-Link: Button auf Kachel + Hinweis in Buchungsmaske, öffnet WhatsApp
[ ] Standort ohne Link: nichts davon sichtbar
[ ] booking='demo' (aktueller Live-Stand): anonym und normaler User sehen „Bald verfügbar“,
    Admin sieht Standorte + Vorschau-Hinweis
[ ] marketplace/events='visible' (aktueller Live-Stand): für alle erreichbar
[ ] lobbies/league/p2g='hidden' (aktueller Live-Stand): auch als Admin „Bald verfügbar“, keine
    Tabs/Buttons dorthin
[ ] Ein Zustand im Admin (Web: Admin → Sichtbarkeit) umstellen, App neu laden → Tab UND Screen
    folgen gemeinsam
[ ] feature_courts_public_enabled wird nirgends mehr gelesen
[ ] „Neudeck 10“ kommt im Repo nicht mehr vor
```
