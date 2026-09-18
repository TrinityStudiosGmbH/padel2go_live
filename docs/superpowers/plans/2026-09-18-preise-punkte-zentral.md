# Plan: Preise zentral, Punkte pro bezahltem Euro, Expert Levels raus

**Datum:** 2026-09-18 · **Status:** Entwurf, wartet auf Freigabe

## Anforderung

1. **Preise & Punkte** wird der einzige Ort für Preise. Sie gelten global für alle Courts.
2. **Ausnahmen pro Standort**, manuell anlegbar und wieder löschbar (z. B. für Events).
3. In **Courts & Standorte** keine Preise mehr, nur Öffnungszeiten und Standort-Merkmale.
4. **Punkte pro Euro** in Preise & Punkte einstellbar. Punkte nur pro **bezahltem** Euro: Rabatte und Freistunden zählen nicht.
5. **Expert Levels komplett raus** — öffentliche Website, Profil, Mein P2G, Admin und Backend.
6. **P2G Points** wird mit **Preise & Punkte** zusammengeführt. Auf Mein P2G nur noch Punktestand und Rabattwert.
7. Bedienbarkeit erhalten.

## Ist-Zustand (geprüft, nicht vermutet)

| Thema | Befund |
|---|---|
| Preise | `court_prices` hat **21 Zeilen, alle pro Court** (7 Courts), **null globale Zeilen**. Das Feld für global existiert bereits (`court_id IS NULL`), wird aber nicht genutzt. |
| Zeitfenster | `court_pricing_bands` ist **leer**. Die Auflösung über `resolve_booking_rate()` funktioniert, wird aber von keinem Datensatz benutzt. |
| Punkte verdienen | Feste Punkte je Dauer: 100 / 150 / 200 für 60 / 90 / 120 Minuten, **unabhängig vom Preis**. Mal Zeitfenster-Faktor, mal Level-Faktor. |
| Punkte einlösen | 10.000 Punkte = 1 Euro. Einlösen ist aktuell **abgeschaltet**. |
| Expert Levels | 8 Stufen mit Faktoren 1,0 bis 2,0 auf die Punktevergabe. |
| Schreibpfad Punkte | `award_booking_payback()` ist der einzige Weg, ist idempotent und verweigert Tennis, Gäste und Stornos. **Bleibt unverändert.** |

**Wichtig:** Eine 60-Minuten-Buchung bringt heute 100 Punkte = **1 Cent** Gegenwert. Bei einem Preis von etwa 24 Euro sind das 0,04 % Payback. Das ist vermutlich nicht gewollt und wird mit dem neuen Modell neu gesetzt.

### Drei Funde, die ich beim Durchsehen mitgenommen habe

1. **Bestehender Fehler: Buchungsseite und Kasse widersprechen sich.** Die Buchungsseite fällt bei einem Court ohne eigene Preise auf die globalen Werte zurück und zeigt 24 / 36 / 40 Euro an. Die Kasse tut das nicht und bricht mit „kein Preis hinterlegt" ab. Der Kunde kommt also bis zum Bezahlen und scheitert dort. Wird in Phase 1 mit behoben, weil beide Seiten dann denselben Weg nehmen.
2. **Bestehender Fehler: die Summe unten stimmt nicht.** Die Gesamtsumme in der Buchungsübersicht liest den rohen Court-Preis und ignoriert sowohl Zeitfenster als auch Vereinskondition. Die Knöpfe direkt darüber zeigen den richtigen Preis. Wird in Phase 1 mit behoben.
3. **Zweite Schreibstelle für Preise.** Neben dem Euro-Knopf speichert auch der Court-Bearbeiten-Dialog Preise mit. Beide müssen raus, sonst bleibt ein zweiter Weg offen, über den jemand versehentlich wieder Court-Preise anlegt.

### Was das Preissystem sonst noch kann und erhalten bleiben muss

Über den Standardpreisen liegt eine **Vereinskondition**: Mitglieder zahlen an ihrem Heimstandort einen Festpreis oder einen Rabatt, auswärts einen anderen Rabatt, mit monatlichem Deckel und Freistunden-Kontingent. Tennis ist für Mitglieder am Heimstandort kostenlos. Das bleibt vollständig unangetastet, es rechnet nur künftig auf dem neuen globalen Preis statt auf dem Court-Preis.

---

## Phase 1 — Preismodell: global mit Standort-Ausnahmen

**Migration.**
- `court_prices` und `court_pricing_bands` bekommen `location_id uuid NULL`.
- Neue Auflösung: **Standort-Ausnahme → global**. Der Court spielt für den Preis keine Rolle mehr.
- `resolve_booking_rate()` wird umgeschrieben: erst Band des Standorts, dann globales Band, dann Standortpreis, dann globaler Preis.
- Bestandsdaten: aus den 21 Court-Preisen wird je Dauer der häufigste Wert der **globale** Preis. Standorte, die davon abweichen, bekommen automatisch eine Ausnahme. Danach werden die Court-Zeilen gelöscht. Die Migration gibt vorher aus, was sie tun wird, damit du es prüfen kannst.
- Eindeutigkeit: je Dauer höchstens eine globale Zeile und höchstens eine je Standort.

**Admin-Oberfläche**, Reiter „Preise":
- Karte **Standardpreise**: 60 / 90 / 120 Minuten, getrennt für Padel und Tennis. Gilt für alle Standorte.
- Karte **Zeitfenster** (Preisdynamik): die bestehende Band-Verwaltung, künftig global statt pro Court.
- Karte **Ausnahmen je Standort**: Liste vorhandener Ausnahmen mit Preisen, Knopf „Ausnahme hinzufügen" (Standort wählen, Preise eintragen) und Löschen je Zeile. Ohne Eintrag gilt automatisch der Standardpreis.

**Courts & Standorte:** Euro-Knopf und Preis-Dialog entfallen ersatzlos. Es bleiben Öffnungszeiten, Merkmale, Bilder, Online-Schalter und die Platz-Anzahl.

## Phase 2 — Punkte pro bezahltem Euro

**Neue Formel:** `Punkte = gerundet(bezahlter Betrag in Euro × Punkte pro Euro)`

- Grundlage ist der **tatsächlich belastete Betrag**. Bei Stripe ist das der Endbetrag nach Gutschein und nach eingelösten Punkten. Freistunden und 0-Euro-Buchungen ergeben damit automatisch **null Punkte**, ohne Sonderregel.
- Die festen Punkte je Dauer (`payback_points_60/90/120min`) fließen nicht mehr ein.
- Der Level-Faktor entfällt (siehe Phase 3).
- Tennis, Gäste und Stornos bleiben wie bisher ausgeschlossen, das erledigt weiter die bestehende Datenbankfunktion.

**Eine Verhaltensänderung, die du kennen solltest.** Heute bekommt eine Buchung mit Gutschein **null** Punkte, auch wenn der Gutschein nur einen Teil abdeckt und der Rest bezahlt wurde. Nach deiner Regel ist das zu streng: der bezahlte Rest soll zählen, nur der Rabatt nicht. Künftig gibt es also Punkte auf den Restbetrag. Bei voller Deckung durch den Gutschein bleibt es bei null. Umgekehrt bekommt eine mit Vereinsrabatt verbilligte Buchung heute die **vollen** Punkte, künftig nur noch die auf den reduzierten Preis. Beides folgt direkt aus „Punkte nur pro bezahltem Euro".

**Betroffen:** `stripe-webhook` (bezahlter Weg), `create-checkout-session` (0-Euro-Weg), `rewards-estimate` (Vorschau im Checkout). Vorschau und Gutschrift werden **gemeinsam** umgestellt, sonst zeigt der Checkout etwas anderes an als am Ende gutgeschrieben wird.

**Admin-Oberfläche**, Reiter „Punkte" — mit klarer Trennung der beiden Kurse, die heute leicht verwechselt werden:
- **Verdienen:** „Punkte je bezahltem Euro". Mit Beispielsatz: „Bei 24 € Buchung gibt es X Punkte."
- **Einlösen:** „Punkte für 1 € Rabatt" (heute 10.000), maximaler Anteil einer Zahlung, Ein/Aus-Schalter.
- Ein Hinweiskasten rechnet beides zusammen: „Aus 24 € werden X Punkte, das entspricht Y € Rabatt, also Z % Payback."

## Phase 3 — Expert Levels entfernen

Reihenfolge ist wichtig, weil eine Datenbankfunktion echte Punkte vergibt.

1. **Zuerst ungefährlich machen:** `get_user_level_multiplier()` gibt fest 1.0 zurück. Ab dann ändert sich fachlich nichts mehr, egal was danach passiert.
2. **Aufrufe entfernen** in `stripe-webhook`, `create-checkout-session`, `rewards-estimate` (geschieht ohnehin in Phase 2).
3. **Frontend entfernen:**
   - Löschen: `lib/expertLevels.ts`, `hooks/useExpertLevels.ts`, `hooks/useLevelUpDetection.ts`, `ExpertLevelsGrid`, `ExpertLevelInfoPopover`, `LevelUpAnimation`, `P2GExpertLevelsTab`.
   - Gratis mit weg, weil heute schon ungenutzt: `P2GPointsHeader`, `MarketplaceCreditsHeader`, `AccountSkillLevel`, `ui/skew-level-cards`.
   - Umbauen: Mein P2G, Konto, Öffentliches Profil, Freundeskarte und -liste, Liga-Seite, Für Spieler, öffentliche League-Seite.
4. **Farben ersetzen.** Fünf Stellen beziehen ihre Rahmen-, Hintergrund- und Ringfarben aus dem Level. Sie bekommen das neutrale Karten-Design, sonst stehen dort leere Klassennamen und die Kacheln wirken kaputt.
5. **Backend:** Endpunkt `expert-levels` und die Felder `expert_level`, `current_tier`, `top_in_tier` aus den Antworten entfernen. Die Liga behält Gesamtrang, Deutschlandliste und Altersklasse.
6. **Tabelle** `expert_levels_config` und die Funktion werden in einer **separaten Migration danach** gelöscht, erst wenn die neue Version läuft.
7. Texte in beiden Sprachen aufräumen.

## Phase 4 — Zusammenführung der Admin-Seiten

`/admin/pricing` heißt „Preise & Punkte" und bekommt vier Reiter: **Preise**, **Punkte**, **Wallets**, **Übersicht**. Die letzten beiden ziehen unverändert von der P2G-Seite um. `/admin/p2g-points` leitet dauerhaft auf `/admin/pricing` um, der Sidebar-Eintrag entfällt.

Beim Rechte-Katalog fällt das Schreibrecht auf Preise für die Seite Courts & Standorte weg. Ein Mitarbeiter mit Zugriff nur auf Courts kann danach keine Preise mehr ändern, was ja gerade der Sinn der Zentralisierung ist.

## Phase 5 — Mein P2G

Die Punkte-Karte zeigt nur noch: Punktestand, Gegenwert in Euro, Umrechenkurs und die beiden Knöpfe. Fortschrittsbalken, Level-Abzeichen und Level-Name entfallen. Damit die Karte nicht halb leer wirkt, rückt der Wochenpunkte-Hinweis nach.

## Phase 6 — Test

- Preis-Auflösung: Standort ohne Ausnahme nimmt den Standardpreis, Standort mit Ausnahme den eigenen, Ausnahme löschen führt zurück zum Standard. Geprüft in der Buchungsmaske und im Checkout.
- Punkte: Buchung mit vollem Preis, mit Gutschein-Rabatt, mit eingelösten Punkten und als Freistunde. Erwartung: Punkte proportional zum tatsächlich gezahlten Betrag, bei 0 Euro keine Punkte. Vorschau im Checkout gleich der späteren Gutschrift.
- Keine Fundstelle von Expert Level mehr im Frontend, keine kaputten Kacheln.
- Durchklicken mit einem Testkonto, danach gelöscht.

---

## Entscheidungen (getroffen am 18.09.2026)

| # | Entscheidung |
|---|---|
| A | **Feste Punkte je 60 Minuten**, global für alle Courts. 90 Minuten = Faktor 1,5 · 120 Minuten = Faktor 2,0. Pro Standort über eine Ausnahme anpassbar, z. B. für Events. Kein Punkte-pro-Euro. |
| B | **Zeitfenster-Faktor auf Punkte entfällt.** Es gibt genau eine Punktezahl je 60 Minuten. |
| C | **Preise getrennt nach Sportart** und zusätzlich je Standort über Ausnahmen einstellbar. |
| D | **Ein Standardpreis für alles.** Die Migration vereinheitlicht, legt keine Ausnahmen automatisch an. Ausnahmen trägt der Admin nachträglich selbst ein. |
| E | Alles rund um die Expert Levels fällt weg, auch „Top 5 in deiner Stufe" in der Liga. |
| F | Die Stufen-Kachelreihe auf „Für Spieler" fällt weg. Stattdessen entsteht dort eine neue, prominente Sektion: **„Du spielst Padel und wirst dafür belohnt."** — Punkte sammeln und im Marketplace einlösen. |

**Wie „nur für bezahlte Buchungen" mit festen Punkten zusammenpasst:** Punkte gibt es weiterhin nur, wenn tatsächlich Geld geflossen ist. Eine Freistunde und eine vollständig per Gutschein bezahlte Buchung ergeben null Punkte. Wurde ein Teil bezahlt, gibt es die volle Punktzahl der Dauer, denn die Punktzahl hängt jetzt an der Zeit, nicht am Betrag.

## Risiken

- **HOCH** Punktevergabe ist geldnah. Mitigation: Level-Faktor zuerst auf 1.0 setzen, Vorschau und Gutschrift gemeinsam ändern, danach mit echten Buchungen in allen vier Varianten testen.
- **MITTEL** Preis-Migration verändert, was Kunden zahlen. Mitigation: Migration gibt die geplante Zuordnung vorher aus, Umstellung erst nach deiner Sichtprüfung.
- **MITTEL** Expert Levels stecken in 30+ Dateien, davon fünf mit reiner Farbgebung. Mitigation: vollständige Fundstellenliste liegt vor, Build und Durchklicken nach jedem Teilschritt.
- **NIEDRIG** Tabelle erst später löschen, damit ein Rückweg bleibt.

## Aufwand

Phase 1: 4 h · Phase 2: 2 h · Phase 3: 5 h · Phase 4: 2 h · Phase 5: 1 h · Test: 2 h · **etwa 16 Stunden**
