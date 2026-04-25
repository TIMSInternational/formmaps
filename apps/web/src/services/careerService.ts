import { CareerRole } from "@/types/career";

export const careers: CareerRole[] = [
  {
    id: "career_data_analyst",
    familyId: "family_data",
    slug: "data-analyst",
    title: { en: "Data Analyst", es: "Analista de Datos" },
    shortDescription: {
      en: "Transform raw data into meaningful insights to drive business decisions.",
      es: "Transforma datos brutos en información significativa para impulsar decisiones comerciales.",
    },
    longDescription: {
      en: "As a Data Analyst, you will collect, process, and perform statistical analyses on large datasets. You will discover how data can be used to answer questions and solve problems. Your work will help organizations make better business decisions, identify new opportunities, and spot trends.",
      es: "Como Analista de Datos, recopilarás, procesarás y realizarás análisis estadísticos en grandes conjuntos de datos. Descubrirás cómo se pueden utilizar los datos para responder preguntas y resolver problemas. Tu trabajo ayudará a las organizaciones a tomar mejores decisiones comerciales, identificar nuevas oportunidades y detectar tendencias.",
    },
    responsibilities: [
      {
        en: "Interpret data, analyze results using statistical techniques and provide ongoing reports",
        es: "Interpretar datos, analizar resultados utilizando técnicas estadísticas y proporcionar informes continuos",
      },
      {
        en: "Develop and implement databases, data collection systems, data analytics and other strategies that optimize statistical efficiency and quality",
        es: "Desarrollar e implementar bases de datos, sistemas de recopilación de datos, análisis de datos y otras estrategias que optimicen la eficiencia y calidad estadística",
      },
      {
        en: "Acquire data from primary or secondary data sources and maintain databases/data systems",
        es: "Adquirir datos de fuentes de datos primarias o secundarias y mantener bases de datos/sistemas de datos",
      },
    ],
    skills: [
      {
        skillId: "sql",
        name: { en: "SQL", es: "SQL" },
        levelRequired: "intermediate",
      },
      {
        skillId: "python",
        name: { en: "Python", es: "Python" },
        levelRequired: "intermediate",
      },
      {
        skillId: "tableau",
        name: { en: "Tableau", es: "Tableau" },
        levelRequired: "beginner",
      },
      {
        skillId: "excel",
        name: { en: "Advanced Excel", es: "Excel Avanzado" },
        levelRequired: "advanced",
      },
    ],
    educationLevel: "Bachelors",
    salaryRange: { min: 55000, median: 75000, max: 110000, currency: "USD" },
    demandStats: {
      jobCount: 12000,
      postedLast30Days: 220,
      growthPercent: 0.07,
    },
    industries: ["Technology", "Finance", "Healthcare", "Retail"],
    locationSupport: ["USA", "Spain", "Remote"],
    iconUrl: "/icons/data-analyst.svg",
    matchScore: 92,
    published: true,
    remoteEligible: true,
  },
  {
    id: "career_ux_designer",
    familyId: "family_design",
    slug: "ux-designer",
    title: { en: "UX Designer", es: "Diseñador UX" },
    shortDescription: {
      en: "Design intuitive and engaging user experiences for digital products.",
      es: "Diseña experiencias de usuario intuitivas y atractivas para productos digitales.",
    },
    longDescription: {
      en: "UX Designers are responsible for the overall feel of the product. You will conduct user research, create personas, design wireframes and prototypes, and test your designs with real users to ensure a seamless and enjoyable experience.",
      es: "Los diseñadores UX son responsables de la sensación general del producto. Realizarás investigaciones de usuarios, crearás personas, diseñarás wireframes y prototipos, y probarás tus diseños con usuarios reales para garantizar una experiencia fluida y agradable.",
    },
    responsibilities: [
      {
        en: "Conduct user research and testing",
        es: "Realizar investigaciones y pruebas de usuarios",
      },
      {
        en: "Develop wireframes and task flows based on user needs",
        es: "Desarrollar wireframes y flujos de tareas basados en las necesidades del usuario",
      },
      {
        en: "Collaborate with Designers and Developers to create intuitive, user-friendly software",
        es: "Colaborar con diseñadores y desarrolladores para crear software intuitivo y fácil de usar",
      },
    ],
    skills: [
      {
        skillId: "figma",
        name: { en: "Figma", es: "Figma" },
        levelRequired: "advanced",
      },
      {
        skillId: "prototyping",
        name: { en: "Prototyping", es: "Prototipado" },
        levelRequired: "intermediate",
      },
      {
        skillId: "user_research",
        name: { en: "User Research", es: "Investigación de Usuarios" },
        levelRequired: "intermediate",
      },
    ],
    educationLevel: "Bachelors",
    salaryRange: { min: 60000, median: 85000, max: 130000, currency: "USD" },
    demandStats: { jobCount: 6000, postedLast30Days: 100, growthPercent: 0.05 },
    industries: ["Technology", "Retail", "Media"],
    locationSupport: ["USA", "Remote"],
    iconUrl: "/icons/ux-designer.svg",
    matchScore: 85,
    published: true,
    remoteEligible: true,
  },
  {
    id: "career_software_engineer",
    familyId: "family_engineering",
    slug: "software-engineer",
    title: { en: "Software Engineer", es: "Ingeniero de Software" },
    shortDescription: {
      en: "Build and maintain scalable software applications and systems.",
      es: "Construye y mantiene aplicaciones y sistemas de software escalables.",
    },
    longDescription: {
      en: "As a Software Engineer, you will apply the principles of engineering to software development. You will design, develop, maintain, test, and evaluate computer software. You will work with a variety of programming languages and technologies to build robust solutions.",
      es: "Como ingeniero de software, aplicarás los principios de la ingeniería al desarrollo de software. Diseñarás, desarrollarás, mantendrás, probarás y evaluarás software informático. Trabajarás con una variedad de lenguajes de programación y tecnologías para construir soluciones robustas.",
    },
    responsibilities: [
      {
        en: "Write clean, scalable code using .NET programming languages",
        es: "Escribir código limpio y escalable utilizando lenguajes de programación .NET",
      },
      {
        en: "Test and deploy applications and systems",
        es: "Probar e implementar aplicaciones y sistemas",
      },
      {
        en: "Revise, update, refactor and debug code",
        es: "Revisar, actualizar, refactorizar y depurar código",
      },
    ],
    skills: [
      {
        skillId: "javascript",
        name: { en: "JavaScript", es: "JavaScript" },
        levelRequired: "advanced",
      },
      {
        skillId: "react",
        name: { en: "React", es: "React" },
        levelRequired: "intermediate",
      },
      {
        skillId: "node",
        name: { en: "Node.js", es: "Node.js" },
        levelRequired: "intermediate",
      },
    ],
    educationLevel: "Bachelors",
    salaryRange: { min: 70000, median: 100000, max: 160000, currency: "USD" },
    demandStats: {
      jobCount: 25000,
      postedLast30Days: 500,
      growthPercent: 0.12,
    },
    industries: ["Technology", "Finance", "Healthcare", "Automotive"],
    locationSupport: ["USA", "Europe", "Remote"],
    iconUrl: "/icons/software-engineer.svg",
    matchScore: 78,
    published: true,
    remoteEligible: true,
  },
  {
    id: "career_product_manager",
    familyId: "family_product",
    slug: "product-manager",
    title: { en: "Product Manager", es: "Gerente de Producto" },
    shortDescription: {
      en: "Lead the vision, strategy, and development of products.",
      es: "Lidera la visión, estrategia y desarrollo de productos.",
    },
    longDescription: {
      en: "Product Managers are responsible for the strategy, roadmap, and feature definition for a product or product line. You will work with cross-functional teams to design, build and roll-out products that deliver the company's vision and strategy.",
      es: "Los gerentes de producto son responsables de la estrategia, la hoja de ruta y la definición de características de un producto o línea de productos. Trabajarás con equipos multifuncionales para diseñar, construir y lanzar productos que cumplan con la visión y estrategia de la empresa.",
    },
    responsibilities: [
      {
        en: "Gain a deep understanding of customer experience, identify and fill product gaps and generate new ideas",
        es: "Obtener una comprensión profunda de la experiencia del cliente, identificar y llenar vacíos de productos y generar nuevas ideas",
      },
      {
        en: "Create buy-in for the product vision both internally and with key external partners",
        es: "Crear aceptación para la visión del producto tanto internamente como con socios externos clave",
      },
      {
        en: "Translate product strategy into detailed requirements and prototypes",
        es: "Traducir la estrategia del producto en requisitos detallados y prototipos",
      },
    ],
    skills: [
      {
        skillId: "strategy",
        name: { en: "Product Strategy", es: "Estrategia de Producto" },
        levelRequired: "advanced",
      },
      {
        skillId: "agile",
        name: { en: "Agile Methodologies", es: "Metodologías Ágiles" },
        levelRequired: "intermediate",
      },
      {
        skillId: "communication",
        name: { en: "Communication", es: "Comunicación" },
        levelRequired: "advanced",
      },
    ],
    educationLevel: "Bachelors",
    salaryRange: { min: 80000, median: 110000, max: 170000, currency: "USD" },
    demandStats: { jobCount: 8000, postedLast30Days: 150, growthPercent: 0.08 },
    industries: ["Technology", "Finance", "Consumer Goods"],
    locationSupport: ["USA", "Remote"],
    iconUrl: "/icons/product-manager.svg",
    matchScore: 65,
    published: true,
    remoteEligible: true,
  },
  {
    id: "career_digital_marketer",
    familyId: "family_marketing",
    slug: "digital-marketer",
    title: { en: "Digital Marketer", es: "Comercializador Digital" },
    shortDescription: {
      en: "Promote products and services through digital channels.",
      es: "Promociona productos y servicios a través de canales digitales.",
    },
    longDescription: {
      en: "Digital Marketers use digital channels to reach customers, build brand awareness, and promote products and services. You will plan and execute marketing campaigns, including SEO/SEM, email, social media and display advertising.",
      es: "Los comercializadores digitales utilizan canales digitales para llegar a los clientes, crear conciencia de marca y promocionar productos y servicios. Planificarás y ejecutarás campañas de marketing, incluyendo SEO/SEM, correo electrónico, redes sociales y publicidad gráfica.",
    },
    responsibilities: [
      {
        en: "Plan and execute all digital marketing, including SEO/SEM, marketing database, email, social media and display advertising campaigns",
        es: "Planificar y ejecutar todo el marketing digital, incluyendo SEO/SEM, base de datos de marketing, correo electrónico, redes sociales y campañas de publicidad gráfica",
      },
      {
        en: "Design, build and maintain our social media presence",
        es: "Diseñar, construir y mantener nuestra presencia en las redes sociales",
      },
      {
        en: "Measure and report performance of all digital marketing campaigns, and assess against goals (ROI and KPIs)",
        es: "Medir y reportar el rendimiento de todas las campañas de marketing digital y evaluar contra objetivos (ROI y KPIs)",
      },
    ],
    skills: [
      {
        skillId: "seo",
        name: { en: "SEO/SEM", es: "SEO/SEM" },
        levelRequired: "intermediate",
      },
      {
        skillId: "analytics",
        name: { en: "Google Analytics", es: "Google Analytics" },
        levelRequired: "intermediate",
      },
      {
        skillId: "content",
        name: { en: "Content Creation", es: "Creación de Contenido" },
        levelRequired: "intermediate",
      },
    ],
    educationLevel: "Bachelors",
    salaryRange: { min: 45000, median: 65000, max: 95000, currency: "USD" },
    demandStats: { jobCount: 15000, postedLast30Days: 300, growthPercent: 0.1 },
    industries: ["Technology", "Retail", "Agency"],
    locationSupport: ["USA", "Remote", "Europe"],
    iconUrl: "/icons/digital-marketer.svg",
    matchScore: 45,
    published: true,
    remoteEligible: true,
  },
];

const simulateNetworkDelay = async <T>(value: T, delay = 200): Promise<T> => {
  return new Promise((resolve) => setTimeout(() => resolve(value), delay));
};

// Simple local store for favorites (when backend not ready)
const userFavoritesKey = (userId: string) => `careers:favorites:${userId}`;

function readFavorites(userId: string) {
  if (typeof window === "undefined") return [] as string[];
  const raw = localStorage.getItem(userFavoritesKey(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as string[];
  } catch {
    return [];
  }
}

function writeFavorites(userId: string, list: string[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(userFavoritesKey(userId), JSON.stringify(list));
}

function dispatchFavoritesUpdated(userId: string) {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent("favorites_updated", { detail: { userId } })
    );
  } catch (e) {
    // ignore
  }
}

export async function listCareers(query?: {
  search?: string;
  industry?: string;
  interest?: string;
  education?: string;
  location?: string;
  sort?: "recommended" | "match" | "title" | "demand";
}) {
  // trivial server-side filtering mock
  let filtered = careers;
  if (query?.search) {
    const s = query.search.toLowerCase();
    filtered = filtered.filter(
      (c) =>
        (c.title.en || "").toLowerCase().includes(s) ||
        (c.shortDescription?.en || "").toLowerCase().includes(s)
    );
  }
  if (query?.industry) {
    filtered = filtered.filter((c) =>
      c.industries?.includes(query.industry as string)
    );
  }
  if (query?.education) {
    filtered = filtered.filter((c) => c.educationLevel === query.education);
  }
  if (query?.location) {
    filtered = filtered.filter((c) =>
      c.locationSupport?.some((loc) => loc.includes(query.location!))
    );
  }

  // Sort logic
  if (query?.sort) {
    filtered = [...filtered]; // copy
    switch (query.sort) {
      case "recommended":
      case "match":
        filtered.sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0));
        break;
      case "title":
        filtered.sort((a, b) =>
          (a.title.en || "").localeCompare(b.title.en || "")
        );
        break;
      case "demand":
        filtered.sort(
          (a, b) =>
            (b.demandStats?.jobCount || 0) - (a.demandStats?.jobCount || 0)
        );
        break;
    }
  }

  return simulateNetworkDelay({
    careers: filtered,
    meta: { total: filtered.length, page: 1, pageSize: 20 },
  });
}

export async function getCareerById(id: string) {
  const found = careers.find((c) => c.id === id);
  return simulateNetworkDelay(found ?? null);
}

export async function getCareerFamilies() {
  // Basic family list
  return simulateNetworkDelay([
    {
      id: "family_data",
      title: { en: "Data & Analytics", es: "Datos y Análisis" },
      iconUrl: "/icons/family-data.svg",
    },
    {
      id: "family_design",
      title: { en: "Design & UX", es: "Diseño y UX" },
      iconUrl: "/icons/family-design.svg",
    },
  ]);
}

// Admin operations (mock)
export async function adminListCareers() {
  return simulateNetworkDelay(careers);
}

export async function adminCreateCareer(payload: CareerRole) {
  const id = `career_${Date.now()}`;
  const newCareer = { ...payload, id } as CareerRole;
  careers.push(newCareer);
  return simulateNetworkDelay(newCareer);
}

export async function adminUpdateCareer(
  id: string,
  payload: Partial<CareerRole>
) {
  const idx = careers.findIndex((c) => c.id === id);
  if (idx === -1) return simulateNetworkDelay(null);
  careers[idx] = { ...careers[idx], ...payload } as CareerRole;
  return simulateNetworkDelay(careers[idx]);
}

export async function adminDeleteCareer(id: string) {
  const idx = careers.findIndex((c) => c.id === id);
  if (idx === -1) return simulateNetworkDelay(false);
  careers.splice(idx, 1);
  return simulateNetworkDelay(true);
}

export async function recommendCareers(payload: {
  userId: string;
  context?: any;
}) {
  // For demo, return careers sorted by matchScore
  const ranked = [...careers].sort(
    (a, b) => (b.matchScore || 0) - (a.matchScore || 0)
  );
  return simulateNetworkDelay({
    recommendations: ranked.map((c) => ({
      careerId: c.id,
      matchScore: c.matchScore,
      explanation: {
        en: "Matches your analytical skills",
        es: "Coincide con tus habilidades analíticas",
      },
    })),
  });
}

export async function getFavoritesForUser(userId: string) {
  const favorites = readFavorites(userId);
  return simulateNetworkDelay({ favorites });
}

export async function addFavorite(userId: string, careerId: string) {
  const favs = readFavorites(userId);
  if (!favs.includes(careerId)) favs.push(careerId);
  writeFavorites(userId, favs);
  dispatchFavoritesUpdated(userId);
  return simulateNetworkDelay({ success: true, favorites: favs });
}

export async function removeFavorite(userId: string, careerId: string) {
  const favs = readFavorites(userId).filter((f) => f !== careerId);
  writeFavorites(userId, favs);
  dispatchFavoritesUpdated(userId);
  return simulateNetworkDelay({ success: true, favorites: favs });
}
