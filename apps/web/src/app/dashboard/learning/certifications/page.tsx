"use client";

import React from "react";
import { motion, useScroll } from "framer-motion";
import {
    CheckCircle2,
    ArrowRight,
    ShieldCheck,
    ExternalLink,
    ArrowLeft,
    Zap,
    Lock,
    Trophy,
    MoreHorizontal,
    Sparkles,
    Hexagon,
    Clock,
    BookOpen,
    Star,
    Users,
    FileText,
    Play,
    Target
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
    // { label: "Value Added", value: "+$12.5k", icon: ShieldCheck, color: "text-indigo-600", bg: "bg-indigo-50 border-indigo-100" },
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
        <main className="min-h-screen bg-white text-slate-900 overflow-hidden relative selection:bg-indigo-100">

            {/* Subtle Background */}
            <div className="fixed inset-0 z-0 opacity-30 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[800px] h-[800px] bg-indigo-100/40 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-sky-100/40 rounded-full blur-[120px]" />
            </div>

            <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 space-y-12">

                {/* Header Section */}
                <div className="space-y-8">
                    <Link
                        href="/dashboard/learning"
                        className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors group"
                    >
                        <div className="p-1.5 rounded-lg bg-white border border-slate-200 mr-2 group-hover:border-indigo-200 transition-all">
                            <ArrowLeft className="w-4 h-4" />
                        </div>
                        Back to Learning
                    </Link>

                    <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8">
                        <div className="space-y-4 max-w-2xl">
                            <motion.div
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white border border-indigo-100 text-indigo-600 text-xs font-bold uppercase tracking-wider"
                            >
                                <Sparkles className="w-3.5 h-3.5 fill-indigo-600" />
                                Elite Credentialing
                            </motion.div>

                            <motion.h1
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.1 }}
                                className="text-4xl md:text-5xl font-bold tracking-tight leading-tight text-slate-900"
                            >
                                Your Path to <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-violet-600">Mastery</span>
                            </motion.h1>

                            <motion.p
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: 0.2 }}
                                className="text-slate-500 text-lg leading-relaxed"
                            >
                                Track certifications, prepare for exams, and validate your expertise with industry-recognized credentials.
                            </motion.p>
                        </div>

                        {/* Stats Cards */}
                        <motion.div
                            initial={{ opacity: 0, x: 20 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: 0.3 }}
                            className="grid grid-cols-2 md:grid-cols-4 gap-3"
                        >
                            {stats.map((stat, i) => (
                                <div key={i} className={`bg-white rounded-2xl p-4 flex flex-col gap-2 border ${stat.bg}`}>
                                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                                    <div>
                                        <p className="text-2xl font-bold text-slate-900 tracking-tight">{stat.value}</p>
                                        <p className="text-xs text-slate-500 font-medium">{stat.label}</p>
                                    </div>
                                </div>
                            ))}
                        </motion.div>
                    </div>
                </div>

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

                    {/* Left: Roadmap */}
                    <div className="lg:col-span-8 space-y-8">
                        <div className="relative">
                            {/* Timeline Path */}
                            <div className="absolute top-0 bottom-0 left-[27px] w-[2px] bg-slate-100 -z-10 rounded-full overflow-hidden">
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
                                    absolute left-0 top-1 w-14 h-14 rounded-2xl flex items-center justify-center z-10 
                                    bg-white border transition-all duration-300
                                    ${cert.status === 'completed' ? 'border-emerald-200' :
                                                cert.status === 'in_progress' ? 'border-indigo-200' :
                                                    'border-slate-200'}
                                `}>
                                            <div className={`
                                        w-full h-full rounded-xl flex items-center justify-center 
                                        ${cert.status === 'completed' ? 'text-emerald-600 bg-emerald-50' :
                                                    cert.status === 'in_progress' ? 'text-indigo-600 bg-indigo-50' :
                                                        'text-slate-400 bg-slate-50'}
                                    `}>
                                                {cert.status === 'completed' ? <CheckCircle2 className="w-6 h-6" /> :
                                                    cert.status === 'locked' ? <Lock className="w-5 h-5" /> :
                                                        <Hexagon className="w-6 h-6" />}
                                            </div>
                                        </div>

                                        {/* Card */}
                                        <div className={`
                                    bg-white rounded-[1.5rem] border transition-all duration-300 
                                    group-hover:-translate-y-0.5 group-hover:shadow-lg group-hover:shadow-slate-100
                                    ${cert.status === 'in_progress' ? 'border-indigo-200 ring-2 ring-indigo-50' : 'border-slate-200 hover:border-indigo-100'}
                                `}>
                                            <div className="p-6 space-y-5">
                                                {/* Header */}
                                                <div className="flex items-start justify-between">
                                                    <div className="flex items-center gap-3">
                                                        <Badge variant="outline" className={`rounded-md border-0 px-2.5 py-1 ${cert.bg} ${cert.text} font-bold text-xs tracking-wide`}>
                                                            {cert.provider}
                                                        </Badge>
                                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{cert.level}</span>
                                                    </div>
                                                    {cert.popularity && (
                                                        <Badge className="bg-amber-50 text-amber-700 border-amber-100 text-xs font-medium">
                                                            <Star className="w-3 h-3 mr-1 fill-amber-400" /> {cert.popularity}
                                                        </Badge>
                                                    )}
                                                </div>

                                                <h3 className="text-xl font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                                                    {cert.title}
                                                </h3>

                                                {/* Skills Tags */}
                                                <div className="flex flex-wrap gap-2">
                                                    {cert.skills.map((skill, i) => (
                                                        <span key={i} className="px-2.5 py-1 bg-slate-50 text-slate-600 rounded-lg text-xs font-medium border border-slate-100">
                                                            {skill}
                                                        </span>
                                                    ))}
                                                </div>

                                                {/* Meta Row */}
                                                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-slate-500 pt-2 border-t border-slate-100">
                                                    <span className="flex items-center gap-1.5">
                                                        <Clock className="w-4 h-4 text-slate-400" /> {cert.duration}
                                                    </span>
                                                    {cert.validFor && (
                                                        <span className="flex items-center gap-1.5">
                                                            <ShieldCheck className="w-4 h-4 text-slate-400" /> Valid {cert.validFor}
                                                        </span>
                                                    )}
                                                    {cert.examCost && (
                                                        <span className="flex items-center gap-1.5 font-semibold text-slate-900">
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
                                                            <span className="text-slate-400">Next: {cert.nextStep}</span>
                                                        </div>
                                                        <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
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
                                                        <Button variant="outline" size="sm" className="rounded-lg border-slate-200 text-slate-600 hover:text-indigo-600">
                                                            <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> View Credential
                                                        </Button>
                                                    )}
                                                    {cert.status === 'in_progress' && (
                                                        <Button size="sm" className="rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white">
                                                            Continue Prep <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                                                        </Button>
                                                    )}
                                                    {cert.status === 'recommended' && (
                                                        <Button variant="outline" size="sm" className="rounded-lg border-slate-200 text-slate-600">
                                                            Start Prep <Play className="w-3.5 h-3.5 ml-1.5" />
                                                        </Button>
                                                    )}
                                                    {cert.status === 'locked' && (
                                                        <span className="flex items-center gap-2 text-slate-400 text-sm">
                                                            <Lock className="w-4 h-4" /> Complete: {cert.prerequisite}
                                                        </span>
                                                    )}
                                                    <Button variant="ghost" size="icon" className="text-slate-400 hover:text-slate-600 rounded-full">
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
                        <div className="bg-white rounded-2xl border border-slate-200 p-6">
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-indigo-50 rounded-xl">
                                    <BookOpen className="w-5 h-5 text-indigo-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Study Resources</h3>
                                    <p className="text-xs text-slate-500">Curated for your path</p>
                                </div>
                            </div>
                            <div className="space-y-4">
                                {studyResources.map((resource, i) => (
                                    <a key={i} href={resource.link} className="block p-4 rounded-xl border border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/30 transition-all group">
                                        <div className="flex items-center justify-between mb-2">
                                            <span className="text-xs font-bold text-indigo-600 uppercase tracking-wider">{resource.type}</span>
                                            <span className="text-xs text-slate-400">{resource.duration}</span>
                                        </div>
                                        <h4 className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">{resource.title}</h4>
                                        <p className="text-xs text-slate-500 mt-1">By {resource.provider}</p>
                                    </a>
                                ))}
                            </div>
                            <Button variant="ghost" className="w-full mt-4 text-indigo-600 hover:bg-indigo-50">
                                View All Resources
                            </Button>
                        </div>

                        {/* Quick Stats */}
                        <div className="bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-6 text-white">
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
                                    {/* <div>
                                <p className="text-2xl font-bold">~$12k</p>
                                <p className="text-xs text-indigo-100">Value Added</p>
                            </div> */}
                                </div>
                            </div>
                        </div>

                        {/* Community */}
                        <div className="bg-white rounded-2xl border border-slate-200 p-6">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-slate-100 rounded-xl">
                                    <Users className="w-5 h-5 text-slate-600" />
                                </div>
                                <div>
                                    <h3 className="font-bold text-slate-900">Community</h3>
                                    <p className="text-xs text-slate-500">12,340 learners</p>
                                </div>
                            </div>
                            <p className="text-sm text-slate-500 mb-4">Join study groups and connect with others on the same path.</p>
                            <Button variant="outline" className="w-full rounded-lg border-slate-200 text-slate-600 hover:text-indigo-600">
                                Join Discussion
                            </Button>
                        </div>
                    </div>
                </div>

                {/* Footer CTA */}
                {/* <div className="bg-slate-900 rounded-[2rem] p-10 md:p-16 text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-900/30 to-purple-900/30" />
                    <div className="relative z-10 max-w-2xl mx-auto space-y-6">
                        <h2 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Ready for more?</h2>
                        <p className="text-slate-400 text-lg">
                            Explore 500+ certifications or sync your existing credentials.
                        </p>
                        <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
                            <Button className="bg-white text-slate-900 hover:bg-slate-100 rounded-xl h-12 px-8 font-bold">
                                Explore Catalog
                            </Button>
                            <Button variant="outline" className="border-slate-700 text-white hover:bg-white/10 rounded-xl h-12 px-8">
                                Sync Data
                            </Button>
                        </div>
                    </div>
                </div> */}

            </div>
        </main>
    );
}
