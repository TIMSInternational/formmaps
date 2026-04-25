"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  ArrowLeft,
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
import Link from "next/link";
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

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.1, type: "spring" as const, stiffness: 100, damping: 20 },
  }),
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
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        {/* Header Section */}
        <div className="space-y-6">
          <Link
            href="/dashboard"
            className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-pink-600 transition-colors group"
          >
            <div className="p-1.5 rounded-lg bg-white border border-slate-200 mr-2 group-hover:border-pink-200 transition-all">
              <ArrowLeft className="w-4 h-4" />
            </div>
            Back to Dashboard
          </Link>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
            <div className="space-y-4 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-pink-50 border border-pink-100 text-pink-600 text-xs font-bold uppercase tracking-wider">
                <Heart className="w-3.5 h-3.5 fill-pink-600" />
                Graduation Requirement
              </div>
              <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
                Community <span className="text-transparent bg-clip-text bg-gradient-to-r from-pink-500 to-rose-500">Service Hours</span>
              </h1>
              <p className="text-slate-500 text-lg leading-relaxed">
                Track your volunteer hours. Log your community service here and see your progress towards graduation.
              </p>
            </div>
            <div className="shrink-0 flex gap-3">
              <Button
                size="lg"
                onClick={() => setShowForm(!showForm)}
                className="bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white rounded-xl shadow-md border-0 h-14 px-6 font-semibold"
              >
                <Plus className="h-5 w-5 mr-2" />
                Log Hours
              </Button>
            </div>
          </div>
        </div>

        {/* Stats Cards - Bento Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <motion.div
            custom={0}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="p-6 rounded-[2rem] bg-white border border-slate-200 hover:border-emerald-300 transition-colors relative overflow-hidden"
          >
            <div className="p-2 bg-emerald-50 rounded-lg w-fit mb-4 border border-emerald-100 relative z-10">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <p className="text-4xl font-extrabold text-slate-900 relative z-10">{totalVerified}<span className="text-xl text-slate-400 font-medium">h</span></p>
            <p className="text-sm text-slate-500 font-medium relative z-10 mt-1">Verified Hours</p>
            {/* Soft decorative background glow */}
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-emerald-100 rounded-full blur-2xl opacity-50 z-0"></div>
          </motion.div>

          <motion.div
            custom={1}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="p-6 rounded-[2rem] bg-white border border-slate-200 hover:border-amber-300 transition-colors relative overflow-hidden"
          >
            <div className="p-2 bg-amber-50 rounded-lg w-fit mb-4 border border-amber-100 relative z-10">
              <Clock className="w-5 h-5 text-amber-600" />
            </div>
            <p className="text-4xl font-extrabold text-slate-900 relative z-10">{totalLogged - totalVerified > 0 ? totalLogged - totalVerified : 0}<span className="text-xl text-slate-400 font-medium">h</span></p>
            <p className="text-sm text-slate-500 font-medium relative z-10 mt-1">Pending Review</p>
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-amber-100 rounded-full blur-2xl opacity-50 z-0"></div>
          </motion.div>

          <motion.div
            custom={2}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="p-6 rounded-[2rem] bg-white border border-slate-200 hover:border-pink-300 transition-colors relative overflow-hidden"
          >
            <div className="p-2 bg-pink-50 rounded-lg w-fit mb-4 border border-pink-100 relative z-10">
              <Zap className="w-5 h-5 text-pink-600" />
            </div>
            <p className="text-4xl font-extrabold text-slate-900 relative z-10">{remaining}<span className="text-xl text-slate-400 font-medium">h</span></p>
            <p className="text-sm text-slate-500 font-medium relative z-10 mt-1">Hours Remaining</p>
            <div className="absolute -right-6 -bottom-6 w-24 h-24 bg-pink-100 rounded-full blur-2xl opacity-50 z-0"></div>
          </motion.div>

          <motion.div
            custom={3}
            initial="hidden"
            animate="visible"
            variants={cardVariants}
            className="flex flex-col justify-center p-6 rounded-[2rem] bg-slate-900 text-white shadow-xl relative overflow-hidden"
          >
            <p className="text-sm text-slate-300 font-medium mb-3">Goal Progress</p>
            <div className="flex items-end gap-2 mb-2">
              <p className="text-4xl font-extrabold">{Math.round(progress)}%</p>
            </div>
            <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-2">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 1.5, ease: "easeOut" }}
                className="h-full rounded-full bg-gradient-to-r from-pink-400 to-rose-400"
              />
            </div>
          </motion.div>
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.div
              initial={{ opacity: 0, height: 0, scale: 0.95 }}
              animate={{ opacity: 1, height: "auto", scale: 1 }}
              exit={{ opacity: 0, height: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="p-8 rounded-[2rem] bg-white border border-pink-200 shadow-xl shadow-pink-500/5 space-y-6">
                <div className="flex items-center gap-3 mb-2">
                  <div className="p-2 bg-pink-50 border border-pink-100 rounded-xl">
                    <Heart className="h-5 w-5 text-pink-600" />
                  </div>
                  <h3 className="font-bold text-xl text-slate-900">Log New Service Hours</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold">Organization *</Label>
                    <div className="relative">
                      <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="e.g. Red Cross"
                        className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-pink-500"
                        value={form.organization}
                        onChange={(e) => setForm({ ...form, organization: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold">Date *</Label>
                    <div className="relative">
                      <Calendar className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="date"
                        className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-pink-500"
                        value={form.date}
                        onChange={(e) => setForm({ ...form, date: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold">Hours *</Label>
                    <div className="relative">
                      <Clock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="number"
                        min="0.5"
                        step="0.5"
                        placeholder="e.g. 4"
                        className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-pink-500"
                        value={form.hours}
                        onChange={(e) => setForm({ ...form, hours: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold">Supervisor Name</Label>
                    <div className="relative">
                      <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        placeholder="e.g. Maria Gonzalez"
                        className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-pink-500"
                        value={form.supervisorName}
                        onChange={(e) => setForm({ ...form, supervisorName: e.target.value })}
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-slate-700 font-semibold">Supervisor Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                      <Input
                        type="email"
                        placeholder="supervisor@org.com"
                        className="pl-10 h-12 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-pink-500"
                        value={form.supervisorEmail}
                        onChange={(e) => setForm({ ...form, supervisorEmail: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-700 font-semibold">Description</Label>
                  <Textarea
                    placeholder="Briefly describe what you did..."
                    className="h-24 bg-slate-50 border-slate-200 rounded-xl focus-visible:ring-pink-500 resize-none"
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-3 pt-2">
                  <Button variant="ghost" className="h-12 px-6 rounded-xl font-semibold hover:bg-slate-100" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmit}
                    disabled={logMutation.isPending || !form.organization || !form.hours || !form.date}
                    className="h-12 px-8 bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white rounded-xl shadow-md border-0 font-semibold"
                  >
                    {logMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                    Submit Hours
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main Content Grid: Entries List */}
        <div className="bg-white rounded-[2rem] p-6 md:p-8 border border-slate-200">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-100 border border-slate-200 rounded-xl">
                <Building2 className="w-6 h-6 text-slate-700" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-xl">Service Log</h3>
                <p className="text-slate-500 text-sm">History of your volunteer work</p>
              </div>
            </div>
            {data?.entries?.length ? (
              <div className="text-sm font-medium text-slate-500">
                {data.entries.length} entries
              </div>
            ) : null}
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <Loader2 className="h-8 w-8 animate-spin text-slate-300" />
            </div>
          ) : !data?.entries?.length ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-16 px-4 border-2 border-dashed border-slate-200 rounded-[2rem]"
            >
              <div className="w-16 h-16 bg-pink-50 text-pink-300 rounded-full flex items-center justify-center mx-auto mb-4">
                <Heart className="h-8 w-8" />
              </div>
              <p className="text-xl font-bold text-slate-900">No service hours logged yet</p>
              <p className="text-slate-500 mt-2 max-w-sm mx-auto">Click "Log Hours" above to start tracking your community service and working towards graduation.</p>
              <Button
                variant="outline"
                onClick={() => setShowForm(true)}
                className="mt-6 rounded-xl border-slate-200 text-pink-600 hover:bg-pink-50 hover:border-pink-200 font-semibold h-11 px-6"
              >
                Start Logging
              </Button>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {data.entries.map((entry, index) => {
                const sc = statusConfig[entry.status];
                const Icon = sc.icon;
                return (
                  <motion.div
                    key={entry.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.1 + index * 0.05 }}
                    className={`p-5 rounded-[1.5rem] border transition-colors flex flex-col md:flex-row md:items-center gap-5 ${entry.status === 'verified' ? 'bg-emerald-50/30 hover:border-emerald-300 border-emerald-100' : 'bg-white hover:border-slate-300 border-slate-200'}`}
                  >
                    <div className={`p-3.5 rounded-xl border shrink-0 ${sc.color} ${sc.border}`}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <h4 className="font-bold text-slate-900 text-lg truncate pr-4">{entry.organization}</h4>
                        <div className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${sc.color} ${sc.border}`}>
                          {sc.label}
                        </div>
                      </div>

                      {entry.description && (
                        <p className="text-sm text-slate-500 mb-3 line-clamp-2">
                          {entry.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500">
                        <div className="flex items-center gap-1.5 bg-slate-100 px-2.5 py-1 rounded-md">
                          <Calendar className="h-3.5 w-3.5 text-slate-400" />
                          {format(new Date(entry.date), "MMM d, yyyy")}
                        </div>
                        <div className="flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md">
                          <Clock className="h-3.5 w-3.5" />
                          {entry.hours} hours logged
                        </div>
                        {entry.supervisorName && (
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <User className="h-3.5 w-3.5" />
                            Supervisor: {entry.supervisorName}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
