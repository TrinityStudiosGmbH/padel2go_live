import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Trash2, Pencil, Copy, Percent, Euro, Gift, Dices, AlertTriangle, Search, Ticket, CheckCheck, ClockAlert, CalendarDays, ShoppingBag, Layers } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { format } from "date-fns";
import { de } from "date-fns/locale";
import { useAuth } from "@/hooks/useAuth";

interface VoucherCode {
  id: string;
  code: string;
  description: string | null;
  scope: string;           // 'booking' | 'marketplace' | 'both'
  discount_type: string;   // 'free' | 'percentage' | 'fixed'
  discount_value: number;  // percentage (1-100) or cents
  is_active: boolean;
  max_uses: number | null;
  current_uses: number;
  valid_from: string;
  valid_until: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

function discountBadge(v: VoucherCode) {
  if (v.discount_type === "percentage") {
    return (
      <Badge
        variant="outline"
        className="gap-1 whitespace-nowrap rounded-full border-[hsl(200_100%_75%/0.3)] bg-[hsl(200_100%_75%/0.1)] px-[11px] py-1 font-mono text-xs font-bold text-[#7FD4FF]"
      >
        <Percent className="h-3 w-3" />
        {v.discount_value} %
      </Badge>
    );
  }
  if (v.discount_type === "fixed") {
    const euros = (v.discount_value / 100).toFixed(2).replace(".", ",");
    return (
      <Badge
        variant="outline"
        className="gap-1 whitespace-nowrap rounded-full border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] px-[11px] py-1 font-mono text-xs font-bold text-[#FFC44D]"
      >
        <Euro className="h-3 w-3" />
        {euros} €
      </Badge>
    );
  }
  return (
    <Badge
      variant="outline"
      className="gap-1 whitespace-nowrap rounded-full border-primary/[0.35] bg-primary/[0.12] px-[11px] py-1 font-mono text-xs font-bold text-primary"
    >
      <Gift className="h-3 w-3" />
      Gratis
    </Badge>
  );
}

function generateCode(): string {
  // 32-char alphabet divides 256 evenly, so a simple modulo is unbiased
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars.charAt(b % chars.length)).join("");
}

export default function AdminVouchers() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [editVoucher, setEditVoucher] = useState<VoucherCode | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Form state
  const [formCode, setFormCode] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formDiscountType, setFormDiscountType] = useState<"free" | "percentage" | "fixed">("free");
  const [formScope, setFormScope] = useState<"booking" | "marketplace" | "both">("booking");
  const [formDiscountValue, setFormDiscountValue] = useState("");
  const [formMaxUses, setFormMaxUses] = useState("");
  const [formValidFrom, setFormValidFrom] = useState("");
  const [formValidUntil, setFormValidUntil] = useState("");
  const [formIsActive, setFormIsActive] = useState(true);

  const { data: vouchers = [], isLoading } = useQuery({
    queryKey: ["admin-vouchers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("voucher_codes")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as VoucherCode[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (voucher: Partial<VoucherCode>) => {
      const { error } = await supabase.from("voucher_codes").insert({
        code: voucher.code!.toUpperCase(),
        description: voucher.description || null,
        discount_type: voucher.discount_type || "free",
        discount_value: voucher.discount_value || 0,
        is_active: voucher.is_active ?? true,
        max_uses: voucher.max_uses || null,
        valid_from: voucher.valid_from || new Date().toISOString(),
        valid_until: voucher.valid_until || null,
        created_by: user!.id,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] });
      toast.success("Voucher erstellt");
      resetForm();
      setCreateOpen(false);
    },
    onError: (err: Error) => {
      toast.error("Fehler", { description: err.message });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (voucher: Partial<VoucherCode> & { id: string }) => {
      const { error } = await supabase
        .from("voucher_codes")
        .update({
          code: voucher.code?.toUpperCase(),
          description: voucher.description,
          discount_type: voucher.discount_type,
          discount_value: voucher.discount_value,
          is_active: voucher.is_active,
          max_uses: voucher.max_uses,
          valid_from: voucher.valid_from,
          valid_until: voucher.valid_until,
        })
        .eq("id", voucher.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] });
      toast.success("Voucher aktualisiert");
      setEditVoucher(null);
    },
    onError: (err: Error) => {
      toast.error("Fehler", { description: err.message });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("voucher_codes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] });
      toast.success("Voucher gelöscht");
    },
    onError: (err: Error) => {
      toast.error("Fehler", { description: err.message });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from("voucher_codes")
        .update({ is_active })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-vouchers"] });
    },
    onError: (err: Error) => {
      toast.error("Status konnte nicht geändert werden: " + err.message);
    },
  });

  const resetForm = () => {
    setFormCode("");
    setFormDescription("");
    setFormDiscountType("free");
    setFormScope("booking");
    setFormDiscountValue("");
    setFormMaxUses("");
    setFormValidFrom("");
    setFormValidUntil("");
    setFormIsActive(true);
  };

  const openCreate = () => {
    resetForm();
    setFormCode(generateCode());
    setCreateOpen(true);
  };

  const openEdit = (v: VoucherCode) => {
    setEditVoucher(v);
    setFormCode(v.code);
    setFormDescription(v.description || "");
    setFormDiscountType((v.discount_type as "free" | "percentage" | "fixed") || "free");
    setFormScope((v.scope as "booking" | "marketplace" | "both") || "booking");
    setFormDiscountValue(
      v.discount_type === "fixed"
        ? ((v.discount_value || 0) / 100).toFixed(2)
        : v.discount_value?.toString() || ""
    );
    setFormMaxUses(v.max_uses?.toString() || "");
    setFormValidFrom(v.valid_from ? format(new Date(v.valid_from), "yyyy-MM-dd'T'HH:mm") : "");
    setFormValidUntil(v.valid_until ? format(new Date(v.valid_until), "yyyy-MM-dd'T'HH:mm") : "");
    setFormIsActive(v.is_active);
  };

  const parseDiscountValue = (): number => {
    if (formDiscountType === "free") return 0;
    const raw = parseFloat(formDiscountValue || "0");
    if (isNaN(raw) || raw <= 0) return 0;
    if (formDiscountType === "fixed") return Math.round(raw * 100); // euros → cents
    return Math.min(100, Math.round(raw)); // percentage: cap at 100
  };

  const handleCreate = () => {
    if (!formCode.trim()) return toast.error("Code ist erforderlich");
    if (formDiscountType !== "free" && (!formDiscountValue || parseDiscountValue() === 0)) {
      return toast.error("Rabattwert erforderlich");
    }
    createMutation.mutate({
      code: formCode.trim(),
      description: formDescription.trim() || null,
      scope: formScope,
      discount_type: formDiscountType,
      discount_value: parseDiscountValue(),
      max_uses: formMaxUses ? parseInt(formMaxUses) : null,
      valid_from: formValidFrom ? new Date(formValidFrom).toISOString() : new Date().toISOString(),
      valid_until: formValidUntil ? new Date(formValidUntil).toISOString() : null,
      is_active: formIsActive,
    });
  };

  const handleUpdate = () => {
    if (!editVoucher) return;
    if (!formCode.trim()) return toast.error("Code ist erforderlich");
    if (formDiscountType !== "free" && (!formDiscountValue || parseDiscountValue() === 0)) {
      return toast.error("Rabattwert erforderlich");
    }
    updateMutation.mutate({
      id: editVoucher.id,
      code: formCode.trim(),
      description: formDescription.trim() || null,
      scope: formScope,
      discount_type: formDiscountType,
      discount_value: parseDiscountValue(),
      max_uses: formMaxUses ? parseInt(formMaxUses) : null,
      valid_from: formValidFrom ? new Date(formValidFrom).toISOString() : editVoucher.valid_from,
      valid_until: formValidUntil ? new Date(formValidUntil).toISOString() : null,
      is_active: formIsActive,
    });
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("Code kopiert!");
  };

  const isExpired = (v: VoucherCode) =>
    v.valid_until && new Date(v.valid_until) < new Date();

  const isUsedUp = (v: VoucherCode) =>
    v.max_uses !== null && v.current_uses >= v.max_uses;

  // Derived from the already-loaded voucher list — no extra query
  const searchTerm = search.trim().toLowerCase();
  const filteredVouchers = searchTerm
    ? vouchers.filter(
        (v) =>
          v.code.toLowerCase().includes(searchTerm) ||
          (v.description || "").toLowerCase().includes(searchTerm)
      )
    : vouchers;

  const activeCount = vouchers.filter((v) => v.is_active && !isExpired(v) && !isUsedUp(v)).length;
  const totalRedemptions = vouchers.reduce((sum, v) => sum + (v.current_uses || 0), 0);
  const expiredOrUsedUpCount = vouchers.filter((v) => isExpired(v) || isUsedUp(v)).length;

  const kpis = [
    { label: "Aktive Codes", value: activeCount.toLocaleString("de-DE"), icon: Ticket, color: "text-primary" },
    { label: "Einlösungen gesamt", value: totalRedemptions.toLocaleString("de-DE"), icon: CheckCheck, color: "text-foreground" },
    { label: "Abgelaufen / aufgebraucht", value: expiredOrUsedUpCount.toLocaleString("de-DE"), icon: ClockAlert, color: "text-[#FFC44D]" },
  ];

  const getStatusBadge = (v: VoucherCode) => {
    if (!v.is_active)
      return (
        <Badge
          variant="secondary"
          className="gap-1.5 whitespace-nowrap rounded-full border border-[hsl(0_0%_18%)] bg-white/5 px-2.5 py-1 text-[11px] font-bold text-[hsl(0_0%_65%)]"
        >
          <span className="h-[5px] w-[5px] rounded-full bg-[hsl(0_0%_65%)]" />
          Inaktiv
        </Badge>
      );
    if (isExpired(v))
      return (
        <Badge
          variant="destructive"
          className="gap-1.5 whitespace-nowrap rounded-full border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] px-2.5 py-1 text-[11px] font-bold text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.1)]"
        >
          <span className="h-[5px] w-[5px] rounded-full bg-[#FF6B6B]" />
          Abgelaufen
        </Badge>
      );
    if (isUsedUp(v))
      return (
        <Badge
          variant="outline"
          className="gap-1.5 whitespace-nowrap rounded-full border-[hsl(41_100%_65%/0.3)] bg-[hsl(41_100%_65%/0.1)] px-2.5 py-1 text-[11px] font-bold text-[#FFC44D]"
        >
          <span className="h-[5px] w-[5px] rounded-full bg-[#FFC44D]" />
          Aufgebraucht
        </Badge>
      );
    return (
      <Badge className="gap-1.5 whitespace-nowrap rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-[11px] font-bold text-primary hover:bg-primary/10">
        <span className="h-[5px] w-[5px] rounded-full bg-primary" />
        Aktiv
      </Badge>
    );
  };

  const formFields = (
    <div className="flex flex-col gap-[17px]">
      <div className="flex flex-col gap-[7px]">
        <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Code<span className="text-primary"> *</span>
        </Label>
        <div className="flex gap-2">
          <Input
            value={formCode}
            onChange={(e) => setFormCode(e.target.value.toUpperCase())}
            placeholder="FREEPLAY"
            className="h-[42px] min-w-0 flex-1 rounded-[11px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[15px] font-bold uppercase tracking-[0.12em]"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFormCode(generateCode())}
            className="h-[42px] gap-[7px] rounded-[11px] border-primary/30 bg-primary/[0.09] px-[15px] text-[13px] font-bold text-primary hover:bg-primary/[0.18] hover:text-primary"
          >
            <Dices className="h-[15px] w-[15px]" />
            Generieren
          </Button>
        </div>
        <span className="text-[11.5px] text-[hsl(0_0%_58%)]">
          8 Zeichen, keine verwechselbaren Buchstaben (kein I, O, 0, 1).
        </span>
      </div>

      <div className="flex flex-col gap-[7px]">
        <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Beschreibung (optional)
        </Label>
        <Input
          value={formDescription}
          onChange={(e) => setFormDescription(e.target.value)}
          placeholder="z.B. Promo-Aktion März"
          className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]"
        />
      </div>

      {/* Geltungsbereich */}
      <div className="flex flex-col gap-[7px]">
        <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Gilt für<span className="text-primary"> *</span>
        </Label>
        <Select value={formScope} onValueChange={(v) => setFormScope(v as "booking" | "marketplace" | "both")}>
          <SelectTrigger className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-[hsl(0_0%_15%)] bg-[hsl(0_0%_6%)]">
            <SelectItem value="booking">
              <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4 text-primary" /> Nur Platzbuchungen</span>
            </SelectItem>
            <SelectItem value="marketplace">
              <span className="flex items-center gap-2"><ShoppingBag className="h-4 w-4 text-[#7FD4FF]" /> Nur Marketplace</span>
            </SelectItem>
            <SelectItem value="both">
              <span className="flex items-center gap-2"><Layers className="h-4 w-4 text-[#FFC44D]" /> Beides</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Discount type + value */}
      <div className="flex flex-col gap-[7px]">
        <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Rabatt-Typ<span className="text-primary"> *</span>
        </Label>
        <Select value={formDiscountType} onValueChange={(v) => { setFormDiscountType(v as "free" | "percentage" | "fixed"); setFormDiscountValue(""); }}>
          <SelectTrigger className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] text-[13.5px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="rounded-xl border-[hsl(0_0%_15%)] bg-[hsl(0_0%_6%)]">
            <SelectItem value="free">
              <span className="flex items-center gap-2"><Gift className="h-4 w-4 text-primary" /> Gratis (100 % Rabatt)</span>
            </SelectItem>
            <SelectItem value="percentage">
              <span className="flex items-center gap-2"><Percent className="h-4 w-4 text-[#7FD4FF]" /> Prozentualer Rabatt</span>
            </SelectItem>
            <SelectItem value="fixed">
              <span className="flex items-center gap-2"><Euro className="h-4 w-4 text-[#FFC44D]" /> Festbetrag-Rabatt</span>
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      {formDiscountType === "percentage" && (
        <div className="flex flex-col gap-[7px]">
          <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Rabatt in %<span className="text-primary"> *</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number" min="1" max="99"
              value={formDiscountValue}
              onChange={(e) => setFormDiscountValue(e.target.value)}
              placeholder="z.B. 20"
              className="h-10 w-32 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-sm font-bold"
            />
            <span className="text-muted-foreground">%</span>
          </div>
          <span className="text-[11.5px] text-[hsl(0_0%_58%)]">
            1–99, für 100 % → Typ „Gratis" wählen.
          </span>
        </div>
      )}

      {formDiscountType === "fixed" && (
        <div className="flex flex-col gap-[7px]">
          <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Rabatt in €<span className="text-primary"> *</span>
          </Label>
          <div className="flex items-center gap-2">
            <Input
              type="number" min="0.50" step="0.01"
              value={formDiscountValue}
              onChange={(e) => setFormDiscountValue(e.target.value)}
              placeholder="z.B. 10.00"
              className="h-10 w-32 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-sm font-bold"
            />
            <span className="text-muted-foreground">€</span>
          </div>
          <span className="text-[11.5px] text-[hsl(0_0%_58%)]">
            Wird vom Courtpreis abgezogen.
          </span>
        </div>
      )}

      <div className="flex flex-col gap-[7px]">
        <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
          Max. Nutzungen
        </Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min="1"
            value={formMaxUses}
            onChange={(e) => setFormMaxUses(e.target.value)}
            placeholder="Unbegrenzt"
            className="h-10 w-40 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-sm font-bold"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setFormMaxUses("1")}
            className="h-10 rounded-[10px] border-[hsl(0_0%_16%)] bg-white/5 px-[15px] text-[12.5px] font-bold text-[hsl(0_0%_85%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
          >
            Einmalig
          </Button>
        </div>
        <p className="text-[11.5px] text-[hsl(0_0%_58%)]">Leer lassen für unbegrenzte Nutzungen.</p>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3">
        <div className="flex flex-col gap-[7px]">
          <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Gültig ab
          </Label>
          <Input
            type="datetime-local"
            value={formValidFrom}
            onChange={(e) => setFormValidFrom(e.target.value)}
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[13px]"
          />
        </div>
        <div className="flex flex-col gap-[7px]">
          <Label className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
            Gültig bis (optional)
          </Label>
          <Input
            type="datetime-local"
            value={formValidUntil}
            onChange={(e) => setFormValidUntil(e.target.value)}
            className="h-10 rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] font-mono text-[13px]"
          />
        </div>
      </div>

      <div className="flex items-center gap-3.5 rounded-[14px] border border-[hsl(0_0%_12%)] bg-white/[0.03] px-[15px] py-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <Label className="text-[13.5px] font-bold text-foreground">Aktiv</Label>
          <span className="text-xs text-muted-foreground">Code kann sofort eingelöst werden.</span>
        </div>
        <Switch checked={formIsActive} onCheckedChange={setFormIsActive} />
      </div>
    </div>
  );

  return (
    <AdminLayout>
      <div className="flex animate-fade-up flex-col gap-[18px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Gutscheincodes für kostenlose Buchungen verwalten
          </p>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button
                onClick={openCreate}
                className="h-9 gap-[7px] rounded-[10px] bg-gradient-lime px-[15px] text-[13px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.28)] hover:opacity-90"
              >
                <Plus className="h-4 w-4" />
                Neuer Voucher
              </Button>
            </DialogTrigger>
            <DialogContent className="max-h-[88vh] gap-[17px] overflow-y-auto rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[520px] sm:rounded-[20px]">
              <DialogHeader className="space-y-0 text-left">
                <span className="mb-[5px] block font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                  Voucher
                </span>
                <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
                  Neuen Voucher erstellen
                </DialogTitle>
              </DialogHeader>
              {formFields}
              <DialogFooter className="gap-2.5 border-t border-[hsl(0_0%_12%)] pt-4">
                <DialogClose asChild>
                  <Button
                    variant="outline"
                    className="h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-[17px] text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
                  >
                    Abbrechen
                  </Button>
                </DialogClose>
                <Button
                  onClick={handleCreate}
                  disabled={createMutation.isPending}
                  className="h-[42px] rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] hover:opacity-90"
                >
                  Erstellen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {/* KPI row — derived from the loaded voucher list */}
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(190px,100%),1fr))] gap-3.5">
          {kpis.map((k) => (
            <Card key={k.label} className="rounded-2xl border-border bg-gradient-card p-5">
              <div className="flex flex-col gap-[9px]">
                <div className="flex items-center justify-between gap-2.5">
                  <span className="text-[12.5px] font-semibold text-[hsl(0_0%_72%)]">{k.label}</span>
                  <span className="flex text-[hsl(0_0%_58%)]">
                    <k.icon className="h-[15px] w-[15px]" />
                  </span>
                </div>
                <span className={`font-mono text-[26px] font-bold leading-none ${k.color}`}>
                  {isLoading ? "–" : k.value}
                </span>
              </div>
            </Card>
          ))}
        </div>

        <Card className="rounded-2xl border-border bg-gradient-card p-5 sm:p-6">
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center justify-between gap-3.5">
              <h2 className="font-display text-base font-bold tracking-tight text-foreground">
                Alle Voucher{" "}
                <span className="font-mono text-sm font-normal text-muted-foreground">
                  {searchTerm ? `(${filteredVouchers.length}/${vouchers.length})` : `(${vouchers.length})`}
                </span>
              </h2>
              <label className="relative flex min-w-[min(260px,100%)] items-center">
                <Search className="pointer-events-none absolute left-[11px] h-[15px] w-[15px] text-[hsl(0_0%_58%)]" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Code oder Beschreibung…"
                  className="h-[38px] w-full rounded-[10px] border-[hsl(0_0%_15%)] bg-white/[0.04] pl-9 text-[13.5px]"
                />
              </label>
            </div>

            <Table className="min-w-[880px]">
              <TableHeader>
                <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                  <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Code</TableHead>
                  <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Beschreibung</TableHead>
                  <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Rabatt</TableHead>
                  <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Status</TableHead>
                  <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Nutzungen</TableHead>
                  <TableHead className="h-auto whitespace-nowrap px-0 pb-3 pr-3.5 font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Gültig bis</TableHead>
                  <TableHead className="h-auto whitespace-nowrap px-0 pb-3 text-right font-mono text-[10px] font-normal uppercase tracking-[0.16em] text-[hsl(0_0%_65%)]">Aktionen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                    <TableCell colSpan={7} className="px-0 py-8 text-center text-[13.5px] text-muted-foreground">
                      Laden...
                    </TableCell>
                  </TableRow>
                ) : vouchers.length === 0 ? (
                  <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                    <TableCell colSpan={7} className="px-0 py-8 text-center text-[13.5px] text-muted-foreground">
                      Noch keine Voucher erstellt
                    </TableCell>
                  </TableRow>
                ) : filteredVouchers.length === 0 ? (
                  <TableRow className="border-[hsl(0_0%_12%)] hover:bg-transparent">
                    <TableCell colSpan={7} className="px-0 py-8 text-center text-[13.5px] text-muted-foreground">
                      Keine Treffer
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredVouchers.map((v) => {
                    const usagePct = v.max_uses
                      ? Math.min(100, Math.round((v.current_uses / v.max_uses) * 100))
                      : 0;
                    return (
                      <TableRow key={v.id} className="border-[hsl(0_0%_12%)] hover:bg-white/[0.02]">
                        <TableCell className="px-0 py-3 pr-3.5">
                          <div className="flex items-center gap-2">
                            <code className="whitespace-nowrap font-mono text-[13.5px] font-bold tracking-[0.08em] text-foreground">
                              {v.code}
                            </code>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-[26px] w-[26px] flex-none rounded-[7px] border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_70%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                              onClick={() => copyCode(v.code)}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
                        <TableCell className="px-0 py-3 pr-3.5 text-[13.5px] text-[hsl(0_0%_78%)]">
                          <span className="block max-w-[210px] truncate">{v.description || "–"}</span>
                        </TableCell>
                        <TableCell className="px-0 py-3 pr-3.5">{discountBadge(v)}</TableCell>
                        <TableCell className="px-0 py-3 pr-3.5">{getStatusBadge(v)}</TableCell>
                        <TableCell className="px-0 py-3 pr-3.5">
                          <div className="flex min-w-[96px] flex-col gap-[5px]">
                            <span className="whitespace-nowrap font-mono text-[12.5px] text-foreground">
                              {v.current_uses}/{v.max_uses ?? "∞"}
                            </span>
                            {v.max_uses !== null && (
                              <div className="h-1 overflow-hidden rounded-full bg-[hsl(0_0%_12%)]">
                                <div
                                  className={`h-full rounded-full ${usagePct >= 100 ? "bg-[#FFC44D]" : "bg-primary"}`}
                                  style={{ width: `${usagePct}%` }}
                                />
                              </div>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="px-0 py-3 pr-3.5">
                          <span
                            className={`whitespace-nowrap font-mono text-[12.5px] ${
                              isExpired(v) ? "text-[#FF6B6B]" : "text-[hsl(0_0%_78%)]"
                            }`}
                          >
                            {v.valid_until
                              ? format(new Date(v.valid_until), "dd.MM.yyyy HH:mm", { locale: de })
                              : "Unbegrenzt"}
                          </span>
                        </TableCell>
                        <TableCell className="px-0 py-3 text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Switch
                              checked={v.is_active}
                              onCheckedChange={(checked) =>
                                toggleMutation.mutate({ id: v.id, is_active: checked })
                              }
                            />
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-[30px] w-[30px] rounded-lg border border-[hsl(0_0%_16%)] bg-white/5 text-[hsl(0_0%_82%)] hover:border-primary/40 hover:bg-white/5 hover:text-primary"
                              onClick={() => openEdit(v)}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-[30px] w-[30px] rounded-lg border border-[hsl(0_100%_71%/0.26)] bg-[hsl(0_100%_71%/0.07)] text-[#FF6B6B] hover:bg-[hsl(0_100%_71%/0.16)] hover:text-[#FF6B6B]"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent className="gap-4 rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[430px] sm:rounded-[20px]">
                                <span className="flex h-11 w-11 items-center justify-center rounded-[13px] border border-[hsl(0_100%_71%/0.3)] bg-[hsl(0_100%_71%/0.1)] text-[#FF6B6B]">
                                  <AlertTriangle className="h-5 w-5" />
                                </span>
                                <AlertDialogHeader className="space-y-[7px] text-left">
                                  <AlertDialogTitle className="font-display text-[19px] font-extrabold tracking-tight text-foreground">
                                    Voucher löschen?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription className="text-sm leading-[1.55] text-[hsl(0_0%_68%)]">
                                    Der Code <strong className="text-foreground">{v.code}</strong> wird unwiderruflich gelöscht.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter className="gap-2.5">
                                  <AlertDialogCancel className="h-10 rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-4 text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground">
                                    Abbrechen
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteMutation.mutate(v.id)}
                                    className="h-10 rounded-[11px] bg-[#FF6B6B] px-[18px] text-[13.5px] font-bold text-[#0A0A0A] hover:bg-[#ff8585]"
                                  >
                                    Löschen
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={!!editVoucher} onOpenChange={(open) => !open && setEditVoucher(null)}>
          <DialogContent className="max-h-[88vh] gap-[17px] overflow-y-auto rounded-[20px] border-[hsl(0_0%_15%)] bg-gradient-to-b from-[hsl(0_0%_7%)] to-[hsl(0_0%_4%)] p-6 sm:max-w-[520px] sm:rounded-[20px]">
            <DialogHeader className="space-y-0 text-left">
              <span className="mb-[5px] block font-mono text-[10px] uppercase tracking-[0.16em] text-primary">
                Voucher
              </span>
              <DialogTitle className="font-display text-xl font-extrabold tracking-tight text-foreground">
                Voucher bearbeiten
              </DialogTitle>
            </DialogHeader>
            {formFields}
            <DialogFooter className="gap-2.5 border-t border-[hsl(0_0%_12%)] pt-4">
              <DialogClose asChild>
                <Button
                  variant="outline"
                  className="h-[42px] rounded-[11px] border-[hsl(0_0%_16%)] bg-white/5 px-[17px] text-[13.5px] font-bold text-[hsl(0_0%_80%)] hover:bg-white/10 hover:text-foreground"
                >
                  Abbrechen
                </Button>
              </DialogClose>
              <Button
                onClick={handleUpdate}
                disabled={updateMutation.isPending}
                className="h-[42px] rounded-[11px] bg-gradient-lime px-5 text-[13.5px] font-bold text-primary-foreground shadow-[0_0_22px_hsl(71_91%_51%/0.25)] hover:opacity-90"
              >
                Speichern
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
