"use client";

import React from "react";
import { useCareerDetails } from "@/hooks/useCareerQueries";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Target,
  Zap,
  DollarSign,
  GraduationCap,
  TrendingUp,
  Brain,
  Sparkles,
  Shield,
  Users,
  Lightbulb,
  BarChart3,
} from "lucide-react";

export default function CareerDetails() {
  const params = useParams();
  const id = Array.isArray(params?.id) ? params?.id[0] : params?.id ?? "";
  const { data: rawData, isLoading } = useCareerDetails(id);
  const router = useRouter();

  if (isLoading)
    return (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Loading career details...</p>
        </div>
      </div>
    );

  // Parse the response — rawData is the `data` field from apiRequest
  const career = (rawData as any)?.career ?? rawData;
  const studentMatch = (rawData as any)?.studentMatch;

  if (!career) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50">
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Career Not Found</h2>
        <p className="text-gray-600 mb-6">The career you are looking for does not exist.</p>
        <button onClick={() => router.back()} className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          Go Back
        </button>
      </div>
    );
  }

  const title = career.programTitle || career.title?.en || "Career";
  const cluster = (career.cluster || "").replace(/_/g, " ");
  const overview = career.overview;
  const education = career.education;

  // Parse JSON strings from AI
  const responsibilities = parseJsonArray(career.responsibilities);
  const skills = parseJsonArray(career.skills);
  const salaryRange = parseJsonObj(career.salaryRange);

  // Student match data
  const matchScore = studentMatch?.totalScore ?? 0;
  const confidence = studentMatch?.confidence ?? "unknown";
  const breakdown = studentMatch?.breakdown;
  const studentMil = studentMatch?.studentMil;
  const milKeys = career.milKeys || [];
  const milRefs = career.milRefs || {};
  const needsBridging = studentMatch?.needsBridging;
  const bridgingReasons = studentMatch?.bridgingReasons || [];

  const confColor = confidence === "high" ? "text-emerald-600" : confidence === "good" ? "text-blue-600" : "text-amber-600";
  const confBg = confidence === "high" ? "bg-emerald-50 border-emerald-200" : confidence === "good" ? "bg-blue-50 border-blue-200" : "bg-amber-50 border-amber-200";
  const confLabel = confidence === "high" ? "Excellent Match" : confidence === "good" ? "Strong Match" : "Good Match";

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="min-h-screen bg-gray-50 pb-12">
      {/* Header */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <button onClick={() => router.back()} className="flex items-center text-gray-500 hover:text-indigo-600 transition-colors mb-4 text-sm font-medium">
            <ArrowLeft className="w-4 h-4 mr-1" /> Back to Careers
          </button>

          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600 text-xl font-bold shrink-0">
                {title.charAt(0)}
              </div>
              <div>
                <h1 className="text-2xl md:text-3xl font-bold text-gray-900">{title}</h1>
                <p className="text-gray-500 mt-1 text-sm font-medium">{cluster}</p>
              </div>
            </div>

            {studentMatch && (
              <div className={`flex items-center gap-4 px-5 py-3 rounded-2xl border ${confBg}`}>
                <div className="text-center">
                  <div className={`text-3xl font-bold ${confColor}`}>{matchScore}%</div>
                  <div className={`text-xs font-semibold uppercase tracking-wider ${confColor}`}>{confLabel}</div>
                </div>
                <div className="h-10 w-px bg-gray-200" />
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                  <span className="text-gray-500">Cognitive</span>
                  <span className="font-semibold text-gray-800">{breakdown?.milScore?.toFixed(0)}%</span>
                  <span className="text-gray-500">Interests</span>
                  <span className="font-semibold text-gray-800">{breakdown?.interestsScore?.toFixed(0)}%</span>
                  <span className="text-gray-500">Motivators</span>
                  <span className="font-semibold text-gray-800">{breakdown?.motivatorsScore?.toFixed(0)}%</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 lg:gap-8">
          {/* Left Column */}
          <div className="lg:col-span-2 space-y-6">
            {/* Overview */}
            {overview && (
              <Section icon={<BookOpen />} title="About this Career">
                <p className="text-gray-600 leading-relaxed">{overview}</p>
              </Section>
            )}

            {/* Cognitive Fit */}
            {studentMil && (
              <Section icon={<Brain />} title="Your Cognitive Fit">
                <div className="space-y-3">
                  {milKeys.map((key: string, idx: number) => {
                    const refVal = idx === 0 ? milRefs.key1Ref : idx === 1 ? milRefs.key2Ref : milRefs.key3Ref;
                    const studentVal = studentMil[key.toLowerCase()] ?? 0;
                    const exceeds = studentVal >= refVal;
                    return (
                      <div key={key} className="flex items-center gap-4">
                        <div className="w-24 text-sm font-medium text-gray-700 capitalize">{key}</div>
                        <div className="flex-1 relative">
                          <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${exceeds ? "bg-emerald-500" : "bg-amber-400"}`}
                              style={{ width: `${Math.min(studentVal, 100)}%` }}
                            />
                          </div>
                          {/* Threshold marker */}
                          <div className="absolute top-0 h-6 border-l-2 border-dashed border-gray-400" style={{ left: `${refVal}%` }}>
                            <span className="absolute -top-5 -translate-x-1/2 text-[10px] text-gray-400 whitespace-nowrap">req: {refVal}%</span>
                          </div>
                        </div>
                        <div className={`w-14 text-right text-sm font-bold ${exceeds ? "text-emerald-600" : "text-amber-600"}`}>
                          {studentVal}%
                        </div>
                      </div>
                    );
                  })}
                  {/* Non-key dimensions */}
                  {studentMil && Object.entries(studentMil as Record<string, number>)
                    .filter(([k]) => !milKeys.map((m: string) => m.toLowerCase()).includes(k))
                    .map(([key, val]) => (
                      <div key={key} className="flex items-center gap-4 opacity-50">
                        <div className="w-24 text-sm font-medium text-gray-500 capitalize">{key}</div>
                        <div className="flex-1">
                          <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-gray-300" style={{ width: `${Math.min(val, 100)}%` }} />
                          </div>
                        </div>
                        <div className="w-14 text-right text-sm text-gray-400">{val}%</div>
                      </div>
                    ))}
                </div>
              </Section>
            )}

            {/* Bridging */}
            {needsBridging && bridgingReasons.length > 0 && (
              <div className="bg-amber-50 rounded-xl border border-amber-200 p-6">
                <h2 className="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2">
                  <Shield className="w-5 h-5 text-amber-600" />
                  Skill Gaps to Bridge
                </h2>
                <ul className="space-y-2">
                  {bridgingReasons.map((r: string, i: number) => (
                    <li key={i} className="flex items-center gap-2 text-sm text-amber-800">
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-500 shrink-0" />
                      {r}
                    </li>
                  ))}
                </ul>
                {career.bridgingPaths && (
                  <div className="mt-4 pt-3 border-t border-amber-200">
                    <p className="text-xs text-amber-700 font-medium mb-1">Recommended preparation:</p>
                    <p className="text-sm text-amber-800">{career.bridgingPaths}</p>
                  </div>
                )}
              </div>
            )}

            {/* Responsibilities */}
            {responsibilities.length > 0 && (
              <Section icon={<Target />} title="Key Responsibilities">
                <ul className="space-y-3">
                  {responsibilities.map((r: string, i: number) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                      <span className="text-gray-700 text-sm">{r}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Skills */}
            {skills.length > 0 && (
              <Section icon={<Zap />} title="Essential Skills">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {skills.map((s: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg border border-gray-100">
                      <div className="h-2 w-2 rounded-full bg-indigo-500 shrink-0" />
                      <span className="text-sm text-gray-700">{s}</span>
                    </div>
                  ))}
                </div>
              </Section>
            )}
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            {/* Salary */}
            {salaryRange && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Compensation
                </h3>
                <div className="space-y-3">
                  {[
                    { label: "Entry Level", value: salaryRange.entry, color: "text-gray-600" },
                    { label: "Mid Career", value: salaryRange.mid, color: "text-indigo-600 font-bold text-lg" },
                    { label: "Senior", value: salaryRange.senior, color: "text-gray-600" },
                  ].map((tier) => (
                    <div key={tier.label} className="flex justify-between items-center">
                      <span className="text-sm text-gray-500">{tier.label}</span>
                      <span className={tier.color}>{tier.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Education */}
            {education && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <GraduationCap className="w-4 h-4" /> Education Path
                </h3>
                <p className="text-sm text-gray-700 leading-relaxed">{education}</p>
              </div>
            )}

            {/* Career Requirements */}
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4" /> Career Profile
              </h3>
              <div className="space-y-4">
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Personality Fit (DISC)</p>
                  <div className="grid grid-cols-4 gap-2">
                    {["D", "I", "S", "C"].map((dim) => {
                      const req = career.discRequirements?.[dim.toLowerCase()] || "Either";
                      return (
                        <div key={dim} className={`text-center p-2 rounded-lg border ${req === "Active" ? "bg-indigo-50 border-indigo-200" : "bg-gray-50 border-gray-100"}`}>
                          <div className="text-sm font-bold text-gray-700">{dim}</div>
                          <div className={`text-xs ${req === "Active" ? "text-indigo-600 font-medium" : "text-gray-400"}`}>{req}</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Interests</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(career.interests || []).map((i: string) => (
                      <span key={i} className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded-full capitalize">{i.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-gray-400 uppercase tracking-wider mb-2">Motivators</p>
                  <div className="flex flex-wrap gap-1.5">
                    {(career.motivators || []).map((m: string) => (
                      <span key={m} className="text-xs bg-purple-50 text-purple-700 px-2 py-1 rounded-full capitalize">{m.replace(/_/g, " ")}</span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Preparation */}
            {career.bridgingPaths && (
              <div className="bg-white rounded-xl border border-gray-200 p-6">
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Lightbulb className="w-4 h-4" /> Preparation Path
                </h3>
                <div className="space-y-2">
                  {career.bridgingPaths.split(";").map((path: string, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-sm text-gray-700">
                      <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                      {path.trim()}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function Section({ icon, title, children }: { icon: React.ReactElement; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        {React.cloneElement(icon as React.ReactElement<any>, { className: "w-5 h-5 text-indigo-500" })}
        {title}
      </h2>
      {children}
    </section>
  );
}

function parseJsonArray(val: any): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return []; }
  }
  return [];
}

function parseJsonObj(val: any): any {
  if (typeof val === "object" && val !== null && !Array.isArray(val)) return val;
  if (typeof val === "string") {
    try { return JSON.parse(val); } catch { return null; }
  }
  return null;
}
