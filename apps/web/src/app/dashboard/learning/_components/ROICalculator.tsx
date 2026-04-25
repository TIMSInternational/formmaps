"use client";

import React from "react";
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Bar,
} from "recharts";
import {
  DynamicBarChart,
  DynamicRadarChart,
} from "@/lib/dynamic-imports";
import { ROIData } from "@/services/benchmarkService";
import { ArrowUpRight, Clock, Target, Radar as RadarIcon, TrendingUp } from "lucide-react";
import AnimatedCounter from "./AnimatedCounter";

interface ROICalculatorProps {
  data: ROIData;
  radarData?: { subject: string; A: number; B: number; fullMark: number }[];
}

export default function ROICalculator({ data, radarData }: ROICalculatorProps) {
  const chartData = [
    {
      name: "Salary",
      Current: data.currentSalary,
      Potential: data.potentialSalary,
    },
  ];

  return (
    <div className="space-y-6">
      
      {/* Salary Impact */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
                <ArrowUpRight className="w-5 h-5 text-emerald-500" />
                Salary Projection
            </h3>
            <div className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-100">
                +${(data.potentialSalary - data.currentSalary).toLocaleString()}
            </div>
        </div>
        
        <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <DynamicBarChart
                layout="vertical"
                data={chartData}
                margin={{ top: 0, right: 30, left: 0, bottom: 0 }}
                barGap={4}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" hide />
                <Tooltip
                  cursor={{ fill: "transparent" }}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #e2e8f0",
                    boxShadow: "none",
                  }}
                  formatter={(value: number) => [`$${value.toLocaleString()}`, ""]}
                />
                <Bar
                  dataKey="Current"
                  fill="#94a3b8" /* slate-400 */
                  radius={[0, 4, 4, 0]}
                  barSize={24}
                  name="Current"
                  label={{ position: "right", fill: "#64748b", fontSize: 11, formatter: (val: any) => `$${(Number(val)/1000).toFixed(0)}k` }}
                />
                <Bar
                  dataKey="Potential"
                  fill="#4f46e5" /* indigo-600 */
                  radius={[0, 4, 4, 0]}
                  barSize={24}
                  name="Potential"
                  label={{ position: "right", fill: "#4f46e5", fontWeight: "bold", fontSize: 11, formatter: (val: any) => `$${(Number(val)/1000).toFixed(0)}k` }}
                />
              </DynamicBarChart>
            </ResponsiveContainer>
        </div>
      </div>
      
      {/* Radar Chart */}
      {radarData && radarData.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6">
           <div className="flex items-center gap-2 mb-4">
               <RadarIcon className="w-5 h-5 text-indigo-500" />
               <h3 className="font-bold text-slate-900">Skill Profile</h3>
           </div>
           
           <div className="h-[240px] w-full">
               <ResponsiveContainer width="100%" height="100%">
                  <DynamicRadarChart cx="50%" cy="50%" outerRadius="75%" data={radarData}>
                     <PolarGrid stroke="#e2e8f0" strokeDasharray="3 3" />
                     <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 10, fontWeight: 500 }} />
                     <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                     <Radar
                        name="Current"
                        dataKey="A"
                        stroke="#94a3b8"
                        strokeWidth={2}
                        fill="#94a3b8"
                        fillOpacity={0.2}
                     />
                     <Radar
                        name="Projected"
                        dataKey="B"
                        stroke="#4f46e5"
                        strokeWidth={2}
                        fill="#4f46e5"
                        fillOpacity={0.4}
                     />
                     <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} iconType="circle" />
                     <Tooltip 
                        contentStyle={{ borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: 'none' }}
                     />
                  </DynamicRadarChart>
               </ResponsiveContainer>
           </div>
        </div>
      )}

      {/* Mini Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
          <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-center">
             <div className="mb-2 text-slate-400">
                 <Clock className="w-5 h-5" />
             </div>
             <h4 className="text-xl font-extrabold text-slate-900">
                <AnimatedCounter value={data.timeToROIWeeks} />w
             </h4>
             <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Time to ROI</p>
          </div>
           <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-center">
             <div className="mb-2 text-slate-400">
                 <Target className="w-5 h-5" />
             </div>
             <h4 className="text-xl font-extrabold text-slate-900">
                +<AnimatedCounter value={data.potentialEmployability - data.currentEmployability} />%
             </h4>
             <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Employability</p>
          </div>
      </div>
    </div>
  );
}
