import { User, Briefcase, GraduationCap, Zap, ClipboardCheck, Target, Code, Palette, TrendingUp, Heart, Gavel, Wrench, Users } from 'lucide-react';

// Career field definitions with associated templates and content
export const careerFields = [
  {
    id: 'technology',
    name: 'Technology & Software',
    description: 'Software development, IT, cybersecurity, data science',
    icon: Code,
    color: '#065292',
    templates: ['modern', 'minimal'],
    skills: {
      technical: ['JavaScript', 'Python', 'React', 'Node.js', 'SQL', 'Git', 'AWS', 'Docker'],
      soft: ['Problem Solving', 'Team Collaboration', 'Agile Methodology', 'Code Review']
    }
  },
  {
    id: 'design',
    name: 'Design & Creative',
    description: 'UI/UX design, graphic design, creative direction',
    icon: Palette,
    color: '#8b5cf6',
    templates: ['creative', 'modern'],
    skills: {
      technical: ['Figma', 'Adobe Creative Suite', 'Sketch', 'Prototyping', 'HTML/CSS', 'Design Systems'],
      soft: ['Creative Thinking', 'User Empathy', 'Visual Communication', 'Attention to Detail']
    }
  },
  {
    id: 'business',
    name: 'Business & Management',
    description: 'Project management, business analysis, consulting',
    icon: TrendingUp,
    color: '#10b981',
    templates: ['classic', 'modern'],
    skills: {
      technical: ['Microsoft Project', 'Salesforce', 'Data Analysis', 'Financial Modeling', 'Agile/Scrum'],
      soft: ['Leadership', 'Strategic Planning', 'Communication', 'Problem Solving', 'Team Management']
    }
  },
  {
    id: 'healthcare',
    name: 'Healthcare & Medical',
    description: 'Medical professionals, healthcare administration',
    icon: Heart,
    color: '#ef4444',
    templates: ['classic', 'minimal'],
    skills: {
      technical: ['Electronic Health Records', 'Medical Terminology', 'HIPAA Compliance', 'Clinical Research'],
      soft: ['Patient Care', 'Empathy', 'Attention to Detail', 'Critical Thinking', 'Communication']
    }
  },
  {
    id: 'legal',
    name: 'Legal & Law',
    description: 'Attorneys, paralegals, legal assistants',
    icon: Gavel,
    color: '#374151',
    templates: ['classic', 'modern'],
    skills: {
      technical: ['Legal Research', 'Case Management Software', 'Document Review', 'Contract Analysis'],
      soft: ['Analytical Thinking', 'Attention to Detail', 'Written Communication', 'Client Relations']
    }
  },
  {
    id: 'engineering',
    name: 'Engineering & Technical',
    description: 'Mechanical, electrical, civil engineering',
    icon: Wrench,
    color: '#f59e0b',
    templates: ['modern', 'classic'],
    skills: {
      technical: ['AutoCAD', 'SolidWorks', 'MATLAB', 'Project Management', 'Quality Assurance'],
      soft: ['Problem Solving', 'Analytical Thinking', 'Attention to Detail', 'Team Collaboration']
    }
  },
  {
    id: 'marketing',
    name: 'Marketing & Sales',
    description: 'Digital marketing, sales, brand management',
    icon: Users,
    color: '#ec4899',
    templates: ['creative', 'modern'],
    skills: {
      technical: ['Google Analytics', 'Social Media Marketing', 'SEO/SEM', 'CRM Software', 'Content Management'],
      soft: ['Communication', 'Creativity', 'Relationship Building', 'Strategic Thinking', 'Adaptability']
    }
  },
  {
    id: 'general',
    name: 'General / Other',
    description: 'Other fields or multiple career paths',
    icon: Target,
    color: '#6b7280',
    templates: ['modern', 'classic', 'minimal', 'creative'],
    skills: {
      technical: ['Microsoft Office', 'Data Entry', 'Customer Service Software', 'Basic Computer Skills'],
      soft: ['Communication', 'Time Management', 'Adaptability', 'Problem Solving', 'Team Work']
    }
  }
];

// Resume builder step configuration
export const resumeSteps = [
  {
    id: 1,
    title: "Career Field",
    description: "Select your career field for personalized templates and content",
    icon: Target,
    fields: ["careerField"]
  },
  {
    id: 2,
    title: "Choose Template",
    description: "Select a professional template that matches your style",
    icon: Palette,
    fields: ["template"]
  },
  {
    id: 3,
    title: "Personal Information",
    description: "Add your contact details and professional summary",
    icon: User,
    fields: ["fullName", "email", "phone", "location", "linkedin", "website", "summary"]
  },
  {
    id: 4,
    title: "Work Experience",
    description: "Add your professional experience and achievements (optional for freshers)",
    icon: Briefcase,
    fields: ["experience"]
  },
  {
    id: 5,
    title: "Education",
    description: "Add your educational background",
    icon: GraduationCap,
    fields: ["education"]
  },
  {
    id: 6,
    title: "Skills",
    description: "Highlight your technical and soft skills",
    icon: Zap,
    fields: ["skills"]
  },
  {
    id: 7,
    title: "Summary",
    description: "Review your completed resume",
    icon: ClipboardCheck,
    fields: ["summary"]
  }
];

// Template options
export const resumeTemplates = [
  {
    id: "modern",
    name: "Modern Professional",
    description: "Clean, professional design with modern typography and subtle colors",
    preview: "/templates/modern-preview.jpg",
    color: "#065292",
    category: "professional",
    suitableFor: ["technology", "business", "engineering", "general"]
  },
  {
    id: "classic",
    name: "Classic Traditional",
    description: "Traditional format preferred by recruiters and conservative industries",
    preview: "/templates/classic-preview.jpg",
    color: "#374151",
    category: "traditional",
    suitableFor: ["legal", "healthcare", "business", "general"]
  },
  {
    id: "creative",
    name: "Creative Bold",
    description: "Stand out with a unique, creative layout perfect for design roles",
    preview: "/templates/creative-preview.jpg",
    color: "#8b5cf6",
    category: "creative",
    suitableFor: ["design", "marketing", "general"]
  },
  {
    id: "minimal",
    name: "Minimal Clean",
    description: "Simple, clean design that focuses on content with maximum readability",
    preview: "/templates/minimal-preview.jpg",
    color: "#10b981",
    category: "minimal",
    suitableFor: ["technology", "healthcare", "engineering", "general"]
  },
  {
    id: "executive",
    name: "Executive Elite",
    description: "Sophisticated design for senior-level positions and executives",
    preview: "/templates/executive-preview.jpg",
    color: "#1f2937",
    category: "executive",
    suitableFor: ["business", "legal", "general"]
  },
  {
    id: "tech",
    name: "Tech Focused",
    description: "Modern layout optimized for technical roles with skill emphasis",
    preview: "/templates/tech-preview.jpg",
    color: "#0ea5e9",
    category: "technical",
    suitableFor: ["technology", "engineering", "general"]
  }
];

// Sample resume data for the screenshot
export const sampleResumeData = {
  personalInfo: {
    fullName: "Maithili Pathak",
    email: "mapathak1391@gmail.com",
    phone: "+1 (914) 727 6370",
    location: "Texas",
    linkedin: "",
    website: "",
    summary: "Project Manager with over 4 years of experience leading cross-functional teams and driving successful delivery of projects within scope, time, and budget across Agile, Waterfall, and hybrid environments."
  },
  experience: [
    {
      id: "1",
      jobTitle: "Project Manager",
      company: "Freddie Mac",
      location: "USA",
      startDate: "Jan 2024",
      endDate: "Present",
      current: true,
      description: [
        "Managed multi-million-dollar projects using Microsoft Project, Smartsheet, and Jira, enabling real-time tracking of schedules, milestones, and deliverables while improving on-time delivery rates by 30%.",
        "Created comprehensive project documentation, including RACI matrices, detailed project plans, and weekly status reports, improving stakeholder communication and visibility across management chain of phases.",
        "Led risk assessments and implemented mitigation strategies, resulting in a 40% reduction in project delays and issue escalations.",
        "Coordinated cross-functional collaboration with 5+ teams including Slack, Zoom, enhanced team engagement and accelerated issue resolution timelines by 25%.",
        "Maintained QA/QC and QC processes, ensuring smooth transition from testing to deployment while maintaining regulatory and quality standards.",
        "Twisted process flows and technical diagrams with MS Visio and Lucidchart, streamlining communication between business analysts, developers, and QA teams."
      ]
    },
    {
      id: "2", 
      jobTitle: "Project Manager",
      company: "Qualcomm",
      location: "USA",
      startDate: "Jan 2021",
      endDate: "Dec 2023",
      current: false,
      description: [
        "Planned and monitored complex project schedules using Gantt Charts and Critical Path Method (CPM), ensuring efficient resource allocation and on-time delivery of key milestones.",
        "Managed cross-functional initiatives across platforms like Asana, Trello, Basecamp, ClickUp, and Confluence to streamline task assignment, progress tracking, and documentation.",
        "Maintained RAID logs, meeting minutes, statements of work, and change requests, improving audit readiness and strengthening project governance.",
        "Conducted detailed cost-benefit analysis and implemented earned value management (EVM) techniques to control project budgets and track financial performance.",
        "Developed visually compelling presentations in PowerPoint and delivered executive-level reports and insights using Tableau to enhance decision-making.",
        "Drove stakeholder engagement and buy-in through structured communication plans and training coordination, increasing adoption rates of new tools and processes by 40%.",
        "Supported technical deployments and infrastructure-related projects on AWS, aligning cloud strategies with business goals to enhance scalability and operational efficiency."
      ]
    }
  ],
  education: [
    {
      id: "1",
      degree: "Master of Science in Project Management",
      institution: "University of Maryland",
      location: "Maryland",
      graduationDate: "2020",
      gpa: ""
    }
  ],
  skills: [
    {
      id: "1",
      name: "SDLC, Agile, Waterfall, Lean, Six Sigma Basics",
      category: "technical",
      level: "expert"
    },
    {
      id: "2", 
      name: "Project Charter, Work Breakdown Structure, Gantt Charts, Critical Path Method",
      category: "technical",
      level: "expert"
    },
    {
      id: "3",
      name: "Microsoft Project, Smartsheet, Asana, Trello, Basecamp, ClickUp, Confluence",
      category: "technical", 
      level: "advanced"
    }
  ]
};
