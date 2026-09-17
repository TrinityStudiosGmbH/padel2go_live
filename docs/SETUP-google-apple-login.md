# Google- und Apple-Login einrichten

**Stand 17.09.2026.** Der Code ist fertig und deployed — die Buttons stehen auf `/auth`.
Es fehlt nur die Konfiguration bei Google, Apple und Supabase.

Gemessener Ist-Zustand (über den Auth-Endpunkt des Projekts geprüft):

| Provider | Zustand | Meldung des Servers |
|---|---|---|
| Google | nicht aktiviert | `provider is not enabled` |
| Apple | Schalter an, Zugangsdaten fehlen | `missing OAuth secret` |

Projekt: `wvvdkuextsbsecqbfksb` · Dashboard: https://supabase.com/dashboard/project/wvvdkuextsbsecqbfksb

---

## 0. Werte, die überall gebraucht werden

| Zweck | Wert |
|---|---|
| Supabase-Callback (Redirect-URI bei Google/Apple) | `https://wvvdkuextsbsecqbfksb.supabase.co/auth/v1/callback` |
| Domain der Website | `www.padel2go-official.de` |
| Rücksprungziel der App nach dem Login | `https://www.padel2go-official.de/auth` |

### Zuerst: Redirect-Liste in Supabase erweitern
Dashboard → **Authentication → URL Configuration**

- **Site URL:** `https://www.padel2go-official.de`
- **Redirect URLs:** diese drei Einträge ergänzen
  ```
  https://www.padel2go-official.de/**
  http://localhost:8080/**
  https://*.vercel.app/**
  ```
  Ohne die Sternchen bricht der Rücksprung ab, weil unser Link eine Zusatzangabe
  trägt (`/auth?redirect=/lobbies`).

---

## 1. Google

### 1a. Google Cloud Console (https://console.cloud.google.com)
1. Oben links ein Projekt wählen oder neu anlegen, z. B. „PADEL2GO“.
2. **APIs & Dienste → OAuth-Zustimmungsbildschirm**
   - Nutzertyp **Extern**, dann **Erstellen**
   - App-Name `PADEL2GO`, Support-E-Mail `info@padel2go-official.de`
   - **Autorisierte Domains:** `padel2go-official.de` und `supabase.co`
   - Logo hochladen (optional, erscheint im Google-Dialog)
   - Speichern. Solange die App im Status „Testing“ steht, können sich nur
     eingetragene Testnutzer anmelden → am Ende auf **Veröffentlichen** klicken.
3. **APIs & Dienste → Anmeldedaten → Anmeldedaten erstellen → OAuth-Client-ID**
   - Anwendungstyp **Webanwendung**, Name z. B. „PADEL2GO Web“
   - **Autorisierte JavaScript-Quellen:**
     ```
     https://www.padel2go-official.de
     http://localhost:8080
     ```
   - **Autorisierte Weiterleitungs-URIs:** (genau diese eine Zeile)
     ```
     https://wvvdkuextsbsecqbfksb.supabase.co/auth/v1/callback
     ```
   - **Erstellen** → es erscheinen **Client-ID** und **Client-Schlüssel**. Beide behalten.

### 1b. Supabase
Dashboard → **Authentication → Sign In / Providers → Google**
- **Enable Sign in with Google** einschalten
- **Client IDs:** die Client-ID aus 1a
- **Client Secret:** den Client-Schlüssel aus 1a
- **Save**

Fertig. Danach kann ich per Test bestätigen, dass der Endpunkt sauber zu Google weiterleitet.

---

## 2. Apple

⚠️ Apple verlangt eine **zahlungspflichtige Mitgliedschaft im Apple Developer Program**
(99 € pro Jahr). Ohne die geht „Sign in with Apple“ nicht.

### 2a. Apple Developer Portal (https://developer.apple.com/account)
1. **Certificates, Identifiers & Profiles → Identifiers → App ID** (falls noch keine existiert)
   - Typ **App**, Beschreibung `PADEL2GO`, Bundle-ID z. B. `eu.padel2go.app`
   - Unter **Capabilities** „Sign In with Apple“ anhaken → Speichern
2. **Identifiers → neuer Eintrag → Services IDs**
   - Beschreibung `PADEL2GO Web`, Identifier z. B. `eu.padel2go.web`
   - Diesen Identifier notieren — er ist bei Supabase die **Client-ID**
   - Nach dem Anlegen den Eintrag öffnen, **Sign In with Apple** anhaken → **Configure**
     - **Primary App ID:** die App-ID aus Schritt 1
     - **Domains and Subdomains:** `www.padel2go-official.de`
     - **Return URLs:** `https://wvvdkuextsbsecqbfksb.supabase.co/auth/v1/callback`
     - Speichern
3. **Keys → neuer Schlüssel**
   - Name `PADEL2GO Sign in with Apple`, **Sign in with Apple** anhaken
   - **Configure** → Primary App ID auswählen
   - Erzeugen und die **`.p8`-Datei herunterladen**. Apple bietet sie nur **einmal**
     zum Download an — sicher ablegen.
   - **Key ID** notieren (steht beim Schlüssel)
4. **Team ID** notieren: oben rechts im Portal unter „Membership“.

### 2b. Supabase
Dashboard → **Authentication → Sign In / Providers → Apple**
- **Enable Sign in with Apple** bleibt an
- **Client IDs:** die Services ID aus 2a, also z. B. `eu.padel2go.web`
- **Secret Key:** hier gehört der Inhalt der `.p8`-Datei hinein, zusammen mit
  **Team ID** und **Key ID** in die jeweiligen Felder. Supabase baut daraus das
  von Apple verlangte, halbjährlich ablaufende Token selbst.
  Falls die Maske nur ein einzelnes Secret-Feld zeigt: den `.p8`-Inhalt als Ganzes
  einfügen, inklusive der Zeilen `-----BEGIN PRIVATE KEY-----` und `-----END PRIVATE KEY-----`.
- **Save**

### 2c. Zwei Besonderheiten bei Apple
- **Name und E-Mail kommen nur beim allerersten Login.** Unsere Onboarding-Maske
  fängt das ab: fehlt der Name, wird er dort abgefragt. Kein Handlungsbedarf.
- **Private Relay.** Nutzer können ihre Adresse verbergen, dann bekommen wir eine
  Adresse auf `@privaterelay.appleid.com`. Damit Buchungsbestätigungen dort ankommen,
  muss `padel2go-official.de` im Apple-Portal unter
  **Certificates, Identifiers & Profiles → Services → Sign in with Apple for Email Communication**
  als Absender-Domain eingetragen und verifiziert werden (SPF-Eintrag). Sonst laufen
  Mails an diese Nutzer ins Leere.

---

## 3. Prüfen

Nach dem Speichern in Supabase lässt sich der Zustand ohne Anmeldung messen:

```
curl -s "https://wvvdkuextsbsecqbfksb.supabase.co/auth/v1/authorize?provider=google&redirect_to=https%3A%2F%2Fwww.padel2go-official.de%2Fauth" | head -c 200
```

- **Richtig konfiguriert:** eine Weiterleitung (HTTP 302) zu `accounts.google.com`
  bzw. `appleid.apple.com`
- `provider is not enabled` → Schalter in Supabase noch aus
- `missing OAuth secret` → Zugangsdaten fehlen oder sind leer

Danach den echten Durchlauf auf https://www.padel2go-official.de/auth testen:
Button drücken, Konto wählen, zurückkommen. Ein neues Konto landet automatisch
in der Profil-Maske unter `/willkommen`.

---

## 4. Häufige Fehler

| Meldung | Ursache |
|---|---|
| `redirect_uri_mismatch` (Google) | Die Weiterleitungs-URI in der Cloud Console stimmt nicht exakt mit dem Supabase-Callback überein |
| `invalid_client` (Apple) | Services ID, Team ID oder Key ID falsch, oder das Secret ist abgelaufen |
| Rücksprung landet auf der Startseite statt im Konto | Redirect URLs in Supabase ohne `/**` |
| Google zeigt „App nicht verifiziert“ | Zustimmungsbildschirm steht noch auf „Testing“ → veröffentlichen |
