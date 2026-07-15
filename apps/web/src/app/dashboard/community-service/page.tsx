"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Heart,
  Plus,
  Clock,
  CheckCircle2,
  Calendar,
  Building2,
  User,
  Mail,
  Loader2,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { QueryStateBoundary } from "@/components/QueryStateBoundary";
import {
  useMyCommunityService,
  useLogCommunityService,
  useUpdateCommunityService,
  useDeleteCommunityService,
} from "@/hooks/useCommunityServiceQueries";
import type { CommunityServiceEntry } from "@/types/communityService";
import { ServiceEntryCard } from "./_components/ServiceEntryCard";
import { useTranslation } from "react-i18next";

// ─── Shared form state type ──────────────────────────────────────────────────

interface FormState {
  organization: string;
  description: string;
  hours: string;
  date: string;
  supervisorName: string;
  supervisorEmail: string;
}

const emptyForm: FormState = {
  organization: "",
  description: "",
  hours: "",
  date: "",
  supervisorName: "",
  supervisorEmail: "",
};

// ─── Page ────────────────────────────────────────────────────────────────────

export default function CommunityServicePage() {
  const { t } = useTranslation("student");
  const { data, isLoading, isError, refetch } = useMyCommunityService();
  const logMutation = useLogCommunityService();
  const updateMutation = useUpdateCommunityService();
  const deleteMutation = useDeleteCommunityService();

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);

  const openAddForm = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const openEditForm = (entry: CommunityServiceEntry) => {
    setEditingId(entry.id);
    setForm({
      organization: entry.organization,
      description: entry.description ?? "",
      hours: String(entry.hours),
      date: entry.date,
      supervisorName: entry.supervisorName ?? "",
      supervisorEmail: entry.supervisorEmail ?? "",
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = () => {
    if (!form.organization || !form.hours || !form.date) return;
    const payload = {
      organization: form.organization,
      description: form.description,
      hours: Number(form.hours),
      date: form.date,
      supervisorName: form.supervisorName || undefined,
      supervisorEmail: form.supervisorEmail || undefined,
    };

    if (editingId) {
      updateMutation.mutate({ entryId: editingId, payload }, { onSuccess: closeForm });
    } else {
      logMutation.mutate(payload, { onSuccess: closeForm });
    }
  };

  const handleDelete = (entryId: string) => {
    if (!window.confirm(t("communityService.deleteConfirm"))) return;
    setDeletingId(entryId);
    deleteMutation.mutate(entryId, {
      onSettled: () => setDeletingId(null),
    });
  };

  const totalRequired = data?.totalHoursRequired ?? 0;
  const totalVerified = data?.totalHoursVerified ?? 0;
  const totalPending = data?.totalHoursPending ?? 0;
  const progress = totalRequired > 0 ? Math.min((totalVerified / totalRequired) * 100, 100) : 0;
  const remaining = Math.max(0, totalRequired - totalVerified);

  const isEmpty = !isLoading && !isError && !(data?.entries?.length);
  const isMutating = logMutation.isPending || updateMutation.isPending;

  const emptyFallback = (
    <div className="text-center py-12 border border-dashed border-border rounded-lg">
      <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center mx-auto mb-3">
        <Heart className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">{t("communityService.noHoursTitle")}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
        {t("communityService.noHoursBody")}
      </p>
      <Button
        variant="outline"
        onClick={openAddForm}
        className="mt-4 border border-border text-foreground hover:bg-secondary text-xs"
      >
        {t("communityService.startLogging")}
      </Button>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col md:flex-row md:items-end justify-between gap-6"
      >
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
            {t("communityService.badge")}
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
            {t("communityService.title")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("communityService.subtitle")}
          </p>
        </div>

        <div className="flex-shrink-0">
          <Button
            onClick={openAddForm}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t("communityService.logHours")}
          </Button>
        </div>
      </motion.div>

      {/* Stat Cards Row */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
      >
        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{t("communityService.verified")}</p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {totalVerified}<span className="text-sm text-muted-foreground font-medium ml-1">hrs</span>
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center">
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{t("communityService.pending")}</p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {totalPending}<span className="text-sm text-muted-foreground font-medium ml-1">hrs</span>
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
              <Zap className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{t("communityService.remaining")}</p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {remaining}<span className="text-sm text-muted-foreground font-medium ml-1">hrs</span>
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
              <Heart className="w-4 h-4 text-indigo-600" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">{t("communityService.progress")}</p>
          </div>
          <p className="text-2xl font-bold text-foreground mb-2">
            {Math.round(progress)}%
          </p>
          <div className="w-full h-1.5 bg-secondary rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 1.5, ease: "easeOut" }}
              className="h-full rounded-full bg-indigo-500"
            />
          </div>
        </div>
      </motion.div>

      {/* Add / Edit Form */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="dash-card p-5 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
                  <Heart className="h-4 w-4 text-rose-600" />
                </div>
                <h3 className="font-semibold text-sm text-foreground">
                  {editingId ? t("communityService.form.editTitle") : t("communityService.form.newTitle")}
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("communityService.form.organization")}</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t("communityService.form.organizationPlaceholder")}
                      className="pl-9 h-10 bg-secondary border-border"
                      value={form.organization}
                      onChange={(e) => setForm({ ...form, organization: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("communityService.form.date")}</Label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="date"
                      className="pl-9 h-10 bg-secondary border-border"
                      value={form.date}
                      onChange={(e) => setForm({ ...form, date: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("communityService.form.hours")}</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min="0.5"
                      step="0.5"
                      placeholder={t("communityService.form.hoursPlaceholder")}
                      className="pl-9 h-10 bg-secondary border-border"
                      value={form.hours}
                      onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("communityService.form.supervisorName")}</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={t("communityService.form.supervisorNamePlaceholder")}
                      className="pl-9 h-10 bg-secondary border-border"
                      value={form.supervisorName}
                      onChange={(e) => setForm({ ...form, supervisorName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("communityService.form.supervisorEmail")}</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder={t("communityService.form.supervisorEmailPlaceholder")}
                      className="pl-9 h-10 bg-secondary border-border"
                      value={form.supervisorEmail}
                      onChange={(e) => setForm({ ...form, supervisorEmail: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("communityService.form.description")}</Label>
                <Textarea
                  placeholder={t("communityService.form.descriptionPlaceholder")}
                  className="h-20 bg-secondary border-border resize-none"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Button variant="ghost" onClick={closeForm}>
                  {t("communityService.form.cancel")}
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isMutating || !form.organization || !form.hours || !form.date}
                  className="bg-foreground text-background hover:bg-foreground/90 px-6"
                >
                  {isMutating && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {editingId ? t("communityService.form.saveChanges") : t("communityService.form.submitHours")}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Entries List */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="dash-card p-5"
      >
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-secondary border border-border flex items-center justify-center">
              <Building2 className="w-4 h-4 text-foreground" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">{t("communityService.serviceLog.title")}</h3>
              <p className="text-xs text-muted-foreground">{t("communityService.serviceLog.history")}</p>
            </div>
          </div>
          {data?.entries?.length ? (
            <p className="text-xs font-medium text-muted-foreground">
              {data.entries.length} {t("communityService.serviceLog.entries")}
            </p>
          ) : null}
        </div>

        <QueryStateBoundary
          isLoading={isLoading}
          isError={isError}
          isEmpty={isEmpty}
          onRetry={refetch}
          emptyFallback={emptyFallback}
        >
          <div className="space-y-3">
            {data?.entries?.map((entry, index) => (
              <ServiceEntryCard
                key={entry.id}
                entry={entry}
                index={index}
                onEdit={openEditForm}
                onDelete={handleDelete}
                deletingId={deletingId}
              />
            ))}
          </div>
        </QueryStateBoundary>
      </motion.div>
    </div>
  );
}
