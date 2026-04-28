"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "motion/react";
import {
  Plus,
  Award,
  Briefcase,
  Heart,
  FolderOpen,
  Trophy,
  Star,
  FileText,
  Calendar,
  Clock,
  Edit,
  Trash2,
  X,
  Upload,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  usePortfolioItems,
  usePortfolioSummary,
  useCreatePortfolioItem,
  useUpdatePortfolioItem,
  useDeletePortfolioItem,
} from "@/hooks/usePortfolioQueries";
import type { PortfolioItemPayload, PortfolioItemType, PortfolioItem } from "@/types/portfolio";

const typeConfig: Record<
  PortfolioItemType,
  { label: string; icon: typeof Award; color: string; bg: string }
> = {
  extracurricular: {
    label: "Extracurricular",
    icon: Star,
    color: "text-purple-600",
    bg: "bg-purple-100",
  },
  award: {
    label: "Award",
    icon: Trophy,
    color: "text-amber-600",
    bg: "bg-amber-100",
  },
  project: {
    label: "Project",
    icon: FolderOpen,
    color: "text-blue-600",
    bg: "bg-blue-100",
  },
  volunteer: {
    label: "Volunteer",
    icon: Heart,
    color: "text-rose-600",
    bg: "bg-rose-100",
  },
  work_experience: {
    label: "Work Experience",
    icon: Briefcase,
    color: "text-emerald-600",
    bg: "bg-emerald-100",
  },
  certification: {
    label: "Certification",
    icon: FileText,
    color: "text-indigo-600",
    bg: "bg-indigo-100",
  },
};

const emptyPayload: PortfolioItemPayload = {
  type: "extracurricular",
  title: "",
  organization: "",
  description: "",
  startDate: "",
  isCurrent: false,
  role: "",
  achievements: [],
};

export default function PortfolioPage() {
  const { t } = useTranslation();
  const [activeType, setActiveType] = useState<PortfolioItemType | "all">(
    "all"
  );
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<PortfolioItem | null>(null);
  const [formData, setFormData] = useState<PortfolioItemPayload>(emptyPayload);

  const typeFilter =
    activeType === "all" ? undefined : (activeType as PortfolioItemType);
  const { data: portfolioData, isLoading } = usePortfolioItems({
    type: typeFilter,
  });
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
      <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh] max-w-5xl mx-auto space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh] max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {t("portfolio.badge", "Student Portfolio")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
            {t("portfolio.title", "My Achievement Portfolio")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t(
              "portfolio.subtitle",
              "Curate your extracurriculars, projects, and experiences in one beautiful space."
            )}
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
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="grid grid-cols-2 md:grid-cols-4 gap-3"
        >
          <div className="dash-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
                <FolderOpen className="w-4 h-4 text-indigo-600" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("portfolio.totalItems", "Total Items")}
              </p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {summary.totalItems}
            </p>
          </div>

          <div className="dash-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                <Heart className="w-4 h-4 text-rose-600" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("portfolio.totalHours", "Volunteer Hours")}
              </p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {summary.totalVolunteerHours || 0}
              <span className="text-sm text-muted-foreground font-medium ml-1">hrs</span>
            </p>
          </div>

          <div className="dash-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-amber-600" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("portfolio.awards", "Awards Won")}
              </p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {summary.byType?.award || 0}
            </p>
          </div>

          <div className="dash-card p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-8 h-8 rounded-lg bg-purple-100 flex items-center justify-center">
                <Star className="w-4 h-4 text-purple-600" />
              </div>
              <p className="text-xs font-medium text-muted-foreground">
                {t("portfolio.categories", "Categories")}
              </p>
            </div>
            <p className="text-2xl font-bold text-foreground">
              {summary.byType ? Object.keys(summary.byType).length : 0}
            </p>
          </div>
        </motion.div>
      )}

      {/* Filter Bar */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="flex flex-wrap gap-2 items-center p-1 bg-secondary rounded-xl w-fit"
      >
        {["all", ...(Object.keys(typeConfig) as PortfolioItemType[])].map((type) => {
          const isActive = activeType === type;
          const label = type === "all" ? "All" : typeConfig[type as PortfolioItemType].label;

          return (
            <button
              key={type}
              onClick={() => setActiveType(type as "all" | PortfolioItemType)}
              className={cn(
                "relative px-4 py-2 text-sm font-medium rounded-xl transition-colors duration-200 outline-none",
                isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeFilterBg"
                  className="absolute inset-0 bg-card rounded-xl border border-border"
                  initial={false}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </motion.div>

      {/* Items Grid */}
      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="dash-card p-12 text-center"
        >
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
            {items.map((item: PortfolioItem, index: number) => {
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
                        <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                            onClick={() => openEditForm(item)}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-rose-600"
                            onClick={() => deleteItem.mutate(item.id)}
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
                            {item.startDate}
                            {item.endDate ? ` - ${item.endDate}` : " - Present"}
                          </span>
                        )}
                        {item.totalHours && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {item.totalHours} hrs
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
                              +{item.achievements.length - 3} more
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl p-0 overflow-hidden bg-card border-border rounded-xl">
          <div className="p-5 border-b border-border">
            <DialogHeader>
              <DialogTitle className="text-sm font-bold text-foreground flex items-center gap-2">
                {editingItem ? (
                  <>
                    <Edit className="w-4 h-4 text-muted-foreground" />
                    {t("portfolio.editItem", "Edit Experience")}
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4 text-muted-foreground" />
                    {t("portfolio.addItem", "Add New Experience")}
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="p-5 space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Type of Experience</label>
              <Select
                value={formData.type}
                onValueChange={(v) =>
                  setFormData({ ...formData, type: v as PortfolioItemType })
                }
              >
                <SelectTrigger className="h-10 bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(typeConfig) as PortfolioItemType[]).map(
                    (type) => (
                      <SelectItem key={type} value={type} className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          {typeConfig[type].label}
                        </div>
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Title *</label>
              <Input
                placeholder="E.g., Varsity Team Captain, Software Engineer Intern..."
                className="h-10 bg-secondary border-border"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organization / School</label>
                <Input
                  placeholder="Where did this happen?"
                  className="h-10 bg-secondary border-border"
                  value={formData.organization}
                  onChange={(e) =>
                    setFormData({ ...formData, organization: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Role / Position</label>
                <Input
                  placeholder="What was your title?"
                  className="h-10 bg-secondary border-border"
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</label>
              <Textarea
                placeholder="Describe your responsibilities and what you learned..."
                className="resize-none bg-secondary border-border min-h-[80px]"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("portfolio.startDate", "Start Date")}
                </label>
                <Input
                  type="date"
                  className="h-10 bg-secondary border-border"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("portfolio.endDate", "End Date")}
                </label>
                <Input
                  type="date"
                  className="h-10 bg-secondary border-border"
                  value={formData.endDate || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      endDate: e.target.value || undefined,
                    })
                  }
                />
              </div>
              <div className="space-y-1 col-span-2 md:col-span-1">
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  {t("portfolio.totalHours", "Total Hours")}
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  className="h-10 bg-secondary border-border"
                  value={formData.totalHours || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      totalHours: e.target.value ? Number(e.target.value) : undefined,
                    })
                  }
                />
              </div>
            </div>
          </div>

          <div className="p-5 bg-secondary border-t border-border flex items-center justify-end gap-3">
            <Button variant="ghost" onClick={() => setShowForm(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              className="bg-foreground text-background hover:bg-foreground/90 px-6"
              onClick={handleSubmit}
              disabled={
                !formData.title.trim() ||
                createItem.isPending ||
                updateItem.isPending
              }
            >
              {editingItem
                ? t("common.save", "Save Changes")
                : t("portfolio.create", "Create Experience")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
