"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import { Plus, FolderOpen, Heart, Trophy, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import {
  usePortfolioItems,
  usePortfolioSummary,
  useCreatePortfolioItem,
  useUpdatePortfolioItem,
  useDeletePortfolioItem,
} from "@/hooks/usePortfolioQueries";
import type { PortfolioItemPayload, PortfolioItemType, PortfolioItem } from "@/types/portfolio";
import { typeConfig, emptyPayload } from "./_components/portfolioConfig";
import { PortfolioItemCard } from "./_components/PortfolioItemCard";
import { PortfolioFormDialog } from "./_components/PortfolioFormDialog";

export default function PortfolioPage() {
  const { t } = useTranslation();
  const [activeType, setActiveType] = useState<PortfolioItemType | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null);
  const [formData, setFormData] = useState<PortfolioItemPayload>(emptyPayload);

  const typeFilter = activeType === "all" ? undefined : (activeType as PortfolioItemType);
  const { data: portfolioData, isLoading } = usePortfolioItems({ type: typeFilter });
  const { data: summary } = usePortfolioSummary();
  const createItem = useCreatePortfolioItem();
  const updateItem = useUpdatePortfolioItem();
  const deleteItem = useDeletePortfolioItem();

  const items = portfolioData?.data || [];

  const openCreateForm = () => {
    setEditingItem(null);
    setFormData(emptyPayload);
    setShowForm(true);
  };

  const openEditForm = (item: PortfolioItem) => {
    setEditingItem(item);
    setFormData({
      type: item.type,
      title: item.title,
      organization: item.organization || "",
      description: item.description || "",
      startDate: item.startDate || "",
      endDate: item.endDate,
      isCurrent: item.isCurrent,
      role: item.role || "",
      totalHours: item.totalHours,
      achievements: item.achievements || [],
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.title.trim()) return;
    if (editingItem) {
      updateItem.mutate(
        { id: editingItem.id, payload: formData },
        { onSuccess: () => setShowForm(false) }
      );
    } else {
      createItem.mutate(formData, { onSuccess: () => setShowForm(false) });
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (<Skeleton key={i} className="h-28" />))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {t("portfolio.badge", "Student Portfolio")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
            {t("portfolio.title", "My Achievement Portfolio")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("portfolio.subtitle", "Curate your extracurriculars, projects, and experiences in one beautiful space.")}
          </p>
        </div>
        <div className="flex-shrink-0">
          <Button onClick={openCreateForm} className="bg-foreground text-background hover:bg-foreground/90">
            <Plus className="h-4 w-4 mr-2" />
            {t("portfolio.addItem", "Add New Experience")}
          </Button>
        </div>
      </motion.div>

      {/* Summary Stats */}
      {summary && (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { icon: FolderOpen, bg: "bg-indigo-100", color: "text-indigo-600", label: t("portfolio.totalItems", "Total Items"), value: summary.totalItems },
            { icon: Heart, bg: "bg-rose-100", color: "text-rose-600", label: t("portfolio.totalHours", "Volunteer Hours"), value: `${summary.totalVolunteerHours || 0}`, suffix: "hrs" },
            { icon: Trophy, bg: "bg-amber-100", color: "text-amber-600", label: t("portfolio.awards", "Awards Won"), value: summary.byType?.award || 0 },
            { icon: Star, bg: "bg-purple-100", color: "text-purple-600", label: t("portfolio.categories", "Categories"), value: summary.byType ? Object.keys(summary.byType).length : 0 },
          ].map((stat, i) => (
            <div key={i} className="dash-card p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                  <stat.icon className={`w-4 h-4 ${stat.color}`} />
                </div>
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
              </div>
              <p className="text-2xl font-bold text-foreground">
                {stat.value}
                {stat.suffix && <span className="text-sm text-muted-foreground font-medium ml-1">{stat.suffix}</span>}
              </p>
            </div>
          ))}
        </motion.div>
      )}

      {/* Filter Bar */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="flex flex-wrap gap-2 items-center p-1 bg-secondary rounded-xl w-fit">
        {["all", ...(Object.keys(typeConfig) as PortfolioItemType[])].map((type) => {
          const isActive = activeType === type;
          const label = type === "all" ? "All" : typeConfig[type as PortfolioItemType].label;
          return (
            <button key={type} onClick={() => setActiveType(type as "all" | PortfolioItemType)}
              className={cn("relative px-4 py-2 text-sm font-medium rounded-xl transition-colors duration-200 outline-none",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground")}>
              {isActive && (
                <motion.div layoutId="activeFilterBg" className="absolute inset-0 bg-card rounded-xl border border-border"
                  initial={false} transition={{ type: "spring", bounce: 0.2, duration: 0.6 }} />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </motion.div>

      {/* Items Grid */}
      {items.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="dash-card p-12 text-center">
          <div className="w-14 h-14 mx-auto mb-4 bg-secondary rounded-xl border border-border flex items-center justify-center">
            <FolderOpen className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="text-sm font-bold text-foreground mb-1">
            {t("portfolio.noItemsTitle", "Build Your Portfolio")}
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto mb-6">
            {t("portfolio.noItems", "Showcase your achievements, projects, and experiences to stand out. Start adding items to build your professional profile.")}
          </p>
          <Button onClick={openCreateForm} className="bg-foreground text-background hover:bg-foreground/90">
            <Plus className="h-4 w-4 mr-2" />
            {t("portfolio.addFirst", "Add Your First Item")}
          </Button>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {items.map((item: PortfolioItem, index: number) => (
              <PortfolioItemCard key={item.id} item={item} index={index}
                onEdit={openEditForm} onDelete={(id) => deleteItem.mutate(id)} />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <PortfolioFormDialog
        open={showForm}
        onOpenChange={setShowForm}
        editingItem={editingItem}
        formData={formData}
        onFormDataChange={setFormData}
        onSubmit={handleSubmit}
        isPending={createItem.isPending || updateItem.isPending}
      />
    </div>
  );
}
