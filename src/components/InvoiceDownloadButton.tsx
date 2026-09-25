import { useState } from "react";
import { FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

/**
 * Laedt die Rechnung zu einer Bestellung oder Buchung.
 *
 * Die Funktion liefert das PDF direkt als Datei, nicht als JSON — deshalb hier
 * ein fetch statt supabase.functions.invoke, das den Rumpf als Text liest und
 * dabei die Binaerdaten zerstoeren wuerde.
 */
export function InvoiceDownloadButton({
  sourceId,
  receiptType,
  className,
  label = "Rechnung",
}: {
  sourceId: string;
  receiptType: string;
  className?: string;
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  const download = async () => {
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) {
        toast.error("Bitte melde dich an, um die Rechnung zu laden");
        return;
      }

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/receipt-pdf`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ source_id: sourceId, receipt_type: receiptType }),
        },
      );

      if (!res.ok) {
        const msg = await res.json().catch(() => null);
        toast.error(
          res.status === 404
            ? "Für diesen Vorgang gibt es noch keinen Beleg"
            : "Beleg konnte nicht geladen werden",
          { description: msg?.error },
        );
        return;
      }

      const blob = await res.blob();
      // Dateiname aus dem Content-Disposition, damit die Datei so heisst wie die
      // Belegnummer und im Downloadordner wiederzufinden ist.
      const disp = res.headers.get("Content-Disposition") ?? "";
      const name = /filename="([^"]+)"/.exec(disp)?.[1] ?? "Rechnung.pdf";

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error("Rechnung konnte nicht geladen werden", { description: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button size="sm" variant="outline" className={className} disabled={busy} onClick={download}>
      {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />}
      {label}
    </Button>
  );
}
