import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, CalendarClock, ChevronDown, ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useLocationTeasers } from "@/hooks/useLocationTeasers";
import { localized } from "@/lib/localized";
import SectionDivider from "@/components/SectionDivider";
import { StorageImage } from "@/components/StorageImage";
import { WhatsAppGroupButton } from "@/components/WhatsAppBusiness";

export function LocationTeasersSection() {
  const { t, i18n } = useTranslation("index");
  const { data: teasers, isLoading } = useLocationTeasers();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (isLoading || !teasers || teasers.length === 0) return null;

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <>
      <section id="standorte" className="py-16 md:py-24 relative overflow-hidden">
        <div className="mx-auto max-w-[1200px] px-5 relative z-10">
          {/* Header */}
          <motion.div
            className="flex flex-col items-center gap-4 text-center mb-12 md:mb-16"
            initial={{ opacity: 0, y: 20, filter: "blur(4px)" }}
            whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="font-stat text-xs uppercase tracking-[0.2em] text-primary">
              {t("locationTeasers.eyebrow")}
            </span>
            <h2 className="text-3xl md:text-5xl font-bold tracking-tight text-foreground" style={{ lineHeight: 1.1 }}>
              {t("locationTeasers.titlePart1")}<span className="text-primary">2</span>{t("locationTeasers.titlePart2")}
            </h2>
            <p className="text-muted-foreground text-base md:text-lg max-w-2xl mx-auto" style={{ textWrap: "pretty" }}>
              {t("locationTeasers.subtitle")}
            </p>
          </motion.div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {teasers.map((teaser, i) => {
              const isExpanded = expandedId === teaser.id;
              const title = localized(teaser, "title", i18n.language);
              const description = localized(teaser, "description", i18n.language);

              return (
                <motion.div
                  key={teaser.id}
                  className="group relative flex flex-col rounded-2xl overflow-hidden bg-gradient-card border border-border/60 hover:border-primary/30 transition-colors duration-300"
                  initial={{ opacity: 0, y: 24, filter: "blur(4px)" }}
                  whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  viewport={{ once: true, amount: 0.2 }}
                  transition={{
                    duration: 0.6,
                    delay: i * 0.1,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  {/* Image */}
                  <div className="relative aspect-[16/10] overflow-hidden bg-muted">
                    {teaser.image_url ? (
                      <StorageImage
                        src={teaser.image_url}
                        renderWidth={800}
                        alt={title}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <MapPin className="w-12 h-12 text-muted-foreground/30" />
                      </div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-background/70" />
                    {teaser.expected_date && (
                      <span className="absolute top-3.5 left-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-background/70 backdrop-blur-sm border border-primary/35 rounded-full px-3 py-1.5">
                        <CalendarClock className="w-3.5 h-3.5" />
                        {localized(teaser, "expected_date", i18n.language)}
                      </span>
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex flex-col gap-2.5 p-5 md:p-6">
                    {teaser.city && (
                      <span className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground">
                        <MapPin className="w-3.5 h-3.5 text-primary" />
                        <span className="font-stat">{localized(teaser, "city", i18n.language)}</span>
                      </span>
                    )}
                    <h3 className="text-xl font-bold text-foreground font-display" style={{ lineHeight: 1.2 }}>
                      {title}
                    </h3>

                    {/* Expandable description */}
                    {teaser.description && (
                      <div>
                        <AnimatePresence initial={false}>
                          {isExpanded ? (
                            <motion.p
                              key="full"
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: "auto", opacity: 1 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.3, ease: "easeInOut" }}
                              className="text-sm text-muted-foreground overflow-hidden"
                              style={{ textWrap: "pretty" }}
                            >
                              {description}
                            </motion.p>
                          ) : (
                            <p className="text-sm text-muted-foreground line-clamp-2" style={{ textWrap: "pretty" }}>
                              {description}
                            </p>
                          )}
                        </AnimatePresence>
                        <button
                          onClick={() => toggleExpand(teaser.id)}
                          className="inline-flex items-center gap-1 text-xs text-primary font-medium mt-1 hover:underline"
                        >
                          {isExpanded ? t("locationTeasers.less") : t("locationTeasers.more")}
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-300 ${isExpanded ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                    )}

                    {/* Club Link + WhatsApp-Gruppe */}
                    {(teaser.club_url || teaser.whatsapp_group_url) && (
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2">
                        {teaser.club_url && (
                          <a
                            href={teaser.club_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="group/link inline-flex items-center gap-1.5 text-sm font-semibold text-primary"
                          >
                            {t("locationTeasers.toClub")}
                            <ArrowRight className="w-4 h-4 transition-transform group-hover/link:translate-x-1" />
                          </a>
                        )}
                        {teaser.whatsapp_group_url && (
                          <WhatsAppGroupButton
                            href={teaser.whatsapp_group_url}
                            label={t("locationTeasers.whatsappJoin")}
                          />
                        )}
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>
      <SectionDivider variant="glow" />
    </>
  );
}
