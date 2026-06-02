"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Briefcase, 
  TrendingUp, 
  DollarSign, 
  ArrowUpRight,
  Globe,
  Building2,
  Search,
  ArrowLeft,
  MapPin,
  CheckCircle2,
  XCircle,
  Clock,
  Zap,
  BarChart3,
  Target,
  MoreHorizontal
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell
} from "recharts";

const marketStats = {
    avgSalary: "$125,000",
    salaryGrowth: "+8.5%",
    openRoles: "14,203",
    topSkill: "React.js"
};

const topCompanies = [
    { name: "TechCorp", roles: 12, logo: "TC", industry: "SaaS", color: "bg-blue-100 text-blue-600" },
    { name: "InnovateInc", roles: 8, logo: "II", industry: "FinTech", color: "bg-purple-100 text-purple-600" },
    { name: "GlobalSol", roles: 15, logo: "GS", industry: "Enterprise", color: "bg-orange-100 text-orange-600" },
    { name: "DataFlow", roles: 5, logo: "DF", industry: "AI/ML", color: "bg-emerald-100 text-emerald-600" },
];

const hotSkills = [
    { name: "TypeScript", demand: "Very High", growth: "+22%", yours: true },
    { name: "Next.js", demand: "High", growth: "+18%", yours: true },
    { name: "AWS", demand: "High", growth: "+15%", yours: false },
    { name: "GraphQL", demand: "Medium", growth: "+8%", yours: false },
    { name: "Docker", demand: "High", growth: "+12%", yours: true },
    { name: "Python", demand: "Very High", growth: "+20%", yours: false },
];

const salaryData = [
  { month: 'Jan', salary: 118000 },
  { month: 'Feb', salary: 119500 },
  { month: 'Mar', salary: 119000 },
  { month: 'Apr', salary: 121000 },
  { month: 'May', salary: 122500 },
  { month: 'Jun', salary: 125000 },
];

const roleDemandData = [
  { name: 'Jan', roles: 12400 },
  { name: 'Feb', roles: 13100 },
  { name: 'Mar', roles: 12900 },
  { name: 'Apr', roles: 13500 },
  { name: 'May', roles: 14203 },
];

const salaryByLevel = [
    { level: "Junior", range: "$65k - $85k", avg: 75000, years: "0-2 yrs" },
    { level: "Mid-Level", range: "$90k - $120k", avg: 105000, years: "3-5 yrs" },
    { level: "Senior", range: "$125k - $160k", avg: 142000, years: "5-8 yrs", current: true },
    { level: "Lead/Staff", range: "$165k - $200k", avg: 182000, years: "8+ yrs" },
];

const topLocations = [
    { city: "San Francisco", salary: "$165k", demand: "Very High", remote: "40%" },
    { city: "New York", salary: "$155k", demand: "High", remote: "35%" },
    { city: "Austin", salary: "$130k", demand: "High", remote: "50%" },
    { city: "Seattle", salary: "$150k", demand: "High", remote: "45%" },
];

const recentJobs = [
    { title: "Senior Frontend Engineer", company: "Stripe", location: "Remote", salary: "$180k - $220k", posted: "2h ago", tags: ["React", "TypeScript"] },
    { title: "Staff Software Engineer", company: "Airbnb", location: "San Francisco", salary: "$200k - $280k", posted: "5h ago", tags: ["React", "Node.js"] },
    { title: "Full Stack Developer", company: "Shopify", location: "Remote", salary: "$140k - $180k", posted: "1d ago", tags: ["Next.js", "GraphQL"] },
];

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08
    }
  }
} as const;

const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 50, damping: 20 } }
};

interface CustomTooltipProps {
  active?: boolean;
  payload?: { value: number }[];
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl shadow-xl">
        <p className="text-slate-300 text-xs mb-1">{label}</p>
        <p className="text-white font-bold text-sm">
          ${payload[0].value.toLocaleString()}
        </p>
      </div>
    );
  }
  return null;
};

export default function JobMarketPulsePage() {
  const userSkillsCount = hotSkills.filter(s => s.yours).length;
  const totalSkills = hotSkills.length;
  const [hoveredRole, setHoveredRole] = useState<number | null>(null);

  return (
    <main className="min-h-screen bg-slate-50 relative overflow-x-hidden">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none z-0">
          <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-indigo-200/20 rounded-full blur-[100px] mix-blend-multiply animate-pulse"></div>
          <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-emerald-100/40 rounded-full blur-[100px] mix-blend-multiply animate-pulse" style={{ animationDelay: '1s' }}></div>
          <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-[0.03]"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8 relative z-10">
        
       {/* Header */}
       <div className="space-y-6">
           <Link 
             href="/dashboard" 
             className="inline-flex items-center text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors group"
           >
               <div className="p-1.5 rounded-lg bg-white/80 backdrop-blur-sm border border-slate-200 mr-2 group-hover:border-indigo-200 transition-all shadow-sm">
                  <ArrowLeft className="w-4 h-4" />
               </div>
               Back to Dashboard
           </Link>
           
           <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
               <div className="space-y-2 max-w-2xl">
                   <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-xs font-bold uppercase tracking-wider">
                      <Globe className="w-3.5 h-3.5" />
                      Live Market Data
                   </div>
                   <h1 className="text-4xl md:text-5xl font-extrabold text-slate-900 tracking-tight">
                      Market <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 via-indigo-500 to-cyan-500">Pulse</span>
                   </h1>
                   <p className="text-slate-500 text-lg">
                      Real-time insights on salaries, hiring trends, and in-demand skills.
                   </p>
               </div>
               <div className="flex items-center text-sm text-slate-600 gap-2 bg-white/80 backdrop-blur-md px-4 py-2 rounded-full border border-slate-200 shadow-sm">
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    Last updated: Just now
               </div>
           </div>
        </div>

        {/* Bento Grid Layout */}
        <motion.div 
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 md:grid-cols-12 gap-6"
        >
            
            {/* Main Stats - Chart Card */}
            <motion.div 
                variants={item} 
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
                className="md:col-span-8 bg-slate-900 rounded-[2rem] p-8 text-white relative overflow-hidden group shadow-2xl"
            >
                {/* Decorative Elements */}
                 <div className="absolute top-0 right-0 w-96 h-96 bg-indigo-500/20 rounded-full blur-3xl translate-x-1/3 -translate-y-1/3 group-hover:bg-indigo-500/30 transition-colors duration-700"></div>
                 <div className="absolute bottom-0 left-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl -translate-x-1/3 translate-y-1/3"></div>

                <div className="flex flex-col h-full justify-between relative z-10">
                    <div className="flex items-center justify-between mb-8">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-white/10 backdrop-blur-md rounded-xl border border-white/10 shadow-inner">
                                <Briefcase className="w-5 h-5 text-emerald-400" />
                            </div>
                            <div>
                                <span className="text-slate-300 font-medium block">Senior Developer Salary</span>
                                <span className="text-xs text-slate-400">Average base pay</span>
                            </div>
                        </div>
                        <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 backdrop-blur-sm">Top 10% Market</Badge>
                    </div>
                    
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-end">
                        <div>
                             <div className="flex items-baseline gap-3 mb-2">
                                <h2 className="text-6xl font-extrabold tracking-tight text-white">{marketStats.avgSalary}</h2>
                            </div>
                            <div className="flex items-center gap-2 text-emerald-400 font-medium mb-6">
                                <ArrowUpRight className="w-4 h-4" /> 
                                {marketStats.salaryGrowth} <span className="text-slate-400 font-normal">vs last month</span>
                            </div>
                            <div className="flex gap-4">
                                <Button size="sm" className="bg-white/10 border-white/10 hover:bg-white/20 text-white backdrop-blur-sm border">View History</Button>
                                <Button size="sm" variant="ghost" className="text-indigo-300 hover:text-white hover:bg-white/5">Details</Button>
                            </div>
                        </div>
                        
                        <div className="h-[180px] w-full mt-4 lg:mt-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={salaryData}>
                                <defs>
                                    <linearGradient id="colorSalary" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                                <Area type="monotone" dataKey="salary" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorSalary)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Hiring Volume */}
            <motion.div 
                variants={item}
                whileHover={{ y: -5, transition: { duration: 0.2 } }}
                className="md:col-span-4 bg-white border border-slate-200/60 rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 hover:shadow-2xl hover:shadow-slate-200/60 transition-all relative overflow-hidden"
            >
                 <div className="absolute top-0 right-0 w-32 h-32 bg-blue-50/50 rounded-full blur-3xl -mr-10 -mt-10"></div>
                 
                 <div className="relative z-10 flex flex-col h-full justify-between">
                     <div>
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-3">
                                <div className="p-2.5 bg-blue-50 rounded-xl border border-blue-100">
                                    <Search className="w-5 h-5 text-blue-600" />
                                </div>
                                <span className="font-bold text-slate-700">Open Roles</span>
                            </div>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400 hover:text-indigo-600"><MoreHorizontal className="w-4 h-4" /></Button>
                        </div>
                        <h3 className="text-4xl font-extrabold text-slate-900 mb-1 tracking-tight">{marketStats.openRoles}</h3>
                        <p className="text-slate-500 text-sm font-medium">Remote & Hybrid</p>
                     </div>
                     
                     <div className="h-[120px] w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={roleDemandData}>
                                <Tooltip 
                                    cursor={{fill: 'transparent'}}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                        return (
                                            <div className="bg-slate-900 text-white text-xs py-1 px-2 rounded-lg shadow-lg">
                                            {payload[0].value?.toLocaleString()}
                                            </div>
                                        );
                                        }
                                        return null;
                                    }}
                                />
                                <Bar dataKey="roles" radius={[4, 4, 0, 0]}>
                                    {roleDemandData.map((entry, index) => (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            fill={hoveredRole === index ? '#065292' : '#cbd5e1'} 
                                            className="transition-all duration-300"
                                            onMouseEnter={() => setHoveredRole(index)}
                                            onMouseLeave={() => setHoveredRole(null)}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                     </div>
                 </div>
            </motion.div>

            {/* Trending Skills - Grid */}
            <motion.div variants={item} className="md:col-span-8 bg-white/60 backdrop-blur-xl border border-slate-200/60 rounded-[2rem] p-8 shadow-sm">
                 <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-rose-50 rounded-xl border border-rose-100">
                            <TrendingUp className="w-5 h-5 text-rose-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">Trending Skills</h3>
                            <p className="text-sm text-slate-500">High demand technologies in your sector</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-xl border border-slate-100 shadow-sm">
                        <span className="text-xs font-medium text-slate-500">Match Rate</span>
                        <div className="flex items-center gap-2">
                            <div className="h-2 w-24 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-gradient-to-r from-indigo-500 to-violet-500" style={{ width: `${(userSkillsCount/totalSkills)*100}%` }}></div>
                            </div>
                            <span className="text-sm font-bold text-indigo-600">{Math.round((userSkillsCount/totalSkills)*100)}%</span>
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {hotSkills.map((skill, i) => (
                        <motion.div 
                            key={i} 
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            className={`group cursor-pointer p-4 rounded-2xl border transition-all duration-300 ${skill.yours ? 'bg-indigo-50/40 border-indigo-100/50 hover:border-indigo-200 hover:shadow-lg hover:shadow-indigo-100' : 'bg-white border-slate-100 hover:border-slate-300 hover:shadow-lg'}`}
                        >
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="font-bold text-slate-900 group-hover:text-indigo-700 transition-colors">{skill.name}</span>
                                </div>
                                {skill.yours ? (
                                    <CheckCircle2 className="w-5 h-5 text-emerald-500 bg-emerald-50 rounded-full" />
                                ) : (
                                    <XCircle className="w-5 h-5 text-slate-300 group-hover:text-rose-400 transition-colors" />
                                )}
                            </div>
                            <div className="flex items-center justify-between">
                                <Badge variant="secondary" className="bg-slate-100/80 text-slate-600 font-normal border-0 text-[10px]">{skill.demand}</Badge>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded-md ${skill.yours ? 'bg-white text-emerald-600 shadow-sm' : 'bg-emerald-50 text-emerald-600'}`}>
                                    {skill.growth}
                                </span>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </motion.div>

             {/* Career Ladder Vertical */}
            <motion.div variants={item} className="md:col-span-4 bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm flex flex-col">
                 <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-violet-50 rounded-xl border border-violet-100">
                        <Target className="w-5 h-5 text-violet-600" />
                    </div>
                    <div>
                        <h3 className="font-bold text-slate-900">Career Path</h3>
                        <p className="text-xs text-slate-500">Salary progression</p>
                    </div>
                </div>
                
                <div className="space-y-6 flex-1 flex flex-col justify-center">
                    {salaryByLevel.map((item, i) => (
                        <div key={i} className="relative pl-4 group">
                             {/* Connector Line */}
                             {i !== salaryByLevel.length - 1 && (
                                 <div className="absolute left-[5px] top-6 bottom-[-24px] w-[2px] bg-slate-100 group-hover:bg-indigo-100 transition-colors"></div>
                             )}
                             
                             <div className={`absolute left-0 top-1.5 w-2.5 h-2.5 rounded-full border-2 ${item.current ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-slate-300 group-hover:border-indigo-300'} transition-colors z-10`}></div>

                             <div className="flex justify-between items-center mb-1">
                                <span className={`text-sm font-bold ${item.current ? 'text-indigo-600' : 'text-slate-600'}`}>{item.level}</span>
                                <span className="text-sm font-bold text-slate-900">{item.range}</span>
                             </div>
                             
                             {item.current && (
                                <motion.div 
                                    layoutId="currentLevel"
                                    className="absolute -right-2 -top-2"
                                >
                                    <Badge className="bg-indigo-600 text-white border-0 text-[10px] shadow-lg shadow-indigo-500/30">You</Badge>
                                </motion.div>
                             )}
                             <p className="text-xs text-slate-400">{item.years}</p>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Sidebar like Cards (Companies & Locations) */}
            <motion.div variants={item} className="md:col-span-4 space-y-6">
                
                {/* Companies */}
                <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <Building2 className="w-5 h-5 text-indigo-600" />
                            <h3 className="font-bold text-slate-900">Top Hiring</h3>
                        </div>
                        <Button variant="link" className="text-indigo-600 p-0 h-auto text-xs font-semibold">View All</Button>
                    </div>
                    <div className="space-y-3">
                         {topCompanies.map((company, i) => (
                            <Link href="#" key={i} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 border border-transparent hover:border-slate-100 transition-all group">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold transition-transform group-hover:scale-110 ${company.color}`}>
                                        {company.logo}
                                    </div>
                                    <div>
                                        <span className="font-bold text-slate-700 block text-sm group-hover:text-indigo-700 transition-colors">{company.name}</span>
                                        <span className="text-[10px] text-slate-400 uppercase tracking-wide">{company.industry}</span>
                                    </div>
                                </div>
                                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded-full group-hover:bg-white group-hover:shadow-sm transition-all">{company.roles} roles</span>
                            </Link>
                        ))}
                    </div>
                </div>

                {/* Locations */}
                <div className="bg-white border border-slate-200 rounded-[2rem] p-6 shadow-sm">
                    <div className="flex items-center gap-2 mb-6">
                        <MapPin className="w-5 h-5 text-rose-500" />
                        <h3 className="font-bold text-slate-900">Hot Spots</h3>
                    </div>
                     <div className="space-y-4">
                         {topLocations.map((loc, i) => (
                            <div key={i} className="flex items-center justify-between text-sm group cursor-pointer">
                                <div className="flex items-center gap-3">
                                    <span className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-rose-500 transition-colors"></span>
                                    <span className="font-medium text-slate-600 group-hover:text-slate-900 transition-colors">{loc.city}</span>
                                </div>
                                <Badge variant="outline" className="text-xs font-normal border-slate-200 group-hover:border-rose-200 group-hover:bg-rose-50 group-hover:text-rose-600 transition-all">{loc.salary}</Badge>
                            </div>
                        ))}
                    </div>
                </div>
            </motion.div>

            {/* Recent Jobs - Wide */}
            <motion.div variants={item} className="md:col-span-8 bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
                 <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-cyan-50 rounded-xl border border-cyan-100">
                            <Briefcase className="w-5 h-5 text-cyan-600" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-900">Recent Opportunities</h3>
                            <p className="text-sm text-slate-500">Curated specifically for your profile</p>
                        </div>
                    </div>
                    <Button variant="ghost" className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50">View All Jobs</Button>
                </div>

                <div className="space-y-4">
                    {recentJobs.map((job, i) => (
                        <div key={i} className="group p-6 rounded-3xl border border-dotted border-slate-200 hover:border-solid hover:border-indigo-200 hover:bg-indigo-50/20 hover:shadow-lg hover:shadow-indigo-50/50 transition-all cursor-pointer bg-white">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="space-y-2">
                                    <h4 className="font-bold text-slate-900 text-lg group-hover:text-indigo-600 transition-colors">{job.title}</h4>
                                    <div className="flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                        <span className="flex items-center gap-1.5 font-medium"><Building2 className="w-3.5 h-3.5 text-slate-400" /> {job.company}</span>
                                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                        <span className="flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-slate-400" /> {job.location}</span>
                                        <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                                        <span className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-slate-400" /> {job.posted}</span>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between sm:justify-end gap-6">
                                    <div className="text-right">
                                        <span className="block font-bold text-slate-900 text-lg">{job.salary}</span>
                                        <div className="flex gap-2 justify-end mt-2">
                                             {job.tags.map((tag, j) => (
                                                <span key={j} className="text-[10px] px-2 py-0.5 bg-slate-100 border border-slate-200 rounded-full text-slate-600 font-medium group-hover:bg-white group-hover:border-indigo-100 group-hover:text-indigo-600 transition-all">{tag}</span>
                                            ))}
                                        </div>
                                    </div>
                                    <div className="h-10 w-10 rounded-full bg-slate-50 border border-slate-200 flex items-center justify-center group-hover:bg-indigo-600 group-hover:border-indigo-600 group-hover:text-white transition-all shadow-sm">
                                        <ArrowUpRight className="w-5 h-5" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </motion.div>

            {/* Quick Action - CTA */}
             <motion.div variants={item} className="md:col-span-12 relative overflow-hidden rounded-[2.5rem] shadow-2xl shadow-indigo-500/30">
                <div className="absolute inset-0 bg-gradient-to-r from-violet-600 via-indigo-600 to-blue-600"></div>
                <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20"></div>
                {/* Abstract shapes */}
                <div className="absolute top-0 right-0 w-[400px] h-[400px] bg-white/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
                <div className="absolute bottom-0 left-0 w-[300px] h-[300px] bg-black/10 rounded-full blur-2xl translate-y-1/3 -translate-x-1/4"></div>

                <div className="relative z-10 p-10 md:p-14 text-center space-y-8">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/10 border border-white/20 text-white text-sm font-medium backdrop-blur-md shadow-lg">
                        <Zap className="w-4 h-4 text-amber-300 fill-amber-300" />
                        <span>Accelerate your growth</span>
                    </div>
                    
                    <div className="max-w-3xl mx-auto space-y-4">
                        <h2 className="text-4xl md:text-5xl font-extrabold tracking-tight text-white leading-tight">
                            Ready to unlock your <br/>
                            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-200 to-white">full earning potential?</span>
                        </h2>
                        <p className="text-indigo-100 text-xl font-medium leading-relaxed max-w-2xl mx-auto">
                            Take our advanced skill assessment to validate your profile and unlock premium salary insights tailored to your expertise.
                        </p>
                    </div>

                    <div className="flex flex-col sm:flex-row justify-center gap-4 pt-4">
                        <Button size="lg" className="h-14 px-10 bg-white text-indigo-600 hover:bg-indigo-50 border-0 font-bold text-lg rounded-2xl shadow-xl hover:scale-105 transition-transform">
                            Start Skill Assessment
                        </Button>
                        <Button size="lg" variant="outline" className="h-14 px-10 border-2 border-white/30 text-white bg-transparent hover:bg-white/10 hover:text-white hover:border-white rounded-2xl font-bold text-lg backdrop-blur-sm">
                            View Learning Gaps
                        </Button>
                    </div>
                </div>
             </motion.div>

        </motion.div>
      </div>
    </main>
  );
}
