"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import {
  Heart,
  Plus,
  Clock,
  CheckCircle2,
  XCircle,
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
import {
  useMyCommunityService,
  useLogCommunityService,
} from "@/hooks/useCommunityServiceQueries";
import type { CommunityServiceStatus } from "@/types/communityService";
import { format } from "date-fns";

const statusConfig: Record<
  CommunityServiceStatus,
  { icon: typeof CheckCircle2; label: string; color: string; border: string }
> = {
  verified: {
    icon: CheckCircle2,
    label: "Verified",
    color: "text-emerald-600 bg-emerald-50",
    border: "border-emerald-200",
  },
  pending: {
    icon: Clock,
    label: "Pending",
    color: "text-amber-600 bg-amber-50",
    border: "border-amber-200",
  },
  rejected: {
    icon: XCircle,
    label: "Rejected",
    color: "text-red-600 bg-red-50",
    border: "border-red-200",
  },
};

export default function CommunityServicePage() {
  const { t } = useTranslation();
  const { data, isLoading } = useMyCommunityService();
  const logMutation = useLogCommunityService();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    organization: "",
    description: "",
    hours: "",
    date: "",
    supervisorName: "",
    supervisorEmail: "",
  });

  const handleSubmit = () => {
    if (!form.organization || !form.hours || !form.date) return;
    logMutation.mutate(
      {
        organization: form.organization,
        description: form.description,
        hours: Number(form.hours),
        date: form.date,
        supervisorName: form.supervisorName || undefined,
        supervisorEmail: form.supervisorEmail || undefined,
      },
      {
        onSuccess: () => {
          setShowForm(false);
          setForm({ organization: "", description: "", hours: "", date: "", supervisorName: "", supervisorEmail: "" });
        },
      }
    );
  };

  const totalRequired = data?.totalHoursRequired ?? 40;
  const totalLogged = data?.totalHoursLogged ?? 0;
  const totalVerified = data?.totalHoursVerified ?? 0;
  const progress = totalRequired > 0 ? Math.min((totalVerified / totalRequired) * 100, 100) : 0;
  const remaining = Math.max(0, totalRequired - totalVerified);

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
            Graduation Requirement
          </p>
          <h1 className="text-2xl font-bold tracking-tight text-foreground mb-1">
            Community Service Hours
          </h1>
          <p className="text-sm text-muted-foreground">
            Track your volunteer hours and see your progress towards graduation.
          </p>
        </div>

        <div className="flex-shrink-0">
          <Button
            onClick={() => setShowForm(!showForm)}
            className="bg-foreground text-background hover:bg-foreground/90"
          >
            <Plus className="h-4 w-4 mr-2" />
            Log Hours
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
            <p className="text-xs font-medium text-muted-foreground">Verified</p>
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
            <p className="text-xs font-medium text-muted-foreground">Pending</p>
          </div>
          <p className="text-2xl font-bold text-foreground">
            {totalLogged - totalVerified > 0 ? totalLogged - totalVerified : 0}<span className="text-sm text-muted-foreground font-medium ml-1">hrs</span>
          </p>
        </div>

        <div className="dash-card p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 rounded-lg bg-rose-100 flex items-center justify-center">
              <Zap className="w-4 h-4 text-rose-600" />
            </div>
            <p className="text-xs font-medium text-muted-foreground">Remaining</p>
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
            <p className="text-xs font-medium text-muted-foreground">Progress</p>
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

      {/* Log Form */}
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
                <h3 className="font-semibold text-sm text-foreground">Log New Service Hours</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Organization *</Label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="e.g. Red Cross"
                      className="pl-9 h-10 bg-secondary border-border"
                      value={form.organization}
                      onChange={(e) => setForm({ ...form, organization: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Date *</Label>
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
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Hours *</Label>
                  <div className="relative">
                    <Clock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="number"
                      min="0.5"
                      step="0.5"
                      placeholder="e.g. 4"
                      className="pl-9 h-10 bg-secondary border-border"
                      value={form.hours}
                      onChange={(e) => setForm({ ...form, hours: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supervisor Name</Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="e.g. Maria Gonzalez"
                      className="pl-9 h-10 bg-secondary border-border"
                      value={form.supervisorName}
                      onChange={(e) => setForm({ ...form, supervisorName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Supervisor Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      type="email"
                      placeholder="supervisor@org.com"
                      className="pl-9 h-10 bg-secondary border-border"
                      value={form.supervisorEmail}
                      onChange={(e) => setForm({ ...form, supervisorEmail: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Description</Label>
                <Textarea
                  placeholder="Briefly describe what you did..."
                  className="h-20 bg-secondary border-border resize-none"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-3 pt-1">
                <Button variant="ghost" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={logMutation.isPending || !form.organization || !form.hours || !form.date}
                  className="bg-foreground text-background hover:bg-foreground/90 px-6"
                >
                  {logMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Submit Hours
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
              <h3 className="font-semibold text-sm text-foreground">Service Log</h3>
              <p className="text-xs text-muted-foreground">History of your volunteer work</p>
            </div>
          </div>
          {data?.entries?.length ? (
            <p className="text-xs font-medium text-muted-foreground">
              {data.entries.length} entries
            </p>
          ) : null}
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data?.entries?.length ? (
          <div className="text-center py-12 border border-dashed border-border rounded-lg">
            <div className="w-12 h-12 bg-secondary rounded-lg flex items-center justify-center mx-auto mb-3">
              <Heart className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm font-semibold text-foreground">No service hours logged yet</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
              Click "Log Hours" above to start tracking your community service.
            </p>
            <Button
              variant="outline"
              onClick={() => setShowForm(true)}
              className="mt-4 border border-border text-foreground hover:bg-secondary text-xs"
            >
              Start Logging
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            {data.entries.map((entry, index) => {
              const sc = statusConfig[entry.status];
              const Icon = sc.icon;
              return (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.05 + index * 0.03 }}
                  className="p-4 rounded-lg border border-border hover:border-foreground/20 transition-colors flex flex-col md:flex-row md:items-center gap-4"
                >
                  <div className={`p-2.5 rounded-lg border shrink-0 ${sc.color} ${sc.border}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <h4 className="font-semibold text-foreground text-sm truncate pr-4">{entry.organization}</h4>
                      <div className={`shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${sc.color} ${sc.border}`}>
                        {sc.label}
                      </div>
                    </div>

                    {entry.description && (
                      <p className="text-xs text-muted-foreground mb-2 line-clamp-2">
                        {entry.description}
                      </p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1 bg-secondary px-2 py-0.5 rounded-md">
                        <Calendar className="h-3 w-3" />
                        {format(new Date(entry.date), "MMM d, yyyy")}
                      </span>
                      <span className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                        <Clock className="h-3 w-3" />
                        {entry.hours} hours
                      </span>
                      {entry.supervisorName && (
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {entry.supervisorName}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </motion.div>
    </div>
  );
}
