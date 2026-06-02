export const marketStats = {
  avgSalary: "$125,000",
  salaryGrowth: "+8.5%",
  openRoles: "14,203",
  topSkill: "React.js"
};

export const topCompanies = [
  { name: "TechCorp", roles: 12, logo: "TC", industry: "SaaS", color: "bg-blue-100 text-blue-600" },
  { name: "InnovateInc", roles: 8, logo: "II", industry: "FinTech", color: "bg-purple-100 text-purple-600" },
  { name: "GlobalSol", roles: 15, logo: "GS", industry: "Enterprise", color: "bg-orange-100 text-orange-600" },
  { name: "DataFlow", roles: 5, logo: "DF", industry: "AI/ML", color: "bg-emerald-100 text-emerald-600" },
];

export const hotSkills = [
  { name: "TypeScript", demand: "Very High", growth: "+22%", yours: true },
  { name: "Next.js", demand: "High", growth: "+18%", yours: true },
  { name: "AWS", demand: "High", growth: "+15%", yours: false },
  { name: "GraphQL", demand: "Medium", growth: "+8%", yours: false },
  { name: "Docker", demand: "High", growth: "+12%", yours: true },
  { name: "Python", demand: "Very High", growth: "+20%", yours: false },
];

export const salaryData = [
  { month: "Jan", salary: 118000 },
  { month: "Feb", salary: 119500 },
  { month: "Mar", salary: 119000 },
  { month: "Apr", salary: 121000 },
  { month: "May", salary: 122500 },
  { month: "Jun", salary: 125000 },
];

export const roleDemandData = [
  { name: "Jan", roles: 12400 },
  { name: "Feb", roles: 13100 },
  { name: "Mar", roles: 12900 },
  { name: "Apr", roles: 13500 },
  { name: "May", roles: 14203 },
];

export const salaryByLevel = [
  { level: "Junior", range: "$65k - $85k", avg: 75000, years: "0-2 yrs", current: false },
  { level: "Mid-Level", range: "$90k - $120k", avg: 105000, years: "3-5 yrs", current: false },
  { level: "Senior", range: "$125k - $160k", avg: 142000, years: "5-8 yrs", current: true },
  { level: "Lead/Staff", range: "$165k - $200k", avg: 182000, years: "8+ yrs", current: false },
];

export const topLocations = [
  { city: "San Francisco", salary: "$165k", demand: "Very High", remote: "40%" },
  { city: "New York", salary: "$155k", demand: "High", remote: "35%" },
  { city: "Austin", salary: "$130k", demand: "High", remote: "50%" },
  { city: "Seattle", salary: "$150k", demand: "High", remote: "45%" },
];

export const recentJobs = [
  { title: "Senior Frontend Engineer", company: "Stripe", location: "Remote", salary: "$180k - $220k", posted: "2h ago", tags: ["React", "TypeScript"] },
  { title: "Staff Software Engineer", company: "Airbnb", location: "San Francisco", salary: "$200k - $280k", posted: "5h ago", tags: ["React", "Node.js"] },
  { title: "Full Stack Developer", company: "Shopify", location: "Remote", salary: "$140k - $180k", posted: "1d ago", tags: ["Next.js", "GraphQL"] },
];

export const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
} as const;

export const item = {
  hidden: { opacity: 0, y: 30 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 50, damping: 20 } },
};
