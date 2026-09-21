# App-Handoff 21.09.2026 — Preise, Punkte, Gutscheine, Rechnungen, Gesellschaft

Stand des Backends nach den Änderungen vom 18.–21.09.2026. Alle Migrationen sind
in Produktion gelaufen und verifiziert. Reihenfolge unten ist nach Dringlichkeit
sortiert: Punkt 1 ist ein Bruch, der die App heute schon treffen kann.

---

## 1. BRUCH: `marketplace_items.credit_cost` existiert nicht mehr

Die Spalte ist **gelöscht**. Jede Abfrage, die sie namentlich anfordert, schlägt
jetzt mit `PGRST204 — Could not find the 'credit_cost' column` fehl. Ein
`insert` auf `marketplace_items`, das sie mitschickt, ebenfalls.

Sie hielt früher den maximalen Punkterabatt je Produkt, von Hand gepflegt. Das
war doppelte Arbeit und fehleranfällig: die Zahl stand in Punkten da, der Kurs,
der sie in Euro übersetzt, auf einer anderen Seite.

**Neu:** Der Deckel rechnet sich aus Warenwert, globalem Prozentsatz und Kurs.

```
centsPerPoint   = 100 / site_settings.credits_per_euro
capCents        = floor(subtotalCents * site_settings.credits_payment_max_percent / 100)
maxPoints       = floor(capCents / centsPerPoint / 10) * 10      // auf Zehner ab
```

Die Abrundung auf Zehner ist Absicht: der Schieberegler im Web läuft in
Zehnerschritten, eine angezeigte Zahl soll auch einstellbar sein. Wenn die App
einen freien Zahleneingabe statt eines Reglers nutzt, kann sie die Abrundung
weglassen — der Server kappt ohnehin selbst.

**Aktuelle Werte:** `credits_per_euro = 100`, `credits_payment_max_percent = 50`,
`feature_credits_payment_enabled = true`.

Beispiel: 100,00 € Ware → 5.000 Punkte → 50,00 € Rabatt.

---

## 2. Punkte verdienen: feste Zahl je 60 Minuten, keine Stufen mehr

Die Expert Levels sind **vollständig entfernt** — kein Level-Multiplikator,
keine Stufen, kein `expert-levels`-Endpunkt, die Tabelle
`expert_levels_config` und die Funktion `get_user_level_multiplier` sind
gelöscht. Falls die App Stufen oder „Top 5 in deiner Stufe" anzeigt: raus.

**Neue Regel**, einzige Quelle ist die DB-Funktion `resolve_booking_points()`:

| Dauer | Punkte |
|---|---|
| 60 Min | `site_settings.payback_points_60min` (aktuell **100**) |
| 90 Min | × 1,5 |
| 120 Min | × 2,0 |
| Tennis | **0**, unabhängig von der Dauer |

Je Standort überschreibbar. Punkte gibt es **nur für tatsächlich gezahltes
Geld**: Rabatte und Freistunden zählen nicht mit. Der Webhook prüft
`session.amount_total > 0`; der 0-Euro-Weg vergibt nichts.

Wenn die App eine Punktevorschau vor der Buchung zeigt, darf sie sie **nicht
selbst rechnen**, sondern nimmt die Edge Function `rewards-estimate` — sonst
laufen Vorschau und Gutschrift auseinander.

---

## 3. Preise sind global, mit Ausnahmen je Standort

In Courts & Standorte lassen sich **keine** Preise mehr setzen.

- `court_prices` — eine Zeile je `sport` + `duration_minutes` (global)
- `location_price_exceptions` — eine Zeile je Standort + Sportart; leeres Feld = globaler Wert
- `court_pricing_bands` — Zeitfenster, hängen jetzt an `location_id`, nicht mehr am Court; `location_id IS NULL` = gilt überall

Auflösung macht `resolve_booking_rate()`: Standort-Band → Standort-Ausnahme →
globales Band → globaler Standardpreis. Darüber liegt unverändert die
Vereinskondition (`resolve_member_pricing`).

**Die App soll Preise nicht selbst zusammensetzen.** Für eine Liste gibt es
`resolve_booking_rate_batch()`, für eine Kachel `court_min_price_cents()`.

---

## 4. Gutscheine: jetzt auch Marketplace, jetzt auch Gäste

### Schema

| Tabelle | Änderung |
|---|---|
| `voucher_codes` | **neu** `scope text` ∈ `booking` \| `marketplace` \| `both` |
| `voucher_redemptions` | `booking_id` und `user_id` sind **nullable**, **neu** `redemption_id` (Marketplace-Bestellung); Prüfregel: genau eine Quelle |
| `marketplace_redemptions` | **neu** `voucher_id`, `voucher_discount_cents` |

### `voucher-validate` — kein Login mehr nötig

```jsonc
POST /functions/v1/voucher-validate
{ "code": "PADEL10", "context": "marketplace" }   // context: "booking" | "marketplace"
```

- **Ohne Anmeldung aufrufbar.** Gäste können Codes prüfen und einlösen.
- `context` ist optional; fehlt es, gilt `booking` — bestehende App-Aufrufe
  laufen unverändert weiter. Für den Marketplace **muss** es gesetzt werden.
- Passt der Geltungsbereich nicht, kommt `{ valid: false, reason: "Dieser Code
  gilt nur für Platzbuchungen" }` — diese Meldung bitte anzeigen, nicht durch
  ein generisches „ungültig" ersetzen.
- **Bremse:** 15 **Fehlversuche** je Stunde und IP, danach HTTP 429. Ein Treffer
  kostet kein Kontingent. Bitte keine automatischen Wiederholungen bei 429.

Antwort bei Erfolg:

```jsonc
{ "valid": true, "voucher_id": "…", "discount_type": "free|percentage|fixed",
  "discount_value": 20, "discount_label": "20 % Rabatt", "scope": "marketplace" }
```

### Gutschein im Marketplace-Checkout

`marketplace-checkout` nimmt zusätzlich `voucher_id`:

```jsonc
POST /functions/v1/marketplace-checkout
{ "item_id": "…", "quantity": 1, "points_to_use": 0,
  "voucher_id": "…",                        // optional
  "guest_email": "…", "guest_name": "…",    // nur ohne Konto
  "shipping": { "address_line1": "…", "postal_code": "…", "city": "…", "country": "DE" } }
```

**Reihenfolge ist wirtschaftlich relevant und serverseitig festgelegt:** erst
der Gutschein auf den Warenwert, dann die Punkte auf den **Rest**. Der
50-Prozent-Deckel der Punkte greift also auf den bereits rabattierten Betrag.
Rechnet die App andersherum, zeigt sie einen höheren Rabatt an, als der Server
gewährt.

Antworten:

| Antwort | Bedeutung |
|---|---|
| `{ "url": "https://checkout.stripe.com/…" }` | zu Stripe weiterleiten |
| `{ "url": …, "resumed": true }` | offene Sitzung wird fortgesetzt |
| `{ "url": …, "renewed": true }` | neue Sitzung zum vollen Preis, Rabatte waren verfallen |
| `{ "free": true, "reference_code": "P2G-…" }` | **kein Stripe** — vollständig gedeckt, Bestellung steht schon |

Der Gratis-Weg gilt **auch für Gäste**: ein 100-Prozent-Gutschein trägt eine
Gastbestellung ohne Konto. Bitte nicht auf eingeloggte Nutzer beschränken.

### Rückgabe bei Abbruch

Die Gutschein-Nutzung wird beim **Anlegen der Bestellung** reserviert, nicht bei
der Zahlung. Bricht der Vorgang ab, gibt `release_order_voucher()` sie zurück —
automatisch über den Aufräumer. Die App muss nichts tun, sollte aber wissen:
nach einem Abbruch hängt **kein** Gutschein mehr an der Bestellung, der Code
muss beim nächsten Anlauf neu eingegeben werden.

---

## 5. Rechnungen als PDF — neu, bitte einbauen

Belege gab es schon (lückenlose Nummer `P2G-<Jahr>-<nnnnnn>`, Netto/Steuer
getrennt), aber kein Dokument. Jetzt gibt es eines.

```jsonc
POST /functions/v1/receipt-pdf
{ "source_id": "<booking.id oder marketplace_redemptions.id>",
  "receipt_type": "booking" | "marketplace_order" }
```

- Antwort ist **`application/pdf`**, kein JSON. Als Blob/Datei behandeln, nicht
  als Text lesen — sonst sind die Binärdaten zerstört.
- `Content-Disposition` trägt den Dateinamen (`P2G-2026-000003.pdf`).
- Mit `Authorization: Bearer <JWT>`: nur eigene Belege. Fremde antworten wie
  nicht vorhandene (404), damit sich keine Belegnummern erraten lassen.
- Alternativ per `{ "token": "<receipts.access_token>" }` **ohne Anmeldung** —
  so kommt ein Gastbesteller über den Link aus der Bestätigungsmail heran.
- `verify_jwt = false`: die Funktion prüft selbst.

**Wo einbauen:** bei jeder bezahlten Bestellung und jeder bezahlten Buchung.
Im Web steht der Knopf unter Konto → Bestellungen und bei den Buchungen, ab
Status bezahlt (`success`/`refunded` bzw. `confirmed`). Bei einer Erstattung
erzeugt dieselbe Funktion automatisch eine **Korrekturrechnung** mit negativen
Beträgen.

Neue Spalten auf `receipts`, falls die App den Beleg selbst anzeigt:
`recipient_address_line1`, `recipient_postal_code`, `recipient_city`,
`recipient_country`, `service_date`, `access_token`.

Neue Tabelle `billing_profile` (eine Zeile, `id = 'global'`) hält die
Absenderangaben. Für Angemeldete lesbar. **Nicht in der App hart eintragen** —
sie ändern sich im Admin.

---

## 6. Gesellschaft: alles auf die OpCo

Die **PADEL2GO UG** hält nur noch die Marke. Vertragspartei, Verantwortliche
nach DSGVO und Rechnungsstellerin ist die **PADEL2GO OpCo UG
(haftungsbeschränkt)**.

| Angabe | Wert |
|---|---|
| Firma | PADEL2GO OpCo UG (haftungsbeschränkt) |
| Anschrift | Am Neudeck 12, 81541 München |
| USt-IdNr. | DE464441826 |
| Registergericht | Amtsgericht München |
| Registernummer | **HRB 312382** (vorher 306377) |
| Geschäftsführung | Florian Steinfelder, David Klemm |

**In der App zu ändern, überall wo die alte Gesellschaft oder HRB 306377 steht:**
Impressum, AGB (Vertragspartei in § 1), Datenschutz (Verantwortlicher),
Widerrufsbelehrung (Anschrift für den Widerruf), Fußzeilen.

Im Web waren das neun Stellen. Die App hat vermutlich eigene Fassungen dieser
Texte — bitte vollständig durchgehen, ein Rest mit der alten Gesellschaft ist
schlimmer als ein sauberer Bruch.

---

## 7. Launch-Countdown entfernen

Das Launch-Datum ist im Web **überall** verschwunden: Countdown und Badge auf
der Startseite, der Datumshinweis bei den Events, der Chip auf „Für Spieler",
und das Feld im Admin.

`site_settings.launch_date` steht **nur noch deshalb** in der Datenbank, weil
die App sie laut früherem Handoff liest. Sobald die App den Countdown entfernt
hat, bitte kurz Bescheid geben — dann wird die Spalte gelöscht.

Solange sie steht, gibt es **kein Feld im Admin mehr**, um das Datum zu ändern.
Ein Countdown in der App liefe also auf ein Datum zu, das niemand mehr
anpassen kann.

---

## 8. Bilder: nie roh ausliefern

Beim Durchmessen der Website war das mit Abstand teuerste Problem, dass
Originalbilder ausgeliefert wurden. Ein Original im Storage wiegt schnell
**1,5 MB**, dieselbe Datei über den Transformations-Endpunkt **60 KB**.

```
https://<project>.supabase.co/storage/v1/object/public/…     ← Original, nicht verwenden
https://<project>.supabase.co/storage/v1/render/image/public/…?width=800&quality=75
```

Gilt auch für **Video-Standbilder** (`poster`): im Web lief eines mit 2,3 MB
mit, nur um die erste Sekunde zu überbrücken.

Wenn die App Standort-, Produkt- oder Visual-Bilder anzeigt: bitte durchgehend
über `render/image` mit einer `width` in der tatsächlichen Anzeigegröße mal
Pixeldichte.

---

## 9. Stripe: Echt- und Testbetrieb sind umschaltbar

`site_integration_configs` (`service = 'stripe'`) hat jetzt ein Feld `mode`
(`live` | `test`) und je ein Schlüsselpaar. Alle Zahlungsfunktionen lesen den
Schalter selbst.

Für die App heißt das: **keine Stripe-Schlüssel in der App hinterlegen.** Der
Checkout läuft ohnehin über die Edge Functions, die den passenden Schlüssel
selbst wählen. Steht der Schlüssel nicht zum Modus, bricht der Server mit einer
klaren Meldung ab, statt still echtes Geld zu bewegen.

**Aktuell steht der Schalter auf `test`.**

---

## Prüfliste

- [ ] Keine Abfrage und kein Insert nutzt `marketplace_items.credit_cost`
- [ ] Punktedeckel im Marketplace wird aus `credits_payment_max_percent` gerechnet
- [ ] Expert Levels und Stufen-Anzeigen entfernt
- [ ] Punktevorschau kommt aus `rewards-estimate`, nicht aus eigener Rechnung
- [ ] Preise kommen aus `resolve_booking_rate` / `court_min_price_cents`
- [ ] Gutscheinfeld im Marketplace-Checkout, für Angemeldete **und** Gäste
- [ ] `context` beim Prüfen gesetzt, Geltungsbereichs-Meldung wird angezeigt
- [ ] Gutschein **vor** Punkten gerechnet
- [ ] `{ free: true }` auch ohne Konto behandelt
- [ ] Rechnungs-Download bei Bestellungen und Buchungen
- [ ] Gesellschaft, USt-IdNr. und HRB in allen Rechtstexten auf die OpCo
- [ ] Launch-Countdown entfernt, danach Rückmeldung fürs Löschen der Spalte
- [ ] Alle Bilder über `render/image`, inklusive Video-Standbilder
- [ ] Keine Stripe-Schlüssel in der App

---

## Was sich **nicht** geändert hat

Damit niemand unnötig sucht: Buchungsablauf, Wallet und `points_ledger`,
Events, Lobbies, Sichtbarkeitssystem (`feature_<name>_state`), Auth und RLS
sind unverändert. Der Handoff vom 17.09. zu WhatsApp-Gruppen und Adresse gilt
weiter.
