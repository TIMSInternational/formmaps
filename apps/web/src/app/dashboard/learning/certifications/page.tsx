"use client";

import React from "react";
import { motion, useScroll } from "framer-motion";
import {
    CheckCircle2,
    ArrowRight,
    ShieldCheck,
    ExternalLink,
    ArrowLeft,
    Lock,
    Trophy,
    MoreHorizontal,
    Hexagon,
    Clock,
    BookOpen,
    Star,
    Users,
    Play,
    Target,
    Zap
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

// Mock Data
const certifications = [
    {
        id: 1,
        provider: "AWS",
        title: "Certified Cloud Practitioner",
        level: "Foundational",
        status: "completed",
        date: "Dec 12, 2024",
        score: "920/1000",
        color: "from-orange-400 to-orange-500",
        bg: "bg-orange-50",
        border: "border-orange-100",
        text: "text-orange-600",
        skills: ["Cloud Concepts", "AWS Services", "Security", "Billing"],
        duration: "4-6 weeks",
        validFor: "3 years"
    },
    {
        id: 2,
        provider: "Google Cloud",
        title: "Associate Cloud Engineer",
        level: "Associate",
        status: "in_progress",
        progress: 65,
        examCost: "$125",
        color: "from-blue-400 to-blue-500",
        bg: "bg-blue-50",
        border: "border-blue-100",
        text: "text-blue-600",
        skills: ["GCP Console", "Compute Engine", "Kubernetes", "IAM"],
        duration: "8-10 weeks",
        nextStep: "Complete Practice Exam"
    },
    {
        id: 3,
        provider: "Microsoft",
        title: "Azure Fundamentals AZ-900",
        level: "Foundational",
        status: "recommended",
        examCost: "$99",
        color: "from-sky-400 to-sky-500",
        bg: "bg-sky-50",
        border: "border-sky-100",
        text: "text-sky-600",
        skills: ["Azure Portal", "Virtual Machines", "Storage", "Networking"],
        duration: "3-4 weeks",
        popularity: "Most Popular"
    },
    {
        id: 4,
        provider: "Meta",
        title: "Front-End Developer Professional",
        level: "Professional",
        status: "locked",
        prerequisite: "React Basics",
        color: "from-slate-400 to-slate-500",
        bg: "bg-slate-50",
        border: "border-slate-100",
        text: "text-slate-500",
        skills: ["React", "JavaScript", "UI/UX", "Testing"],
        duration: "12-16 weeks"
    }
];

const stats = [
    { label: "Earned", value: "1", icon: Trophy, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-100" },
    { label: "In Progress", value: "1", icon: Zap, color: "text-amber-600", bg: "bg-amber-50 border-amber-100" },
    { label: "Study Hours", value: "42h", icon: Clock, color: "text-blue-600", bg: "bg-blue-50 border-blue-100" },
];

const studyResources = [
    { title: "Official AWS Training", type: "Course", duration: "20h", provider: "AWS", link: "#" },
    { title: "GCP Practice Exams", type: "Practice", duration: "5h", provider: "Whizlabs", link: "#" },
    { title: "Azure Study Guide", type: "Guide", duration: "15h", provider: "Microsoft", link: "#" },
];

export default function CertificationRoadmapPage() {
    const { scrollYProgress } = useScroll();

    return (
        <div className="w-full px-4 sm:px-5 lg:px-8 py-10 lg:py-12 min-h-[100dvh]">

            {/* Header */}
            <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5 mb-10"
            >
                <Link
                    href="/dashboard/learning"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Back to Learning
                </Link>

                <div className="flex flex-col gap-2">
                    <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-muted-foreground">
                        Certification Roadmap
                    </span>
                    <h1 className="text-3xl md:text-4xl font-bold text-foreground tracking-tight leading-none">
                        Your Path to Mastery
                    </h1>
                    <p className="max-w-2xl text-base text-muted-foreground">
                        Track certifications, prepare for exams, and validate your expertise with industry-recognized credentials.
                    </p>
                </div>
            </motion.div>

            {/* Stats Row */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-10"
            >
                {stats.map((stat, i) => (
                    <div key={i} className="dash-card p-5 flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${stat.bg}`}>
                            <stat.icon className={`w-5 h-5 ${stat.color}`} />
                        </div>
                        <div>
                            <p className="text-2xl font-bold text-foreground tracking-tight">{stat.value}</p>
                            <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
                        </div>
                    </div>
                ))}
            </motion.div>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                {/* Left: Roadmap */}
                <div className="lg:col-span-8 space-y-8">
                    <div className="relative">
                        {/* Timeline Path */}
                        <div className="absolute top-0 bottom-0 left-[27px] w-[2px] bg-secondary -z-10 rounded-full overflow-hidden">
                            <motion.div
                                className="w-full bg-indigo-500 h-full origin-top"
                                style={{ scaleY: scrollYProgress }}
                            />
                        </div>

                        <div className="space-y-10">
                            {certifications.map((cert, index) => (
                                <motion.div
                                    key={cert.id}
                                    initial={{ opacity: 0, x: -30 }}
                                    whileInView={{ opacity: 1, x: 0 }}
                                    viewport={{ once: true, margin: "-50px" }}
                                    transition={{ delay: index * 0.08, duration: 0.5 }}
                                    className="relative pl-16 group"
                                >
                                    {/* Timeline Node */}
                                    <div className={`
                                        absolute left-0 top-1 w-14 h-14 rounded-xl flex items-center justify-center z-10
                                        bg-card border transition-all duration-300
                                        ${cert.status === 'completed' ? 'border-emerald-200' :
                                            cert.status === 'in_progress' ? 'border-indigo-200' :
                                                'border-border'}
                                    `}>
                                        <div className={`
                                            w-full h-full rounded-xl flex items-center justify-center
                                            ${cert.status === 'completed' ? 'text-emerald-600 bg-emerald-50' :
                                                cert.status === 'in_progress' ? 'text-indigo-600 bg-indigo-50' :
                                                    'text-muted-foreground bg-secondary'}
                                        `}>
                                            {cert.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> :
                                                cert.status === 'locked' ? <Lock className="w-5 h-5" /> :
                                                    <Hexagon className="w-6 h-6" />}
                                        </div>
                                    </div>

                                    {/* Card */}
                                    <div className={`
                                        dash-card transition-all duration-300
                                        group-hover:-translate-y-0.5 hover:border-foreground/20
                                        ${cert.status === 'in_progress' ? 'border-indigo-200 ring-2 ring-indigo-50' : 'border-border hover:border-indigo-100'}
                                    `}>
                                        <div className="p-5 space-y-5">
                                            {/* Header */}
                                            <div className="flex items-start justify-between">
                                                <div className="flex items-center gap-3">
                                                    <Badge variant="outline" className={`rounded-md border-0 px-2.5 py-1 ${cert.bg} ${cert.text} font-bold text-xs tracking-wide`}>
                                                        {cert.provider}
                                                    </Badge>
                                                    <span className="text-xs font-bold text-muted-foreground uppercase tracking-widest">{cert.level}</span>
                                                </div>
                                                {cert.popularity && (
                                                    <Badge className="bg-amber-50 text-amber-700 border-amber-100 text-xs font-medium">
                                                        <Star className="w-3 h-3 mr-1 fill-amber-400" /> {cert.popularity}
                                                    </Badge>
                                                )}
                                            </div>

                                            <h3 className="text-xl font-bold text-foreground group-hover:text-indigo-600 transition-colors">
                                                {cert.title}
                                            </h3>

                                            {/* Skills Tags */}
                                            <div className="flex flex-wrap gap-2">
                                                {cert.skills.map((skill, i) => (
                                                    <span key={i} className="px-2.5 py-1 bg-secondary text-muted-foreground rounded-lg text-xs font-medium border border-border">
                                                        {skill}
                                                    </span>
                                                ))}
                                            </div>

                                            {/* Meta Row */}
                                            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-muted-foreground pt-2 border-t border-border">
                                                <span className="flex items-center gap-1.5">
                                                    <Clock className="w-4 h-4 text-muted-foreground" /> {cert.duration}
                                                </span>
                                                {cert.validFor && (
                                                    <span className="flex items-center gap-1.5">
                                                        <ShieldCheck className="w-4 h-4 text-muted-foreground" /> Valid {cert.validFor}
                                                    </span>
                                                )}
                                                {cert.examCost && (
                                                    <span className="flex items-center gap-1.5 font-semibold text-foreground">
                                                        {cert.examCost}
                                                    </span>
                                                )}
                                                {cert.status === 'completed' && cert.score && (
                                                    <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                                                        <Trophy className="w-4 h-4" /> Score: {cert.score}
                                                    </span>
                                                )}
                                            </div>

                                            {/* Progress Bar */}
                                            {cert.status === 'in_progress' && (
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-xs font-bold uppercase tracking-wider">
                                                        <span className="text-indigo-600">{cert.progress}% Prepared</span>
                                                        <span className="text-muted-foreground">Next: {cert.nextStep}</span>
                                                    </div>
                                                    <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            whileInView={{ width: `${cert.progress}%` }}
                                                            transition={{ duration: 1.2, ease: "circOut" }}
                                                            className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 rounded-full"
                                                        />
                                                    </div>
                                                </div>
                                            )}

                                            {/* Actions */}
                                            <div className="flex items-center justify-between pt-2">
                                                {cert.status === 'completed' && (
                                                    <Button variant="outline" size="sm" className="rounded-lg border-border text-muted-foreground hover:text-indigo-600">
                                                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View Credential
                                                    </Button>
                                                )}
                                                {cert.status === 'in_progress' && (
                                                    <Button size="sm" className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">
                                                        Continue Prep <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                                                    </Button>
                                                )}
                                                {cert.status === 'recommended' && (
                                                    <Button variant="outline" size="sm" className="rounded-lg border-border text-muted-foreground">
                                                        Start Prep <Play className="w-3.5 h-3.5 ml-1.5" />
                                                    </Button>
                                                )}
                                                {cert.status === 'locked' && (
                                                    <span className="flex items-center gap-2 text-muted-foreground text-sm">
                                                        <Lock className="w-4 h-4" /> Complete: {cert.prerequisite}
                                                    </span>
                                                )}
                                                <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-foreground rounded-full">
                                                    <MoreHorizontal className="w-5 h-5" />
                                                </Button>
                                            </div>
                                        </div>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right: Sidebar */}
                <div className="lg:col-span-4 space-y-6 lg:sticky lg:top-8 self-start">

                    {/* Study Resources */}
                    <div className="dash-card p-5">
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 bg-indigo-50 rounded-lg">
                                <BookOpen className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground">Study Resources</h3>
                                <p className="text-xs text-muted-foreground">Curated for your path</p>
                            </div>
                        </div>
                        <div className="space-y-4">
                            {studyResources.map((resource, i) => (
                                <a key={i} href={resource.link} className="block p-4 rounded-lg border border-border hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{resource.type}</span>
                                        <span className="text-xs text-muted-foreground">{resource.duration}</span>
                                    </div>
                                    <h4 className="font-semibold text-foreground group-hover:text-indigo-600 transition-colors">{resource.title}</h4>
                                    <p className="text-xs text-muted-foreground mt-1">By {resource.provider}</p>
                                </a>
                            ))}
                        </div>
                        <Button variant="ghost" className="w-full mt-4 text-indigo-600 hover:bg-indigo-50">
                            View All Resources
                        </Button>
                    </div>

                    {/* Quick Stats - gradient progress card stays */}
                    <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-xl p-5 text-white">
                        <div className="flex items-center gap-3 mb-4">
                            <Target className="w-6 h-6" />
                            <h3 className="font-bold">Your Progress</h3>
                        </div>
                        <div className="space-y-4">
                            <div>
                                <div className="flex justify-between text-sm mb-1">
                                    <span className="text-indigo-100">Overall Completion</span>
                                    <span className="font-bold">25%</span>
                                </div>
                                <div className="h-2 bg-white/20 rounded-full overflow-hidden">
                                    <div className="h-full bg-white w-1/4 rounded-full" />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
                                <div>
                                    <p className="text-2xl font-bold">1/4</p>
                                    <p className="text-xs text-indigo-100">Completed</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Community */}
                    <div className="dash-card p-5">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="p-2 bg-secondary rounded-lg">
                                <Users className="w-5 h-5 text-muted-foreground" />
                            </div>
                            <div>
                                <h3 className="font-bold text-foreground">Community</h3>
                                <p className="text-xs text-muted-foreground">12,340 learners</p>
                            </div>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">Join study groups and connect with others on the same path.</p>
                        <Button variant="outline" className="w-full rounded-lg border-border text-muted-foreground hover:text-indigo-600">
                            Join Discussion
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
