"use client";

import { useState, useEffect } from "react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

export default function GraduationPage() {
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
      setCategories(rules.categoryRequirements);
      setSpecialReqs(rules.specialRequirements);
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
    if (status === "on_track") return "text-green-600";
    if (status === "at_risk") return "text-yellow-600";
    return "text-red-600";
  };

  const trackIcon = (status: string) => {
    if (status === "on_track") return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    if (status === "at_risk") return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    return <AlertTriangle className="h-4 w-4 text-red-600" />;
  };

  if (rulesLoading) {
    return (<div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-[500px] w-full" /></div>);
  }

  return (
    <div className="space-y-8">
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="space-y-1">
        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
          {t("schoolAdmin.graduation.title", "Graduation Requirements")}
        </h1>
        <p className="text-lg text-gray-500 font-medium">
          {t("schoolAdmin.graduation.subtitle", "Define credit requirements and track student progress toward graduation.")}
        </p>
      </motion.div>

      {/* Rules Summary */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-gray-100 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <GraduationCap className="h-5 w-5 text-teal-600" />
                {t("schoolAdmin.graduation.rulesTitle", "Graduation Rule Set")}
              </CardTitle>
              <CardDescription>
                {rules
                  ? t("schoolAdmin.graduation.creditsRequired", "{{count}} total credits required", { count: rules.totalCreditsRequired })
                  : t("schoolAdmin.graduation.noRules", "No rules configured yet")}
              </CardDescription>
            </div>
            <Button
              onClick={() => setRuleDialogOpen(true)}
              className="bg-gradient-to-r from-teal-600 to-cyan-600 hover:from-teal-700 hover:to-cyan-700 text-white"
            >
              {rules ? t("schoolAdmin.graduation.editRules", "Edit Rules") : t("schoolAdmin.graduation.createRules", "Create Rules")}
            </Button>
          </CardHeader>
          {rules && (
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {rules.categoryRequirements.map((cat, i) => (
                  <div key={i} className="p-4 rounded-lg border bg-gray-50 space-y-1">
                    <p className="font-semibold text-sm">{cat.category}</p>
                    <p className="text-xs text-gray-500">{cat.minCredits} credits minimum</p>
                    {cat.electivesAllowed && <Badge variant="secondary" className="text-xs">Electives OK</Badge>}
                  </div>
                ))}
              </div>
            </CardContent>
          )}
        </Card>
      </motion.div>

      {/* Rules Edit Dialog */}
      <Dialog open={ruleDialogOpen} onOpenChange={setRuleDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t("schoolAdmin.graduation.editRulesTitle", "Edit Graduation Rules")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <div className="space-y-2">
              <Label>{t("schoolAdmin.graduation.totalCredits", "Total Credits Required")}</Label>
              <Input type="number" value={totalCredits} onChange={(e) => setTotalCredits(Number(e.target.value))} />
            </div>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-base font-semibold">{t("schoolAdmin.graduation.categories", "Category Requirements")}</Label>
                <Button variant="outline" size="sm" onClick={addCategory}><Plus className="h-3 w-3 mr-1" />Add</Button>
              </div>
              {categories.map((cat, i) => (
                <div key={i} className="flex gap-2 items-end border p-3 rounded-lg">
                  <div className="flex-1 space-y-1">
                    <Label className="text-xs">Category</Label>
                    <Input value={cat.category} onChange={(e) => updateCategory(i, "category", e.target.value)} placeholder="e.g. Mathematics" />
                  </div>
                  <div className="w-24 space-y-1">
                    <Label className="text-xs">Credits</Label>
                    <Input type="number" value={cat.minCredits} onChange={(e) => updateCategory(i, "minCredits", Number(e.target.value))} />
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => removeCategory(i)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRuleDialogOpen(false)}>{t("common.cancel", "Cancel")}</Button>
            <Button
              onClick={handleSaveRules}
              disabled={createRules.isPending || updateRules.isPending}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {(createRules.isPending || updateRules.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t("common.save", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Student Progress Table */}
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
        <Card className="border-0 shadow-lg">
          <CardHeader className="bg-gradient-to-r from-teal-50 to-cyan-50 border-b border-gray-100">
            <CardTitle>{t("schoolAdmin.graduation.progressTitle", "Student Progress Overview")}</CardTitle>
            <CardDescription>{t("schoolAdmin.graduation.progressDesc", "Track which students are on track for graduation")}</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {progressLoading ? (
              <div className="p-6"><Skeleton className="h-[300px] w-full" /></div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("common.student", "Student")}</TableHead>
                    <TableHead>{t("schoolAdmin.graduation.status", "Status")}</TableHead>
                    <TableHead>{t("schoolAdmin.graduation.creditDeficit", "Credit Deficit")}</TableHead>
                    <TableHead>{t("schoolAdmin.graduation.missingCourses", "Missing Courses")}</TableHead>
                    <TableHead>{t("schoolAdmin.graduation.topGap", "Top Gap")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {progress?.data?.map((s) => (
                    <TableRow key={s.studentId}>
                      <TableCell className="font-medium">{s.studentName}</TableCell>
                      <TableCell>
                        <span className={`flex items-center gap-1 font-semibold text-sm ${trackColor(s.overallStatus)}`}>
                          {trackIcon(s.overallStatus)}
                          {s.overallStatus.replace("_", " ")}
                        </span>
                      </TableCell>
                      <TableCell>{s.creditDeficit > 0 ? `-${s.creditDeficit}` : "0"}</TableCell>
                      <TableCell>{s.missingRequiredCourses}</TableCell>
                      <TableCell className="text-gray-500 text-sm">{s.topGap || "—"}</TableCell>
                    </TableRow>
                  ))}
                  {(!progress?.data || progress.data.length === 0) && (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center text-gray-400 py-12">
                        {t("schoolAdmin.graduation.noData", "No progress data available")}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
