"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { toast } from "sonner";
import { AnimatePresence } from "motion/react";
import { Plus, Search, Tag, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Question360,
  questions360Service,
  getRelationTypeOptions,
  getCommonCategories,
  CreateQuestion360Request,
  UpdateQuestion360Request,
} from "@/services/questions360Service";
import { QuestionCard } from "./_components/QuestionCard";
import { QuestionFormDialog } from "./_components/QuestionFormDialog";

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

const RELATION_TYPE_OPTIONS = getRelationTypeOptions();
const CATEGORY_OPTIONS = getCommonCategories();

export default function AdminQuestionsPage() {
  const router = useRouter();
  const { t } = useTranslation("platform_owner");
  const { t: tCommon } = useTranslation();
  const { isAdmin, loading: authLoading } = useAdminAccess();
  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [questions, setQuestions] = useState<Question360[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<Question360 | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterRelation, setFilterRelation] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const [formData, setFormData] = useState<CreateQuestionData>({
    questionEnglishText: "",
    questionSpanishText: "",
    category: CATEGORY_OPTIONS[0],
    relationType: "Parent",
    questionNumber: 1,
    isSubQuestion: false,
    isActive: true,
  });

  const loadQuestions = async () => {
    try {
      setLoading(true);
      const data = await questions360Service.getAllQuestions();
      if (Array.isArray(data)) {
        setQuestions(data);
      } else {
        setQuestions([]);
        toast.error(t("questions.toast.invalidDataFormat"));
      }
    } catch {
      toast.error(t("questions.toast.failedToLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!authLoading && isAdmin) {
      loadQuestions();
    } else if (!authLoading && !isAdmin) {
      router.push("/login");
    }
  }, [authLoading, isAdmin, router]);

  const handleOpenCreate = () => {
    setEditingQuestion(null);
    const maxNum = questions.length > 0 ? Math.max(...questions.map(q => q.questionNumber)) : 0;
    setFormData({
      questionEnglishText: "",
      questionSpanishText: "",
      category: CATEGORY_OPTIONS[0],
      relationType: "Parent",
      questionNumber: maxNum + 1,
      isSubQuestion: false,
      isActive: true,
      parentQuestionId: undefined,
    });
    setIsDialogOpen(true);
  };

  const handleOpenEdit = (question: Question360) => {
    setEditingQuestion(question);
    setFormData({
      questionEnglishText: question.questionEnglishText,
      questionSpanishText: question.questionSpanishText || "",
      category: question.category,
      relationType: question.relationType,
      questionNumber: question.questionNumber,
      isSubQuestion: question.isSubQuestion,
      isActive: question.isActive,
      parentQuestionId: question.parentQuestionId,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.questionEnglishText.trim()) {
      toast.error(t("questions.toast.englishRequired"));
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        ...formData,
        parentQuestionId: formData.isSubQuestion ? formData.parentQuestionId : undefined,
      };
      if (editingQuestion) {
        await questions360Service.updateQuestion(editingQuestion.id, payload as UpdateQuestion360Request);
        toast.success(t("questions.toast.updatedSuccess"));
      } else {
        await questions360Service.createQuestion(payload as CreateQuestion360Request);
        toast.success(t("questions.toast.createdSuccess"));
      }
      setIsDialogOpen(false);
      loadQuestions();
    } catch {
      toast.error(editingQuestion ? t("questions.toast.failedToUpdate") : t("questions.toast.failedToCreate"));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const confirmed = await confirm({
      title: t("questions.confirm.deleteTitle"),
      description: t("questions.confirm.deleteDesc"),
      confirmLabel: t("questions.confirm.deleteLabel"),
      variant: "destructive",
    });
    if (!confirmed) return;
    try {
      await questions360Service.deleteQuestion(id);
      toast.success(t("questions.toast.deletedSuccess"));
      loadQuestions();
    } catch {
      toast.error(t("questions.toast.failedToDelete"));
    }
  };

  const handleToggleActive = async (question: Question360) => {
    try {
      if (question.isActive) {
        await questions360Service.deactivateQuestion(question.id);
        toast.success(t("questions.toast.deactivated"));
      } else {
        await questions360Service.activateQuestion(question.id);
        toast.success(t("questions.toast.activated"));
      }
      setQuestions(questions.map(q => q.id === question.id ? { ...q, isActive: !q.isActive } : q));
    } catch {
      toast.error(t("questions.toast.failedToUpdateStatus"));
    }
  };

  const filteredQuestions = questions.filter(q => {
    const matchesSearch = q.questionEnglishText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (q.questionSpanishText && q.questionSpanishText.toLowerCase().includes(searchQuery.toLowerCase()));
    const matchesRelation = filterRelation === "all" || q.relationType === filterRelation;
    const matchesCategory = filterCategory === "all" || q.category === filterCategory;
    return matchesSearch && matchesRelation && matchesCategory;
  }).sort((a, b) => a.questionNumber - b.questionNumber);

  const totalPages = Math.max(1, Math.ceil(filteredQuestions.length / PAGE_SIZE));
  const pagedQuestions = filteredQuestions.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => { setPage(1); }, [searchQuery, filterRelation, filterCategory]);

  if (authLoading || loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1">
          <h1 className="text-4xl font-bold tracking-tight text-gray-900">{t("questions.title")}</h1>
          <p className="text-lg text-gray-500 font-medium">{t("questions.subtitle")}</p>
        </div>
        <Button onClick={handleOpenCreate} className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-sm h-12 px-6">
          <Plus className="mr-2 h-5 w-5" />
          {t("questions.addQuestion")}
        </Button>
      </div>

      {/* Tabs & Filters */}
      <div className="space-y-4">
        <Tabs defaultValue="all" value={filterRelation} onValueChange={setFilterRelation} className="w-full">
          <TabsList className="bg-white border border-gray-200 p-1 h-12 rounded-xl w-full justify-start overflow-x-auto">
            <TabsTrigger value="all" className="rounded-lg px-4 h-9 data-[state=active]:bg-gray-100 data-[state=active]:text-gray-900">{t("questions.allRelations")}</TabsTrigger>
            {RELATION_TYPE_OPTIONS.map(opt => (
              <TabsTrigger key={opt.value} value={opt.value} className="rounded-lg px-4 h-9 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">{opt.label}</TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <Input placeholder={t("questions.searchPlaceholder")} value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white transition-colors" />
          </div>
          <div className="flex gap-4">
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[200px] h-11 rounded-xl border-gray-200 bg-gray-50/50">
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-gray-500" />
                  <SelectValue placeholder={t("questions.categoryPlaceholder")} />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("questions.allCategories")}</SelectItem>
                {CATEGORY_OPTIONS.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Questions Grid */}
      <div className="grid grid-cols-1 gap-4">
        <AnimatePresence>
          {filteredQuestions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
              <FileText className="h-16 w-16 text-gray-200 mb-4" />
              <h3 className="text-xl font-semibold text-gray-900">{t("questions.noQuestionsTitle")}</h3>
              <p className="text-gray-500 mt-2 text-center">{t("questions.noQuestionsDesc")}</p>
            </div>
          ) : (
            pagedQuestions.map((question) => (
              <QuestionCard key={question.id} question={question}
                onEdit={handleOpenEdit} onDelete={handleDelete} onToggleActive={handleToggleActive} />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Pagination */}
      {filteredQuestions.length > 0 && (
        <div className="flex items-center justify-between border border-gray-100 rounded-xl p-4 bg-white">
          <p className="text-sm text-gray-500">
            {t("questions.pagination.showingPage", { page, total: totalPages, count: filteredQuestions.length })}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-lg border-gray-200 text-gray-500 h-8">{tCommon("common.previous")}</Button>
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="rounded-lg border-gray-200 text-gray-500 h-8">{tCommon("common.next")}</Button>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <QuestionFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingQuestion={editingQuestion}
        formData={formData}
        onFormDataChange={setFormData}
        onSave={handleSave}
        isSaving={isSaving}
        relationTypeOptions={RELATION_TYPE_OPTIONS}
        categoryOptions={CATEGORY_OPTIONS}
        parentQuestions={questions.filter(q => !q.isSubQuestion && q.id !== editingQuestion?.id)}
      />

      <ConfirmDialog />
    </div>
  );
}
