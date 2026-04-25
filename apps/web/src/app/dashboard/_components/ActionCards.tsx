"use client";

import { motion } from "framer-motion";
import { dashboardData } from "./data";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  Brain,
  BookOpen,
  FileText,
  Users,
  ArrowUpRight,
} from "@phosphor-icons/react";

interface ActionCardsProps {
  className?: string;
  data?: any[];
}

const CARD_ICONS = [Brain, BookOpen, FileText, Users];

// Distinct, vibrant high-end color themes for each action card
const THEMES = [
  {
    bg: "bg-blue-950",
    text: "text-white",
    subtext: "text-blue-200",
    border: "border-blue-900",
    iconBg: "bg-blue-900/50",
    iconColor: "text-blue-300",
    actionBg: "bg-white/10 hover:bg-white/20 text-white border-white/10",
    badge: "bg-blue-500/20 text-blue-200 border-blue-500/20",
    shadow: "shadow-[inset_0_1px_0_rgba(255,255,255,0.1)]",
  },
  {
    bg: "bg-emerald-50",
    text: "text-emerald-950",
    subtext: "text-emerald-700/70",
    border: "border-emerald-200/60",
    iconBg: "bg-emerald-200/50",
    iconColor: "text-emerald-700",
    actionBg: "bg-emerald-900 text-white hover:bg-emerald-800 border-transparent",
    badge: "bg-emerald-200/50 text-emerald-800 border-emerald-300/30",
    shadow: "shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]",
  },
  {
    bg: "bg-indigo-50",
    text: "text-indigo-950",
    subtext: "text-indigo-700/70",
    border: "border-indigo-200/60",
    iconBg: "bg-indigo-200/50",
    iconColor: "text-indigo-700",
    actionBg: "bg-indigo-900 text-white hover:bg-indigo-800 border-transparent",
    badge: "bg-indigo-200/50 text-indigo-800 border-indigo-300/30",
    shadow: "shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]",
  },
  {
    bg: "bg-rose-50",
    text: "text-rose-950",
    subtext: "text-rose-700/70",
    border: "border-rose-200/60",
    iconBg: "bg-rose-200/50",
    iconColor: "text-rose-700",
    actionBg: "bg-rose-900 text-white hover:bg-rose-800 border-transparent",
    badge: "bg-rose-200/50 text-rose-800 border-rose-300/30",
    shadow: "shadow-[0_20px_40px_-15px_rgba(0,0,0,0.05)]",
  }
];

export function ActionCards({ className, data }: ActionCardsProps) {
  const defaultActionCards = dashboardData.actionCards;
  const cardsToRender =
    data && data.length > 0
      ? data.map((d, i) => ({
          id: i + 1,
          title: d.title || d.Title,
          subtitle: d.description || d.Description,
          action: d.urgency || d.Urgency || "Start",
          link: "#",
          badge: undefined,
        }))
      : defaultActionCards;
  const { t } = useTranslation();

  return (
    <section
      className={cn("grid grid-cols-2 gap-5 w-full", className)}
      aria-label={t("dashboard.learningTools")}
    >
      {cardsToRender.map((card, index) => {
        const Icon = CARD_ICONS[index] ?? Brain;
        const theme = THEMES[index % THEMES.length];

        return (
          <motion.div
            key={card.id}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              type: "spring",
              stiffness: 100,
              damping: 20,
              delay: index * 0.1,
            }}
            whileHover={{ y: -4 }}
            className={cn(
              "h-full relative rounded-[2rem] border transition-all duration-300 group overflow-hidden",
              theme.bg,
              theme.border,
              theme.shadow
            )}
          >
            <div className="relative z-10 h-full flex flex-col p-8">
              {/* Badge */}
              {card.badge && (
                <span
                  className={cn(
                    "absolute top-6 right-6 text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-widest border",
                    theme.badge
                  )}
                >
                  {t(card.badge)}
                </span>
              )}

              {/* Icon Container */}
              <motion.div
                className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center mb-6 shrink-0",
                  theme.iconBg,
                  theme.iconColor
                )}
                whileHover={{ rotate: [0, -5, 5, 0], scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300, damping: 15 }}
                aria-hidden="true"
              >
                <Icon weight="duotone" size={24} />
              </motion.div>

              {/* Content */}
              <div className="flex-grow mb-8">
                <h3
                  className={cn(
                    "font-semibold text-lg leading-tight mb-2 tracking-tight",
                    theme.text
                  )}
                >
                  {t(card.title)}
                </h3>
                <p
                  className={cn(
                    "text-sm leading-relaxed",
                    theme.subtext
                  )}
                >
                  {t(card.subtitle)}
                </p>
              </div>

              {/* Action Button */}
              <Link
                href={card.link}
                className={cn(
                  "w-full mt-auto flex items-center justify-between px-5 py-3.5 rounded-xl text-sm font-semibold transition-all duration-200 active:scale-[0.98] group/btn border",
                  theme.actionBg
                )}
              >
                <span>{t(card.action)}</span>
                <ArrowUpRight
                  size={16}
                  weight="bold"
                  className="transition-transform group-hover/btn:translate-x-1 group-hover/btn:-translate-y-1"
                />
              </Link>
            </div>
          </motion.div>
        );
      })}
    </section>
  );
}
