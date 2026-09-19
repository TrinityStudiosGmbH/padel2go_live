import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { AlertTriangle, FileText, Loader2, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const FIELD_LABEL = "font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground";
const INPUT_CLASS = "h-[42px] rounded-[11px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[14px]";

type Field = { key: keyof Profile; label: string; placeholder?: string; required?: boolean };

interface Profile {
  company_name: string; address_line1: string; postal_code: string; city: string;
  country: string; vat_id: string; tax_number: string; register_court: string;
  register_number: string; managing_directors: string; email: string; phone: string;
  website: string; bank_name: string; iban: string; bic: string;
}

const EMPTY: Profile = {
  company_name: "", address_line1: "", postal_code: "", city: "", country: "Deutschland",
  vat_id: "", tax_number: "", register_court: "", register_number: "",
  managing_directors: "", email: "", phone: "", website: "", bank_name: "", iban: "", bic: "",
};

const GROUPS: { title: string; note?: string; fields: Field[] }[] = [
  {
    title: "Absender",
    fields: [
      { key: "company_name", label: "Firmenname", required: true },
      { key: "address_line1", label: "Straße und Nummer", required: true },
      { key: "postal_code", label: "PLZ", required: true },
      { key: "city", label: "Ort", required: true },
      { key: "country", label: "Land" },
    ],
  },
  {
    title: "Steuer und Register",
    note: "Eines von beiden — USt-IdNr. oder Steuernummer — muss auf jeder Rechnung stehen (§ 14 UStG).",
    fields: [
      { key: "vat_id", label: "USt-IdNr.", placeholder: "DE123456789" },
      { key: "tax_number", label: "Steuernummer", placeholder: "143/123/45678" },
      { key: "register_court", label: "Registergericht", placeholder: "Amtsgericht München" },
      { key: "register_number", label: "Registernummer", placeholder: "HRB 123456" },
      { key: "managing_directors", label: "Geschäftsführung" },
    ],
  },
  {
    title: "Kontakt und Bank",
    note: "Erscheint in der Fußzeile der Rechnung. Die Bankverbindung ist freiwillig, alles ist bereits bezahlt.",
    fields: [
      { key: "email", label: "E-Mail" },
      { key: "phone", label: "Telefon" },
      { key: "website", label: "Website" },
      { key: "bank_name", label: "Bank" },
      { key: "iban", label: "IBAN" },
      { key: "bic", label: "BIC" },
    ],
  },
];

/**
 * Absenderangaben fuer Rechnungen. Sie standen bisher nur als Text im
 * Impressum und waren damit fuer das Rechnungsdokument unerreichbar; eine
 * USt-IdNr. gab es ueberhaupt nicht.
 */
export function BillingProfilePanel() {
  const [form, setForm] = useState<Profile>(EMPTY);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data, error } = await (supabase as any)
        .from("billing_profile").select("*").eq("id", "global").maybeSingle();
      if (error) toast.error("Rechnungsangaben konnten nicht geladen werden", { description: error.message });
      else if (data) setForm({ ...EMPTY, ...(data as Profile) });
      setIsLoading(false);
    })();
  }, []);

  const set = (key: keyof Profile, value: string) => setForm((p) => ({ ...p, [key]: value }));

  const save = async () => {
    const missing = GROUPS.flatMap((g) => g.fields).filter((f) => f.required && !form[f.key].trim());
    if (missing.length) {
      toast.error("Pflichtangabe fehlt", { description: missing.map((m) => m.label).join(", ") });
      return;
    }
    setIsSaving(true);
    const { error } = await (supabase as any)
      .from("billing_profile")
      .update({ ...form, updated_at: new Date().toISOString() })
      .eq("id", "global");
    if (error) toast.error("Fehler beim Speichern", { description: error.message });
    else toast.success("Rechnungsangaben gespeichert");
    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      </Card>
    );
  }

  const noTaxId = !form.vat_id.trim() && !form.tax_number.trim();

  return (
    <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
      <div className="flex flex-col gap-[18px]">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-[34px] w-[34px] flex-none items-center justify-center rounded-[10px] border border-primary/30 bg-primary/10 text-primary">
            <FileText className="h-4 w-4" />
          </span>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="font-display text-base font-bold tracking-tight text-foreground">
              Rechnungsangaben
            </h2>
            <span className="text-[13px] leading-normal text-muted-foreground">
              Steht auf jeder Rechnung, die Kunden herunterladen.
            </span>
          </div>
        </div>

        {noTaxId && (
          <div className="flex items-start gap-3 rounded-[13px] border border-[hsl(41_100%_65%/0.22)] bg-[hsl(41_100%_65%/0.06)] px-[15px] py-[13px]">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-[#FFC44D]" />
            <span className="text-[12.5px] leading-relaxed text-[hsl(0_0%_78%)]">
              Weder USt-IdNr. noch Steuernummer hinterlegt. Ohne eine der beiden Angaben ist eine
              Rechnung nach § 14 UStG unvollständig und der Kunde kann die Vorsteuer nicht ziehen.
            </span>
          </div>
        )}

        {GROUPS.map((group) => (
          <div key={group.title} className="flex flex-col gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-primary">
              {group.title}
            </span>
            {group.note && (
              <span className="-mt-1 text-[11.5px] leading-relaxed text-muted-foreground">
                {group.note}
              </span>
            )}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(220px,100%),1fr))] gap-3">
              {group.fields.map((f) => (
                <div key={String(f.key)} className="flex flex-col gap-[7px]">
                  <Label className={FIELD_LABEL}>
                    {f.label}
                    {f.required && <span className="text-primary"> *</span>}
                  </Label>
                  <Input
                    value={form[f.key]}
                    placeholder={f.placeholder}
                    onChange={(e) => set(f.key, e.target.value)}
                    className={INPUT_CLASS}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}

        <Button
          onClick={save}
          disabled={isSaving}
          className="h-[42px] w-fit gap-2 rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] transition-opacity hover:opacity-90"
        >
          {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Rechnungsangaben speichern
        </Button>
      </div>
    </Card>
  );
}
