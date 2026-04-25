"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { DashboardSkeleton } from "@/components/skeletons/DashboardSkeleton";

/**
 * Resume Builder Root Page
 *
 * This page redirects to the My Resumes page
 * which is the entry point for resume management.
 * Users navigate from here to create or edit resumes.
 *
 * The new architecture:
 * 1. /dashboard/resumes - My Resumes management page
 * 2. /dashboard/resume-builder/[id] - Split-screen resume editor
 *
 * See RESUME_BUILDER_REDESIGN_ARCHITECTURE.md for full details
 */

export default function ResumeBuilderPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to My Resumes page
    router.replace("/dashboard/resumes");
  }, [router]);

  return (
    <DashboardSkeleton />
  );
}

// import { CareerFieldStep } from "./_components/CareerFieldStep";
// import { PersonalInfoStep } from "./_components/PersonalInfoStep";
// import { TemplateSelectionStep } from "./_components/TemplateSelectionStep";
// import { ExperienceStep } from "./_components/ExperienceStep";
// import { EducationStep } from "./_components/EducationStep";
// import { SkillsStep } from "./_components/SkillsStep";
// import { TemplatePreviewStep } from "./_components/TemplatePreviewStep";
// import { ResumePreview } from "./_components/ResumePreview";
// import { LivePreviewPDF } from "./_components/LivePreviewPDF";
// import { NavigationButtons } from "./_components/NavigationButtons";

// import { resumeSteps, resumeTemplates } from "./_components/resumeData";
// import { useEffect, useState } from "react";
// import { useRouter } from "next/navigation";

// import * as resumeService from "@/services/resumeService";

// export default function ResumeBuilderPage() {
//   const { resumeBuilder, setResumeLoading } = useGlobalStore();
//   const currentStep = resumeBuilder.currentStep;
//   const [resumeId, setResumeId] = useState<string | null>(null);
//   const router = useRouter();

//   // Background auto-save on data change
//   useEffect(() => {
//     if (!resumeBuilder.isDirty) return;
//     const timer = setTimeout(async () => {
//       setResumeLoading(true);
//       // map store data to API payload
//       const { data } = resumeBuilder;
//       const payload = {
//         personal: {
//           fullName: data.personalInfo.fullName,
//           email: data.personalInfo.email,
//           phone: data.personalInfo.phone,
//           location: data.personalInfo.location,
//           linkedIn: data.personalInfo.linkedin,
//           website: data.personalInfo.website,
//         },
//         summary: data.personalInfo.summary,
//         skills: {
//           skills: data.skills.reduce((acc, s) => {
//             acc[s.category] = [...(acc[s.category] || []), s.name];
//             return acc;
//           }, {} as Record<string, string[]>),
//         },
//         experience: data.experience.map((e) => ({
//           company: e.company,
//           location: e.location,
//           title: e.jobTitle,
//           startDate: e.startDate,
//           endDate: e.endDate,
//           descriptions: e.description,
//         })),
//         education: data.education.map((ed) => ({
//           degree: ed.degree,
//           institution: ed.institution,
//           location: ed.location,
//           startDate: "",
//           endDate: ed.graduationDate,
//         })),
//       };
//       try {
//         if (resumeId) {
//           await resumeService.updateResume(resumeId, payload);
//         } else {
//           const res = await resumeService.createResume(payload);
//           setResumeId(res._id);
//         }
//       } catch (err) {
//         console.error("Auto-save failed", err);
//       } finally {
//         setResumeLoading(false);
//       }
//     }, 1000);
//     return () => clearTimeout(timer);
//   }, [resumeBuilder.data]);

//   const renderCurrentStep = () => {
//     switch (currentStep) {
//       case 1:
//         return <CareerFieldStep />;
//       case 2:
//         return <TemplateSelectionStep />;
//       case 3:
//         return <PersonalInfoStep />;
//       case 4:
//         return <ExperienceStep />;
//       case 5:
//         return <EducationStep />;
//       case 6:
//         return <SkillsStep />;
//       case 7:
//         return <TemplatePreviewStep />;
//       default:
//         return <CareerFieldStep />;
//     }
//   };

//   // Get current template for background synchronization
//   const currentTemplate = resumeTemplates.find(
//     (t) => t.id === resumeBuilder.data.template
//   );
//   const templateColor = currentTemplate?.color || "#3b82f6";

//   return (
//     <div
//       className="min-h-screen transition-all duration-700 ease-in-out"
//       style={{
//         background: `linear-gradient(135deg,
//           ${templateColor}08 0%,
//           ${templateColor}05 25%,
//           transparent 50%,
//           ${templateColor}03 75%,
//           ${templateColor}08 100%
//         )`,
//       }}
//     >
//
//       <div className="relative bg-white/80 backdrop-blur-xl border-b border-white/20 shadow-sm">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
//           <div className="flex items-center justify-between h-20">
//
//             <div className="flex items-center space-x-6">
//               <div>
//                 <div className="flex items-center space-x-3">
//                   <div className="w-10 h-10 bg-gradient-to-r from-indigo-600 to-blue-600 rounded-xl flex items-center justify-center">
//                     <svg
//                       className="w-6 h-6 text-white"
//                       fill="none"
//                       stroke="currentColor"
//                       viewBox="0 0 24 24"
//                     >
//                       <path
//                         strokeLinecap="round"
//                         strokeLinejoin="round"
//                         strokeWidth={2}
//                         d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
//                       />
//                     </svg>
//                   </div>
//                   <div>
//                     <h1 className="text-2xl font-bold text-gray-900">
//                       Resume Builder
//                     </h1>
//                     <p className="text-sm text-gray-600">
//                       Step {currentStep} of {resumeSteps.length}:{" "}
//                       {resumeSteps[currentStep - 1]?.title}
//                     </p>
//                   </div>
//                 </div>
//               </div>

//               <div className="hidden md:flex items-center space-x-3">
//                 <div className="w-32 h-2 bg-gray-200 rounded-full overflow-hidden">
//                   <div
//                     className="h-full bg-gradient-to-r from-indigo-600 to-blue-600 transition-all duration-300"
//                     style={{
//                       width: `${(currentStep / resumeSteps.length) * 100}%`,
//                     }}
//                   />
//                 </div>
//                 <span className="text-sm text-gray-600 font-medium">
//                   {Math.round((currentStep / resumeSteps.length) * 100)}%
//                 </span>
//               </div>
//             </div>

//             <div className="flex items-center space-x-4">
//               <div className="flex items-center space-x-2">
//                 {resumeBuilder.isDirty ? (
//                   <div className="flex items-center space-x-2 text-amber-600">
//                     <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
//                     <span className="text-sm font-medium">Unsaved changes</span>
//                   </div>
//                 ) : (
//                   <div className="flex items-center space-x-2 text-green-600">
//                     <svg
//                       className="w-4 h-4"
//                       fill="currentColor"
//                       viewBox="0 0 20 20"
//                     >
//                       <path
//                         fillRule="evenodd"
//                         d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
//                         clipRule="evenodd"
//                       />
//                     </svg>
//                     <span className="text-sm font-medium">Saved</span>
//                   </div>
//                 )}
//               </div>

//               <div className="flex items-center space-x-2">
//                 <ResumePreview />
//               </div>
//             </div>
//           </div>
//         </div>
//       </div>

//       <div className="bg-white/60 backdrop-blur-sm border-b border-white/20">
//         <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
//           <StepIndicator />
//         </div>
//       </div>

//       <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
//         <div
//           className={`grid grid-cols-1 gap-8 ${
//             currentStep === 1 || currentStep === 2
//               ? "lg:grid-cols-1"
//               : "lg:grid-cols-2"
//           }`}
//         >
//           <div
//             className={`bg-white/70 backdrop-blur-xl rounded-2xl  shadow-xl border border-white/20 p-8 ${
//               currentStep === 1 || currentStep === 2 ? "max-w-4xl mx-auto" : ""
//             }`}
//           >
//             {renderCurrentStep()}
//             <NavigationButtons />
//           </div>

//           {currentStep > 2 && (
//             <div className="lg:sticky lg:top-8 lg:self-start">
//               <div className="bg-white/70 backdrop-blur-xl rounded-2xl shadow-xl border border-white/20 p-8">
//                 <div className="flex items-center space-x-3 mb-6">
//                   <div className="w-8 h-8 bg-gradient-to-r from-green-600 to-emerald-600 rounded-lg flex items-center justify-center">
//                     <svg
//                       className="w-5 h-5 text-white"
//                       fill="none"
//                       stroke="currentColor"
//                       viewBox="0 0 24 24"
//                     >
//                       <path
//                         strokeLinecap="round"
//                         strokeLinejoin="round"
//                         strokeWidth={2}
//                         d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
//                       />
//                       <path
//                         strokeLinecap="round"
//                         strokeLinejoin="round"
//                         strokeWidth={2}
//                         d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
//                       />
//                     </svg>
//                   </div>
//                   <h3 className="text-lg font-semibold text-gray-900">
//                     Live Preview
//                   </h3>
//                 </div>
//                 <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
//                   <LivePreviewPDF />
//                 </div>
//               </div>
//             </div>
//           )}
//         </div>
//       </div>
//     </div>
//   );
// }
