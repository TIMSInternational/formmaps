"use client";

import { Loader2, Globe } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Question360 } from "@/services/questions360Service";

interface CreateQuestionData {
  questionEnglishText: string;
  questionSpanishText: string;
  category: string;
  relationType: "Parent" | "Teacher" | "Other" | "Self";
  questionNumber: number;
  isSubQuestion: boolean;
  parentQuestionId?: string;
  isActive?: boolean;
}

interface QuestionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingQuestion: Question360 | null;
  formData: CreateQuestionData;
  onFormDataChange: (data: CreateQuestionData) => void;
  onSave: () => void;
  isSaving: boolean;
  relationTypeOptions: Array<{ value: string; label: string }>;
  categoryOptions: string[];
  parentQuestions: Question360[];
}

export function QuestionFormDialog({
  open,
  onOpenChange,
  editingQuestion,
  formData,
  onFormDataChange,
  onSave,
  isSaving,
  relationTypeOptions,
  categoryOptions,
  parentQuestions,
}: QuestionFormDialogProps) {
  const { t } = useTranslation("platform_owner");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl rounded-3xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
        <DialogHeader className="p-8 pb-4 shrink-0">
          <DialogTitle className="text-2xl font-bold text-gray-900">
            {editingQuestion ? t("questions.form.editTitle") : t("questions.form.addTitle")}
          </DialogTitle>
          <DialogDescription className="text-base text-gray-500">
            {t("questions.form.formDesc")}
          </DialogDescription>
        </DialogHeader>

        <div className="px-8 py-4 space-y-6 overflow-y-auto flex-1">
          {/* Classification */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-gray-700 font-medium">{t("questions.form.relationType")}</Label>
              <Select
                value={formData.relationType}
                onValueChange={(v: "Parent" | "Teacher" | "Other" | "Self") =>
                  onFormDataChange({ ...formData, relationType: v })
                }
              >
                <SelectTrigger className="h-11 rounded-xl border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {relationTypeOptions.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 font-medium">{t("questions.form.category")}</Label>
              <Select
                value={formData.category}
                onValueChange={(v) => onFormDataChange({ ...formData, category: v })}
              >
                <SelectTrigger className="h-11 rounded-xl border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categoryOptions.map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Question Text */}
          <div className="space-y-4 p-4 bg-gray-50/50 rounded-2xl border border-gray-100">
            <div className="space-y-2">
              <Label className="text-gray-700 font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-blue-500" />
                {t("questions.form.englishText")} <span className="text-red-500">{t("questions.form.required")}</span>
              </Label>
              <Textarea
                value={formData.questionEnglishText}
                onChange={(e) => onFormDataChange({ ...formData, questionEnglishText: e.target.value })}
                className="min-h-[80px] rounded-xl border-gray-200 resize-none focus:ring-2 focus:ring-primary/20"
                placeholder={t("questions.form.englishPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 font-medium flex items-center gap-2">
                <Globe className="h-4 w-4 text-orange-500" />
                {t("questions.form.spanishText")}
              </Label>
              <Textarea
                value={formData.questionSpanishText}
                onChange={(e) => onFormDataChange({ ...formData, questionSpanishText: e.target.value })}
                className="min-h-[80px] rounded-xl border-gray-200 resize-none focus:ring-2 focus:ring-orange-500/20"
                placeholder={t("questions.form.spanishPlaceholder")}
              />
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="text-gray-700 font-medium">{t("questions.form.questionNumber")}</Label>
              <Input
                type="number"
                min="1"
                value={formData.questionNumber}
                onChange={(e) => onFormDataChange({ ...formData, questionNumber: parseInt(e.target.value) || 1 })}
                className="h-11 rounded-xl border-gray-200"
              />
            </div>
            <div className="space-y-2">
              <Label className="text-gray-700 font-medium">{t("questions.form.type")}</Label>
              <Select
                value={formData.isSubQuestion ? "sub" : "main"}
                onValueChange={(v) => {
                  const isSub = v === "sub";
                  onFormDataChange({
                    ...formData,
                    isSubQuestion: isSub,
                    parentQuestionId: isSub ? formData.parentQuestionId : undefined
                  });
                }}
              >
                <SelectTrigger className="h-11 rounded-xl border-gray-200">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="main">{t("questions.form.mainQuestion")}</SelectItem>
                  <SelectItem value="sub">{t("questions.form.subQuestion")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formData.isSubQuestion && (
            <div className="space-y-2">
              <Label className="text-gray-700 font-medium">{t("questions.form.parentQuestion")}</Label>
              <Select
                value={formData.parentQuestionId}
                onValueChange={(v) => onFormDataChange({ ...formData, parentQuestionId: v })}
              >
                <SelectTrigger className="h-11 rounded-xl border-gray-200">
                  <SelectValue placeholder={t("questions.form.parentPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {parentQuestions.map(q => (
                    <SelectItem key={q.id} value={q.id}>
                      #{q.questionNumber} - {q.questionEnglishText.length > 70 ? q.questionEnglishText.substring(0, 70) + "..." : q.questionEnglishText}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter className="p-8 pt-4 bg-gray-50/50 shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} className="rounded-xl h-11 border-gray-200 text-gray-700">
            {t("questions.form.cancelButton")}
          </Button>
          <Button onClick={onSave} disabled={isSaving} className="rounded-xl h-11 bg-gray-900 text-white hover:bg-gray-800">
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
            {editingQuestion ? t("questions.form.saveChanges") : t("questions.form.createButton")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
