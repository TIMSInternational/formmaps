// Mock data that will be replaced with API calls later
export const dashboardData = {
  user: {
    name: "John Doe",
    avatar: "/api/placeholder/32/32",
  },

  competencyPlan: {
    title: "Competency Profit & Development Plan",
    date: "Tue, 14 Nov, 2022, 11:30 AM",
    categories: [
      { name: "Leadership", percentage: 54, color: "#3B82F6", trend: "up" },
      {
        name: "PCA/LIA/Interest",
        percentage: 20,
        color: "#10B981",
        trend: "up",
      },
      { name: "Thinking", percentage: 26, color: "#EF4444", trend: "down" },
      {
        name: "Technical Analytics",
        percentage: 28,
        color: "#8B5CF6",
        trend: "down",
      },
      { name: "Thinking", percentage: 26, color: "#F59E0B", trend: "down" },
    ],
  },

  actionCards: [
    {
      id: 1,
      title: "dashboard.startAssessment",
      subtitle: "dashboard.completeEvaluations",
      icon: "🧠",
      action: "dashboard.beginAssessment",
      link: "/dashboard/assessments",
      variant: "primary",
      badge: "dashboard.recommended",
    },
    {
      id: 2,
      title: "dashboard.startCourse",
      subtitle: "dashboard.goToCatalog",
      icon: "📚",
      action: "dashboard.browseCourses",
      link: "/dashboard/learning/courses",
      variant: "secondary",
    },
    {
      id: 3,
      title: "dashboard.buildResume",
      subtitle: "dashboard.createWithAI",
      icon: "📄",
      action: "dashboard.startBuilding",
      link: "/dashboard/resumes",
      variant: "secondary",
      badge: "dashboard.withAI",
    },
    {
      id: 4,
      title: "dashboard.scheduleCoaching",
      subtitle: "dashboard.bookSession",
      icon: "👥",
      action: "dashboard.bookSession",
      link: "/dashboard/book-coach",
      variant: "secondary",
    },
  ],

  opportunities: [
    {
      id: "01",
      catNo: "6465",
      driver: {
        name: "Sr. software developer",
        avatar: "/api/placeholder/32/32",
      },
      status: "Completed",
      statusColor: "green",
      rating: 5,
    },
    {
      id: "02",
      catNo: "5665",
      driver: {
        name: "Database Engineer",
        avatar: "/api/placeholder/32/32",
      },
      status: "Pending",
      statusColor: "blue",
      rating: 4,
    },
    {
      id: "03",
      catNo: "1755",
      driver: {
        name: "Network Engineer",
        avatar: "/api/placeholder/32/32",
      },
      status: "In route",
      statusColor: "red",
      rating: 5,
    },
  ],

  careerMatches: [
    {
      id: 1,
      title: "Sr. Software developer",
      company: "Creative Design Labs",
      progress: 85,
      icon: "💻",
    },
    {
      id: 2,
      title: "Python Text to speech",
      company: "Microsoft",
      progress: 70,
      icon: "🐍",
    },
    {
      id: 3,
      title: "Database Engineer",
      company: "Softwire Inc.",
      progress: 65,
      icon: "🗄️",
    },
  ],

  benchmarks: {
    currentValue: 9460.0,
    change: -1.5,
    comparison: 9940,
    lastWeekIncome: 25658.0,
  },

  milestones: {
    current: 9,
    total: 20,
    progress: 45, // percentage
    skills: [
      { name: "AI", color: "#3B82F6" },
      { name: "CurriDRAW", color: "#10B981" },
      { name: "InDesign", color: "#8B5CF6" },
      { name: "Canva", color: "#F59E0B" },
    ],
  },

  activity: {
    timeRange: "Mar 2022 - Oct 2022",
    data: [
      { month: "May", value: 240 },
      { month: "Jun", value: 180 },
      { month: "Jul", value: 280 },
      { month: "Aug", value: 220 },
      { month: "Sep", value: 260 },
      { month: "Oct", value: 200 },
    ],
    maxValue: 300,
  },
};

export const sidebarData = {
  logo: {
    icon: "N",
    text: "Nexa Univ",
  },

  navigation: [
    {
      id: "dashboard",
      name: "nav.dashboard",
      icon: "dashboard",
      path: "/dashboard",
    },
    {
      id: "assessments",
      name: "dashboard.assessments",
      icon: "assessments",
      path: "/dashboard/assessments",
      submenu: [
        { name: "common.overview", path: "/dashboard/assessments" },
        { name: "dashboard.pcaAssessment", path: "/dashboard/assessments/pca" },
        { name: "dashboard.liaAssessment", path: "/dashboard/assessments/mil" },
        {
          name: "dashboard.evaluationTitle",
          path: "/dashboard/assessments/evaluation",
        },
        { name: "dashboard.timeline", path: "/dashboard/timeline" },
      ],
    },
    {
      id: "career-planning",
      name: "nav.careerEducation",
      icon: "career",
      path: "#",
      submenu: [
        {
          name: "dashboard.careerPathsExplorer",
          path: "/dashboard/career-paths",
        },
        {
          name: "dashboard.universitySuggestions",
          path: "/dashboard/university",
        },
        // { name: "dashboard.jobMarketPulse", path: "/dashboard/career/market" },
      ],
    },
    // {
    //   id: "benchmarks",
    //   name: "nav.benchmarks",
    //   icon: "analytics",
    //   path: "/dashboard/benchmarks",
    //   submenu: [
    //     { name: "benchmarks.header.title", path: "/dashboard/benchmarks/overview" },
    //     { name: "benchmarks.compensationTitle", path: "/dashboard/benchmarks/compensation" },
    //     { name: "benchmarks.market", path: "/dashboard/benchmarks/market" },
    //     { name: "benchmarks.skills.title", path: "/dashboard/benchmarks/skills" },
    //     { name: "benchmarks.demographics.title", path: "/dashboard/benchmarks/demographics" },
    //   ],
    // },
    {
      id: "learning",
      name: "nav.learning",
      icon: "learning",
      path: "/dashboard/learning",
      submenu: [
        { name: "dashboard.courses", path: "/dashboard/learning/courses" },
        // { name: "dashboard.smartGaps", path: "/dashboard/learning/gaps" },
        {
          name: "dashboard.certifications",
          path: "/dashboard/learning/certifications",
        },
        { name: "dashboard.progress", path: "/dashboard/progress" },
      ],
    },
    {
      id: "resumes",
      name: "dashboard.resumeBuilder",
      icon: "analytics",
      path: "/dashboard/resumes",
    },
    {
      id: "portfolio",
      name: "dashboard.portfolio",
      icon: "assessments",
      path: "/dashboard/portfolio",
    },
    {
      id: "course-plan",
      name: "dashboard.coursePlan",
      icon: "learning",
      path: "/dashboard/course-plan",
    },
    // {
    //   id: "graduation",
    //   name: "dashboard.graduation",
    //   icon: "career",
    //   path: "#",
    //   submenu: [
    //     {
    //       name: "dashboard.communityService",
    //       path: "/dashboard/community-service",
    //     },
    //   ],
    // },
    {
      id: "sessions",
      name: "Counseling & Coaching",
      icon: "opportunities",
      path: "/dashboard/my-sessions",
      submenu: [
        { name: "My Sessions", path: "/dashboard/my-sessions" },
        { name: "Book Counselor Session", path: "/dashboard/book-counselor" },
        { name: "Find Coach", path: "/dashboard/book-coach" },
      ],
    },
    // {
    //   id: "transactions",
    //   name: "nav.transactions",
    //   icon: "transactions",
    //   path: "/dashboard/transactions",
    // },
    {
      id: "subscriptions",
      name: "dashboard.subscriptions",
      icon: "subscriptions",
      path: "/dashboard/subscriptions",
    },
  ],
};

export const coachSidebarData = {
  logo: {
    icon: "V",
    text: "UNIV.365",
  },

  navigation: [
    {
      id: "dashboard",
      name: "nav.dashboard",
      icon: "dashboard",
      path: "/dashboard",
    },
    {
      id: "sessions",
      name: "nav.sessions",
      icon: "opportunities",
      path: "/dashboard/coaching/sessions",
    },
    {
      id: "schedule",
      name: "nav.schedule",
      icon: "calendar",
      path: "/dashboard/coaching/schedule",
    },
    {
      id: "analytics",
      name: "nav.analytics",
      icon: "analytics",
      path: "/dashboard/coaching/analytics",
    },
    {
      id: "earnings",
      name: "nav.earnings",
      icon: "subscriptions",
      path: "/dashboard/coaching/earnings",
    },
    {
      id: "settings",
      name: "nav.settings",
      icon: "assessments",
      path: "/dashboard/coaching/settings",
    },
    {
      id: "profile",
      name: "nav.profile",
      icon: "career",
      path: "/dashboard/coaching/profile",
    },
  ],
};

export const adminSidebarData = {
  logo: {
    icon: "V",
    text: "UNIV.365",
  },

  navigation: [
    {
      id: "dashboard",
      name: "nav.dashboard",
      icon: "dashboard",
      path: "/dashboard/admin",
    },
    {
      id: "analytics",
      name: "nav.analytics",
      icon: "analytics",
      path: "/dashboard/admin/analytics",
    },
    {
      id: "users",
      name: "nav.users",
      icon: "people",
      path: "/dashboard/admin/users",
    },
    {
      id: "coaches",
      name: "nav.coaches",
      icon: "opportunities",
      path: "/dashboard/admin/coaches",
    },
    {
      id: "schools",
      name: "nav.schools",
      icon: "learning",
      path: "/dashboard/admin/schools",
    },
    {
      id: "courses",
      name: "nav.courses",
      icon: "learning",
      path: "/dashboard/admin/courses",
    },
    {
      id: "careers",
      name: "nav.careers",
      icon: "career",
      path: "/dashboard/admin/careers",
    },
    {
      id: "questions",
      name: "nav.questions",
      icon: "assessments",
      path: "/dashboard/admin/questions",
    },
    {
      id: "plans",
      name: "nav.plans",
      icon: "subscriptions",
      path: "/dashboard/admin/plans",
    },
    {
      id: "transactions",
      name: "nav.transactions",
      icon: "subscriptions",
      path: "/dashboard/admin/transactions",
    },
    {
      id: "payouts",
      name: "nav.payouts",
      icon: "subscriptions",
      path: "/dashboard/admin/payouts",
    },
    {
      id: "settings",
      name: "nav.settings",
      icon: "settings",
      path: "/dashboard/admin/settings",
    },
  ],
};
