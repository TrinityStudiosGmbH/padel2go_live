/**
 * Die eine Stelle, an der Stripe-Zugangsdaten herkommen.
 *
 * Vorher holte sich jede der sechs zahlungsrelevanten Funktionen den Schluessel
 * selbst, jeweils mit eigener Kopie von "Umgebungsvariable zuerst, Datenbank
 * als Rueckfall". Genau dieses Muster hatte schon beim Mailversand dazu
 * gefuehrt, dass im Admin ein Schluessel stand und verschickt wurde mit einem
 * anderen.
 *
 * Hier entscheidet ein Schalter im Admin (Integrationen -> Stripe), ob die
 * Plattform im Echt- oder im Testbetrieb laeuft. Danach richtet sich, welches
 * Schluesselpaar gilt.
 */

export type StripeMode = "live" | "test";

export interface StripeCredentials {
  mode: StripeMode;
  secretKey: string;
  publishableKey: string;
  /** Kann leer sein: ohne Webhook-Geheimnis laesst sich nur nicht signieren pruefen. */
  webhookSecret: string;
}

interface StripeConfig {
  mode?: string;
  secret_key?: string;
  publishable_key?: string;
  webhook_secret?: string;
  test_secret_key?: string;
  test_publishable_key?: string;
  test_webhook_secret?: string;
}

const clean = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Passt der Schluessel zum Modus? Ein Live-Schluessel im Testbetrieb wuerde
 * echtes Geld bewegen, obwohl alle Beteiligten von einer Probe ausgehen. Der
 * umgekehrte Fall ist harmloser, aber genauso falsch: es kaeme nie Geld an.
 * Beides faellt hier auf, statt erst in der Abrechnung.
 */
function keyMatchesMode(key: string, mode: StripeMode): boolean {
  if (!key) return false;
  // Eingeschraenkte Schluessel (rk_) verhalten sich wie sk_ und tragen dieselbe
  // Modus-Kennung an derselben Stelle.
  const isTestKey = key.startsWith("sk_test_") || key.startsWith("rk_test_");
  const isLiveKey = key.startsWith("sk_live_") || key.startsWith("rk_live_");
  if (!isTestKey && !isLiveKey) return true; // unbekanntes Format nicht blockieren
  return mode === "test" ? isTestKey : isLiveKey;
}

/**
 * Liefert die aktiven Zugangsdaten. Wirft, wenn gar kein Schluessel hinterlegt
 * ist oder wenn der hinterlegte nicht zum eingestellten Modus passt.
 */
export async function resolveStripe(supabaseAdmin: any): Promise<StripeCredentials> {
  const { data } = await supabaseAdmin
    .from("site_integration_configs")
    .select("config")
    .eq("service", "stripe")
    .maybeSingle();

  const cfg = ((data?.config ?? {}) as StripeConfig) || {};
  const mode: StripeMode = clean(cfg.mode) === "test" ? "test" : "live";

  const secretKey = mode === "test"
    ? clean(cfg.test_secret_key) || clean(Deno.env.get("STRIPE_TEST_SECRET_KEY"))
    : clean(cfg.secret_key) || clean(Deno.env.get("STRIPE_SECRET_KEY"));

  const publishableKey = mode === "test"
    ? clean(cfg.test_publishable_key) || clean(Deno.env.get("STRIPE_TEST_PUBLISHABLE_KEY"))
    : clean(cfg.publishable_key) || clean(Deno.env.get("STRIPE_PUBLISHABLE_KEY"));

  const webhookSecret = mode === "test"
    ? clean(cfg.test_webhook_secret) || clean(Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET"))
    : clean(cfg.webhook_secret) || clean(Deno.env.get("STRIPE_WEBHOOK_SECRET"));

  if (!secretKey) {
    throw new Error(
      mode === "test"
        ? "Kein Stripe-Testschlüssel hinterlegt (Admin → Integrationen → Stripe)"
        : "Kein Stripe-Schlüssel hinterlegt (Admin → Integrationen → Stripe)",
    );
  }

  if (!keyMatchesMode(secretKey, mode)) {
    throw new Error(
      mode === "test"
        ? "Testbetrieb ist eingeschaltet, hinterlegt ist aber ein Live-Schlüssel. Zahlungen wären echt — abgebrochen."
        : "Echtbetrieb ist eingeschaltet, hinterlegt ist aber ein Test-Schlüssel. Es käme kein Geld an — abgebrochen.",
    );
  }

  return { mode, secretKey, publishableKey, webhookSecret };
}

/**
 * Beide Webhook-Geheimnisse, aktives zuerst. Der Webhook probiert sie der
 * Reihe nach durch: so bleibt er waehrend einer Umstellung funktionsfaehig,
 * wenn Stripe noch ein Ereignis aus dem anderen Modus nachliefert.
 */
export async function resolveWebhookSecrets(
  supabaseAdmin: any,
): Promise<{ secrets: { secret: string; mode: StripeMode }[]; keyFor: Record<StripeMode, string> }> {
  const { data } = await supabaseAdmin
    .from("site_integration_configs")
    .select("config")
    .eq("service", "stripe")
    .maybeSingle();

  const cfg = ((data?.config ?? {}) as StripeConfig) || {};
  const active: StripeMode = clean(cfg.mode) === "test" ? "test" : "live";

  const liveSecret = clean(cfg.webhook_secret) || clean(Deno.env.get("STRIPE_WEBHOOK_SECRET"));
  const testSecret = clean(cfg.test_webhook_secret) || clean(Deno.env.get("STRIPE_TEST_WEBHOOK_SECRET"));
  const liveKey = clean(cfg.secret_key) || clean(Deno.env.get("STRIPE_SECRET_KEY"));
  const testKey = clean(cfg.test_secret_key) || clean(Deno.env.get("STRIPE_TEST_SECRET_KEY"));

  const ordered: { secret: string; mode: StripeMode }[] = active === "test"
    ? [{ secret: testSecret, mode: "test" }, { secret: liveSecret, mode: "live" }]
    : [{ secret: liveSecret, mode: "live" }, { secret: testSecret, mode: "test" }];

  return {
    secrets: ordered.filter((s) => !!s.secret),
    keyFor: { live: liveKey, test: testKey },
  };
}
