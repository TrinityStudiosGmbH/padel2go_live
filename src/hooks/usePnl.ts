import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { PnlBasis, PnlBucket, PnlRow } from "@/lib/pnl";
import { useStripeIsTest } from "@/hooks/useStripeIsTest";

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Zeilen von get_pnl() fuer einen Zeitraum. Nur Admins bekommen etwas zurueck. */
export function usePnl(from: Date, to: Date, basis: PnlBasis, bucket: PnlBucket, enabled = true) {
  const { data: isTest } = useStripeIsTest();
  return useQuery({
    queryKey: ["pnl", iso(from), iso(to), basis, bucket, isTest],
    enabled: enabled && isTest !== undefined,
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_pnl", {
        p_from: iso(from), p_to: iso(to), p_basis: basis, p_bucket: bucket,
      });
      if (error) throw error;
      return (data ?? []) as PnlRow[];
    },
  });
}

export type PnlEntryKind = "income" | "expense";
export type PnlRecurrence = "once" | "monthly" | "quarterly" | "yearly";

export interface PnlEntry {
  id: string;
  kind: PnlEntryKind;
  category: string;
  label: string;
  amount_cents: number;
  tax_rate: number;
  recurrence: PnlRecurrence;
  entry_date: string;
  end_date: string | null;
  notes: string | null;
}

export type PnlEntryInput = Omit<PnlEntry, "id">;

export function usePnlEntries() {
  return useQuery({
    queryKey: ["pnl-entries"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("pnl_entries")
        .select("id, kind, category, label, amount_cents, tax_rate, recurrence, entry_date, end_date, notes")
        .order("entry_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PnlEntry[];
    },
  });
}

export function usePnlEntryMutations() {
  const qc = useQueryClient();
  const done = () => {
    qc.invalidateQueries({ queryKey: ["pnl-entries"] });
    qc.invalidateQueries({ queryKey: ["pnl"] });
  };
  const save = useMutation({
    mutationFn: async ({ id, ...input }: PnlEntryInput & { id?: string }) => {
      const payload = { ...input, end_date: input.recurrence === "once" ? null : input.end_date, updated_at: new Date().toISOString() };
      const q = id
        ? (supabase as any).from("pnl_entries").update(payload).eq("id", id)
        : (supabase as any).from("pnl_entries").insert(payload);
      const { error } = await q;
      if (error) throw error;
    },
    onSuccess: done,
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from("pnl_entries").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: done,
  });
  return { save, remove };
}
