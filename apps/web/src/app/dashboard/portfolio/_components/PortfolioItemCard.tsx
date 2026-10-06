"use client";

import { motion } from "motion/react";
import { Edit, Trash2, Calendar, Clock } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { typeConfig, effectiveHours } from "./portfolioConfig";
import { useDateFormat } from "@/hooks/useDateFormat";
import type { PortfolioItem } from "@/types/portfolio";

interface PortfolioItemCardProps {
  item: PortfolioItem;
  index: number;
  onEdit: (item: PortfolioItem) => void;
  onDelete: (id: string) => void;
}

export function PortfolioItemCard({ item, index, onEdit, onDelete }: PortfolioItemCardProps) {
  const { t } = useTranslation();
  const { formatMonthYear } = useDateFormat();
  const hours = effectiveHours(item);
  const cfg = typeConfig[item.type] || typeConfig.extracurricular;
  const Icon = cfg.icon;

  return (
    <motion.div
      key={item.id}
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ delay: index * 0.03 }}
    >
      <div className="dash-card p-5 hover:border-foreground/20 transition-all duration-300 group">
        <div className="space-y-3">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className={`p-2 rounded-lg ${cfg.bg} flex-shrink-0`}>
                <Icon className={`h-4 w-4 ${cfg.color}`} />
              </div>
              <div>
                <h3 className="font-semibold text-foreground text-sm leading-tight">
                  {item.title}
                </h3>
                {item.organization && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {item.organization}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("studentUi.portfolio.card.editAria", { title: item.title })}
                className="h-7 w-7 text-muted-foreground hover:text-foreground focus-visible:opacity-100 focus-visible:ring-2"
                onClick={() => onEdit(item)}
              >
                <Edit className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                aria-label={t("studentUi.portfolio.card.deleteAria", { title: item.title })}
                className="h-7 w-7 text-muted-foreground hover:text-rose-600 focus-visible:opacity-100 focus-visible:ring-2"
                onClick={() => {
                  if (window.confirm(t("studentUi.portfolio.card.deleteConfirm", { title: item.title }))) {
                    onDelete(item.id);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>

          {item.role && (
            <div className="inline-flex items-center px-2 py-0.5 rounded-md bg-secondary border border-border text-xs font-medium text-muted-foreground">
              {item.role}
            </div>
          )}

          {item.description && (
            <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
              {item.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground pt-2 border-t border-border">
            {item.startDate && (
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatMonthYear(item.startDate)}
                {" – "}
                {item.endDate ? formatMonthYear(item.endDate) : t("studentUi.portfolio.card.present")}
              </span>
            )}
            {hours > 0 && (
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {t("studentUi.portfolio.card.hours", { count: hours })}
              </span>
            )}
          </div>

          {item.achievements && item.achievements.length > 0 && (
            <div className="flex gap-1.5 flex-wrap pt-1">
              {item.achievements.slice(0, 3).map((a) => (
                <span
                  key={a}
                  className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700"
                >
                  {a}
                </span>
              ))}
              {item.achievements.length > 3 && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-muted-foreground">
                  {t("studentUi.portfolio.card.more", { count: item.achievements.length - 3 })}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
