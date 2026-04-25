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
      <div className="max-w-5xl mx-auto p-6 space-y-6">
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
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-6 border-b border-gray-100/50 relative"
      >
        <div className="absolute -top-32 -left-32 w-64 h-64 bg-indigo-300/20 rounded-full blur-3xl" />
        <div className="absolute -top-32 right-0 w-64 h-64 bg-purple-300/20 rounded-full blur-3xl" />

        <div className="relative z-10">
          <Badge variant="outline" className="mb-3 border-indigo-200 text-indigo-700 bg-indigo-50/50">
            {t("portfolio.badge", "Student Portfolio")}
          </Badge>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 mb-2">
            {t("portfolio.title", "My Achievement Portfolio")}
          </h1>
          <p className="text-lg text-gray-500 max-w-xl">
            {t(
              "portfolio.subtitle",
              "Curate your extracurriculars, projects, and experiences in one beautiful space."
            )}
          </p>
        </div>

        <div className="relative z-10 flex-shrink-0">
          <Button onClick={openCreateForm} size="lg" className="rounded-full shadow-lg shadow-indigo-200 hover:shadow-xl transition-all font-medium px-6">
            <Plus className="h-5 w-5 mr-2" />
            {t("portfolio.addItem", "Add New Experience")}
          </Button>
        </div>
      </motion.div>

      {/* Summary Stats - Bento Grid */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="col-span-2 md:col-span-1"
          >
            <div className="bg-gradient-to-br from-blue-500 to-indigo-600 rounded-3xl p-6 text-white h-full shadow-lg shadow-indigo-200/50 relative overflow-hidden group">
              <div className="absolute top-0 right-0 p-4 opacity-20 transform group-hover:scale-110 transition-transform duration-500">
                <FolderOpen className="w-16 h-16" />
              </div>
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <p className="text-white/80 font-medium text-sm uppercase tracking-wider">
                    {t("portfolio.totalItems", "Total Portfolio Items")}
                  </p>
                </div>
                <div className="mt-4">
                  <p className="text-5xl font-bold tracking-tight">
                    {summary.totalItems}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="col-span-1"
          >
            <div className="bg-white rounded-3xl p-6 h-full border border-gray-100 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden group">
              <div className="flex flex-col h-full justify-between">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center mb-4">
                  <Heart className="w-5 h-5 text-rose-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900 mb-1">
                    {summary.totalVolunteerHours || 0}
                    <span className="text-lg text-gray-500 font-medium ml-1">hrs</span>
                  </p>
                  <p className="text-sm text-gray-500 font-medium">
                    {t("portfolio.totalHours", "Volunteer Hours")}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.4 }}
            className="col-span-1"
          >
            <div className="bg-white rounded-3xl p-6 h-full border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex flex-col h-full justify-between">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center mb-4">
                  <Trophy className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-3xl font-bold text-gray-900 mb-1">
                    {summary.byType?.award || 0}
                  </p>
                  <p className="text-sm text-gray-500 font-medium">
                    {t("portfolio.awards", "Awards Won")}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4, duration: 0.4 }}
            className="col-span-2 md:col-span-1"
          >
            <div className="bg-gray-900 rounded-3xl p-6 h-full shadow-xl relative overflow-hidden group">
              <div className="absolute inset-0 bg-gradient-to-br from-gray-800 to-gray-900 opacity-90" />
              <div className="absolute -bottom-4 -right-4 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors" />
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <p className="text-gray-400 font-medium text-sm">
                    {t("portfolio.categories", "Categories Explored")}
                  </p>
                </div>
                <div className="mt-4 flex items-end justify-between">
                  <p className="text-4xl font-bold text-white tracking-tight">
                    {summary.byType ? Object.keys(summary.byType).length : 0}
                  </p>
                  <div className="flex gap-1 mb-1">
                    {Object.keys(typeConfig).slice(0, 3).map((k, i) => (
                      <div key={k} className="w-2.5 h-2.5 rounded-full opacity-50" style={{ backgroundColor: typeConfig[k as PortfolioItemType].bg.replace('bg-', '') }} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* Animated Filter Bar */}
      <div className="flex flex-wrap gap-2 items-center p-1 bg-gray-100/50 rounded-2xl w-fit">
        {["all", ...(Object.keys(typeConfig) as PortfolioItemType[])].map((type) => {
          const isActive = activeType === type;
          const label = type === "all" ? "All" : typeConfig[type as PortfolioItemType].label;

          return (
            <button
              key={type}
              onClick={() => setActiveType(type as "all" | PortfolioItemType)}
              className={cn(
                "relative px-4 py-2 text-sm font-medium rounded-xl transition-colors duration-200 outline-none",
                isActive ? "text-blue-700" : "text-gray-500 hover:text-gray-900 hover:bg-gray-100"
              )}
            >
              {isActive && (
                <motion.div
                  layoutId="activeFilterBg"
                  className="absolute inset-0 bg-white rounded-xl shadow-sm border border-gray-200/50"
                  initial={false}
                  transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                />
              )}
              <span className="relative z-10">{label}</span>
            </button>
          );
        })}
      </div>

      {/* Items Grid */}
      {items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="relative rounded-3xl border border-dashed border-gray-300 bg-gray-50/50 backdrop-blur-sm p-16 text-center overflow-hidden group"
        >
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 via-transparent to-blue-50/50 opacity-0 group-hover:opacity-100 transition-opacity duration-1000" />
          <div className="relative z-10">
            <div className="w-20 h-20 mx-auto mb-6 bg-white rounded-2xl shadow-sm border border-gray-100 flex items-center justify-center transform group-hover:-translate-y-2 transition-transform duration-500">
              <FolderOpen className="h-10 w-10 text-indigo-400" />
            </div>
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {t("portfolio.noItemsTitle", "Build Your Portfolio")}
            </h3>
            <p className="text-gray-500 max-w-md mx-auto mb-8">
              {t("portfolio.noItems", "Showcase your achievements, projects, and experiences to stand out. Start adding items to build your professional profile.")}
            </p>
            <Button onClick={openCreateForm} size="lg" className="rounded-full px-8 shadow-md hover:shadow-lg transition-all">
              <Plus className="h-5 w-5 mr-2" />
              {t("portfolio.addFirst", "Add Your First Item")}
            </Button>
          </div>
        </motion.div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <AnimatePresence mode="popLayout">
            {items.map((item: PortfolioItem) => {
              const cfg = typeConfig[item.type] || typeConfig.extracurricular;
              const Icon = cfg.icon;

              return (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <div className="bg-white rounded-[24px] p-6 border border-gray-100/80 shadow-sm hover:shadow-xl hover:shadow-indigo-100/40 transition-all duration-300 group relative">
                    <div className="absolute top-0 left-0 w-2 h-full rounded-l-[24px] opacity-0 group-hover:opacity-100 transition-opacity" style={{ backgroundColor: cfg.color.replace('text-', '') }} />
                    <div className="space-y-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-4">
                          <div className={`p-3 rounded-2xl ${cfg.bg} flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                            <Icon className={`h-6 w-6 ${cfg.color}`} />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900 text-lg leading-tight group-hover:text-indigo-600 transition-colors">
                              {item.title}
                            </h3>
                            {item.organization && (
                              <p className="text-sm text-gray-500 mt-1 font-medium">
                                {item.organization}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8 rounded-full bg-gray-50 hover:bg-gray-100 text-gray-600"
                            onClick={() => openEditForm(item)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="secondary"
                            className="h-8 w-8 rounded-full bg-red-50 hover:bg-red-100 text-red-500"
                            onClick={() => deleteItem.mutate(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>

                      {item.role && (
                        <div className="inline-flex items-center px-2.5 py-1 rounded-md bg-gray-50 border border-gray-100 text-xs font-semibold text-gray-600">
                          {item.role}
                        </div>
                      )}

                      {item.description && (
                        <p className="text-sm text-gray-600 leading-relaxed line-clamp-3">
                          {item.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-sm font-medium text-gray-500 pt-2 border-t border-gray-50">
                        {item.startDate && (
                          <span className="flex items-center gap-1.5">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {item.startDate}
                            {item.endDate ? ` – ${item.endDate}` : " – Present"}
                          </span>
                        )}
                        {item.totalHours && (
                          <span className="flex items-center gap-1.5">
                            <Clock className="h-4 w-4 text-gray-400" />
                            {item.totalHours} hrs
                          </span>
                        )}
                      </div>

                      {item.achievements && item.achievements.length > 0 && (
                        <div className="flex gap-2 flex-wrap pt-1">
                          {item.achievements.slice(0, 3).map((a) => (
                            <span
                              key={a}
                              className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100/50"
                            >
                              {a}
                            </span>
                          ))}
                          {item.achievements.length > 3 && (
                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
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
        <DialogContent className="max-w-xl p-0 overflow-hidden bg-white/95 backdrop-blur-xl border-gray-100 rounded-3xl">
          <div className="bg-gradient-to-r from-indigo-50 to-blue-50/30 p-6 border-b border-indigo-100/50">
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                {editingItem ? (
                  <>
                    <Edit className="w-5 h-5 text-indigo-500" />
                    {t("portfolio.editItem", "Edit Experience")}
                  </>
                ) : (
                  <>
                    <Plus className="w-5 h-5 text-indigo-500" />
                    {t("portfolio.addItem", "Add New Experience")}
                  </>
                )}
              </DialogTitle>
            </DialogHeader>
          </div>

          <div className="p-6 space-y-5">
            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Type of Experience</label>
              <Select
                value={formData.type}
                onValueChange={(v) =>
                  setFormData({ ...formData, type: v as PortfolioItemType })
                }
              >
                <SelectTrigger className="h-12 bg-gray-50/50 border-gray-200 focus:ring-indigo-500">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(typeConfig) as PortfolioItemType[]).map(
                    (type) => (
                      <SelectItem key={type} value={type} className="cursor-pointer">
                        <div className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${typeConfig[type].bg.replace('bg-', 'bg-')}`} style={{ backgroundColor: typeConfig[type].color.replace('text-', '') }} />
                          {typeConfig[type].label}
                        </div>
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Title *</label>
              <Input
                placeholder="E.g., Varsity Team Captain, Software Engineer Intern..."
                className="h-12 bg-gray-50/50 border-gray-200 focus:ring-indigo-500"
                value={formData.title}
                onChange={(e) =>
                  setFormData({ ...formData, title: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Organization / School</label>
                <Input
                  placeholder="Where did this happen?"
                  className="h-12 bg-gray-50/50 border-gray-200 focus:ring-indigo-500"
                  value={formData.organization}
                  onChange={(e) =>
                    setFormData({ ...formData, organization: e.target.value })
                  }
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Role / Position</label>
                <Input
                  placeholder="What was your title?"
                  className="h-12 bg-gray-50/50 border-gray-200 focus:ring-indigo-500"
                  value={formData.role}
                  onChange={(e) =>
                    setFormData({ ...formData, role: e.target.value })
                  }
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Description</label>
              <Textarea
                placeholder="Describe your responsibilities and what you learned..."
                className="resize-none bg-gray-50/50 border-gray-200 focus:ring-indigo-500 min-h-[100px]"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                rows={3}
              />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("portfolio.startDate", "Start Date")}
                </label>
                <Input
                  type="date"
                  className="h-12 bg-gray-50/50 border-gray-200 focus:ring-indigo-500"
                  value={formData.startDate}
                  onChange={(e) =>
                    setFormData({ ...formData, startDate: e.target.value })
                  }
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("portfolio.endDate", "End Date")}
                </label>
                <Input
                  type="date"
                  className="h-12 bg-gray-50/50 border-gray-200 focus:ring-indigo-500"
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
                <label className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  {t("portfolio.totalHours", "Total Hours")}
                </label>
                <Input
                  type="number"
                  placeholder="0"
                  className="h-12 bg-gray-50/50 border-gray-200 focus:ring-indigo-500"
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

          <div className="p-6 bg-gray-50/80 border-t border-gray-100 flex items-center justify-end gap-3 rounded-b-3xl">
            <Button variant="ghost" className="hover:bg-gray-200/50" onClick={() => setShowForm(false)}>
              {t("common.cancel", "Cancel")}
            </Button>
            <Button
              className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 px-8"
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
