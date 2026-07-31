"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { motion, AnimatePresence } from "motion/react";
import {
    Loader2,
    Plus,
    MoreVertical,
    Check,
    X,
    CreditCard,
    Edit,
    Trash2,
    AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    fetchSubscriptionPlans,
    createSubscriptionPlan,
    updateSubscriptionPlan,
    deleteSubscriptionPlan,
    SubscriptionPlan
} from "@/services/subscriptionService";

// Types
interface CreatePlanData {
    name: string;
    price: number;
    interval: "one_time" | "monthly" | "yearly";
    features: string[];
    isActive: boolean;
}

const PLAN_INTERVALS = [
    { value: "one_time", label: "One Time", description: "Single payment" },
    { value: "monthly", label: "Monthly", description: "Recurring monthly" },
    { value: "yearly", label: "Yearly", description: "Recurring yearly" },
] as const;


export default function AdminPlansPage() {
    const { t } = useTranslation("platform_owner");
    const router = useRouter();
    const { isAdmin, loading: authLoading } = useAdminAccess();
    const { confirm, ConfirmDialog } = useConfirmDialog();

    // State
    const [plans, setPlans] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [editingPlan, setEditingPlan] = useState<any | null>(null);
    const [isSaving, setIsSaving] = useState(false);

    // Form State
    const [formData, setFormData] = useState<CreatePlanData>({
        name: "",
        price: 0,
        interval: "monthly",
        features: [""],
        isActive: true
    });

    // Initial Fetch
    const loadPlans = async () => {
        try {
            setLoading(true);
            const data = await fetchSubscriptionPlans();
            // Transform to match local needs if necessary, but the service returns a good structure
            // The service returns { subscription: {...}, billingOptions: [...], features: [...] }
            // We want billingOptions
            setPlans(data.billingOptions || []);
        } catch (error) {
            toast.error(t("plans.toast.failedToLoad"));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!authLoading && isAdmin) {
            loadPlans();
        } else if (!authLoading && !isAdmin) {
            router.push("/login");
        }
    }, [authLoading, isAdmin, router]);


    // Handlers
    const handleOpenCreate = () => {
        setEditingPlan(null);
        setFormData({
            name: "",
            price: 0,
            interval: "monthly",
            features: [""],
            isActive: true
        });
        setIsDialogOpen(true);
    };

    const handleOpenEdit = (plan: any) => {
        setEditingPlan(plan);
        setFormData({
            name: plan.name,
            price: plan.price,
            interval: plan.period === 'month' ? 'monthly' : plan.period === 'year' ? 'yearly' : 'one_time',
            features: plan.features && plan.features.length > 0 ? plan.features : [""],
            isActive: plan.isActive !== false // Default to true if undefined
        });
        setIsDialogOpen(true);
    };

    const handleSave = async () => {
        // Validation
        if (!formData.name.trim() || formData.price < 0) {
            toast.error(t("plans.toast.validationError"));
            return;
        }

        setIsSaving(true);
        try {
            const cleanFeatures = formData.features.filter(f => f.trim().length > 0);

            const payload = {
                ...formData,
                features: cleanFeatures
            };

            if (editingPlan) {
                await updateSubscriptionPlan(editingPlan.id, payload);
                toast.success(t("plans.toast.updatedSuccess"));
            } else {
                await createSubscriptionPlan(payload);
                toast.success(t("plans.toast.createdSuccess"));
            }

            setIsDialogOpen(false);
            loadPlans();
        } catch (error) {
            toast.error(editingPlan ? t("plans.toast.failedToUpdate") : t("plans.toast.failedToCreate"));
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (planId: string) => {
        const confirmed = await confirm({ title: t("plans.confirm.deleteTitle"), description: t("plans.confirm.deleteDesc"), confirmLabel: t("plans.confirm.deleteLabel"), variant: "destructive" });
        if (!confirmed) return;

        try {
            await deleteSubscriptionPlan(planId);
            toast.success(t("plans.toast.deletedSuccess"));
            loadPlans();
        } catch (error) {
            toast.error(t("plans.toast.failedToDelete"));
        }
    };

    // Form Helpers
    const updateFeature = (index: number, value: string) => {
        const newFeatures = [...formData.features];
        newFeatures[index] = value;
        setFormData({ ...formData, features: newFeatures });
    };

    const addFeature = () => {
        setFormData({ ...formData, features: [...formData.features, ""] });
    };

    const removeFeature = (index: number) => {
        const newFeatures = formData.features.filter((_, i) => i !== index);
        setFormData({ ...formData, features: newFeatures });
    };


    if (authLoading || loading) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="space-y-8">

                {/* Header */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
                            {t("plans.title")}
                        </h1>
                        <p className="text-lg text-gray-500 font-medium">
                            {t("plans.subtitle")}
                        </p>
                    </div>
                    <Button
                        onClick={handleOpenCreate}
                        className="bg-gray-900 hover:bg-gray-800 text-white rounded-xl shadow-sm h-12 px-6"
                    >
                        <Plus className="mr-2 h-5 w-5" />
                        {t("plans.createButton")}
                    </Button>
                </div>

                {/* Plans Grid */}
                {plans.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-dashed border-gray-200">
                        <CreditCard className="h-16 w-16 text-gray-200 mb-4" />
                        <h3 className="text-xl font-semibold text-gray-900">{t("plans.emptyTitle")}</h3>
                        <p className="text-gray-500 max-w-sm text-center mt-2 mb-6">
                            {t("plans.emptyDesc")}
                        </p>
                        <Button onClick={handleOpenCreate} variant="outline" className="rounded-xl">
                            {t("plans.emptyCreateButton")}
                        </Button>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        <AnimatePresence>
                            {plans.map((plan) => (
                                <motion.div
                                    key={plan.id}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.95 }}
                                    layout
                                    className="group relative bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col"
                                >
                                    {/* Active Badge */}
                                    {plan.popular && (
                                        <div className="absolute top-0 right-0 p-4">
                                            <Badge className="bg-gradient-to-r from-[#2E9098] to-indigo-600 text-white border-0 shadow-sm rounded-lg px-2 py-1">
                                                {t("plans.popular")}
                                            </Badge>
                                        </div>
                                    )}

                                    <div className="p-8 flex-1">
                                        <div className="mb-6">
                                            <h3 className="text-xl font-bold text-gray-900 mb-2">{plan.name}</h3>
                                            <div className="flex items-baseline gap-1">
                                                <span className="text-4xl font-extrabold text-gray-900 tracking-tight">
                                                    ${(plan.price ?? 0).toFixed(2)}
                                                </span>
                                                <span className="text-gray-500 font-medium">
                                                    /{plan.period === 'one-time' ? t("plans.perPeriod.once") : plan.period === 'month' ? t("plans.perPeriod.monthly") : plan.period === 'year' ? t("plans.perPeriod.yearly") : plan.period}
                                                </span>
                                            </div>
                                            {plan.description && (
                                                <p className="text-sm text-gray-500 mt-2 line-clamp-2">{plan.description}</p>
                                            )}
                                        </div>

                                        <div className="space-y-4">
                                            {plan.features?.slice(0, 5).map((feature: string, idx: number) => (
                                                <div key={idx} className="flex items-start gap-3">
                                                    <div className="mt-1 p-0.5 rounded-full bg-green-50 text-green-600">
                                                        <Check className="h-3 w-3 block" strokeWidth={3} />
                                                    </div>
                                                    <span className="text-sm text-gray-600 font-medium leading-tight">
                                                        {feature}
                                                    </span>
                                                </div>
                                            ))}
                                            {plan.features?.length > 5 && (
                                                <p className="text-xs text-gray-400 font-medium pl-6">
                                                    {t("plans.moreFeatures", { count: plan.features.length - 5 })}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action Footer */}
                                    <div className="p-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <div className={`h-2.5 w-2.5 rounded-full ${plan.isActive !== false ? "bg-emerald-500" : "bg-gray-300"}`} />
                                            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                                                {plan.isActive !== false ? t("plans.statusActive") : t("plans.statusInactive")}
                                            </span>
                                        </div>
                                        <div className="flex gap-1">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-9 w-9 p-0 rounded-full hover:bg-white hover:shadow-sm"
                                                onClick={() => handleOpenEdit(plan)}
                                            >
                                                <Edit className="h-4 w-4 text-gray-600" />
                                            </Button>
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                className="h-9 w-9 p-0 rounded-full hover:bg-white hover:text-red-600 hover:shadow-sm"
                                                onClick={() => handleDelete(plan.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </AnimatePresence>
                    </div>
                )}


                {/* Create/Edit Dialog */}
                <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                    <DialogContent className="sm:max-w-lg rounded-3xl p-0 gap-0 overflow-hidden">
                        <DialogHeader className="p-8 pb-4">
                            <DialogTitle className="text-2xl font-bold text-gray-900">
                                {editingPlan ? t("plans.form.editTitle") : t("plans.form.createTitle")}
                            </DialogTitle>
                            <DialogDescription className="text-base text-gray-500">
                                {editingPlan ? t("plans.form.editDesc") : t("plans.form.createDesc")}
                            </DialogDescription>
                        </DialogHeader>

                        <div className="px-8 space-y-6 py-4">
                            <div className="space-y-2">
                                <Label className="text-gray-700 font-medium">{t("plans.form.planName")}</Label>
                                <Input
                                    placeholder={t("plans.form.planNamePlaceholder")}
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    className="h-11 rounded-xl border-gray-200 focus:ring-2 focus:ring-primary/20"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-6">
                                <div className="space-y-2">
                                    <Label className="text-gray-700 font-medium">{t("plans.form.price")}</Label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 font-medium">$</span>
                                        <Input
                                            type="number"
                                            min="0"
                                            step="0.01"
                                            value={formData.price}
                                            onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) })}
                                            className="h-11 pl-7 rounded-xl border-gray-200"
                                        />
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-gray-700 font-medium">{t("plans.form.billingInterval")}</Label>
                                    <Select
                                        value={formData.interval}
                                        onValueChange={(v: any) => setFormData({ ...formData, interval: v })}
                                    >
                                        <SelectTrigger className="h-11 rounded-xl border-gray-200">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="monthly">{t("plans.form.intervalMonthly")}</SelectItem>
                                            <SelectItem value="yearly">{t("plans.form.intervalYearly")}</SelectItem>
                                            <SelectItem value="one_time">{t("plans.form.intervalOneTime")}</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-gray-700 font-medium">{t("plans.form.features")}</Label>
                                    <Button size="sm" variant="ghost" onClick={addFeature} className="h-8 text-primary hover:text-primary">
                                        <Plus className="h-3.5 w-3.5 mr-1" />
                                        {t("plans.form.addFeature")}
                                    </Button>
                                </div>
                                <div className="space-y-2 max-h-[200px] overflow-y-auto pr-2">
                                    {formData.features.map((feature, idx) => (
                                        <div key={idx} className="flex gap-2">
                                            <Input
                                                value={feature}
                                                onChange={(e) => updateFeature(idx, e.target.value)}
                                                className="h-10 rounded-xl border-gray-200 flex-1"
                                                placeholder={t("plans.form.featurePlaceholder")}
                                            />
                                            {formData.features.length > 1 && (
                                                <Button size="icon" variant="ghost" onClick={() => removeFeature(idx)} className="h-10 w-10 text-gray-400 hover:text-red-500 rounded-xl">
                                                    <X className="h-4 w-4" />
                                                </Button>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <DialogFooter className="p-8 pt-4 bg-gray-50/50">
                            <Button variant="outline" onClick={() => setIsDialogOpen(false)} className="rounded-xl h-11 border-gray-200 text-gray-700">
                                {t("plans.form.cancelButton")}
                            </Button>
                            <Button onClick={handleSave} disabled={isSaving} className="rounded-xl h-11 bg-gray-900 text-white hover:bg-gray-800">
                                {isSaving ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                                {editingPlan ? t("plans.form.saveChanges") : t("plans.form.createButton")}
                            </Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>

        <ConfirmDialog />
        </div>
    );
}

