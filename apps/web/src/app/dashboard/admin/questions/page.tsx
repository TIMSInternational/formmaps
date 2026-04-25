"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import {
    Loader2,
    Plus,
    Search,
    Filter,
    MoreVertical,
    Edit,
    Trash2,
    CheckCircle,
    XCircle,
    Globe,
    Tag,
    Users,
    FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { Badge } from "@/components/ui/badge";
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
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    Question360,
    questions360Service,
    getRelationTypeOptions,
    getCommonCategories,
    CreateQuestion360Request,
    UpdateQuestion360Request
} from "@/services/questions360Service";

// Types
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
    const { t } = useTranslation();
    const router = useRouter();
    const { isAdmin, loading: authLoading } = useAdminAccess();

    // State
    const [questions, setQuestions] = useState<Question360[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingQuestion, setEditingQuestion] = useState<Question360 | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Filters
    const [searchQuery, setSearchQuery] = useState("");
    const [filterRelation, setFilterRelation] = useState("all");
    const [filterCategory, setFilterCategory] = useState("all");

    // Form State
    const [formData, setFormData] = useState<CreateQuestionData>({
        questionEnglishText: "",
        questionSpanishText: "",
        category: CATEGORY_OPTIONS[0],
        relationType: "Parent",
        questionNumber: 1,
        isSubQuestion: false,
        isActive: true
    });

    // Initial Fetch
    const loadQuestions = async () => {
        try {
            setLoading(true);
            const data = await questions360Service.getAllQuestions();
            if (Array.isArray(data)) {
                setQuestions(data);
            } else {
                setQuestions([]);
                toast.error("Received invalid data format");
            }
        } catch (error) {
            console.error("Failed to load questions", error);
            toast.error("Failed to load questions");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && isAdmin) {
            loadQuestions();
        } else if (!authLoading && !isAdmin) {
            router.push("/dashboard");
        }
    }, [authLoading, isAdmin, router]);

    // Handlers
    const handleOpenCreate = () => {
        setEditingQuestion(null);
        // Find next question number for default
        const maxNum = questions.length > 0 ? Math.max(...questions.map(q => q.questionNumber)) : 0;

        setFormData({
            questionEnglishText: "",
            questionSpanishText: "",
            category: CATEGORY_OPTIONS[0],
            relationType: "Parent",
            questionNumber: maxNum + 1,
            isSubQuestion: false,
            isActive: true,
            parentQuestionId: undefined
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
            parentQuestionId: question.parentQuestionId
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        if (!formData.questionEnglishText.trim()) {
            toast.error("English question text is required");
            return;
        }

        setIsSaving(true);
        try {
            const payload = {
                ...formData,
                parentQuestionId: formData.isSubQuestion ? formData.parentQuestionId : undefined
            };

            if (editingQuestion) {
                await questions360Service.updateQuestion(editingQuestion.id, payload as UpdateQuestion360Request);
                toast.success("Question updated successfully");
            } else {
                await questions360Service.createQuestion(payload as CreateQuestion360Request);
                toast.success("Question created successfully");
            }

            setIsDialogOpen(false);
            loadQuestions();
        } catch (error) {
            console.error(error);
            toast.error(editingQuestion ? "Failed to update question" : "Failed to create question");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Are you sure you want to delete this question? This cannot be undone.")) return;

        try {
            await questions360Service.deleteQuestion(id);
            toast.success("Question deleted successfully");
            loadQuestions();
        } catch (error) {
            console.error(error);
            toast.error("Failed to delete question");
        }
    };

    const handleToggleActive = async (question: Question360) => {
        try {
            if (question.isActive) {
                await questions360Service.deactivateQuestion(question.id);
                toast.success("Question deactivated");
            } else {
                await questions360Service.activateQuestion(question.id);
                toast.success("Question activated");
            }
            // Optimistic update locally or reload
            setQuestions(questions.map(q => q.id === question.id ? { ...q, isActive: !q.isActive } : q));
        } catch (error) {
            console.error(error);
            toast.error("Failed to update status");
        }
    };

    // Filtering
    const filteredQuestions = questions.filter(q => {
        const matchesSearch = q.questionEnglishText.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (q.questionSpanishText && q.questionSpanishText.toLowerCase().includes(searchQuery.toLowerCase()));
        const matchesRelation = filterRelation === "all" || q.relationType === filterRelation;
        const matchesCategory = filterCategory === "all" || q.category === filterCategory;

        return matchesSearch && matchesRelation && matchesCategory;
    }).sort((a, b) => a.questionNumber - b.questionNumber);


    if (authLoading || loading) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="min-h-screen bg-gray-50/50 p-6 md:p-8 font-sans text-gray-900">
            <div className="max-w-7xl mx-auto space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
                            360° Questions
                        </h1>
                        <p className="text-lg text-gray-500 font-medium">
                            Manage evaluation questions for feedback cycles
                        </p>
                    </div>
                    <Button
                        onClick={handleOpenCreate}
                        className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-sm h-12 px-6"
                    >
                        <Plus className="mr-2 h-5 w-5" />
                        Add Question
                    </Button>
                </div>

                {/* Tabs & Filters */}
                <div className="space-y-4">
                    <Tabs defaultValue="all" value={filterRelation} onValueChange={setFilterRelation} className="w-full">
                        <TabsList className="bg-white border border-gray-200 p-1 h-12 rounded-xl w-full justify-start overflow-x-auto">
                            <TabsTrigger value="all" className="rounded-lg px-4 h-9 data-[state=active]:bg-gray-100 data-[state=active]:text-gray-900">
                                All Relations
                            </TabsTrigger>
                            {RELATION_TYPE_OPTIONS.map(opt => (
                                <TabsTrigger key={opt.value} value={opt.value} className="rounded-lg px-4 h-9 data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">
                                    {opt.label}
                                </TabsTrigger>
                            ))}
                        </TabsList>
                    </Tabs>

                    <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder="Search questions..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-10 h-11 rounded-xl border-gray-200 bg-gray-50/50 focus:bg-white transition-colors"
                            />
                        </div>
                        <div className="flex gap-4">
                            <Select value={filterCategory} onValueChange={setFilterCategory}>
                                <SelectTrigger className="w-[200px] h-11 rounded-xl border-gray-200 bg-gray-50/50">
                                    <div className="flex items-center gap-2">
                                        <Tag className="h-4 w-4 text-gray-500" />
                                        <SelectValue placeholder="Category" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Categories</SelectItem>
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
                                <h3 className="text-xl font-semibold text-gray-900">No questions found</h3>
                                <p className="text-gray-500 mt-2 text-center">
                                    Try adjusting your search or filters, or add a new question.
                                </p>
                            </div>
                        ) : (
                            filteredQuestions.map((question) => (
                                <motion.div
                                    key={question.id}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.99 }}
                                    className={`group bg-white rounded-2xl border ${question.isActive ? 'border-gray-100' : 'border-gray-200 bg-gray-50/50'} p-6 transition-all hover:shadow-md hover:border-blue-100`}
                                >
                                    <div className="flex flex-col md:flex-row gap-6">
                                        {/* Status & Number */}
                                        <div className="flex md:flex-col items-center md:items-start gap-3 md:gap-1 min-w-[80px]">
                                            <Badge variant="outline" className="h-8 w-8 rounded-full flex items-center justify-center border-gray-200 bg-gray-50 text-gray-600 font-bold shrink-0">
                                                {question.questionNumber}
                                            </Badge>
                                            <div className="md:mt-2">
                                                {question.isActive ? (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                                                        Inactive
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        {/* Content */}
                                        <div className="flex-1 space-y-3">
                                            <div className="flex flex-wrap gap-2 mb-1">
                                                <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-100 border-0 rounded-lg px-2.5 py-0.5 font-medium">
                                                    {question.relationType}
                                                </Badge>
                                                <Badge className="bg-purple-50 text-purple-700 hover:bg-purple-100 border-0 rounded-lg px-2.5 py-0.5 font-medium">
                                                    {question.category}
                                                </Badge>
                                                {question.isSubQuestion && (
                                                    <Badge variant="outline" className="text-orange-600 border-orange-200 bg-orange-50 rounded-lg">
                                                        Sub-Question
                                                    </Badge>
                                                )}
                                            </div>

                                            <div className="space-y-2">
                                                <div className="flex gap-3">
                                                    <div className="mt-1 h-5 w-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0 text-xs font-bold text-gray-500">EN</div>
                                                    <p className="text-gray-900 font-medium text-lg leading-relaxed">
                                                        {question.questionEnglishText}
                                                    </p>
                                                </div>
                                                {question.questionSpanishText && (
                                                    <div className="flex gap-3">
                                                        <div className="mt-1 h-5 w-5 rounded-full bg-orange-50 flex items-center justify-center shrink-0 text-xs font-bold text-orange-600">ES</div>
                                                        <p className="text-gray-500 italic leading-relaxed">
                                                            {question.questionSpanishText}
                                                        </p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        {/* Actions */}
                                        <div className="flex md:flex-col items-center justify-end md:justify-start gap-2 border-t md:border-t-0 md:border-l border-gray-100 pt-4 md:pt-0 md:pl-6 min-w-[120px]">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full justify-start md:justify-center rounded-xl bg-white border-gray-200 hover:bg-gray-50 text-gray-700"
                                                onClick={() => handleOpenEdit(question)}
                                            >
                                                <Edit className="h-4 w-4 mr-2" />
                                                Edit
                                            </Button>

                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" size="sm" className="w-full justify-start md:justify-center rounded-xl text-gray-400 hover:text-gray-600">
                                                        <MoreVertical className="h-4 w-4 mr-2 md:mr-0" />
                                                        <span className="md:hidden">More Options</span>
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="rounded-xl p-2 w-48">
                                                    <DropdownMenuItem
                                                        onClick={() => handleToggleActive(question)}
                                                        className="rounded-lg cursor-pointer"
                                                    >
                                                        {question.isActive ? (
                                                            <>
                                                                <XCircle className="h-4 w-4 mr-2 text-orange-500" />
                                                                Deactivate
                                                            </>
                                                        ) : (
                                                            <>
                                                                <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
                                                                Activate
                                                            </>
                                                        )}
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem
                                                        onClick={() => handleDelete(question.id)}
                                                        className="rounded-lg text-red-600 focus:text-red-700 cursor-pointer"
                                                    >
                                                        <Trash2 className="h-4 w-4 mr-2" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </div>
                                    </div>
                                </motion.div>
                            ))
                        )}
                    </AnimatePresence>
                </div>

                {/* Create/Edit Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="sm:max-w-2xl rounded-3xl p-0 gap-0 overflow-hidden max-h-[90vh] flex flex-col">
                        <DialogHeader className="p-8 pb-4 shrink-0">
                            <DialogTitle className="text-2xl font-bold text-gray-900">
                                {editingQuestion ? "Edit Question" : "Add New Question"}
                            </DialogTitle>
                            <DialogDescription className="text-base text-gray-500">
                                Configure the evaluation question details and translations.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="px-8 py-4 space-y-6 overflow-y-auto flex-1">
                            {/* Classification */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-gray-700 font-medium">Relation Type</Label>
                                    <Select
                                        value={formData.relationType}
                                        onValueChange={(v: any) => setFormData({ ...formData, relationType: v })}
                                    >
                                        <SelectTrigger className="h-11 rounded-xl border-gray-200">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {RELATION_TYPE_OPTIONS.map(opt => (
                                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-700 font-medium">Category</Label>
                                    <Select
                                        value={formData.category}
                                        onValueChange={(v) => setFormData({ ...formData, category: v })}
                                    >
                                        <SelectTrigger className="h-11 rounded-xl border-gray-200">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {CATEGORY_OPTIONS.map(cat => (
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
                                        English Text <span className="text-red-500">*</span>
                                    </Label>
                                    <Textarea
                                        value={formData.questionEnglishText}
                                        onChange={(e) => setFormData({ ...formData, questionEnglishText: e.target.value })}
                                        className="min-h-[80px] rounded-xl border-gray-200 resize-none focus:ring-2 focus:ring-primary/20"
                                        placeholder="e.g. How effectively does this person communicate?"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-700 font-medium flex items-center gap-2">
                                        <Globe className="h-4 w-4 text-orange-500" />
                                        Spanish Text (Optional)
                                    </Label>
                                    <Textarea
                                        value={formData.questionSpanishText}
                                        onChange={(e) => setFormData({ ...formData, questionSpanishText: e.target.value })}
                                        className="min-h-[80px] rounded-xl border-gray-200 resize-none focus:ring-2 focus:ring-orange-500/20"
                                        placeholder="e.g. ¿Con qué eficacia se comunica esta persona?"
                                    />
                                </div>
                            </div>

                            {/* Metadata */}
                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-gray-700 font-medium">Question Number</Label>
                                    <Input
                                        type="number"
                                        min="1"
                                        value={formData.questionNumber}
                                        onChange={(e) => setFormData({ ...formData, questionNumber: parseInt(e.target.value) || 1 })}
                                        className="h-11 rounded-xl border-gray-200"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-700 font-medium">Type</Label>
                                    <Select
                                        value={formData.isSubQuestion ? "sub" : "main"}
                                        onValueChange={(v) => {
                                            const isSub = v === "sub";
                                            setFormData({
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
                                            <SelectItem value="main">Main Question</SelectItem>
                                            <SelectItem value="sub">Sub-Question</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            {formData.isSubQuestion && (
                                <div className="space-y-2">
                                    <Label className="text-gray-700 font-medium">Parent Question</Label>
                                    <Select
                                        value={formData.parentQuestionId}
                                        onValueChange={(v) => setFormData({ ...formData, parentQuestionId: v })}
                                    >
                                        <SelectTrigger className="h-11 rounded-xl border-gray-200">
                                            <SelectValue placeholder="Select parent question" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {questions.filter(q => !q.isSubQuestion && q.id !== editingQuestion?.id).map(q => (
                                                <SelectItem key={q.id} value={q.id}>
                                                    #{q.questionNumber} - {q.questionEnglishText.substring(0, 40)}...
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                        </div>

                        <DialogFooter className="p-8 pt-4 bg-gray-50/50 shrink-0">
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl h-11 border-gray-200 text-gray-700">
                                Cancel
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving} className="rounded-xl h-11 bg-gray-900 text-white hover:bg-gray-800">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                {editingQuestion ? "Save Changes" : "Create Question"}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

            </div>
        </div>
    );
}
