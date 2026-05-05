"use client";
import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
    BookOpen, Star, TrendingUp, GraduationCap, Users, ExternalLink,
    BarChart3, Clock, Award, Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { useAdminAccess } from "@/hooks/useAdminAccess";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { useCourseList, useRecommendedCourses } from "@/hooks/useCourseQueries";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";
import { Skeleton } from "@/components/ui/skeleton";
import type { Course } from "@/types/course";

export default function CoursesPage() {
    const router = useRouter();
    const { isAdmin, loading: authLoading } = useAdminAccess();
    const { t } = useTranslation();

    const { data: catalogData, isLoading: catalogLoading } = useCourseList();
    const { data: recommendedData } = useRecommendedCourses();
    const { data: analyticsData } = useAdminAnalytics("month");

    const allCourses: Course[] = catalogData?.courses || catalogData?.Courses || [];
    const recommendedCourses: Course[] = recommendedData?.courses || [];

    // Derived insights
    const topRated = useMemo(() =>
        [...allCourses].filter(c => c.rating).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)).slice(0, 6),
        [allCourses]
    );
    const mostPopular = useMemo(() =>
        [...allCourses].filter(c => c.reviewCount).sort((a, b) => (b.reviewCount ?? 0) - (a.reviewCount ?? 0)).slice(0, 6),
        [allCourses]
    );
    const providers = useMemo(() => {
        const map = new Map<string, number>();
        allCourses.forEach(c => { if (c.provider) map.set(c.provider, (map.get(c.provider) || 0) + 1); });
        return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    }, [allCourses]);
    const difficulties = useMemo(() => {
        const map = new Map<string, number>();
        allCourses.forEach(c => { if (c.difficulty) map.set(c.difficulty, (map.get(c.difficulty) || 0) + 1); });
        return Object.fromEntries(map);
    }, [allCourses]);
    const avgRating = allCourses.length > 0
        ? (allCourses.reduce((s, c) => s + (c.rating ?? 0), 0) / allCourses.filter(c => c.rating).length).toFixed(1)
        : "—";

    useEffect(() => {
        if (!authLoading && !isAdmin) router.push("/login");
    }, [isAdmin, authLoading, router]);

    if (authLoading) return <DashboardSkeleton />;

    const cardStyle = {
        borderRadius: "var(--admin-radius-lg, 8px)",
        border: "1px solid var(--admin-border-default, #e5e5e5)",
        background: "var(--admin-bg-card, #fff)",
        padding: 20,
    };
    const labelStyle = { fontSize: 11, fontWeight: 500 as const, color: "var(--admin-font-tertiary, #818181)", textTransform: "uppercase" as const, letterSpacing: "0.04em" };
    const valueStyle = { fontSize: 28, fontWeight: 700 as const, color: "var(--admin-font-primary, #111)", letterSpacing: "-0.02em" };
    const sectionTitle = { fontSize: 13, fontWeight: 600 as const, color: "var(--admin-font-primary, #111)", marginBottom: 12, display: "flex" as const, alignItems: "center" as const, gap: 6 };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-4xl font-bold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>Course Insights</h1>
                <p className="text-base mt-1" style={{ color: "var(--admin-font-tertiary)" }}>
                    Platform course catalog overview — {allCourses.length} courses from Coursera
                </p>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: "Total Courses", value: catalogLoading ? "..." : allCourses.length.toLocaleString(), icon: BookOpen },
                    { label: "Recommended", value: recommendedCourses.length.toLocaleString(), icon: TrendingUp },
                    { label: "Avg Rating", value: avgRating, icon: Star },
                    { label: "Providers", value: String(providers.length + (providers.length >= 5 ? "+" : "")), icon: GraduationCap },
                    { label: "Difficulty Levels", value: String(Object.keys(difficulties).length), icon: BarChart3 },
                ].map((s, i) => (
                    <div key={i} style={cardStyle}>
                        <s.icon style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", marginBottom: 8 }} />
                        <div style={valueStyle}>{s.value}</div>
                        <div style={labelStyle}>{s.label}</div>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Top Rated */}
                <div style={cardStyle}>
                    <h3 style={sectionTitle}><Star style={{ width: 14, height: 14, color: "#f59e0b" }} /> Highest Rated</h3>
                    {catalogLoading ? (
                        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
                    ) : (
                        <div className="space-y-2">
                            {topRated.map((c, i) => (
                                <div key={c.id || i} className="flex items-center gap-3 p-3 rounded-lg transition-colors" style={{ background: "var(--admin-bg-hover, #f9f9f9)" }}>
                                    <span className="text-sm font-bold w-5 text-center" style={{ color: i < 3 ? "#f59e0b" : "var(--admin-font-tertiary)" }}>#{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate" style={{ color: "var(--admin-font-primary)" }}>{c.title}</p>
                                        <p className="text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>{c.provider} &middot; {c.difficulty || "All levels"}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Star className="h-3.5 w-3.5 text-amber-400 fill-amber-400" />
                                        <span className="text-sm font-semibold" style={{ color: "var(--admin-font-primary)" }}>{(c.rating ?? 0).toFixed(1)}</span>
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

                {/* Most Popular (by reviews) */}
                <div style={cardStyle}>
                    <h3 style={sectionTitle}><TrendingUp style={{ width: 14, height: 14, color: "#3b82f6" }} /> Most Popular</h3>
                    {catalogLoading ? (
                        <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
                    ) : (
                        <div className="space-y-2">
                            {mostPopular.map((c, i) => (
                                <div key={c.id || i} className="flex items-center gap-3 p-3 rounded-lg transition-colors" style={{ background: "var(--admin-bg-hover, #f9f9f9)" }}>
                                    <span className="text-sm font-bold w-5 text-center" style={{ color: i < 3 ? "#3b82f6" : "var(--admin-font-tertiary)" }}>#{i + 1}</span>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate" style={{ color: "var(--admin-font-primary)" }}>{c.title}</p>
                                        <p className="text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>{c.provider} &middot; {c.difficulty || "All levels"}</p>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                        <Users className="h-3.5 w-3.5" style={{ color: "var(--admin-font-tertiary)" }} />
                                        <span className="text-sm font-semibold" style={{ color: "var(--admin-font-primary)" }}>{(c.reviewCount ?? 0).toLocaleString()}</span>
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
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Recommended for Students */}
                <div style={cardStyle}>
                    <h3 style={sectionTitle}><Award style={{ width: 14, height: 14, color: "#8b5cf6" }} /> AI-Recommended for Students</h3>
                    {recommendedCourses.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: "var(--admin-font-tertiary)" }}>No recommendations generated yet</p>
                    ) : (
                        <div className="space-y-2">
                            {recommendedCourses.slice(0, 6).map((c, i) => (
                                <div key={c.id || i} className="flex items-center gap-3 p-3 rounded-lg" style={{ background: "var(--admin-bg-hover, #f9f9f9)" }}>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate" style={{ color: "var(--admin-font-primary)" }}>{c.title}</p>
                                        <p className="text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>{c.provider} &middot; {c.duration ? `${c.duration} weeks` : ""}</p>
                                    </div>
                                    {c.difficulty && <Badge variant="secondary" className="text-[10px] shrink-0">{c.difficulty}</Badge>}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Breakdown by Difficulty + Provider */}
                <div style={cardStyle}>
                    <h3 style={sectionTitle}><BarChart3 style={{ width: 14, height: 14, color: "#10b981" }} /> Catalog Breakdown</h3>
                    <div className="space-y-4">
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--admin-font-tertiary)" }}>By Difficulty</p>
                            <div className="flex flex-wrap gap-2">
                                {Object.entries(difficulties).map(([level, count]) => (
                                    <div key={level} className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: "var(--admin-bg-hover, #f9f9f9)" }}>
                                        <span className="text-xs font-medium" style={{ color: "var(--admin-font-primary)" }}>{level}</span>
                                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--admin-bg-card)", color: "var(--admin-font-tertiary)" }}>{count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div>
                            <p className="text-[11px] font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--admin-font-tertiary)" }}>Top Providers</p>
                            <div className="space-y-1.5">
                                {providers.map(([name, count]) => (
                                    <div key={name} className="flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "var(--admin-bg-hover, #f9f9f9)" }}>
                                        <span className="text-xs font-medium" style={{ color: "var(--admin-font-primary)" }}>{name}</span>
                                        <span className="text-xs font-semibold" style={{ color: "var(--admin-font-tertiary)" }}>{count} courses</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
