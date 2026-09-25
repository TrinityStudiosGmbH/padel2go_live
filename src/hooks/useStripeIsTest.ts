import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Ob Stripe im Testbetrieb laeuft. Auswertungen zeigen den Betrieb, in dem man
 * sich befindet: im Testbetrieb Testbuchungen, im Echtbetrieb echte. Derselbe
 * Schalter, den auch die Datenbank fuer die Auslastung und das Stempeln neuer
 * Vorgaenge benutzt — public.stripe_is_test().
 */
export function useStripeIsTest() {
  return useQuery({
    queryKey: ["stripe-is-test"],
    queryFn: async () => {
      // Die Funktion steht noch nicht in den generierten Typen.
      const { data, error } = await (supabase.rpc as any)("stripe_is_test");
      if (error) throw error;
      return data === true;
    },
    staleTime: 60_000,
  });
}
