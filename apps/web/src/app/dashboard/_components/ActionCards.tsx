"use client";

import { motion } from "motion/react";
import { actionCards as defaultActionCardsData } from "./data";
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

const ICON_COLORS = [
  "text-indigo-600 bg-indigo-100",
  "text-emerald-600 bg-emerald-100",
  "text-violet-600 bg-violet-100",
  "text-amber-600 bg-amber-100",
];

export function ActionCards({ className, data }: ActionCardsProps) {
  const defaultActionCards = defaultActionCardsData;
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
      className={cn("grid grid-cols-2 gap-4 w-full", className)}
      aria-label={t("dashboard.learningTools")}
    >
      {cardsToRender.map((card, index) => {
        const Icon = CARD_ICONS[index] ?? Brain;
        const iconStyle = ICON_COLORS[index % ICON_COLORS.length];

        return (
          <Link
            key={card.id}
            href={card.link}
            className="group"
          >
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                type: "spring",
                stiffness: 120,
                damping: 20,
                delay: index * 0.08,
              }}
              className="h-full relative dash-card p-6 transition-colors duration-200 hover:border-foreground/20 cursor-pointer"
            >
              {/* Badge */}
              {card.badge && (
                <span className="absolute top-5 right-5 text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase tracking-widest border border-border bg-secondary text-muted-foreground">
                  {t(card.badge)}
                </span>
              )}

              {/* Icon */}
              <div
                className={cn(
                  "w-11 h-11 rounded-xl flex items-center justify-center mb-5 shrink-0",
                  iconStyle,
                )}
                aria-hidden="true"
              >
                <Icon weight="duotone" size={22} />
              </div>

              {/* Content */}
              <div className="mb-5">
                <h3 className="font-semibold text-[15px] leading-tight mb-1.5 tracking-tight text-foreground">
                  {t(card.title)}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t(card.subtitle)}
                </p>
              </div>

              {/* Action */}
              <div className="flex items-center justify-between mt-auto pt-4 border-t border-border">
                <span className="text-sm font-semibold text-foreground">
                  {t(card.action)}
                </span>
                <ArrowUpRight
                  size={16}
                  weight="bold"
                  className="text-muted-foreground group-hover:text-foreground transition-colors"
                />
              </div>
            </motion.div>
          </Link>
        );
      })}
    </section>
  );
}
