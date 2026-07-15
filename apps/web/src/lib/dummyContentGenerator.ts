import { careerFields } from "@/app/dashboard/resume-builder/_components/resumeData";

export interface DummyPersonalInfo {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  website: string;
  summary: string;
}

export interface DummyExperience {
  jobTitle: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string[];
}

export interface DummyEducation {
  degree: string;
  institution: string;
  location: string;
  graduationDate: string;
  gpa?: string;
}

export interface DummySkill {
  name: string;
  category: "technical" | "soft" | "language";
  level: "beginner" | "intermediate" | "advanced" | "expert";
}

export interface DummyContent {
  personalInfo: DummyPersonalInfo;
  experience: DummyExperience[];
  education: DummyEducation[];
  skills: DummySkill[];
}

// Sample names for different demographics
const sampleNames = [
  "Alex Johnson",
  "Jordan Smith",
  "Taylor Brown",
  "Casey Davis",
  "Morgan Wilson",
  "Riley Garcia",
  "Avery Martinez",
  "Quinn Anderson",
  "Sage Thompson",
  "River Lee",
];

// Sample companies by industry
const companiesByField = {
  technology: [
    "TechCorp",
    "InnovateSoft",
    "DataDyne",
    "CloudFirst",
    "DevSolutions",
    "ByteWorks",
  ],
  design: [
    "CreativeStudio",
    "DesignLab",
    "PixelPerfect",
    "ArtisanWorks",
    "VisualCraft",
    "BrandForge",
  ],
  business: [
    "GlobalConsulting",
    "StrategyCorp",
    "BusinessPro",
    "MarketLeaders",
    "GrowthPartners",
    "ExecutiveEdge",
  ],
  healthcare: [
    "MedCenter",
    "HealthFirst",
    "CarePoint",
    "WellnessGroup",
    "MedTech Solutions",
    "LifeCare",
  ],
  legal: [
    "LawFirm Associates",
    "Justice Partners",
    "Legal Solutions",
    "Advocate Group",
    "Counsel Pro",
    "LegalEdge",
  ],
  engineering: [
    "EngineerCorp",
    "TechBuild",
    "InfraSolutions",
    "BuildRight",
    "SystemsEng",
    "StructureWorks",
  ],
  marketing: [
    "BrandBoost",
    "MarketMakers",
    "DigitalEdge",
    "PromoWorks",
    "CampaignCraft",
    "SocialSphere",
  ],
  general: [
    "Professional Services",
    "Business Solutions",
    "ServicePro",
    "WorkForce Inc",
    "CareerPath",
    "OpportunityHub",
  ],
};

// Sample universities
const universities = [
  "State University",
  "Tech Institute",
  "Metropolitan College",
  "Regional University",
  "Community College",
  "Professional Institute",
  "Academic Center",
  "Learning University",
];

// Experience levels
export type ExperienceLevel = "fresher" | "junior" | "mid" | "senior";

// Generate dummy content based on career field and experience level
export function generateDummyContent(
  careerFieldId: string,
  experienceLevel: ExperienceLevel = "mid"
): DummyContent {
  const field =
    careerFields.find((f: any) => f.id === careerFieldId) ||
    careerFields.find((f: any) => f.id === "general")!;
  const randomName =
    sampleNames[Math.floor(Math.random() * sampleNames.length)];
  const companies =
    companiesByField[careerFieldId as keyof typeof companiesByField] ||
    companiesByField.general;

  return {
    personalInfo: generatePersonalInfo(randomName, field, experienceLevel),
    experience: generateExperience(field, experienceLevel, companies),
    education: generateEducation(field, experienceLevel),
    skills: generateSkills(field, experienceLevel),
  };
}

// Expose helper to get job description bullets for UI suggestions
export function getJobDescriptionsFor(fieldId: string, level: string) {
  return getJobDescriptions(fieldId, level).slice(0, 6);
}

function generatePersonalInfo(
  name: string,
  field: any,
  experienceLevel: ExperienceLevel
): DummyPersonalInfo {
  const email = name.toLowerCase().replace(" ", ".") + "@email.com";
  const summaries = {
    fresher: {
      technology: `Recent graduate with a strong foundation in software development and programming. Passionate about creating innovative solutions and eager to contribute to dynamic development teams. Proficient in modern programming languages and frameworks with hands-on project experience.`,
      design: `Creative and detail-oriented design graduate with a passion for user-centered design. Skilled in design tools and principles with experience in creating engaging visual experiences. Eager to bring fresh perspectives to design challenges.`,
      business: `Motivated business graduate with strong analytical and communication skills. Experienced in project coordination and team collaboration through internships and academic projects. Ready to contribute to business growth and operational excellence.`,
      healthcare: `Compassionate healthcare professional with recent certification and clinical training. Committed to providing quality patient care and maintaining high standards of medical practice. Eager to begin career in healthcare services.`,
      legal: `Detail-oriented law graduate with strong research and analytical skills. Experienced in legal writing and case analysis through academic work and internships. Committed to upholding justice and providing excellent legal support.`,
      engineering: `Recent engineering graduate with solid technical foundation and problem-solving skills. Experienced in engineering principles and design through academic projects and internships. Ready to contribute to innovative engineering solutions.`,
      marketing: `Creative marketing graduate with digital marketing knowledge and social media expertise. Passionate about brand building and customer engagement. Ready to drive marketing initiatives and campaign success.`,
      general: `Motivated professional with strong work ethic and excellent communication skills. Quick learner with ability to adapt to new environments and challenges. Ready to contribute to organizational success and professional growth.`,
    },
    junior: {
      technology: `Software developer with 1-2 years of experience building web applications and mobile solutions. Proficient in modern development frameworks and agile methodologies. Passionate about clean code and continuous learning.`,
      design: `UI/UX designer with 1-2 years of experience creating user-centered digital experiences. Skilled in design thinking and prototyping with a portfolio of successful projects. Focused on creating intuitive and accessible designs.`,
      business: `Business analyst with 1-2 years of experience in process improvement and data analysis. Strong background in project coordination and stakeholder management. Committed to driving business efficiency and growth.`,
      healthcare: `Healthcare professional with 1-2 years of clinical experience providing quality patient care. Skilled in medical procedures and patient communication. Dedicated to maintaining high standards of healthcare delivery.`,
      legal: `Legal professional with 1-2 years of experience in legal research and document preparation. Strong analytical skills and attention to detail. Committed to providing excellent legal support and client service.`,
      engineering: `Engineer with 1-2 years of experience in design and project implementation. Skilled in technical analysis and problem-solving. Focused on delivering innovative engineering solutions.`,
      marketing: `Marketing professional with 1-2 years of experience in digital campaigns and brand management. Skilled in content creation and social media marketing. Passionate about driving brand awareness and engagement.`,
      general: `Professional with 1-2 years of experience in customer service and administrative support. Strong communication and organizational skills. Committed to excellence and continuous improvement.`,
    },
    mid: {
      technology: `Experienced software developer with 3-5 years of expertise in full-stack development and system architecture. Proven track record of delivering scalable solutions and leading development teams. Passionate about emerging technologies and best practices.`,
      design: `Senior designer with 3-5 years of experience leading design projects and mentoring junior designers. Expert in user research and design systems with a portfolio of award-winning projects. Focused on creating impactful user experiences.`,
      business: `Business professional with 3-5 years of experience in strategic planning and operations management. Proven ability to drive process improvements and lead cross-functional teams. Committed to achieving business objectives and growth.`,
      healthcare: `Experienced healthcare professional with 3-5 years of clinical expertise and patient care excellence. Skilled in advanced medical procedures and healthcare technology. Dedicated to improving patient outcomes and healthcare quality.`,
      legal: `Legal professional with 3-5 years of experience in litigation and legal counsel. Strong track record in case management and client representation. Committed to achieving favorable outcomes and upholding legal standards.`,
      engineering: `Senior engineer with 3-5 years of experience in complex project design and implementation. Expert in technical leadership and innovation. Focused on delivering high-quality engineering solutions and mentoring teams.`,
      marketing: `Marketing manager with 3-5 years of experience in campaign strategy and brand development. Proven track record in driving revenue growth and market expansion. Expert in digital marketing and customer acquisition.`,
      general: `Experienced professional with 3-5 years of leadership and project management experience. Strong track record in team coordination and process optimization. Committed to organizational excellence and strategic growth.`,
    },
    senior: {
      technology: `Senior technology leader with 6+ years of experience architecting enterprise solutions and leading engineering teams. Expert in scalable system design and technology strategy. Passionate about innovation and technical excellence.`,
      design: `Design director with 6+ years of experience leading design organizations and establishing design culture. Expert in design strategy and user experience optimization. Focused on creating world-class digital products.`,
      business: `Senior business executive with 6+ years of experience in strategic leadership and organizational transformation. Proven track record in revenue growth and operational excellence. Expert in change management and team development.`,
      healthcare: `Senior healthcare leader with 6+ years of clinical and administrative experience. Expert in healthcare operations and quality improvement. Committed to advancing healthcare delivery and patient outcomes.`,
      legal: `Senior legal counsel with 6+ years of experience in complex litigation and legal strategy. Expert in risk management and regulatory compliance. Committed to providing strategic legal guidance and leadership.`,
      engineering: `Principal engineer with 6+ years of experience in technical leadership and innovation. Expert in system architecture and engineering excellence. Focused on driving technological advancement and team development.`,
      marketing: `Marketing director with 6+ years of experience in brand strategy and market leadership. Expert in customer acquisition and revenue optimization. Passionate about building market-leading brands and teams.`,
      general: `Senior executive with 6+ years of leadership experience in organizational development and strategic planning. Expert in change management and business transformation. Committed to driving sustainable growth and excellence.`,
    },
  };

  return {
    fullName: name,
    email: email,
    phone: "+1 (555) 123-4567",
    location: "New York, NY",
    linkedin: `linkedin.com/in/${name.toLowerCase().replace(" ", "")}`,
    website:
      experienceLevel !== "fresher"
        ? `${name.toLowerCase().replace(" ", "")}.dev`
        : "",
    summary:
      summaries[experienceLevel][
        field.id as keyof (typeof summaries)[typeof experienceLevel]
      ] || summaries[experienceLevel].general,
  };
}

function generateExperience(
  field: any,
  experienceLevel: ExperienceLevel,
  companies: string[]
): DummyExperience[] {
  if (experienceLevel === "fresher") {
    // Freshers might have internships or entry-level positions
    return [
      {
        jobTitle: getJobTitle(field.id, "entry"),
        company: companies[Math.floor(Math.random() * companies.length)],
        location: "New York, NY",
        startDate: "Jun 2024",
        endDate: "Present",
        current: true,
        description: getJobDescriptions(field.id, "entry"),
      },
    ];
  }

  const experiences: DummyExperience[] = [];
  const experienceCounts = {
    junior: 1,
    mid: 2,
    senior: 3,
  };

  const count =
    experienceCounts[experienceLevel as keyof typeof experienceCounts] || 2;

  for (let i = 0; i < count; i++) {
    const isCurrent = i === 0;
    const level = i === 0 ? experienceLevel : i === 1 ? "junior" : "entry";

    experiences.push({
      jobTitle: getJobTitle(field.id, level),
      company: companies[Math.floor(Math.random() * companies.length)],
      location: "New York, NY",
      startDate: getStartDate(i, experienceLevel),
      endDate: isCurrent ? "Present" : getEndDate(i, experienceLevel),
      current: isCurrent,
      description: getJobDescriptions(field.id, level),
    });
  }

  return experiences;
}

function getJobTitle(fieldId: string, level: string): string {
  const titles: Record<string, Record<string, string>> = {
    technology: {
      entry: "Junior Software Developer",
      junior: "Software Developer",
      mid: "Senior Software Developer",
      senior: "Principal Software Engineer",
    },
    design: {
      entry: "Junior UI/UX Designer",
      junior: "UI/UX Designer",
      mid: "Senior UI/UX Designer",
      senior: "Design Director",
    },
    business: {
      entry: "Business Analyst",
      junior: "Senior Business Analyst",
      mid: "Project Manager",
      senior: "Director of Operations",
    },
    healthcare: {
      entry: "Healthcare Assistant",
      junior: "Registered Nurse",
      mid: "Senior Nurse",
      senior: "Nurse Manager",
    },
    legal: {
      entry: "Legal Assistant",
      junior: "Associate Attorney",
      mid: "Senior Attorney",
      senior: "Partner",
    },
    engineering: {
      entry: "Junior Engineer",
      junior: "Engineer",
      mid: "Senior Engineer",
      senior: "Principal Engineer",
    },
    marketing: {
      entry: "Marketing Coordinator",
      junior: "Marketing Specialist",
      mid: "Marketing Manager",
      senior: "Marketing Director",
    },
  };

  return titles[fieldId]?.[level] || titles.business[level] || "Professional";
}

function getJobDescriptions(fieldId: string, level: string): string[] {
  const descriptions: Record<string, Record<string, string[]>> = {
    technology: {
      entry: [
        "Developed responsive web applications using React and TypeScript",
        "Collaborated with senior developers on code reviews and best practices",
        "Participated in agile development processes and daily standups",
        "Wrote unit tests and contributed to automated testing frameworks",
      ],
      junior: [
        "Built and maintained web applications using modern JavaScript frameworks",
        "Implemented RESTful APIs and database integrations using Node.js and SQL",
        "Collaborated with cross-functional teams to deliver high-quality software",
        "Optimized application performance and resolved production issues",
      ],
      mid: [
        "Led development of complex web applications serving 10,000+ users",
        "Mentored junior developers and conducted technical interviews",
        "Architected scalable solutions using cloud technologies and microservices",
        "Implemented CI/CD pipelines and improved deployment processes by 40%",
      ],
      senior: [
        "Designed and implemented enterprise-scale software architecture",
        "Led technical strategy and technology adoption across engineering teams",
        "Managed engineering teams of 10+ developers and delivered critical projects",
        "Established coding standards and best practices across the organization",
      ],
    },
    design: {
      entry: [
        "Created user interface designs for web and mobile applications",
        "Conducted user research and usability testing sessions",
        "Collaborated with developers to ensure design implementation accuracy",
        "Maintained design systems and component libraries",
      ],
      junior: [
        "Designed end-to-end user experiences for digital products",
        "Created wireframes, prototypes, and high-fidelity mockups",
        "Conducted user interviews and analyzed feedback to improve designs",
        "Worked closely with product managers to define user requirements",
      ],
      mid: [
        "Led design projects from concept to launch for multiple product lines",
        "Mentored junior designers and established design processes",
        "Collaborated with stakeholders to align design strategy with business goals",
        "Improved user engagement by 35% through data-driven design decisions",
      ],
      senior: [
        "Established design vision and strategy for the entire product portfolio",
        "Built and led a team of 8+ designers across multiple disciplines",
        "Partnered with executive leadership to drive product innovation",
        "Implemented design systems that improved development efficiency by 50%",
      ],
    },
    business: {
      entry: [
        "Analyzed business processes and identified improvement opportunities",
        "Created detailed documentation and process flow diagrams",
        "Supported project managers in coordinating cross-functional initiatives",
        "Prepared reports and presentations for stakeholder meetings",
      ],
      junior: [
        "Led business analysis for process improvement projects",
        "Gathered requirements from stakeholders and translated them into actionable plans",
        "Managed project timelines and coordinated with multiple departments",
        "Implemented new processes that reduced operational costs by 15%",
      ],
      mid: [
        "Managed complex projects with budgets exceeding $500K",
        "Led cross-functional teams of 10+ members to achieve project objectives",
        "Developed strategic plans and presented recommendations to senior leadership",
        "Improved operational efficiency by 25% through process optimization",
      ],
      senior: [
        "Directed strategic initiatives and organizational transformation projects",
        "Managed P&L responsibility for business units generating $10M+ revenue",
        "Built and led high-performing teams across multiple business functions",
        "Drove company growth through strategic partnerships and market expansion",
      ],
    },
  };

  return (
    descriptions[fieldId]?.[level] || [
      "Contributed to team projects and organizational goals",
      "Collaborated with colleagues to achieve department objectives",
      "Maintained high standards of professional excellence",
      "Supported continuous improvement initiatives and best practices",
    ]
  );
}

function generateEducation(
  field: any,
  experienceLevel: ExperienceLevel
): DummyEducation[] {
  const degrees = {
    technology: "Bachelor of Science in Computer Science",
    design: "Bachelor of Fine Arts in Graphic Design",
    business: "Bachelor of Business Administration",
    healthcare: "Bachelor of Science in Nursing",
    legal: "Juris Doctor",
    engineering: "Bachelor of Science in Engineering",
    marketing: "Bachelor of Arts in Marketing",
    general: "Bachelor of Arts",
  };

  const graduationYear =
    experienceLevel === "fresher"
      ? "2024"
      : experienceLevel === "junior"
      ? "2022"
      : experienceLevel === "mid"
      ? "2019"
      : "2016";

  return [
    {
      degree: degrees[field.id as keyof typeof degrees] || degrees.general,
      institution:
        universities[Math.floor(Math.random() * universities.length)],
      location: "New York, NY",
      graduationDate: graduationYear,
      gpa: experienceLevel === "fresher" ? "3.7" : undefined,
    },
  ];
}

function generateSkills(
  field: any,
  experienceLevel: ExperienceLevel
): DummySkill[] {
  const fieldSkills = field.skills;
  const skillLevels = {
    fresher: ["beginner", "intermediate"],
    junior: ["intermediate", "advanced"],
    mid: ["advanced", "expert"],
    senior: ["expert"],
  };

  const levels = skillLevels[experienceLevel] as Array<
    "beginner" | "intermediate" | "advanced" | "expert"
  >;
  const skills: DummySkill[] = [];

  // Add technical skills
  fieldSkills.technical.slice(0, 6).forEach((skill: string, index: number) => {
    skills.push({
      name: skill,
      category: "technical",
      level: levels[index % levels.length],
    });
  });

  // Add soft skills
  fieldSkills.soft.slice(0, 4).forEach((skill: string, index: number) => {
    skills.push({
      name: skill,
      category: "soft",
      level: levels[index % levels.length],
    });
  });

  return skills;
}

function getStartDate(index: number, experienceLevel: ExperienceLevel): string {
  const currentYear = new Date().getFullYear();
  const yearsBack = {
    junior: [0],
    mid: [0, 2],
    senior: [0, 3, 5],
  };

  const years = yearsBack[experienceLevel as keyof typeof yearsBack] || [0];
  const year = currentYear - (years[index] || 0);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Math.floor(Math.random() * 12)];

  return `${month} ${year}`;
}

function getEndDate(index: number, experienceLevel: ExperienceLevel): string {
  const currentYear = new Date().getFullYear();
  const yearsBack = {
    junior: [1],
    mid: [1, 4],
    senior: [2, 4, 6],
  };

  const years = yearsBack[experienceLevel as keyof typeof yearsBack] || [1];
  const year = currentYear - (years[index] || 1);
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const month = months[Math.floor(Math.random() * 12)];

  return `${month} ${year}`;
}
