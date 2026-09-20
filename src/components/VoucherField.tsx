import { useState } from "react";
import { Check, Loader2, Tag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";

export interface AppliedVoucher {
  id: string;
  code: string;
  discountType: string;
  discountValue: number;
  discountLabel: string;
}

/**
 * Gutscheinfeld fuer Buchung und Marketplace, fuer Angemeldete wie Gaeste.
 *
 * Der Code wird nur geprueft, nicht verbraucht — verbucht wird er erst beim
 * Bezahlen, serverseitig. Die Anzeige hier ist eine Vorschau, die der Server
 * nicht glaubt: er rechnet den Rabatt selbst aus dem hinterlegten Gutschein.
 */
export function VoucherField({
  context,
  applied,
  onApply,
  onClear,
  className,
}: {
  context: "booking" | "marketplace";
  applied: AppliedVoucher | null;
  onApply: (v: AppliedVoucher) => void;
  onClear: () => void;
  className?: string;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const check = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("voucher-validate", {
        body: { code: trimmed, context },
      });
      if (fnError) {
        setError("Code konnte nicht geprüft werden");
        return;
      }
      const res = data as {
        valid?: boolean; reason?: string; voucher_id?: string;
        discount_type?: string; discount_value?: number; discount_label?: string;
      };
      if (!res?.valid || !res.voucher_id) {
        setError(res?.reason ?? "Ungültiger Code");
        return;
      }
      onApply({
        id: res.voucher_id,
        code: trimmed,
        discountType: res.discount_type ?? "free",
        discountValue: res.discount_value ?? 0,
        discountLabel: res.discount_label ?? "Rabatt",
      });
      setCode("");
    } finally {
      setBusy(false);
    }
  };

  if (applied) {
    return (
      <div className={`flex items-center gap-3 rounded-2xl border border-primary/25 bg-primary/[0.06] px-4 py-3 ${className ?? ""}`}>
        <Check className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 text-[13px] leading-snug">
          <span className="font-mono font-bold">{applied.code}</span>
          <span className="text-muted-foreground"> · {applied.discountLabel}</span>
        </span>
        <button
          type="button"
          onClick={onClear}
          aria-label="Gutschein entfernen"
          className="shrink-0 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 rounded-2xl border border-border bg-white/[0.03] px-4 py-3.5 ${className ?? ""}`}>
      <div className="flex items-center gap-2.5">
        <Tag className="h-4 w-4 text-primary" />
        <span className="text-[13.5px] font-bold">Gutscheincode</span>
      </div>
      <div className="flex gap-2">
        <Input
          value={code}
          placeholder="z. B. PADEL10"
          onChange={(e) => { setCode(e.target.value.toUpperCase()); setError(null); }}
          onKeyDown={(e) => e.key === "Enter" && check()}
          className="h-10 font-mono text-[14px]"
        />
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0"
          disabled={!code.trim() || busy}
          onClick={check}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Einlösen"}
        </Button>
      </div>
      {error && <span className="text-[12.5px] text-destructive">{error}</span>}
    </div>
  );
}
