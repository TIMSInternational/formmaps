"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
    BookOpen, TrendingUp, GraduationCap, ExternalLink,
    BarChart3, Award, Search, Loader2, Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useRecommendedCourses } from "@/hooks/useCourseQueries";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api/apiClient";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import type { Course } from "@/types/course";

export default function CoursesPage() {
    const router = useRouter();
    const { isAdmin, loading: authLoading } = useAdminAccess();
    const { t } = useTranslation("platform_owner");
    const [searchTerm, setSearchTerm] = useState("");

    const { data: catalogData, isLoading: catalogLoading } = useQuery({
        queryKey: ["courses", "admin-full-catalog"],
        queryFn: () => apiRequest("/api/course?limit=1000", { method: "GET" }).then((r: any) => r?.data ?? r),
        staleTime: 10 * 60 * 1000,
    });
    const { data: recommendedData } = useRecommendedCourses();

    const allCourses: Course[] = catalogData?.courses || catalogData?.Courses || [];
    const recommendedCourses: Course[] = recommendedData?.courses || [];

    // Compute real stats from available data
    const categories = useMemo(() => {
        const map = new Map<string, number>();
        allCourses.forEach(c => { if (c.category) map.set(c.category, (map.get(c.category) || 0) + 1); });
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }, [allCourses]);

    const searchResults = useMemo(() => {
        if (!searchTerm.trim()) return [];
        const q = searchTerm.toLowerCase();
        return allCourses.filter(c =>
            c.title?.toLowerCase().includes(q) ||
            c.category?.toLowerCase().includes(q) ||
            c.provider?.toLowerCase().includes(q)
        ).slice(0, 10);
    }, [allCourses, searchTerm]);

    useEffect(() => {
        if (!authLoading && !isAdmin) router.push("/login");
    }, [isAdmin, authLoading, router]);

    if (authLoading) return <DashboardSkeleton />;

    const s = { borderRadius: "var(--admin-radius-lg, 8px)", border: "1px solid var(--admin-border-default, #e5e5e5)", background: "var(--admin-bg-card, #fff)" } as const;
    const lbl = { fontSize: 11, fontWeight: 500 as const, color: "var(--admin-font-tertiary)", textTransform: "uppercase" as const, letterSpacing: "0.04em" };
    const val = { fontSize: 28, fontWeight: 700 as const, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" };
    const hdr = { fontSize: 13, fontWeight: 600 as const, color: "var(--admin-font-primary)", marginBottom: 12, display: "flex" as const, alignItems: "center" as const, gap: 6 };
    const row = { background: "var(--admin-bg-hover, #f9f9f9)" };

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>{t("courses.title")}</h1>
                    <p className="text-base mt-1" style={{ color: "var(--admin-font-tertiary)" }}>
                        {t("courses.subtitle")}
                    </p>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input placeholder={t("courses.searchPlaceholder")} className="pl-9 h-10 rounded-xl" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {[
                    { label: t("courses.stats.inCatalog"), value: catalogLoading ? "..." : allCourses.length.toLocaleString(), icon: BookOpen },
                    { label: t("courses.stats.categories"), value: categories.length.toLocaleString(), icon: Layers },
                    { label: t("courses.stats.aiRecommended"), value: recommendedCourses.length.toLocaleString(), icon: TrendingUp },
                    { label: t("courses.stats.source"), value: "Coursera", icon: GraduationCap },
                ].map((stat, i) => (
                    <div key={i} style={{ ...s, padding: 16 }}>
                        <stat.icon style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", marginBottom: 8 }} />
                        <div style={val}>{stat.value}</div>
                        <div style={lbl}>{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Search Results */}
            {searchTerm.trim() && (
                <div style={{ ...s, padding: 20 }}>
                    <h3 style={hdr}><Search style={{ width: 14, height: 14 }} /> {t("courses.search.resultsFor", { term: searchTerm })}</h3>
                    {searchResults.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: "var(--admin-font-tertiary)" }}>{t("courses.search.noMatch")}</p>
                    ) : (
                        <div className="space-y-2">
                            {searchResults.map((c, i) => (
                                <div key={c.id || i} className="flex items-center gap-3 p-3 rounded-lg" style={row}>
                                    <BookOpen className="h-4 w-4 shrink-0" style={{ color: "var(--admin-font-tertiary)" }} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate" style={{ color: "var(--admin-font-primary)" }}>{c.title}</p>
                                        <p className="text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>
                                            {c.category || "General"} {c.difficulty ? `· ${c.difficulty}` : ""} {c.duration ? `· ${c.duration}w` : ""}
                                        </p>
                                    </div>
                                    {c.courseraUrl && (
                                        <a href={c.courseraUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1.5 rounded-md hover:bg-white transition-colors">
                                            <ExternalLink className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* AI Recommended for Students */}
                <div style={{ ...s, padding: 20 }}>
                    <h3 style={hdr}><Award style={{ width: 14, height: 14, color: "#8b5cf6" }} /> {t("courses.aiRecommended.sectionTitle")}</h3>
                    <p className="text-[11px] mb-3" style={{ color: "var(--admin-font-tertiary)" }}>
                        {t("courses.aiRecommended.sectionDesc")}
                    </p>
                    {catalogLoading ? (
                        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
                    ) : recommendedCourses.length === 0 ? (
                        <p className="text-sm py-6 text-center" style={{ color: "var(--admin-font-tertiary)" }}>{t("courses.aiRecommended.noRecommendations")}</p>
                    ) : (
                        <div className="space-y-2">
                            {recommendedCourses.slice(0, 8).map((c, i) => (
                                <div key={c.id || i} className="flex items-center gap-3 p-3 rounded-lg" style={row}>
                                    <span className="text-xs font-bold w-5 text-center" style={{ color: "#8b5cf6" }}>#{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate" style={{ color: "var(--admin-font-primary)" }}>{c.title}</p>
                                        <p className="text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>
                                            {c.category || "General"} {c.duration ? `· ${c.duration} weeks` : ""}
                                        </p>
                                    </div>
                                    {c.courseraUrl && (
                                        <a href={c.courseraUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 p-1.5 rounded-md hover:bg-white transition-colors">
                                            <ExternalLink className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                                        </a>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Categories Breakdown */}
                <div style={{ ...s, padding: 20 }}>
                    <h3 style={hdr}><BarChart3 style={{ width: 14, height: 14, color: "#10b981" }} /> {t("courses.categories.sectionTitle")}</h3>
                    <p className="text-[11px] mb-3" style={{ color: "var(--admin-font-tertiary)" }}>
                        {t("courses.categories.sectionDesc", { count: allCourses.length })}
                    </p>
                    {catalogLoading ? (
                        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
                    ) : (
                        <div className="space-y-1.5">
                            {categories.slice(0, 12).map(([name, count]) => {
                                const pct = Math.round((count / allCourses.length) * 100);
                                return (
                                    <div key={name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={row}>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-xs font-medium truncate" style={{ color: "var(--admin-font-primary)" }}>{name}</p>
                                        </div>
                                        <div className="w-24 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--admin-border-default)" }}>
                                            <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-[11px] font-semibold w-10 text-right" style={{ color: "var(--admin-font-tertiary)" }}>{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Sample from Catalog */}
            <div style={{ ...s, padding: 20 }}>
                <h3 style={hdr}><BookOpen style={{ width: 14, height: 14, color: "#065292" }} /> {t("courses.sample.sectionTitle")}</h3>
                <p className="text-[11px] mb-3" style={{ color: "var(--admin-font-tertiary)" }}>
                    {t("courses.sample.sectionDesc", { count: allCourses.length })}
                </p>
                {catalogLoading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">{[1,2,3,4,5,6].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {allCourses.slice(0, 12).map((c, i) => (
                            <div key={c.id || i} className="flex items-start gap-3 p-3 rounded-lg" style={row}>
                                <BookOpen className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--admin-font-tertiary)" }} />
                                <div className="min-w-0">
                                    <p className="text-xs font-semibold line-clamp-2" style={{ color: "var(--admin-font-primary)" }}>{c.title}</p>
                                    <p className="text-[10px] mt-0.5" style={{ color: "var(--admin-font-tertiary)" }}>{c.category || "General"}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
