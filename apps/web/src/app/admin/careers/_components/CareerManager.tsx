"use client";

import React, { useState, useEffect, useMemo } from "react";
import { Input } from "@/components/ui/input";
import {
    Briefcase, Search, TrendingUp, Globe, GraduationCap,
    BarChart3, DollarSign, Layers, ExternalLink, MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "react-i18next";
import { listCareers } from "@/services/careerService";
import { Skeleton } from "@/components/ui/skeleton";

// Raw career shape from the API (different from the typed CareerRole)
interface RawCareer {
    programId?: string;
    programTitle?: string;
    cluster?: string;
    title?: { en?: string; es?: string } | string;
    industries?: string[];
    educationLevel?: string;
    salaryRange?: { median?: number };
    remoteEligible?: boolean;
    skills?: any[];
    [key: string]: any;
}

function getTitle(c: RawCareer): string {
    if (c.programTitle) return c.programTitle;
    if (typeof c.title === "string") return c.title;
    if (c.title?.en) return c.title.en;
    if (c.title?.es) return c.title.es;
    return "Untitled";
}

function getCategory(c: RawCareer): string {
    return c.cluster || c.industries?.[0] || "General";
}

export function CareerManager() {
    const { t } = useTranslation();
    const [careers, setCareers] = useState<RawCareer[]>([]);
    const [search, setSearch] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        (async () => {
            setLoading(true);
            const res = await listCareers();
            setCareers(res.careers || []);
            setLoading(false);
        })();
    }, []);

    // Derived insights
    const clusters = useMemo(() => {
        const map = new Map<string, number>();
        careers.forEach(c => {
            const cat = getCategory(c);
            if (cat && cat !== "General") map.set(cat, (map.get(cat) || 0) + 1);
        });
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }, [careers]);

    const educationLevels = useMemo(() => {
        const map = new Map<string, number>();
        careers.forEach(c => { if (c.educationLevel) map.set(c.educationLevel, (map.get(c.educationLevel) || 0) + 1); });
        return [...map.entries()].sort((a, b) => b[1] - a[1]);
    }, [careers]);

    const remoteCount = useMemo(() => careers.filter(c => c.remoteEligible).length, [careers]);

    const topSkills = useMemo(() => {
        const map = new Map<string, number>();
        careers.forEach(c => c.skills?.forEach(s => {
            const name = typeof s.name === "string" ? s.name : (s.name as any)?.en || "";
            if (name) map.set(name, (map.get(name) || 0) + 1);
        }));
        return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);
    }, [careers]);

    const salaryBands = useMemo(() => {
        const bands = { "< $40k": 0, "$40k–$70k": 0, "$70k–$100k": 0, "$100k+": 0 };
        careers.forEach(c => {
            const m = c.salaryRange?.median;
            if (!m) return;
            if (m < 40000) bands["< $40k"]++;
            else if (m < 70000) bands["$40k–$70k"]++;
            else if (m < 100000) bands["$70k–$100k"]++;
            else bands["$100k+"]++;
        });
        return Object.entries(bands).filter(([, v]) => v > 0);
    }, [careers]);

    const searchResults = useMemo(() => {
        if (!search.trim()) return [];
        const q = search.toLowerCase();
        return careers.filter(c =>
            getTitle(c).toLowerCase().includes(q) ||
            getCategory(c).toLowerCase().includes(q)
        ).slice(0, 10);
    }, [careers, search]);

    const s = { borderRadius: "var(--admin-radius-lg, 8px)", border: "1px solid var(--admin-border-default, #e5e5e5)", background: "var(--admin-bg-card, #fff)" } as const;
    const lbl = { fontSize: 11, fontWeight: 500 as const, color: "var(--admin-font-tertiary)", textTransform: "uppercase" as const, letterSpacing: "0.04em" };
    const val = { fontSize: 28, fontWeight: 700 as const, color: "var(--admin-font-primary)", letterSpacing: "-0.02em" };
    const hdr = { fontSize: 13, fontWeight: 600 as const, color: "var(--admin-font-primary)", marginBottom: 12, display: "flex" as const, alignItems: "center" as const, gap: 6 };
    const row = { background: "var(--admin-bg-hover, #f9f9f9)" };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-bold tracking-tight" style={{ color: "var(--admin-font-primary)" }}>Career Insights</h1>
                    <p className="text-base mt-1" style={{ color: "var(--admin-font-tertiary)" }}>
                        Career database used for AI-powered student career matching
                    </p>
                </div>
                <div className="relative w-full md:w-72">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input placeholder="Search careers..." className="pl-9 h-10 rounded-xl" value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                {[
                    { label: "Total Careers", value: loading ? "..." : careers.length.toLocaleString(), icon: Briefcase },
                    { label: "Career Clusters", value: clusters.length.toLocaleString(), icon: Layers },
                    { label: "Remote Eligible", value: remoteCount.toLocaleString(), icon: Globe },
                    { label: "Education Levels", value: educationLevels.length.toLocaleString(), icon: GraduationCap },
                    { label: "Skills Tracked", value: topSkills.length > 0 ? `${topSkills.length}+` : "—", icon: TrendingUp },
                ].map((stat, i) => (
                    <div key={i} style={{ ...s, padding: 16 }}>
                        <stat.icon style={{ width: 16, height: 16, color: "var(--admin-font-tertiary)", marginBottom: 8 }} />
                        <div style={val}>{stat.value}</div>
                        <div style={lbl}>{stat.label}</div>
                    </div>
                ))}
            </div>

            {/* Search Results */}
            {search.trim() && (
                <div style={{ ...s, padding: 20 }}>
                    <h3 style={hdr}><Search style={{ width: 14, height: 14 }} /> Results for "{search}"</h3>
                    {searchResults.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: "var(--admin-font-tertiary)" }}>No careers match</p>
                    ) : (
                        <div className="space-y-2">
                            {searchResults.map((c, i) => (
                                <div key={c.id || i} className="flex items-center gap-3 p-3 rounded-lg" style={row}>
                                    <Briefcase className="h-4 w-4 shrink-0" style={{ color: "var(--admin-font-tertiary)" }} />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold truncate" style={{ color: "var(--admin-font-primary)" }}>{getTitle(c)}</p>
                                        <p className="text-[11px]" style={{ color: "var(--admin-font-tertiary)" }}>
                                            {getCategory(c)} {c.educationLevel ? `· ${c.educationLevel}` : ""} {c.remoteEligible ? "· Remote" : ""}
                                        </p>
                                    </div>
                                    {c.salaryRange?.median && (
                                        <span className="text-xs font-semibold shrink-0" style={{ color: "var(--admin-font-tertiary)" }}>
                                            ${Math.round(c.salaryRange.median / 1000)}k
                                        </span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Industries Breakdown */}
                <div style={{ ...s, padding: 20 }}>
                    <h3 style={hdr}><BarChart3 style={{ width: 14, height: 14, color: "#3b82f6" }} /> By Career Cluster</h3>
                    {loading ? (
                        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
                    ) : clusters.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: "var(--admin-font-tertiary)" }}>No cluster data</p>
                    ) : (
                        <div className="space-y-1.5">
                            {clusters.slice(0, 10).map(([name, count]) => {
                                const pct = Math.round((count / careers.length) * 100);
                                return (
                                    <div key={name} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={row}>
                                        <p className="flex-1 text-xs font-medium truncate" style={{ color: "var(--admin-font-primary)" }}>{name}</p>
                                        <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--admin-border-default)" }}>
                                            <div className="h-full rounded-full bg-blue-500" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-[11px] font-semibold w-8 text-right" style={{ color: "var(--admin-font-tertiary)" }}>{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Top Skills */}
                <div style={{ ...s, padding: 20 }}>
                    <h3 style={hdr}><TrendingUp style={{ width: 14, height: 14, color: "#8b5cf6" }} /> Most In-Demand Skills</h3>
                    {loading ? (
                        <div className="space-y-2">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
                    ) : topSkills.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: "var(--admin-font-tertiary)" }}>No skills data</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {topSkills.map(([skill, count]) => (
                                <div key={skill} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={row}>
                                    <span className="text-xs font-medium" style={{ color: "var(--admin-font-primary)" }}>{skill}</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: "var(--admin-bg-card)", color: "var(--admin-font-tertiary)" }}>{count}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Education & Salary */}
                <div style={{ ...s, padding: 20 }}>
                    <h3 style={hdr}><GraduationCap style={{ width: 14, height: 14, color: "#10b981" }} /> Education Requirements</h3>
                    {loading ? (
                        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
                    ) : educationLevels.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: "var(--admin-font-tertiary)" }}>No education data</p>
                    ) : (
                        <div className="space-y-1.5">
                            {educationLevels.map(([level, count]) => (
                                <div key={level} className="flex items-center justify-between px-3 py-2.5 rounded-lg" style={row}>
                                    <span className="text-xs font-medium" style={{ color: "var(--admin-font-primary)" }}>{level}</span>
                                    <span className="text-xs font-semibold" style={{ color: "var(--admin-font-tertiary)" }}>{count} careers</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Salary Distribution */}
                <div style={{ ...s, padding: 20 }}>
                    <h3 style={hdr}><DollarSign style={{ width: 14, height: 14, color: "#f59e0b" }} /> Salary Distribution</h3>
                    {loading ? (
                        <div className="space-y-2">{[1,2,3].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}</div>
                    ) : salaryBands.length === 0 ? (
                        <p className="text-sm py-4 text-center" style={{ color: "var(--admin-font-tertiary)" }}>No salary data available</p>
                    ) : (
                        <div className="space-y-1.5">
                            {salaryBands.map(([band, count]) => {
                                const pct = Math.round((count / careers.length) * 100);
                                return (
                                    <div key={band} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={row}>
                                        <p className="flex-1 text-xs font-medium" style={{ color: "var(--admin-font-primary)" }}>{band}</p>
                                        <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "var(--admin-border-default)" }}>
                                            <div className="h-full rounded-full bg-amber-500" style={{ width: `${pct}%` }} />
                                        </div>
                                        <span className="text-[11px] font-semibold w-8 text-right" style={{ color: "var(--admin-font-tertiary)" }}>{count}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* Sample Careers */}
            <div style={{ ...s, padding: 20 }}>
                <h3 style={hdr}><Briefcase style={{ width: 14, height: 14, color: "#3b82f6" }} /> Sample from Database</h3>
                <p className="text-[11px] mb-3" style={{ color: "var(--admin-font-tertiary)" }}>
                    All {careers.length} careers are analyzed by the AI to match students based on their assessment profiles
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {(loading ? [] : careers.slice(0, 9)).map((c, i) => (
                        <div key={c.id || i} className="flex items-start gap-3 p-3 rounded-lg" style={row}>
                            <Briefcase className="h-4 w-4 mt-0.5 shrink-0" style={{ color: "var(--admin-font-tertiary)" }} />
                            <div className="min-w-0">
                                <p className="text-xs font-semibold line-clamp-2" style={{ color: "var(--admin-font-primary)" }}>{getTitle(c)}</p>
                                <p className="text-[10px] mt-0.5" style={{ color: "var(--admin-font-tertiary)" }}>
                                    {getCategory(c)}
                                    {c.remoteEligible ? " · Remote" : ""}
                                </p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
