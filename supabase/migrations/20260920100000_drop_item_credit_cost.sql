-- ---------------------------------------------------------------------------
-- Punkte-Deckel je Produkt entfaellt
-- ---------------------------------------------------------------------------
-- Der maximale Punkterabatt wurde bisher je Produkt von Hand gepflegt
-- (marketplace_items.credit_cost). Das war doppelte Arbeit und fehleranfaellig:
-- die Zahl stand in Punkten da, der Kurs, der sie in Euro uebersetzt, lag auf
-- einer anderen Seite. Ein Deckel von 100 Punkten bei einem Kurs von 10.000
-- Punkten je Euro ergab einen Cent Rabatt, ohne dass das irgendwo auffiel.
--
-- Kuenftig rechnet sich der Deckel aus dem Warenwert und dem globalen Anteil
-- (site_settings.credits_payment_max_percent, Preise & Punkte). 170 EUR bei
-- 50 Prozent und 100 Punkten je Euro sind 8.500 Punkte — automatisch, fuer
-- jedes Produkt.
--
-- ACHTUNG REIHENFOLGE: erst die Anwendung ausrollen, dann diese Migration.
-- Das alte Bundle liest die Spalte noch und schreibt sie beim Anlegen eines
-- Produkts mit. Zwischen Deploy und Migration bitte kein Produkt neu anlegen.
--
-- marketplace_redemptions.credit_cost bleibt unangetastet: dort steht, wie
-- viele Punkte eine konkrete Bestellung tatsaechlich gekostet hat. Das ist ein
-- historischer Beleg, kein Einstellwert.
-- ---------------------------------------------------------------------------

BEGIN;

ALTER TABLE public.marketplace_items
  DROP CONSTRAINT IF EXISTS marketplace_items_credit_cost_check;

ALTER TABLE public.marketplace_items
  DROP COLUMN IF EXISTS credit_cost;

COMMIT;
