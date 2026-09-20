import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { invokeEdgeFunction } from "@/lib/edgeFunctionUtils";
import { applyVoucherDiscount } from "@/lib/pricing";
import { useMemberQuota, useInvalidateMembership, type MemberQuotaSummary } from "@/hooks/useClubMembership";
export interface BookingDetails {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  price_cents: number;
  currency: string;
  hold_expires_at: string | null;
  location: { name: string; slug: string; address: string | null };
  court: { name: string };
  guest_name?: string | null;
  guest_email?: string | null;
  court_id?: string | null;
  /** Bereits vom Preis abgezogene Vereinskondition in Cent. */
  member_discount_cents?: number;
  member_scope?: "home" | "away" | null;
  /** true = über das Freikontingent des Vereins gebucht (Preis 0). */
  is_free_allocation?: boolean;
}

export interface RewardBreakdown {
  key: string;
  title: string;
  points: number;
  description?: string;
}

export interface RewardsEstimate {
  total_points: number;
  breakdown: RewardBreakdown[];
  disclaimers: string[];
}

export type CheckoutState = 
  | "loading"
  | "ready"
  | "processing"
  | "expired"
  | "already_paid"
  | "error";

export interface VoucherState {
  code: string;
  status: "idle" | "validating" | "valid" | "invalid";
  voucherId: string | null;
  discountType: string;   // 'free' | 'percentage' | 'fixed'
  discountValue: number;  // percentage (1-100) or cents
  discountLabel: string;  // human-readable, e.g. "20 % Rabatt"
  errorMessage: string | null;
}

export interface UseBookingCheckoutReturn {
  booking: BookingDetails | null;
  state: CheckoutState;
  error: string | null;
  timeLeft: number | null;
  stripeUrl: string | null;
  rewardsEstimate: RewardsEstimate | null;
  voucher: VoucherState;
  setVoucherCode: (code: string) => void;
  validateVoucher: () => Promise<void>;
  clearVoucher: () => void;
  isGuest: boolean;
  handlePayment: () => Promise<void>;
  formatTimeLeft: (seconds: number) => string;
  /** Freikontingent des Vereins auf diesem Court; null = nicht verfügbar. */
  memberQuota: MemberQuotaSummary | null;
  claimingQuota: boolean;
  useMemberQuotaForBooking: () => Promise<void>;
}

/** Fehlermeldungen der claim_member_quota-RPC in Klartext. */
const QUOTA_ERRORS: Record<string, string> = {
  not_a_club_member: "Du bist keinem Verein zugeordnet.",
  not_home_court: "Dieser Court gehört nicht zu deinem Verein.",
  quota_not_enabled: "Dein Verein hat das Freikontingent nicht für Mitglieder freigegeben.",
  club_quota_exhausted: "Das Freikontingent deines Vereins ist für diesen Monat aufgebraucht.",
  member_quota_exhausted: "Dein persönliches Kontingent ist für diesen Monat aufgebraucht.",
  tennis_already_free: "Tennis ist in deinem Verein ohnehin kostenlos.",
  quota_already_used: "Diese Buchung läuft bereits über das Freikontingent.",
  booking_not_pending: "Diese Buchung kann nicht mehr geändert werden.",
};

export function useBookingCheckout(): UseBookingCheckoutReturn {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [booking, setBooking] = useState<BookingDetails | null>(null);
  const [state, setState] = useState<CheckoutState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [stripeUrl, setStripeUrl] = useState<string | null>(null);
  const [rewardsEstimate, setRewardsEstimate] = useState<RewardsEstimate | null>(null);
  const [voucher, setVoucher] = useState<VoucherState>({
    code: "",
    status: "idle",
    voucherId: null,
    discountType: "free",
    discountValue: 0,
    discountLabel: "Kostenlos",
    errorMessage: null,
  });

  const [claimingQuota, setClaimingQuota] = useState(false);

  const bookingId = searchParams.get("booking_id");
  // Guest mode: booking was created without auth — no redirect, no user checks
  const isGuest = searchParams.get("guest") === "1";

  // Freikontingent des eigenen Vereins für genau diesen Court und Monat.
  const { data: memberQuota } = useMemberQuota(
    booking?.court_id ?? null,
    booking?.start_time ?? null,
  );
  const invalidateMembership = useInvalidateMembership();

  // Auth redirect: only when NOT a guest checkout
  useEffect(() => {
    if (!authLoading && !user && !isGuest) {
      navigate(`/auth?redirect=/booking/checkout?booking_id=${bookingId}`);
    }
  }, [authLoading, user, isGuest, bookingId, navigate]);

  // Fetch booking: for guests (no user) wait until auth loading done then fetch
  useEffect(() => {
    if (bookingId && (user || (!authLoading && isGuest))) {
      fetchBooking();
    }
  }, [user, bookingId, authLoading, isGuest]);

  // Countdown timer effect
  useEffect(() => {
    if (!booking?.hold_expires_at) return;

    const updateTimer = () => {
      const now = new Date();
      const expiry = new Date(booking.hold_expires_at!);
      const diff = Math.max(0, Math.floor((expiry.getTime() - now.getTime()) / 1000));
      setTimeLeft(diff);

      if (diff === 0) {
        setState("expired");
        setError("Deine Reservierung ist abgelaufen. Bitte buche erneut.");
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [booking?.hold_expires_at]);

  const setVoucherCode = (code: string) => {
    setVoucher((prev) => ({
      ...prev,
      code,
      status: "idle",
      voucherId: null,
      discountType: "free",
      discountValue: 0,
      discountLabel: "Kostenlos",
      errorMessage: null,
    }));
  };

  const clearVoucher = () => {
    setVoucher({ code: "", status: "idle", voucherId: null, discountType: "free", discountValue: 0, discountLabel: "Kostenlos", errorMessage: null });
  };

  const validateVoucher = async () => {
    if (!voucher.code.trim()) return;

    setVoucher((prev) => ({ ...prev, status: "validating", errorMessage: null }));

    const { data, error: fnError } = await invokeEdgeFunction<{
      valid: boolean;
      voucher_id?: string;
      reason?: string;
      description?: string;
      discount_type?: string;
      discount_value?: number;
      discount_label?: string;
    }>("voucher-validate", {
      body: { code: voucher.code.trim(), context: "booking" },
      maxRetries: 1,
    });

    if (fnError || !data) {
      setVoucher((prev) => ({
        ...prev,
        status: "invalid",
        errorMessage: fnError?.message || "Validierung fehlgeschlagen",
      }));
      return;
    }

    if (data.valid) {
      const discountType = data.discount_type || "free";
      const discountValue = data.discount_value ?? 0;
      const discountLabel = data.discount_label || "Kostenlos";
      setVoucher((prev) => ({
        ...prev,
        status: "valid",
        voucherId: data.voucher_id || null,
        discountType,
        discountValue,
        discountLabel,
        errorMessage: null,
      }));
      toast.success("Gutscheincode gültig!", { description: discountLabel });
    } else {
      setVoucher((prev) => ({
        ...prev,
        status: "invalid",
        errorMessage: data.reason || "Ungültiger Code",
      }));
    }
  };

  const fetchBooking = async () => {
    try {
      let data: BookingDetails | null = null;
      let fetchError: unknown = null;

      if (user) {
        // Authenticated path: direct select with ownership check
        const { data: row, error } = await supabase
          .from("bookings")
          .select(`
            id,
            start_time,
            end_time,
            status,
            price_cents,
            currency,
            hold_expires_at,
            guest_name,
            guest_email,
            court_id,
            member_discount_cents,
            member_scope,
            is_free_allocation,
            location:locations (name, slug, address),
            court:courts (name)
          `)
          .eq("id", bookingId!)
          .eq("user_id", user.id)
          .single();

        fetchError = error;
        if (row) {
          // guest_name/guest_email not in generated types yet — cast per project convention
          const r = row as any;
          data = {
            ...r,
            location: r.location as BookingDetails["location"],
            court: r.court as BookingDetails["court"],
          };
        }
      } else {
        // Guest path: no anon SELECT policy on bookings (guest PII protection).
        // SECURITY DEFINER RPC — the booking UUID is the credential.
        // RPC not in generated types yet; cast per project convention (see useQrSections.ts)
        const { data: rows, error } = await (supabase.rpc as any)("get_guest_booking", {
          p_booking_id: bookingId,
        });

        fetchError = error;
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row) {
          data = {
            id: row.id,
            start_time: row.start_time,
            end_time: row.end_time,
            status: row.status,
            price_cents: row.price_cents,
            currency: row.currency,
            hold_expires_at: row.hold_expires_at,
            guest_name: row.guest_name,
            guest_email: row.guest_email,
            location: {
              name: row.location_name,
              slug: row.location_slug,
              address: row.location_address,
            },
            court: { name: row.court_name },
          };
        }
      }

      if (fetchError || !data) {
        setError("Buchung nicht gefunden oder kein Zugriff.");
        setState("error");
        return;
      }

      if (data.status !== "pending_payment") {
        if (data.status === "confirmed") {
          navigate(isGuest ? "/booking/success?guest=1" : "/account");
          toast.info("Diese Buchung wurde bereits bezahlt.");
          setState("already_paid");
        } else {
          setError(`Buchung kann nicht bezahlt werden. Status: ${data.status}`);
          setState("error");
        }
        return;
      }

      setBooking(data);
      setState("ready");

      // Fetch rewards estimate only for authenticated users (guests don't earn points)
      if (isGuest) return;
      invokeEdgeFunction<RewardsEstimate>("rewards-estimate", {
        body: {
          booking_id: bookingId,
          price_cents: data.price_cents || 0,
          start_time: data.start_time,
        },
        maxRetries: 1,
      }).then(({ data: estimateData }) => {
        if (estimateData && estimateData.total_points !== undefined) {
          setRewardsEstimate(estimateData);
        }
      }).catch((estimateErr) => {
        console.warn("Could not fetch rewards estimate:", estimateErr);
      });
    } catch (err) {
      console.error("Error fetching booking:", err);
      setError("Fehler beim Laden der Buchung.");
      setState("error");
    }
  };

  const redeemVoucher = async (): Promise<boolean> => {
    if (!booking || voucher.status !== "valid") return false;

    setState("processing");

    const { data, error: fnError } = await invokeEdgeFunction<{ success: boolean }>(
      "voucher-redeem",
      {
        body: { code: voucher.code.trim(), booking_id: booking.id },
        maxRetries: 1,
      }
    );

    if (fnError || !data?.success) {
      toast.error("Fehler beim Einlösen", {
        description: fnError?.message || "Bitte versuche es erneut.",
      });
      setState("ready");
      return false;
    }

    toast.success("Buchung kostenlos bestätigt! 🎉");
    navigate(isGuest ? "/booking/success?guest=1" : "/booking/success");
    return true;
  };

  const handlePayment = async () => {
    if (!booking) return;

    // Fully-free vouchers bypass Stripe; partial discounts go through Stripe with reduced price
    if (voucher.status === "valid") {
      const effectivePrice = applyVoucherDiscount(booking.price_cents, voucher.discountType, voucher.discountValue);
      if (effectivePrice === 0) {
        await redeemVoucher();
        return;
      }
    }

    setState("processing");

    const isPartialVoucher =
      voucher.status === "valid" &&
      applyVoucherDiscount(booking.price_cents, voucher.discountType, voucher.discountValue) > 0;

    const { data, error } = await invokeEdgeFunction<{ url: string | null; free?: boolean }>(
      "create-checkout-session",
      {
        body: {
          booking_id: booking.id,
          ...(isPartialVoucher && voucher.voucherId ? { voucher_id: voucher.voucherId } : {}),
        },
        maxRetries: 2,
        retryDelayMs: 1500,
      }
    );

    if (error) {
      console.error("[Checkout] Payment error:", error);
      toast.error("Fehler beim Starten der Zahlung", {
        description: error.message,
        action: {
          label: "Erneut versuchen",
          onClick: () => handlePayment(),
        },
      });
      setState("ready");
      return;
    }

    // Points covered the whole price — the booking is already confirmed server-side,
    // no Stripe session was created.
    if (data?.free) {
      toast.success("Buchung kostenlos bestätigt! 🎉");
      navigate("/booking/success");
      return;
    }

    if (!data?.url) {
      toast.error("Fehler beim Starten der Zahlung", {
        description: "Keine Checkout-URL vom Server erhalten. Bitte versuche es erneut.",
      });
      setState("ready");
      return;
    }

    setStripeUrl(data.url);

    // Extend the local countdown to 30 minutes to match the Stripe session TTL.
    // create-checkout-session has already written hold_expires_at = now+30min to the DB;
    // we mirror that here so the timer on this page stays accurate without a re-fetch.
    const newExpiry = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    setBooking(prev => prev ? { ...prev, hold_expires_at: newExpiry } : null);

    // Redirect in the same tab. Using window.open(_blank) after an async call is
    // blocked by popup blockers on most mobile browsers; a same-tab redirect is
    // simpler and always works. Stripe's success_url brings the user back to
    // /booking/success after payment.
    window.location.assign(data.url);
  };

  /**
   * Buchung auf das Freikontingent des Vereins umstellen. Die RPC prüft unter
   * Row-Lock den Vereins- UND den persönlichen Rest und setzt den Preis auf 0.
   * Danach wird die Buchung neu geladen — bezahlt wird dann über den Free-Path
   * von create-checkout-session.
   */
  const useMemberQuotaForBooking = async () => {
    if (!booking || claimingQuota) return;

    setClaimingQuota(true);
    const { error: rpcError } = await (supabase.rpc as any)("claim_member_quota", {
      p_booking_id: booking.id,
    });
    setClaimingQuota(false);

    if (rpcError) {
      const key = Object.keys(QUOTA_ERRORS).find((k) => rpcError.message?.includes(k));
      toast.error("Freikontingent nicht nutzbar", {
        description: key ? QUOTA_ERRORS[key] : "Bitte versuche es erneut.",
      });
      return;
    }

    invalidateMembership();
    await fetchBooking();
    toast.success("Freikontingent verwendet — die Buchung ist kostenlos.");
  };

  const formatTimeLeft = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  return {
    booking,
    state,
    error,
    timeLeft,
    stripeUrl,
    rewardsEstimate,
    voucher,
    setVoucherCode,
    validateVoucher,
    clearVoucher,
    isGuest,
    handlePayment,
    formatTimeLeft,
    memberQuota: memberQuota ?? null,
    claimingQuota,
    useMemberQuotaForBooking,
  };
}
