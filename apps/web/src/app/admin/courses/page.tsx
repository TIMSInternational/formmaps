"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
    Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Plus, Search, Edit, Trash2, BookOpen, Loader2, MoreHorizontal,
    GraduationCap, Users, Eye, FileText, CheckCircle, Star, TrendingUp, ExternalLink,
} from "lucide-react";
import {
    DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { useCourseList, useRecommendedCourses } from "@/hooks/useCourseQueries";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import type { Course } from "@/types/course";

export default function CoursesPage() {
    const router = useRouter();
    const { isAdmin, loading: authLoading } = useAdminAccess();
    const { t } = useTranslation();
    const { confirm, ConfirmDialog } = useConfirmDialog();

    const [searchTerm, setSearchTerm] = useState("");
    const [page, setPage] = useState(1);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);
    const [newCourse, setNewCourse] = useState({ title: "", description: "", instructor: "" });
    const ITEMS_PER_PAGE = 15;

    // Fetch the actual course catalog (Coursera + admin-created)
    const { data: catalogData, isLoading: catalogLoading, refetch } = useCourseList();
    const { data: recommendedData } = useRecommendedCourses();
    const { data: analyticsData } = useAdminAnalytics("month");

    const allCourses: Course[] = catalogData?.courses || catalogData?.Courses || [];
    const recommendedCourses: Course[] = recommendedData?.courses || [];

    // Filter & paginate
    const filteredCourses = useMemo(() => {
        if (!searchTerm.trim()) return allCourses;
        const q = searchTerm.toLowerCase();
        return allCourses.filter((c) =>
            c.title?.toLowerCase().includes(q) ||
            c.provider?.toLowerCase().includes(q) ||
            c.difficulty?.toLowerCase().includes(q)
        );
    }, [allCourses, searchTerm]);

    const totalPages = Math.ceil(filteredCourses.length / ITEMS_PER_PAGE);
    const paginatedCourses = filteredCourses.slice((page - 1) * ITEMS_PER_PAGE, page * ITEMS_PER_PAGE);

    // Compute real stats
    const topRated = useMemo(() =>
        [...allCourses].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 5),
        [allCourses]
    );
    const avgRating = allCourses.length > 0
        ? (allCourses.reduce((sum, c) => sum + (c.rating ?? 0), 0) / allCourses.length).toFixed(1)
        : "—";

    // Actions
    const handleAddCourse = async () => {
        setIsCreating(true);
        try {
            const { adminCreateCourse } = await import("@/services/courseService");
            await adminCreateCourse(newCourse as any);
            setIsAddDialogOpen(false);
            setNewCourse({ title: "", description: "", instructor: "" });
            toast.success("Course created");
            refetch();
        } catch {
            toast.error("Failed to create course");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteCourse = async (id: string) => {
        const confirmed = await confirm({ title: "Delete Course", description: "This will permanently remove this course from the catalog.", confirmLabel: "Delete", variant: "destructive" });
        if (!confirmed) return;
        try {
            const { adminDeleteCourse } = await import("@/services/courseService");
            await adminDeleteCourse(id);
            toast.success("Course deleted");
            refetch();
        } catch {
            toast.error("Failed to delete course");
        }
    };

    useEffect(() => {
        if (!authLoading && !isAdmin) router.push("/login");
    }, [isAdmin, authLoading, router]);

    useEffect(() => {
        setPage(1);
    }, [searchTerm]);

    if (authLoading) return <DashboardSkeleton />;

    const statsCards = [
        { label: "Total in Catalog", value: allCourses.length.toLocaleString(), icon: BookOpen },
        { label: "Recommended", value: recommendedCourses.length.toLocaleString(), icon: TrendingUp },
        { label: "Avg Rating", value: avgRating, icon: Star },
        { label: "Providers", value: String(new Set(allCourses.map((c) => c.provider).filter(Boolean)).size), icon: GraduationCap },
    ];

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight text-gray-900">Course Catalog</h1>
                    <p className="text-lg text-gray-500 font-medium">Platform courses sourced from Coursera and custom additions</p>
                </div>
                <div className="flex gap-3 w-full md:w-auto">
                    <div className="relative w-full md:w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder="Search courses..."
                            className="pl-9 h-10 bg-white border-gray-200 rounded-xl shadow-sm"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                    <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                        <DialogTrigger asChild>
                            <Button className="h-10 rounded-xl bg-gray-900 text-white shadow-sm hover:bg-gray-800">
                                <Plus className="mr-2 h-4 w-4" /> Add Course
                            </Button>
                        </DialogTrigger>
                        <DialogContent className="sm:max-w-[525px] rounded-2xl">
                            <DialogHeader>
                                <DialogTitle>Add New Course</DialogTitle>
                                <DialogDescription>Add a custom course to the platform catalog.</DialogDescription>
                            </DialogHeader>
                            <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                    <Label htmlFor="title">Title</Label>
                                    <Input id="title" value={newCourse.title} onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })} placeholder="e.g. Advanced React Patterns" />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="desc">Description</Label>
                                    <Textarea id="desc" value={newCourse.description} onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })} placeholder="Brief description..." />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="inst">Instructor</Label>
                                    <Input id="inst" value={newCourse.instructor} onChange={(e) => setNewCourse({ ...newCourse, instructor: e.target.value })} placeholder="Instructor name" />
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
                                <Button onClick={handleAddCourse} disabled={isCreating || !newCourse.title.trim()}>
                                    {isCreating ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Creating...</> : <><Plus className="mr-2 h-4 w-4" /> Create</>}
                                </Button>
                            </DialogFooter>
                        </DialogContent>
                    </Dialog>
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {statsCards.map((stat, i) => (
                    <div key={i} style={{ borderRadius: "var(--admin-radius-lg, 8px)", border: "1px solid var(--admin-border-default, #e5e5e5)", background: "var(--admin-bg-card, #fff)", padding: 16 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--admin-bg-icon-box, #f5f5f5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                <stat.icon style={{ width: 16, height: 16, color: "var(--admin-font-tertiary, #818181)" }} />
                            </div>
                        </div>
                        <div style={{ fontSize: 24, fontWeight: 600, color: "var(--admin-font-primary, #111)", letterSpacing: "-0.02em" }}>{stat.value}</div>
                        <div style={{ fontSize: 12, color: "var(--admin-font-tertiary, #818181)", marginTop: 2 }}>{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Top Rated Courses */}
            {topRated.length > 0 && (
                <div style={{ borderRadius: "var(--admin-radius-lg, 8px)", border: "1px solid var(--admin-border-default, #e5e5e5)", background: "var(--admin-bg-card, #fff)", padding: 16 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--admin-font-primary, #111)", marginBottom: 12, display: "flex", alignItems: "center", gap: 6 }}>
                        <Star style={{ width: 14, height: 14, color: "#f59e0b" }} /> Top Rated Courses
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                        {topRated.map((c, i) => (
                            <div key={c.id || i} className="flex items-center gap-3 p-2.5 rounded-lg" style={{ background: "var(--admin-bg-hover, #f9f9f9)" }}>
                                <span className="text-xs font-bold text-amber-500 w-4">#{i + 1}</span>
                                <div className="min-w-0 flex-1">
                                    <p className="text-xs font-semibold truncate" style={{ color: "var(--admin-font-primary, #111)" }}>{c.title}</p>
                                    <p className="text-[10px]" style={{ color: "var(--admin-font-tertiary, #818181)" }}>
                                        {c.provider} &middot; {(c.rating ?? 0).toFixed(1)} &#9733;
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Course Table */}
            <div style={{ borderRadius: "var(--admin-radius-lg, 8px)", border: "1px solid var(--admin-border-default, #e5e5e5)", background: "var(--admin-bg-card, #fff)", overflow: "hidden" }}>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="pl-4">Course</TableHead>
                            <TableHead>Provider</TableHead>
                            <TableHead>Difficulty</TableHead>
                            <TableHead>Rating</TableHead>
                            <TableHead>Duration</TableHead>
                            <TableHead className="text-right pr-4">Actions</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {catalogLoading ? (
                            <TableRow><TableCell colSpan={6} className="h-48 text-center"><Loader2 className="h-6 w-6 animate-spin text-gray-400 mx-auto" /></TableCell></TableRow>
                        ) : paginatedCourses.length === 0 ? (
                            <TableRow><TableCell colSpan={6} className="h-48 text-center text-gray-500"><BookOpen className="h-8 w-8 text-gray-300 mx-auto mb-2" /><p>No courses match your search</p></TableCell></TableRow>
                        ) : (
                            paginatedCourses.map((course) => (
                                <TableRow key={course.id}>
                                    <TableCell className="pl-4 max-w-[280px]">
                                        <p className="font-medium text-sm truncate" style={{ color: "var(--admin-font-primary)" }}>{course.title}</p>
                                    </TableCell>
                                    <TableCell className="text-sm" style={{ color: "var(--admin-font-secondary)" }}>{course.provider || "—"}</TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="text-[10px] font-medium">{course.difficulty || "—"}</Badge>
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        {course.rating ? <span className="flex items-center gap-1"><Star className="h-3 w-3 text-amber-400 fill-amber-400" />{course.rating.toFixed(1)}</span> : "—"}
                                    </TableCell>
                                    <TableCell className="text-sm" style={{ color: "var(--admin-font-tertiary)" }}>{course.duration ? `${course.duration}w` : "—"}</TableCell>
                                    <TableCell className="text-right pr-4">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" className="h-8 w-8 p-0 rounded-full"><MoreHorizontal className="h-4 w-4" /></Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-[160px]">
                                                {course.courseraUrl && (
                                                    <DropdownMenuItem onClick={() => window.open(course.courseraUrl, "_blank")} className="cursor-pointer">
                                                        <ExternalLink className="mr-2 h-3.5 w-3.5 text-gray-400" /> View on Coursera
                                                    </DropdownMenuItem>
                                                )}
                                                <DropdownMenuSeparator />
                                                <DropdownMenuItem onClick={() => handleDeleteCourse(course.id)} className="text-red-600 cursor-pointer">
                                                    <Trash2 className="mr-2 h-3.5 w-3.5" /> Remove
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
                <div className="flex items-center justify-between border-t p-3" style={{ borderColor: "var(--admin-border-default)" }}>
                    <p className="text-xs" style={{ color: "var(--admin-font-tertiary)" }}>
                        Showing {((page - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(page * ITEMS_PER_PAGE, filteredCourses.length)} of {filteredCourses.length} courses
                    </p>
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="h-7 text-xs">{t("common.previous")}</Button>
                        <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="h-7 text-xs">{t("common.next")}</Button>
                    </div>
                </div>
            </div>

            <ConfirmDialog />
        </div>
    );
}
