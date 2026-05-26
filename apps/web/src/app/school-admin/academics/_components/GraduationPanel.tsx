"use client";

import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { GraduationCap, Plus, Loader2, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  useGraduationRules,
  useCreateGraduationRules,
  useUpdateGraduationRules,
  useAllGraduationProgress,
} from "@/hooks/useGraduationQueries";
import type { CategoryRequirement, SpecialRequirement } from "@/types/graduation";

export function GraduationPanel() {
  const { t } = useTranslation();
  const { data: rules, isLoading: rulesLoading } = useGraduationRules();
  const { data: progress, isLoading: progressLoading } = useAllGraduationProgress({ limit: 20 });
  const createRules = useCreateGraduationRules();
  const updateRules = useUpdateGraduationRules();

  const [totalCredits, setTotalCredits] = useState(24);
  const [categories, setCategories] = useState<CategoryRequirement[]>([]);
  const [specialReqs, setSpecialReqs] = useState<SpecialRequirement[]>([]);
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);

  useEffect(() => {
    if (rules) {
      setTotalCredits(rules.totalCreditsRequired);
      setCategories(rules.categoryRequirements ?? []);
      setSpecialReqs(rules.specialRequirements ?? []);
    }
  }, [rules]);

  const addCategory = () => {
    setCategories([...categories, { category: "", minCredits: 0, requiredCourses: [], electivesAllowed: true }]);
  };

  const removeCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const updateCategory = (index: number, field: string, value: string | number | boolean) => {
    setCategories(categories.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const handleSaveRules = () => {
    const payload = {
      schoolId: rules?.schoolId || "",
      academicYearId: rules?.academicYearId || "",
      totalCreditsRequired: totalCredits,
      categoryRequirements: categories,
      specialRequirements: specialReqs,
    };
    if (rules?.id) {
      updateRules.mutate(
        { ruleSetId: rules.id, payload },
        {
          onSuccess: () => { toast.success(t("schoolAdmin.graduation.saved", "Rules saved")); setRuleDialogOpen(false); },
          onError: () => toast.error(t("schoolAdmin.graduation.error", "Failed to save")),
        }
      );
    } else {
      createRules.mutate(payload, {
        onSuccess: () => { toast.success(t("schoolAdmin.graduation.created", "Rules created")); setRuleDialogOpen(false); },
        onError: () => toast.error(t("schoolAdmin.graduation.error", "Failed to create")),
      });
    }
  };

  const trackColor = (status: string) => {
    if (status === "on_track") return "#10b981";
    if (status === "at_risk") return "#f59e0b";
    return "#ef4444";
  };

  const trackIcon = (status: string) => {
    if (status === "on_track") return <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#10b981" }} />;
    if (status === "at_risk") return <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#f59e0b" }} />;
    return <AlertTriangle className="h-3.5 w-3.5" style={{ color: "#ef4444" }} />;
  };

  if (rulesLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" style={{ background: "var(--admin-bg-hover)" }} />
        <Skeleton className="h-[400px]" style={{ background: "var(--admin-bg-hover)" }} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Rules Summary */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          background: "var(--admin-bg-hover)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GraduationCap style={{ width: 16, height: 16, color: "var(--admin-accent-blue, #3b82f6)" }} />
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
                {t("schoolAdmin.graduation.rulesTitle", "Graduation Rule Set")}
              </div>
              <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
                {rules
                  ? t("schoolAdmin.graduation.creditsRequired", "{{count}} total credits required", { count: rules.totalCreditsRequired })
                  : t("schoolAdmin.graduation.noRules", "No rules configured yet")}
              </div>
            </div>
          </div>
          <button
            onClick={() => setRuleDialogOpen(true)}
            style={{
              height: 32, borderRadius: 6, padding: "0 12px",
              fontSize: 12, fontWeight: 600,
              display: "flex", alignItems: "center", gap: 4,
              background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
              border: "none", cursor: "pointer",
            }}
          >
            {rules ? t("schoolAdmin.graduation.editRules", "Edit Rules") : t("schoolAdmin.graduation.createRules", "Create Rules")}
          </button>
        </div>
        {rules && (
          <div style={{ padding: 16 }}>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {(rules.categoryRequirements ?? []).map((cat, i) => (
                <div key={i} style={{
                  padding: "10px 12px", borderRadius: 6,
                  border: "1px solid var(--admin-border-default)",
                  background: "var(--admin-bg-hover)",
                }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>{cat.category}</div>
                  <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)", marginTop: 2 }}>{cat.minCredits} credits minimum</div>
                  {cat.electivesAllowed && (
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 3,
                      background: "rgba(16,185,129,0.1)", color: "#10b981", marginTop: 4, display: "inline-block",
                    }}>
                      Electives OK
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Rules Edit Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("schoolAdmin.graduation.editRulesTitle", "Edit Graduation Rules")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>{t("schoolAdmin.graduation.totalCredits", "Total Credits Required")}</Label>
              <Input type="number" min="1" value={totalCredits} onChange={(e) => setTotalCredits(Math.max(1, Number(e.target.value)))} />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{t("schoolAdmin.graduation.categories", "Category Requirements")}</Label>
                <button
                  onClick={addCategory}
                  style={{
                    height: 30, borderRadius: 6, padding: "0 10px",
                    fontSize: 11, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 4,
                    background: "transparent", color: "var(--admin-font-primary)",
                    border: "1px solid var(--admin-border-default)", cursor: "pointer",
                  }}
                >
                  <Plus className="h-3 w-3" />Add
                </button>
              </div>
              {categories.map((cat, i) => (
                <div key={i} className="flex gap-2 items-end" style={{ border: "1px solid var(--admin-border-default)", padding: 12, borderRadius: 6 }}>
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Category</Label>
                    <Input value={cat.category} onChange={(e) => updateCategory(i, "category", e.target.value)} placeholder="e.g. Mathematics" />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Credits</Label>
                    <Input type="number" value={cat.minCredits} onChange={(e) => updateCategory(i, "minCredits", Number(e.target.value))} />
                  </div>
                  <button
                    onClick={() => removeCategory(i)}
                    style={{ width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    <Trash2 className="h-4 w-4" style={{ color: "#ef4444" }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <button
              onClick={() => setRuleDialogOpen(false)}
              style={{
                height: 36, borderRadius: 6, padding: "0 14px",
                fontSize: 12, fontWeight: 600, background: "transparent",
                color: "var(--admin-font-primary)",
                border: "1px solid var(--admin-border-default)", cursor: "pointer",
              }}
            >
              {t("common.cancel", "Cancel")}
            </button>
            <button
              onClick={handleSaveRules}
              disabled={createRules.isPending || updateRules.isPending}
              style={{
                height: 36, borderRadius: 6, padding: "0 14px",
                fontSize: 12, fontWeight: 600,
                display: "flex", alignItems: "center", gap: 6,
                background: "var(--admin-accent-blue, #3b82f6)", color: "#fff",
                border: "none", cursor: "pointer",
                opacity: (createRules.isPending || updateRules.isPending) ? 0.6 : 1,
              }}
            >
              {(createRules.isPending || updateRules.isPending) && <Loader2 className="h-4 w-4 animate-spin" />}
              {t("common.save", "Save")}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student Progress Table */}
      <div style={{
        borderRadius: 8, border: "1px solid var(--admin-border-default)",
        background: "var(--admin-bg-card)", overflow: "hidden",
      }}>
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid var(--admin-border-default)",
          background: "var(--admin-bg-hover)",
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary)" }}>
            {t("schoolAdmin.graduation.progressTitle", "Student Progress Overview")}
          </div>
          <div style={{ fontSize: 11, color: "var(--admin-font-tertiary)" }}>
            {t("schoolAdmin.graduation.progressDesc", "Track which students are on track for graduation")}
          </div>
        </div>
        <div>
          {progressLoading ? (
            <div style={{ padding: 16 }}>
              <Skeleton className="h-[300px] w-full" style={{ background: "var(--admin-bg-hover)" }} />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{t("common.student", "Student")}</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.graduation.status", "Status")}</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.graduation.creditDeficit", "Credit Deficit")}</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.graduation.missingCourses", "Missing Courses")}</TableHead>
                  <TableHead style={{ fontSize: 11, fontWeight: 600, color: "var(--admin-font-tertiary)" }}>{t("schoolAdmin.graduation.topGap", "Top Gap")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {progress?.data?.map((s) => (
                  <TableRow key={s.studentId}>
                    <TableCell style={{ fontSize: 13, fontWeight: 500, color: "var(--admin-font-primary)" }}>{s.studentName}</TableCell>
                    <TableCell>
                      <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, fontWeight: 600, color: trackColor(s.overallStatus) }}>
                        {trackIcon(s.overallStatus)}
                        {s.overallStatus.replace("_", " ")}
                      </span>
                    </TableCell>
                    <TableCell style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>{s.creditDeficit > 0 ? `-${s.creditDeficit}` : "0"}</TableCell>
                    <TableCell style={{ fontSize: 12, color: "var(--admin-font-primary)" }}>{s.missingRequiredCourses}</TableCell>
                    <TableCell style={{ fontSize: 12, color: "var(--admin-font-tertiary)" }}>{s.topGap || "\u2014"}</TableCell>
                  </TableRow>
                ))}
                {(!progress?.data || progress.data.length === 0) && (
                  <TableRow>
                    <TableCell colSpan={5} style={{ textAlign: "center", color: "var(--admin-font-tertiary)", padding: "48px 0", fontSize: 12 }}>
                      {t("schoolAdmin.graduation.noData", "No progress data available")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
