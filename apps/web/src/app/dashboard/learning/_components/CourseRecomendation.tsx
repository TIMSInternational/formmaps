"use client";

import React, { useEffect, useState } from "react";
import { Course } from "@/types/course";
import { getRecommendationsBySkills } from "@/services/courseService";
import { Button } from "@/components/ui/button";
import { Star, Clock, BookOpen, ExternalLink, GraduationCap, ArrowRight } from "lucide-react";

interface CourseRecommendationsProps {
  skills: string[];
}

export default function CourseRecommendations({ skills }: CourseRecommendationsProps) {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchCourses = async () => {
      if (skills.length === 0) return;
      setLoading(true);
      try {
        const data = await getRecommendationsBySkills(skills);
        setCourses(data);
      } finally {
        setLoading(false);
      }
    };
    fetchCourses();
  }, [skills]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4">
        {[1, 2].map((i) => (
          <div key={i} className="h-32 bg-slate-100 animate-pulse rounded-2xl" />
        ))}
      </div>
    );
  }

  if (courses.length === 0) {
    return (
       <div className="text-center py-10 px-4 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
           <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center mx-auto mb-3 border border-slate-100">
                <GraduationCap className="w-6 h-6 text-slate-300" />
           </div>
           <p className="text-slate-500 font-medium">Select a skill gap above to uncover top-rated courses.</p>
       </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 h-full">
      {courses.map((course) => (
        <div 
            key={course.id} 
            className="group flex flex-col bg-white rounded-2xl border border-slate-200 overflow-hidden hover:border-indigo-400 transition-colors duration-300"
        >
            <div className="relative h-40 w-full overflow-hidden bg-slate-100">
                 {course.thumbnailUrl ? (
                    <img
                      src={course.thumbnailUrl}
                      alt={course.title}
                      loading="lazy"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                 ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <BookOpen className="w-8 h-8 opacity-50" />
                    </div>
                 )}
                 <div className="absolute top-3 right-3 flex items-center gap-1 bg-white/90 backdrop-blur-md px-2 py-1 rounded-lg text-xs font-bold text-slate-900 border border-white/50">
                     <Star className="w-3 h-3 text-amber-500 fill-amber-500" /> 4.8
                 </div>
            </div>

            <div className="p-5 flex flex-col flex-1">
                <h4 className="font-bold text-slate-900 leading-snug mb-2 text-lg group-hover:text-indigo-600 transition-colors">
                    {course.title}
                </h4>
                <p className="text-sm text-slate-500 line-clamp-2 mb-4">
                   Master the fundamentals and advanced concepts to boost your career growth.
                </p>

                <div className="mt-auto pt-4 border-t border-slate-100 flex items-center justify-between">
                    <div className="flex items-center gap-3 text-xs font-medium text-slate-500">
                        <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                            <Clock className="w-3.5 h-3.5" /> 4-6w
                        </span>
                        <span className="flex items-center gap-1.5 bg-slate-50 px-2 py-1 rounded-md border border-slate-100">
                            Intermediate
                        </span>
                    </div>
                    
                    <Button 
                        size="sm" 
                        variant="ghost" 
                        className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 px-2 font-bold group/btn" 
                        onClick={() => { if (course.courseraUrl) window.open(course.courseraUrl, '_blank'); }}
                    >
                        Enroll <ArrowRight className="w-4 h-4 ml-1 transition-transform group-hover/btn:translate-x-1" />
                    </Button>
                </div>
            </div>
        </div>
      ))}
    </div>
  );
}
