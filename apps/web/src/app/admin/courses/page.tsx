"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogFooter,
    DialogDescription,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
    Plus,
    Search,
    Edit,
    Trash2,
    BookOpen,
    Loader2,
    MoreHorizontal,
    GraduationCap,
    Users,
    Eye,
    FileText,
    CheckCircle,
    Clock,
    AlertCircle
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuLabel,
    DropdownMenuSeparator
} from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useAdminCourseList } from "@/hooks/useAdminCourseQueries";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { TableRowsSkeleton } from "@/components/skeletons/TableSkeleton";
import { Skeleton } from "@/components/ui/skeleton";

// Course type interface
interface Course {
    id: string;
    title: string;
    instructor?: string;
    students?: number;
    status?: string;
    lastUpdated?: string;
}

export default function CoursesPage() {
    const router = useRouter();
    const { isAdmin, loading: authLoading } = useAdminAccess();
    const { t } = useTranslation();

    const [searchTerm, setSearchTerm] = useState("");
    const [page, setPage] = useState(1);
    const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
    const [isCreating, setIsCreating] = useState(false);

    const [newCourse, setNewCourse] = useState({
        title: "",
        description: "",
        instructor: "",
    });

    // Data Hooks
    const {
        data,
        isLoading: coursesLoading,
        refetch
    } = useAdminCourseList({
        page,
        limit: 10,
        search: searchTerm,
    });

    const { data: analyticsData } = useAdminAnalytics("month");

    const courses = data?.items || [];
    const totalPages = data ? Math.ceil(data.total / data.limit) : 1;
    const loading = coursesLoading;

    // Handle Actions
    const handleAddCourse = async () => {
        setIsCreating(true);
        try {
            const { adminCreateCourse } = await import("@/services/courseService");
            await adminCreateCourse(newCourse as any);
            setIsAddDialogOpen(false);
            setNewCourse({ title: "", description: "", instructor: "" });
            toast.success(t("admin.courses.courseCreated"));
            refetch();
        } catch (error) {
            toast.error("Failed to create course");
        } finally {
            setIsCreating(false);
        }
    };

    const handleDeleteCourse = async (id: string) => {
        try {
            const { adminDeleteCourse } = await import("@/services/courseService");
            await adminDeleteCourse(id);
            toast.success(t("admin.courses.courseDeleted"));
            refetch();
        } catch (error) {
            toast.error("Failed to delete course");
        }
    };

    // Handle admin access
    useEffect(() => {
        if (!authLoading && !isAdmin) {
            toast.error(t("admin.accessDenied"));
            router.push("/login");
        }
    }, [isAdmin, authLoading, router]);

    // Debounce search
    useEffect(() => {
        const timer = setTimeout(() => {
            if (!authLoading && isAdmin) setPage(1);
        }, 500);
        return () => clearTimeout(timer);
    }, [searchTerm]);

    // Stats Configuration
    const statsCards = [
        {
            label: "Total Courses",
            value: data?.total?.toLocaleString() || "0",
            growth: analyticsData?.stats.monthlyGrowth.courses || 0,
            icon: BookOpen,
            color: "text-blue-600",
            bg: "bg-blue-50",
            border: "border-blue-100",
            blobColor: "bg-blue-500"
        },
        {
            label: "Active Courses",
            value: analyticsData?.stats.activeCourses?.toLocaleString() || "0",
            growth: null,
            icon: CheckCircle,
            color: "text-emerald-600",
            bg: "bg-emerald-50",
            border: "border-emerald-100",
            blobColor: "bg-emerald-500"
        },
        {
            label: "Total Enrollments",
            value: (analyticsData?.stats as any)?.totalEnrollments?.toLocaleString() || "—",
            growth: null,
            icon: GraduationCap,
            color: "text-violet-600",
            bg: "bg-violet-50",
            border: "border-violet-100",
            blobColor: "bg-violet-500"
        },
        {
            label: "Draft Courses",
            value: String(courses.filter((c: any) => c.status === "draft").length),
            growth: null,
            icon: FileText,
            color: "text-amber-600",
            bg: "bg-amber-50",
            border: "border-amber-100",
            blobColor: "bg-amber-500"
        }
    ];

    if (authLoading) {
        return <DashboardSkeleton />;
    }

    return (
        <div className="space-y-8">

                {/* Header & Actions */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                    <div className="space-y-1">
                        <h1 className="text-4xl font-bold tracking-tight text-gray-900">
                            {t("admin.courses.title")}
                        </h1>
                        <p className="text-lg text-gray-500 font-medium">
                            {t("admin.courses.subtitle")}
                        </p>
                    </div>

                    <div className="flex gap-3 w-full md:w-auto">
                        <div className="relative w-full md:w-72">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder={t("admin.courses.searchPlaceholder")}
                                className="pl-9 h-10 bg-white border-gray-200 rounded-xl shadow-sm focus:ring-gray-900 focus:border-gray-900 transition-shadow"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </div>

                        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                            <DialogTrigger asChild>
                                <Button className="h-10 rounded-xl bg-gray-900 text-white shadow-sm hover:bg-gray-800 transition-all hover:shadow-md">
                                    <Plus className="mr-2 h-4 w-4" />
                                    {t("admin.courses.addCourse")}
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="sm:max-w-[525px] rounded-2xl border-gray-100 shadow-2xl p-0 overflow-hidden">
                                <div className="bg-gray-50/50 p-6 border-b border-gray-100 flex flex-col items-center text-center">
                                    <div className="h-12 w-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4 ring-4 ring-white shadow-sm">
                                        <BookOpen className="h-6 w-6" />
                                    </div>
                                    <DialogTitle className="text-xl font-bold text-gray-900">{t("admin.courses.createTitle")}</DialogTitle>
                                    <DialogDescription className="text-gray-500 mt-1">
                                        Create a new course to add to the platform catalog.
                                    </DialogDescription>
                                </div>

                                <div className="p-6 space-y-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="title" className="text-sm font-semibold text-gray-700 ml-1">{t("admin.courses.field.title")}</Label>
                                        <Input
                                            id="title"
                                            value={newCourse.title}
                                            onChange={(e) => setNewCourse({ ...newCourse, title: e.target.value })}
                                            className="h-11 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all"
                                            placeholder="e.g. Advanced React Patterns"
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="description" className="text-sm font-semibold text-gray-700 ml-1">{t("admin.courses.field.description")}</Label>
                                        <Textarea
                                            id="description"
                                            value={newCourse.description}
                                            onChange={(e) => setNewCourse({ ...newCourse, description: e.target.value })}
                                            className="min-h-[100px] rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all resize-none"
                                            placeholder="Brief description of the course content..."
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="instructor" className="text-sm font-semibold text-gray-700 ml-1">{t("admin.courses.field.instructor")}</Label>
                                        <Input
                                            id="instructor"
                                            value={newCourse.instructor}
                                            onChange={(e) => setNewCourse({ ...newCourse, instructor: e.target.value })}
                                            className="h-11 rounded-xl border-gray-200 focus:border-blue-500 focus:ring-blue-100 transition-all"
                                            placeholder="Instructor Name"
                                        />
                                    </div>
                                </div>

                                <DialogFooter className="bg-gray-50/50 p-6 border-t border-gray-100 gap-3 sm:gap-0">
                                    <Button
                                        variant="outline"
                                        onClick={() => setIsAddDialogOpen(false)}
                                        className="rounded-xl h-11 border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 bg-white shadow-sm flex-1 sm:flex-none sm:mr-3"
                                    >
                                        {t("common.cancel")}
                                    </Button>
                                    <Button
                                        onClick={handleAddCourse}
                                        className="rounded-xl h-11 bg-gray-900 hover:bg-gray-800 text-white shadow-md flex-1 sm:flex-none sm:min-w-[140px]"
                                        disabled={isCreating}
                                    >
                                        {isCreating ? (
                                            <>
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                                Creating...
                                            </>
                                        ) : (
                                            <>
                                                <Plus className="mr-2 h-4 w-4" />
                                                {t("admin.courses.create")}
                                            </>
                                        )}
                                    </Button>
                                </DialogFooter>
                            </DialogContent>
                        </Dialog>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {statsCards.map((stat, index) => (
                        <div
                            key={index}
                            style={{
                                borderRadius: "var(--admin-radius-lg, 8px)",
                                border: "1px solid var(--admin-border-default, #2a2a2a)",
                                background: "var(--admin-bg-card, #1e1e1e)",
                                padding: 16,
                                transition: "border-color 0.15s",
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-hover, #333)"; }}
                            onMouseLeave={(e) => { e.currentTarget.style.borderColor = "var(--admin-border-default, #2a2a2a)"; }}
                        >
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
                                <div style={{
                                    width: 32, height: 32, borderRadius: 6,
                                    background: "var(--admin-bg-icon-box, #2a2a2a)",
                                    display: "flex", alignItems: "center", justifyContent: "center",
                                }}>
                                    <stat.icon style={{ width: 16, height: 16, color: "var(--admin-font-tertiary, #818181)" }} />
                                </div>
                                {stat.growth !== null && stat.growth !== undefined && (
                                    <div style={{
                                        display: "flex", alignItems: "center", gap: 2,
                                        fontSize: 11, fontWeight: 500,
                                        color: Number(stat.growth) >= 0 ? "var(--admin-accent-green, #10b981)" : "var(--admin-accent-red, #ef4444)",
                                    }}>
                                        {Number(stat.growth) >= 0 ? "+" : ""}{Math.abs(Number(stat.growth)).toFixed(1)}%
                                    </div>
                                )}
                            </div>
                            <div style={{ fontSize: 24, fontWeight: 600, color: "var(--admin-font-primary, #ebebeb)", letterSpacing: "-0.02em" }}>
                                {stat.value}
                            </div>
                            <div style={{ fontSize: 12, color: "var(--admin-font-tertiary, #818181)", marginTop: 4 }}>
                                {stat.label}
                            </div>
                        </div>
                    ))}
                </div>

                {/* Courses Table */}
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden hover:shadow-md transition-all duration-300">
                    <Table>
                        <TableHeader className="bg-gray-50/50">
                            <TableRow className="border-gray-50 hover:bg-gray-50/50">
                                <TableHead className="py-4 font-semibold text-gray-600 pl-6">{t("admin.courses.table.title")}</TableHead>
                                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.courses.table.instructor")}</TableHead>
                                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.courses.table.students")}</TableHead>
                                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.courses.table.status")}</TableHead>
                                <TableHead className="py-4 font-semibold text-gray-600">{t("admin.courses.table.lastUpdated")}</TableHead>
                                <TableHead className="py-4 font-semibold text-gray-600 text-right pr-6">{t("admin.courses.table.actions")}</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-48 text-center">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
                                            <p className="text-sm text-gray-500">Loading courses...</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : courses.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={6} className="h-48 text-center text-gray-500">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <BookOpen className="h-8 w-8 text-gray-300" />
                                            <p>No courses found</p>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ) : (
                                courses.map((course: Course) => (
                                    <TableRow key={course.id} className="border-gray-50 hover:bg-gray-50/50 transition-colors">
                                        <TableCell className="font-medium text-gray-900 pl-6 py-4">
                                            <div className="flex items-center group">
                                                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg mr-3 group-hover:bg-blue-100 transition-colors">
                                                    <BookOpen className="h-4 w-4" />
                                                </div>
                                                {course.title}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-gray-600 py-4">{course.instructor || "Unassigned"}</TableCell>
                                        <TableCell className="text-gray-600 py-4">
                                            <div className="flex items-center gap-1.5">
                                                <Users className="h-3.5 w-3.5 text-gray-400" />
                                                {course.students || 0}
                                            </div>
                                        </TableCell>
                                        <TableCell className="py-4">
                                            <Badge
                                                variant={course.status === "Published" ? "default" : "secondary"}
                                                className={`font-medium shadow-none border-0 ${course.status === "Published"
                                                    ? "bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                                                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                                                    }`}
                                            >
                                                {course.status || "Draft"}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-gray-500 py-4 text-sm">
                                            {course.lastUpdated || new Date().toLocaleDateString()}
                                        </TableCell>
                                        <TableCell className="text-right pr-6 py-4">
                                            <DropdownMenu>
                                                <DropdownMenuTrigger asChild>
                                                    <Button variant="ghost" className="h-8 w-8 p-0 hover:bg-gray-100 rounded-full">
                                                        <MoreHorizontal className="h-4 w-4 text-gray-400" />
                                                    </Button>
                                                </DropdownMenuTrigger>
                                                <DropdownMenuContent align="end" className="w-[160px] rounded-xl border-gray-100 shadow-lg">
                                                    <DropdownMenuItem onClick={() => { setNewCourse({ title: course.title, description: (course as any).description || "", instructor: course.instructor || "" }); setIsAddDialogOpen(true); }} className="cursor-pointer">
                                                        <Eye className="mr-2 h-3.5 w-3.5 text-gray-400" />
                                                        View Details
                                                    </DropdownMenuItem>
                                                    <DropdownMenuItem onClick={() => { setNewCourse({ title: course.title, description: (course as any).description || "", instructor: course.instructor || "" }); setIsAddDialogOpen(true); }} className="cursor-pointer">
                                                        <Edit className="mr-2 h-3.5 w-3.5 text-gray-400" />
                                                        Edit Course
                                                    </DropdownMenuItem>
                                                    <DropdownMenuSeparator className="bg-gray-50" />
                                                    <DropdownMenuItem onClick={() => handleDeleteCourse(course.id)} className="text-red-600 focus:text-red-700 focus:bg-red-50 cursor-pointer">
                                                        <Trash2 className="mr-2 h-3.5 w-3.5" />
                                                        Delete
                                                    </DropdownMenuItem>
                                                </DropdownMenuContent>
                                            </DropdownMenu>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                    {/* Pagination inside Card */}
                    <div className="flex items-center justify-between border-t border-gray-100 p-4 bg-gray-50/30">
                        <p className="text-sm text-gray-500">
                            Showing page <span className="font-semibold text-gray-900">{page}</span> of <span className="font-semibold text-gray-900">{totalPages || 1}</span>
                        </p>
                        <div className="flex items-center gap-2">
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.max(1, p - 1))}
                                disabled={page === 1 || loading}
                                className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
                            >
                                {t("common.previous")}
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                disabled={page === totalPages || loading}
                                className="rounded-lg border-gray-200 hover:bg-white hover:text-gray-900 text-gray-500 h-8"
                            >
                                {t("common.next")}
                            </Button>
                        </div>
                    </div>
                </div>
        </div>
    );
}
