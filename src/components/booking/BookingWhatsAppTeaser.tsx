import { useTranslation } from "react-i18next";
import { WhatsAppIcon, WhatsAppGroupButton } from "@/components/WhatsAppBusiness";

interface BookingWhatsAppTeaserProps {
  locationName: string;
  href: string;
}

/** „Spielpartner gesucht?“ — Hinweis auf die WhatsApp-Gruppe des Standorts in der ersten Buchungsmaske. */
export function BookingWhatsAppTeaser({ locationName, href }: BookingWhatsAppTeaserProps) {
  const { t } = useTranslation("booking");

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-[#25D366]/25 bg-[#25D366]/[0.06] px-4 py-3.5 sm:flex-row sm:items-center">
      <div className="flex-none w-[42px] h-[42px] rounded-xl border border-[#25D366]/35 bg-[#25D366]/15 flex items-center justify-center text-[#25D366]">
        <WhatsAppIcon className="w-5 h-5" />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[14px] font-bold text-foreground">{t("whatsappTeaser.title")}</span>
        <span className="text-[12.5px] leading-[1.55] text-[hsl(0_0%_75%)]">
          {t("whatsappTeaser.description", { name: locationName })}
        </span>
      </div>
      <WhatsAppGroupButton href={href} label={t("whatsappTeaser.cta")} className="self-start sm:self-center" />
    </div>
  );
}
