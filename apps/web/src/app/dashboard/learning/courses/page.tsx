"use client";
import { useTranslation } from "react-i18next";
import { CoursesCatalog } from "../../../../components/dashboard/courses/CoursesCatalog";
import { ArrowLeft, BookOpen, Zap } from "lucide-react";
import Link from "next/link";


export default function CoursesPage() {
  const { t } = useTranslation();

  return (
    <main className="min-h-screen bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
        
        {/* Header Section */}
        <div className="space-y-6">
           <Link 
             href="/dashboard/learning" 
             className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors group"
           >
               <div className="p-1.5 rounded-lg bg-white border border-slate-200 mr-2 group-hover:border-indigo-200 transition-all">
                  <ArrowLeft className="w-4 h-4" />
               </div>
               {t("nav.learning")}
           </Link>
           
           <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
               <div className="space-y-4 max-w-2xl">
                   <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-50 border border-blue-100 text-blue-600 text-xs font-bold uppercase tracking-wider">
                      <Zap className="w-3.5 h-3.5 fill-blue-600" />
                      Curated Catalog
                   </div>
                   <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight leading-[1.1]">
                      Explore <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">Courses</span>
                   </h1>
                   <p className="text-slate-500 text-lg leading-relaxed">
                      {t("courses.discoverCourses")}
                   </p>
               </div>
           </div>
        </div>

        {/* Courses Catalog */}
        <CoursesCatalog />
      </div>
    </main>
  );
}
