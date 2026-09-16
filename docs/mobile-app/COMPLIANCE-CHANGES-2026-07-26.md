# Compliance-Änderungen Web/Backend → App-Relevanz (26.07.2026)

Handoff für die Expo/RN-App-Session (Backend = dasselbe Supabase-Projekt `wvvdkuextsbsecqbfksb`).
Alle Migrationen sind in Produktion ausgeführt, alle Edge Functions deployed.
Kontext: Haupt-Handoff `HANDOFF-ios-expo-app.md` · Hero-Shader separat in `HERO-SHADER.md`.

## 1. MUSS die App übernehmen (App-Store-/Rechts-Blocker)

### 1.1 In-App-Account-Löschung (Apple 5.1.1(v) — Pflicht!)
- Edge Function **`delete-account`** (POST, leerer Body, User-JWT via `supabase.functions.invoke`).
- Web-Referenz: `src/components/account/AccountSecurityTab.tsx` — Zwei-Stufen-Dialog
  (Warnung + „LÖSCHEN" tippen), danach `signOut` + Redirect.
- Verhalten: Auth-User wird gelöscht; Buchungen/Bestellungen/Punkte-Ledger bleiben
  **anonymisiert** erhalten (§ 147 AO); Versandadressen werden vorher genullt.
  Admins können sich nicht selbst löschen (403).

### 1.2 Datenexport (Art. 15/20 DSGVO)
- Neue Edge Function **`export-my-data`** (POST, leerer Body, User-JWT) → JSON mit
  profile, wallet, points_ledger, bookings, marketplace_orders, returns, receipts,
  device_tokens, reward_instances. App: Button im Account → Share-Sheet/Datei speichern.

### 1.3 Push-Consent (§ 7 UWG) — Datenmodell ist live
- `profiles.push_marketing_opt_in` (boolean, **Default false**) — own-row RLS-Update erlaubt.
- `notifications.category`: `'transactional'` (Default) | `'marketing'`.
- Der DB-Trigger `notify_push` sendet **Marketing-Pushes nur an Opt-ins**;
  transaktionale Pushes (Buchung, Bestellung, Erinnerung) laufen immer.
- App-TODO: Toggle „Marketing-Push" in den Einstellungen (einfaches profiles-Update,
  Web-Referenz im AccountSecurityTab); beim Erstellen eigener Notifications ggf.
  `category` setzen. OS-Permission-Flow bleibt wie gehabt.

### 1.4 Registrierung: AGB + 18+
- Web verlangt jetzt bei Signup zwei Pflicht-Checkboxen (AGB/Datenschutz + „mind. 18").
  Metadata: `signUp(..., { data: { terms_accepted_at: ISO, adult_confirmed: true } })`.
- App-TODO: identische Checkboxen im Registrierungs-Screen + gleiche Metadata,
  sonst inkonsistente Rechtslage zwischen Kanälen.

### 1.5 Button-Lösung (§ 312j BGB)
- Zahlungs-Buttons heißen jetzt **„Zahlungspflichtig buchen"** (Court) bzw.
  **„Zahlungspflichtig bestellen"** (Shop) — EN: „Book/Order with obligation to pay".
- App-TODO: gleiche Labels in allen Checkout-Screens. Unter dem Button (Court):
  Storno-Hinweis („Kostenlose Stornierung bis Spielbeginn…") + Widerrufsausschluss
  (§ 312g Abs. 2 Nr. 9 BGB). Shop: AGB/Datenschutz/Widerruf-Linkzeile + Lieferzeit.
  Wording 1:1 aus `src/locales/de|en/booking.json` (`checkout.legal.*`,
  `guestModal.cancellationNote`) und `marketplace.json` (`checkout.legalNote`,
  `checkout.deliveryTimeDynamic`).

## 2. Serververhalten, das die App kennen muss

### 2.1 Buchungsfenster wird jetzt SERVERSEITIG erzwungen
- DB-Trigger `enforce_booking_window` auf `bookings`-INSERT: lehnt Slots in der
  Vergangenheit (>15 min) und außerhalb `locations.opening_hours_json` ab
  (Europe/Berlin; `is_24_7` überspringt). Fehlertexte: `booking_in_past…`,
  `outside_opening_hours…`.
- `create-guest-booking` liefert lesbare deutsche Fehlermeldungen dafür;
  `create-checkout-session` lehnt gestartete Slots ab
  („Der gebuchte Zeitraum liegt in der Vergangenheit").
- App-TODO: diese Fehler abfangen/anzeigen; Slot-UI wie im Web clientseitig filtern.

### 2.2 Neue RPC-Signatur
- `refund_marketplace_order(p_order_id, p_refund_amount_cents, p_stripe_refund_id)` —
  alte 1-Arg-Version existiert nicht mehr (nur relevant falls die App Admin-Flows baut).

### 2.3 Belege (receipts)
- Jede bezahlte Buchung/Bestellung erzeugt einen Beleg: Tabelle `receipts`
  (receipt_number `P2G-JJJJ-NNNNNN`, gross/discount/paid/net, tax_rate, tax_cents).
  RLS: User sieht eigene Belege → kann die App im Bestell-/Buchungsdetail anzeigen.
- Bestätigungs-Mails enthalten jetzt USt-Ausweis, Belegnummer und die AGB als
  txt-Anhang; Shop-Mails zusätzlich die volle Widerrufsbelehrung.

### 2.4 Marketplace-Order-Felder (neu auf `marketplace_redemptions`)
`unit_price_cents, gross_cents, discount_cents, tax_rate, tax_cents,
refund_amount_cents, refunded_at, stripe_refund_id, tracking_number, carrier,
shipped_at, shipping_confirmation_sent_at`.
- App-Bestellhistorie kann Tracking anzeigen (Web-Referenz `AccountOrdersTab.tsx`).

### 2.5 Retouren/Widerruf im Shop
- Tabelle **`marketplace_returns`** (user INSERT für eigene success-Order, SELECT own;
  Status `requested|received|refunded|rejected`, eine Retoure je Order).
- App-TODO: „Widerruf / Retoure melden"-Dialog in der Bestellhistorie
  (Web-Referenz `AccountOrdersTab.tsx`; Texte in `account.json` → `orders.return.*`).

### 2.6 Produktseiten-Pflichtangaben (Shop)
Neue Felder auf `marketplace_items`: `manufacturer_name/address/email`,
`eu_responsible_*`, `product_identifier`, `safety_warnings`, `textile_composition`,
`delivery_days_min/max`, `base_price_quantity/unit`, `tax_rate`.
- App-TODO auf Produktdetail: „inkl. MwSt. · kostenloser Versand", Lieferzeit
  (`delivery_days_min–max` Werktage), Herstellerinfos-Sektion (wenn gepflegt),
  30-Tage-Bestpreis bei UVP-Streichpreis via RPC
  **`marketplace_lowest_price_30d(p_item_id)`** (anon-callable, Cents).

### 2.7 Punkte-Ledger ist append-only
- Kein UPDATE/DELETE mehr möglich (Trigger); bei Account-Löschung wird `user_id`
  genullt statt Zeilen zu löschen. Nichts zu tun, nur wissen.

## 3. Rechtstexte & Seiten (für WebViews/Links aus der App)
- Neu: **`/widerruf`** (Widerrufsbelehrung + Muster-Formular), **`/versand`**
  (Versand & Zahlung). Bestehend aktualisiert: `/agb` (12 §§, u. a. § 5 Warenkauf,
  § 6 Widerruf, § 8 Bonusprogramm: 100 P = 1 €, max. 50 %, Verfall 36 Monate),
  `/impressum` (UG, Am Neudeck 12, DDG/MStV), `/datenschutz` (15 Abschnitte,
  neu: Shop, **Push**, **Community/Matchmaking**, **Kameras**, **Drittland**).
- App-Impressumspflicht: Impressum + Datenschutz müssen auch in der App in
  ≤ 2 Klicks erreichbar sein (Settings-Links reichen).
- Storno-Policy überall einheitlich: **kostenlos bis Spielbeginn, 100 % Erstattung**.

## 4. Noch offen (nicht in diesem Paket, App betrifft's später)
- Kamera-/Padmi-Consent-Flow (Opt-in pro Match inkl. Mitspieler) — VOR erster Kamera.
- Report-Funktion für Inhalte + blockUser-UI (DSA) — blockUser-API existiert schon
  in `friends-api` (`useFriendships.blockUser`), nur UI fehlt (Web wie App).
- KI-Label für News-Artikel, Profil-Sichtbarkeits-Toggle, Wartungs-/Notfall-Modul.
