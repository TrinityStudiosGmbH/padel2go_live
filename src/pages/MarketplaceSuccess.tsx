import { Helmet } from "react-helmet-async";
import { useSearchParams, useLocation, useNavigate } from "react-router-dom";
import { useTranslation, Trans } from "react-i18next";
import { motion } from "framer-motion";
import Navigation from "@/components/Navigation";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { PackageCheck, Truck, ShoppingBag, CalendarDays } from "lucide-react";
import { ptsFmt } from "@/lib/marketplace";
import { useCheckoutVerification, CheckoutStatusNotice } from "@/components/CheckoutStatusNotice";

interface OrderState {
  code?: string;
  mail?: string;
  product?: string;
  addrName?: string;
  addrLine?: string;
  total?: string;
  method?: string;
  spent?: number;
}

const MarketplaceSuccess = () => {
  const { t } = useTranslation("marketplace");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionId = searchParams.get("session_id");
  const order = (location.state as { order?: OrderState } | null)?.order ?? null;

  const orderNumber = order?.code || sessionId || null;

  // Nicht blind "Vielen Dank" zeigen: bei Stripe nachfragen, was wirklich war.
  const { state: payState, resumeUrl } = useCheckoutVerification(sessionId);
  const paymentDone = payState === "confirmed" || payState === "processing" || payState === "unknown";

  return (
    <>
      <Helmet>
        <title>{t("success.metaTitle")}</title>
        <meta name="description" content={t("success.metaDescription")} />
      </Helmet>

      <Navigation />

      <main
        className="min-h-screen pt-[100px] pb-24"
        style={{ background: "radial-gradient(ellipse 60% 40% at 50% 0%, rgba(199,240,17,0.09), transparent), #000" }}
      >
        <div className="mx-auto max-w-[560px] px-5 flex flex-col items-center gap-6 text-center">
          <CheckoutStatusNotice
            state={payState}
            resumeUrl={resumeUrl}
            backTo="/marketplace"
            backLabel="Zurück zum Marketplace"
          />

          {paymentDone && (
            <motion.span
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15 }}
              className="w-24 h-24 rounded-full bg-primary/10 border border-primary/45 flex items-center justify-center text-primary"
              style={{ boxShadow: "0 0 60px rgba(199,240,17,0.3)" }}
            >
              <PackageCheck className="w-11 h-11" strokeWidth={2.2} />
            </motion.span>
          )}

          {paymentDone && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="flex flex-col gap-2.5"
          >
            <h1 className="font-display font-extrabold tracking-tight text-[clamp(30px,5vw,42px)]">
              {t("success.title")}
            </h1>
            <p className="text-base leading-relaxed text-muted-foreground">
              {order?.mail ? (
                <Trans
                  i18nKey="marketplace:success.bodyWithMail"
                  values={{ mail: order.mail }}
                  components={{ 1: <span className="text-foreground font-semibold" /> }}
                />
              ) : (
                t("success.bodyNoMail")
              )}
            </p>
            {orderNumber && (
              <span className="font-stat text-[13px] text-muted-foreground break-all">
                <Trans
                  i18nKey="marketplace:success.orderNumber"
                  values={{ number: orderNumber }}
                  components={{ 1: <span className="text-primary" /> }}
                />
              </span>
            )}
          </motion.div>
          )}

          {paymentDone && order && (
            <motion.div
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.28 }}
              className="w-full rounded-2xl border border-border/60 bg-gradient-card p-6"
            >
              <div className="flex flex-col gap-3 text-left">
                {order.product && (
                  <>
                    <DetailRow label={t("success.rowProduct")} value={order.product} />
                    <div className="h-px bg-border/70" />
                  </>
                )}
                {order.addrName && (
                  <>
                    <div className="flex justify-between items-start gap-2.5">
                      <span className="text-[13.5px] text-muted-foreground">{t("success.rowDeliveryTo")}</span>
                      <span className="flex flex-col items-end text-right">
                        <span className="text-sm font-semibold">{order.addrName}</span>
                        {order.addrLine && <span className="text-[13px] text-muted-foreground">{order.addrLine}</span>}
                      </span>
                    </div>
                    <div className="h-px bg-border/70" />
                  </>
                )}
                {!!order.spent && order.spent > 0 && (
                  <>
                    <div className="flex justify-between items-center gap-2.5">
                      <span className="text-[13.5px] text-muted-foreground">{t("success.rowPointsRedeemed")}</span>
                      <span className="font-stat text-[13.5px] font-bold text-primary">
                        {t("success.pointsValue", { points: ptsFmt(order.spent) })}
                      </span>
                    </div>
                    <div className="h-px bg-border/70" />
                  </>
                )}
                {order.total && (
                  <div className="flex justify-between items-center gap-2.5">
                    <span className="text-[13.5px] text-muted-foreground">{t("success.rowPaid")}</span>
                    <span className="inline-flex items-center gap-2">
                      <span className="font-stat text-[15px] font-bold text-primary">{order.total}</span>
                      {order.method && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 text-[11px] font-bold text-primary">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                          {order.method}
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>
            </motion.div>
          )}

          <motion.span
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.36 }}
            className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-white/[0.04] px-4 py-2 text-[13px] font-semibold text-foreground/70"
          >
            <Truck className="w-3.5 h-3.5 text-primary" />
            {t("success.shippingNote")}
          </motion.span>

          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex gap-3 w-full flex-wrap"
          >
            <div className="flex-1 min-w-[200px]">
              <Button variant="outline" size="lg" className="w-full" onClick={() => navigate("/marketplace")}>
                <ShoppingBag className="w-4 h-4 mr-1" />
                {t("success.keepShopping")}
              </Button>
            </div>
            <div className="flex-1 min-w-[200px]">
              <Button variant="lime" size="lg" className="w-full" onClick={() => navigate("/booking")}>
                <CalendarDays className="w-4 h-4 mr-1" />
                {t("success.bookCourt")}
              </Button>
            </div>
          </motion.div>
        </div>
      </main>

      <Footer />
    </>
  );
};

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center gap-2.5">
      <span className="text-[13.5px] text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-right">{value}</span>
    </div>
  );
}

export default MarketplaceSuccess;
