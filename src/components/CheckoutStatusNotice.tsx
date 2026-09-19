import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Clock, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { NavLink } from "@/components/NavLink";
import { invokeEdgeFunction } from "@/lib/edgeFunctionUtils";

/**
 * Prueft bei Stripe nach, was mit einer Bezahlsitzung wirklich passiert ist.
 *
 * Vorher zeigten die Erfolgsseiten "Vielen Dank" allein deshalb, weil Stripe
 * dorthin weitergeleitet hat. Das stimmt aber nicht immer: die Weiterleitung
 * passiert auch, wenn der Kunde im Stripe-Fenster abbricht und den Zurueck-Pfeil
 * benutzt, und sie sagt nichts darueber, ob die Buchung schon verbucht ist.
 */
export type CheckoutState = "loading" | "confirmed" | "processing" | "open" | "expired" | "unknown";

interface VerifyResponse {
  state: Exclude<CheckoutState, "loading">;
  resume_url?: string | null;
  reference?: string | null;
  kind?: "booking" | "marketplace" | null;
}

export function useCheckoutVerification(sessionId: string | null) {
  const [state, setState] = useState<CheckoutState>(sessionId ? "loading" : "unknown");
  const [resumeUrl, setResumeUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setState("unknown");
      return;
    }
    let cancelled = false;
    let attempt = 0;

    const check = async () => {
      const { data, error } = await invokeEdgeFunction<VerifyResponse>("verify-checkout-session", {
        body: { session_id: sessionId },
      });
      if (cancelled) return;

      if (error || !data?.state) {
        // Lieber nichts behaupten als etwas Falsches: die Seite bleibt dann bei
        // ihrer normalen Darstellung.
        setState("unknown");
        return;
      }

      setResumeUrl(data.resume_url ?? null);

      // "processing" heisst: Geld ist da, die Verbuchung laeuft noch. Das dauert
      // normalerweise ein bis zwei Sekunden, deshalb kurz nachfassen, bevor wir
      // den Kunden mit einem Hinweis behelligen.
      if (data.state === "processing" && attempt < 4) {
        attempt += 1;
        setTimeout(check, 1500);
        return;
      }

      setState(data.state);
    };

    check();
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  return { state, resumeUrl };
}

/** Zeigt nur dann etwas, wenn der Kunde etwas wissen muss. */
export function CheckoutStatusNotice({
  state,
  resumeUrl,
  backTo,
  backLabel,
}: {
  state: CheckoutState;
  resumeUrl: string | null;
  backTo: string;
  backLabel: string;
}) {
  if (state === "confirmed" || state === "unknown") return null;

  if (state === "loading") {
    return (
      <div className="flex items-center justify-center gap-2 text-[13.5px] text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Zahlung wird geprüft …
      </div>
    );
  }

  if (state === "processing") {
    return (
      <div className="flex w-full items-start gap-3 rounded-2xl border border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.08)] px-4 py-3.5 text-left">
        <Clock className="mt-0.5 h-5 w-5 flex-none text-[#FFC44D]" />
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-bold text-[#FFC44D]">Zahlung eingegangen, Bestätigung folgt</span>
          <span className="text-[13px] leading-relaxed text-[hsl(0_0%_78%)]">
            Dein Geld ist bei uns, die Buchung wird gerade abgeschlossen. Die Bestätigung kommt
            per E-Mail, meist innerhalb einer Minute. Falls nach 15 Minuten nichts da ist, melde
            dich bitte kurz bei uns.
          </span>
        </div>
      </div>
    );
  }

  // open / expired: es ist KEIN Geld geflossen.
  const isOpen = state === "open";
  return (
    <div className="flex w-full flex-col gap-3 rounded-2xl border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.08)] px-4 py-3.5 text-left">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-[#FF6B6B]" />
        <div className="flex flex-col gap-1">
          <span className="text-[14px] font-bold text-[#FF6B6B]">
            {isOpen ? "Zahlung noch nicht abgeschlossen" : "Zahlung abgebrochen"}
          </span>
          <span className="text-[13px] leading-relaxed text-[hsl(0_0%_78%)]">
            {isOpen
              ? "Es wurde noch nichts abgebucht. Du kannst die Zahlung jetzt abschließen."
              : "Es wurde nichts abgebucht und der Bezahlvorgang ist abgelaufen."}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2 pl-8">
        {isOpen && resumeUrl && (
          <Button variant="lime" size="sm" asChild className="gap-2">
            <a href={resumeUrl}>
              <CreditCard className="h-4 w-4" />
              Zahlung abschließen
            </a>
          </Button>
        )}
        <Button variant="outline" size="sm" asChild>
          <NavLink to={backTo}>{backLabel}</NavLink>
        </Button>
      </div>
    </div>
  );
}
