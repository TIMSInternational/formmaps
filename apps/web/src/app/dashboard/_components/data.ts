export const actionCards = [
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
];

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
      path: "/dashboard/coaching",
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
