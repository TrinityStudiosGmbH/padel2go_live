# Plan: Profil-Onboarding nach dem ersten Login

**Datum:** 2026-09-17 · **Status:** Entwurf, wartet auf Freigabe

## Anforderung
Nach dem ersten Login eine einmalige Maske mit Begrüßung und Shader-Hintergrund, die alle Profil-Infos abfragt, die das Backend braucht, und sie im Profil speichert. Nichts kaputt machen, danach testen.

## Befund
- `profiles` hat bereits alles: `username` (unique, 3–30, a-z 0-9 . _), `display_name`, `age`, `avatar_url`, `skill_self_rating` (1–10, Default 5), `games_played_self`, `profile_completed_at`. **Keine Migration nötig.**
- Der Signup-Trigger legt nur eine leere Profilzeile an; Auth.tsx fragt bei Registrierung nur E-Mail, Passwort, AGB und Volljährigkeit ab.
- `skill_self_rating` und `games_played_self` werden **nirgends** abgefragt, nur gelesen (Defaults). `age` steuert die Alters-Rangliste, `username` das öffentliche Profil und Freunde, `display_name` Grußzeilen und Mails.
- `profile_completed_at` wird nur im Admin angezeigt; `rewards-trigger` kennt ein Event `profileCompleted` (Reward `PROFILE_COMPLETED`), das niemand auslöst.
- Shader: `SectionShaderBackdrop` (Three.js-Shader mit Akzentfarbe + Overlay) ist die vorhandene Vollflächen-Komponente.
- Username-Verfügbarkeitsprüfung und Avatar-Upload (Bucket `avatars`, `${user.id}/avatar.jpg`) existieren in `Account.tsx`.

## Umsetzung

### 1. Guard `RequireProfileComplete` (neu, `src/components/RequireProfileComplete.tsx`)
- Liest `profiles.profile_completed_at` des eingeloggten Users (React Query, Key `["profile-complete", userId]`).
- Nicht gesetzt → `<Navigate to="/willkommen?next=<aktueller Pfad>">`. Gesetzt → `<Outlet />`.
- In `App.tsx` **innerhalb** von `RequireAuth` um alle geschützten Routen gelegt (Account, Dashboard, Lobbies, Club, Admin). Einzige Ausnahme: `/willkommen` selbst.
- Bestehende Nutzer ohne Zeitstempel sehen die Maske genau einmal, vorausgefüllt mit dem, was schon da ist. Ohne Ausfüllen kommt niemand mehr ins Dashboard (gewollt: „das was wir backend brauchen“).

### 2. Seite `/willkommen` (neu, `src/pages/Onboarding.tsx`)
Vollbild, `SectionShaderBackdrop` in Lime, zentrierte Karte, Fortschrittspunkte, Framer-Motion-Übergänge, mobil ab 320 px.

| Schritt | Inhalt | Pflicht |
|---|---|---|
| 0 Begrüßung | „Willkommen bei PADEL2GO“, zwei Sätze, Button „Los geht's“ | – |
| 1 Name | Username (Live-Verfügbarkeit, Regeln wie Account) + Anzeigename | beide |
| 2 Alter | Zahl, 18–99 (Volljährigkeit wurde bei Registrierung bestätigt) | ja |
| 3 Spielstärke | Selbsteinschätzung 1–10 als Slider mit Beschreibung je Stufe + „Wie viele Matches hast du schon gespielt?“ (0 / 1–10 / 11–50 / 50+) | ja |
| 4 Foto | Avatar-Upload, „Überspringen“ erlaubt | nein |
| 5 Fertig | Zusammenfassung, Button „Zum Dashboard“ | – |

Speichern (Schritt 5): ein `update` auf `profiles` mit allen Feldern + `profile_completed_at = now()`, danach `rewards-trigger` Event `profileCompleted` (fire-and-forget, nur falls die Function einen User-JWT akzeptiert; sonst entfällt das), dann Redirect auf `?next` oder `/dashboard`.

### 3. Anpassungen
- `Auth.tsx`: nach Registrierung/Login weiter wie bisher; der Guard übernimmt die Umleitung.
- `Account.tsx`: Skill-Selbsteinschätzung und Matches-Anzahl werden dort **nicht** ergänzt (nicht Teil des Auftrags); Änderung später jederzeit über die Maske möglich? Nein — die Maske ist einmalig. Bearbeitung bleibt über Account (Username, Anzeigename, Alter, Avatar).
- i18n: neuer Namespace `onboarding` (de/en), Seite nutzt vorhandene `account.profileForm`-Texte für Feldhinweise.
- `RequireProfileComplete` in CLAUDE.md-Guards eintragen.

### 4. Test
- Build, Lint, Typecheck.
- Live-Test mit Playwright und einem eigens angelegten Testkonto (`onboarding-test-<zeit>@padel2go-official.de`, per SQL mit bestätigter E-Mail angelegt, danach wieder gelöscht): Login → Umleitung auf `/willkommen` → alle Schritte → Dashboard erreichbar → erneuter Login zeigt die Maske nicht mehr → Username-Kollision wird abgefangen.
- Mobil-Layout 375 px per Screenshot.

## Risiken
- **MITTEL** Admins/Club-User mit leerem Profil landen erst in der Maske. Bewusst, dauert 1 Minute.
- **NIEDRIG** Race: Profilzeile wird vom Trigger asynchron angelegt; beim allerersten Login direkt nach Bestätigung könnte die Zeile noch fehlen → Guard behandelt „keine Zeile“ wie „nicht vollständig“, Speichern nutzt `upsert`.
- **NIEDRIG** `rewards-trigger`-Auth unbekannt; wird geprüft, sonst weggelassen.

## Aufwand
~3 h (Guard 20 min, Seite 2 h, Test 40 min).
