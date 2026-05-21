"use client";

import { useEffect, useState } from "react";
import { unwrapList } from "@/lib/unwrapList";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Star,
  ArrowRight,
  MapPin,
  ArrowUpRight,
  Sparkle,
} from "@phosphor-icons/react";
import Link from "next/link";
import { getCoaches } from "@/services/coachService";
import { Coach } from "@/types/coach";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";

export function FeaturedCoaches() {
  const { t } = useTranslation();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchCoaches = async () => {
      try {
        const response = await getCoaches({ limit: 3 });
        setCoaches(unwrapList(response, "coaches"));
      } catch (error) {
      // error handled silently
    } finally {
        setIsLoading(false);
      }
    };
    fetchCoaches();
  }, []);

  return (
    <section className="w-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div
            className="w-10 h-10 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm"
            aria-hidden="true"
          >
            <Sparkle weight="duotone" size={20} className="text-slate-700" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-slate-900 tracking-tight leading-none mb-1">
              {t("coaching.featuredCoaches")}
            </h2>
            <p className="text-sm text-slate-500 leading-none">
              {t("coaching.featuredDescription")}
            </p>
          </div>
        </div>
        <Link
          href="/dashboard/book-coach"
          className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group"
        >
          {t("coaching.viewAllCoaches")}
          <motion.div
            whileHover={{ x: 3 }}
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
          >
            <ArrowRight size={14} weight="bold" aria-hidden="true" />
          </motion.div>
        </Link>
      </div>

      {/* Cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5" aria-busy="true">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[280px] rounded-2xl bg-white border border-border animate-pulse"
            />
          ))}
        </div>
      ) : coaches.length === 0 ? null : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {coaches.map((coach, index) => (
            <motion.div
              layout
              key={coach.id}
              initial={{ opacity: 0, y: 24 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 100,
                damping: 20,
                delay: index * 0.1,
              }}
              whileHover={{ y: -6 }}
              className="group relative flex flex-col h-full bg-white rounded-2xl border border-border p-8 hover:border-foreground/20 transition-all duration-300"
            >
              {/* Top: Avatar + Rating */}
              <div className="flex items-start justify-between mb-6">
                <div className="relative">
                  <Avatar className="h-16 w-16 shadow-sm border border-slate-100">
                    <AvatarImage
                      src={coach.image}
                      className="object-cover"
                      alt=""
                    />
                    <AvatarFallback className="bg-slate-50 text-slate-700 text-xl font-bold">
                      {coach.name.charAt(0)}
                    </AvatarFallback>
                  </Avatar>
                  {/* Status Indicator with micro-animation */}
                  <motion.div
                    className="absolute bottom-0.5 right-0.5 w-4 h-4 bg-emerald-500 border-2 border-white rounded-full shadow-sm"
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    aria-label="Available"
                  />
                </div>

                {/* Rating pill */}
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-50 border border-slate-100 shadow-sm">
                  <Star weight="fill" size={13} className="text-amber-400" />
                  <span className="text-sm font-bold text-slate-800 leading-none">
                    {coach.rating ?? "5.0"}
                  </span>
                  <span className="text-[11px] text-slate-400 leading-none">
                    (
                    {Array.isArray(coach.reviews)
                      ? coach.reviews.length
                      : (coach.reviews ?? 0)}
                    )
                  </span>
                </div>
              </div>

              {/* Name + Title */}
              <div className="mb-4">
                <h3 className="font-semibold text-slate-900 text-lg leading-tight tracking-tight mb-1">
                  {coach.name}
                </h3>
                <p className="text-sm font-medium text-slate-500 leading-tight">
                  {coach.title}
                </p>
              </div>

              {/* Tags */}
              {coach.tags && coach.tags.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-6">
                  {coach.tags.slice(0, 2).map((tag) => (
                    <span
                      key={tag}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-50 text-slate-600 font-medium border border-slate-200/60"
                    >
                      {tag}
                    </span>
                  ))}
                  {(coach.tags.length ?? 0) > 2 && (
                    <span className="text-[11px] px-2.5 py-1 rounded-lg bg-slate-50 text-slate-400 border border-slate-200/60">
                      +{coach.tags.length - 2}
                    </span>
                  )}
                </div>
              )}

              {/* Location + Rate */}
              <div className="flex items-center justify-between text-xs text-slate-500 mb-6 mt-auto">
                {coach.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={14} weight="duotone" aria-hidden="true" />
                    <span className="truncate max-w-[100px] font-medium">
                      {coach.location}
                    </span>
                  </div>
                )}
                {coach.hourlyRate && (
                  <span className="font-bold text-slate-800">
                    <span className="text-slate-400 font-medium">
                      {t("coaching.from")}
                    </span>{" "}
                    ${coach.hourlyRate}
                    <span className="font-medium text-slate-400">/hr</span>
                  </span>
                )}
              </div>

              {/* CTA */}
              <Link
                href={`/dashboard/book-coach/${coach.id}`}
                className="flex items-center justify-between w-full px-5 py-3.5 rounded-xl bg-foreground text-white text-sm font-semibold hover:bg-foreground/90 active:scale-[0.98] transition-all duration-200 group/btn"
              >
                <span>{t("coaching.bookSession")}</span>
                <ArrowUpRight
                  size={16}
                  weight="bold"
                  className="transition-transform group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1"
                  aria-hidden="true"
                />
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
