// 360-Degree Evaluation Service - Educational/Vocational Assessment

export interface CompetencyDimension {
  id: string;
  name: string;
  nameSpanish?: string;
  description: string;
  descriptionSpanish?: string;
  category:
    | "interests"
    | "talents"
    | "strengths"
    | "emotional_intelligence"
    | "leadership"
    | "responsibility"
    | "communication";
  isActive: boolean;
  order: number;
  weight: number;
}

export interface RatingScale {
  id: string;
  name: string;
  nameSpanish?: string;
  description: string;
  descriptionSpanish?: string;
  type: "likert" | "emotive";
  minValue: number;
  maxValue: number;
  labels: {
    value: number;
    label: string;
    labelSpanish?: string;
    description?: string;
    descriptionSpanish?: string;
    emoji?: string;
  }[];
  options: {
    value: number;
    label: string;
    labelSpanish?: string;
    description?: string;
    descriptionSpanish?: string;
    emoji?: string;
  }[];
}

export interface EvaluatorGroup {
  id: string;
  name: string;
  nameSpanish?: string;
  type: "self" | "parent" | "teacher" | "sibling_friend";
  minRequired: number;
  maxAllowed: number;
  description?: string;
  descriptionSpanish?: string;
  evaluators: Evaluator[];
}

export interface EvaluatorRequirement {
  self: { minimum: number; maximum: number };
  parent: { minimum: number; maximum: number };
  teacher: { minimum: number; maximum: number };
  peer: { minimum: number; maximum: number };
}

export interface CounselorEvaluationGroupResponse {
  id: string;
  evaluatedUserId: string;
  evaluatedUserName: string;
  evaluatedUserGradeLevel?: number;
  evaluatorName: string;
  evaluatorEmail: string;
  relation: string;
  groupType: string;
  invitationToken: string;
  tokenExpiryDate: string;
  invitationUrl: string;
  isTokenUsed: boolean;
  isEvaluationCompleted: boolean;
  createdDate: string;
}

export interface Evaluator {
  id: string;
  name: string;
  email: string;
  phone: string; // Required with country code (e.g., +1234567890)
  relationship: string;
  groupType: EvaluatorGroup["type"];
  groupId?: string;
  invitationToken: string;
  invitationSent: boolean;
  invitationSentAt?: string;
  responseReceived: boolean;
  responseReceivedAt?: string;
  isActive: boolean;
}

export interface EvaluationQuestion {
  id: string;
  competencyId: string;
  questionText: string;
  questionType: "rating" | "open_ended" | "both";
  isRequired: boolean;
  order: number;
  helpText?: string;
}

export interface EvaluationResponse {
  id: string;
  evaluationId: string;
  evaluatorId: string;
  questionId: string;
  ratingValue?: number;
  textResponse?: string;
  submittedAt: string;
}

export interface EvaluationSession {
  id: string;
  evaluatedPersonId: string;
  evaluatedPersonName: string;
  title: string;
  description: string;
  status: "draft" | "active" | "completed" | "archived";
  createdBy: string;
  createdAt: string;
  startDate: string;
  endDate: string;
  competencyDimensions: CompetencyDimension[];
  ratingScale: RatingScale;
  evaluatorGroups: EvaluatorGroup[];
  evaluators: Evaluator[];
  questions: EvaluationQuestion[];
  responses: EvaluationResponse[];
  configuration: EvaluationConfiguration;
  evaluatorRequirements: EvaluatorRequirement;
}

export interface EvaluationConfiguration {
  id: string;
  name: string;
  description: string;
  competencyDimensions: CompetencyDimension[];
  ratingScale: RatingScale;
  evaluatorRequirements: EvaluatorRequirement;
  evaluatorGroups: EvaluatorGroup[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  allowAnonymousResponses?: boolean;
  requireAllQuestions?: boolean;
  allowPartialSubmissions?: boolean;
  sendReminders?: boolean;
  reminderIntervalDays?: number;
  maxReminders?: number;
  showProgressToEvaluated?: boolean;
  generateReportAutomatically?: boolean;
}

export interface EvaluationInvitation {
  id: string;
  evaluationId: string;
  evaluatorId: string;
  token: string;
  expiresAt: string;
  isUsed: boolean;
  usedAt?: string;
}

export interface EvaluationReport {
  id: string;
  evaluationId: string;
  generatedAt: string;
  summary: {
    totalEvaluators: number;
    responseRate: number;
    completionRate: number;
    averageRatings: { [competencyId: string]: number };
  };
  competencyAnalysis: {
    competencyId: string;
    competencyName: string;
    overallRating: number;
    ratingsByGroup: { [groupType: string]: number };
    strengths: string[];
    developmentAreas: string[];
    keyFeedback: string[];
  }[];
  recommendations: string[];
  detailedFeedback: {
    groupType: string;
    feedback: {
      competencyId: string;
      rating: number;
      comments: string[];
    }[];
  }[];
}

// Default competency dimensions for educational/vocational assessment
export const DEFAULT_COMPETENCY_DIMENSIONS: CompetencyDimension[] = [
  {
    id: "interests-001",
    name: "Academic Interests",
    nameSpanish: "Intereses Académicos",
    description: "Shows curiosity and engagement in learning activities",
    descriptionSpanish:
      "Muestra curiosidad y compromiso en actividades de aprendizaje",
    category: "interests",
    isActive: true,
    order: 1,
    weight: 1,
  },
  {
    id: "interests-002",
    name: "Career Interests",
    nameSpanish: "Intereses Profesionales",
    description: "Demonstrates interest in specific career paths or industries",
    descriptionSpanish:
      "Demuestra interés en caminos profesionales específicos o industrias",
    category: "interests",
    isActive: true,
    order: 2,
    weight: 1,
  },
  {
    id: "talents-001",
    name: "Analytical Thinking",
    nameSpanish: "Pensamiento Analítico",
    description: "Ability to break down complex problems and think logically",
    descriptionSpanish:
      "Capacidad para desglosar problemas complejos y pensar lógicamente",
    category: "talents",
    isActive: true,
    order: 3,
    weight: 1,
  },
  {
    id: "talents-002",
    name: "Creative Expression",
    nameSpanish: "Expresión Creativa",
    description: "Shows creativity and original thinking in various contexts",
    descriptionSpanish:
      "Muestra creatividad y pensamiento original en diversos contextos",
    category: "talents",
    isActive: true,
    order: 4,
    weight: 1,
  },
  {
    id: "strengths-001",
    name: "Perseverance",
    nameSpanish: "Perseverancia",
    description: "Demonstrates persistence when facing challenges",
    descriptionSpanish: "Demuestra persistencia ante los desafíos",
    category: "strengths",
    isActive: true,
    order: 5,
    weight: 1,
  },
  {
    id: "strengths-002",
    name: "Adaptability",
    nameSpanish: "Adaptabilidad",
    description: "Adjusts well to new situations and changes",
    descriptionSpanish: "Se adapta bien a situaciones nuevas y cambios",
    category: "strengths",
    isActive: true,
    order: 6,
    weight: 1,
  },
  {
    id: "emotional_intelligence-001",
    name: "Self-Awareness",
    nameSpanish: "Autoconciencia",
    description: "Understands own emotions and their impact on others",
    descriptionSpanish:
      "Entiende sus propias emociones y su impacto en los demás",
    category: "emotional_intelligence",
    isActive: true,
    order: 7,
    weight: 1,
  },
  {
    id: "emotional_intelligence-002",
    name: "Empathy",
    nameSpanish: "Empatía",
    description: "Shows understanding and consideration for others feelings",
    descriptionSpanish:
      "Muestra comprensión y consideración por los sentimientos de los demás",
    category: "emotional_intelligence",
    isActive: true,
    order: 8,
    weight: 1,
  },
  {
    id: "leadership-001",
    name: "Initiative",
    nameSpanish: "Iniciativa",
    description: "Takes action and shows leadership in group settings",
    descriptionSpanish: "Toma acción y muestra liderazgo en entornos grupales",
    category: "leadership",
    isActive: true,
    order: 9,
    weight: 1,
  },
  {
    id: "leadership-002",
    name: "Collaboration",
    nameSpanish: "Colaboración",
    description: "Works effectively with others towards common goals",
    descriptionSpanish:
      "Trabaja efectivamente con otros hacia objetivos comunes",
    category: "leadership",
    isActive: true,
    order: 10,
    weight: 1,
  },
  {
    id: "responsibility-001",
    name: "Accountability",
    nameSpanish: "Responsabilidad",
    description: "Takes ownership of actions and commitments",
    descriptionSpanish: "Asume la propiedad de sus acciones y compromisos",
    category: "responsibility",
    isActive: true,
    order: 11,
    weight: 1,
  },
  {
    id: "responsibility-002",
    name: "Time Management",
    nameSpanish: "Gestión del Tiempo",
    description: "Manages time effectively and meets deadlines",
    descriptionSpanish:
      "Gestiona el tiempo efectivamente y cumple con los plazos",
    category: "responsibility",
    isActive: true,
    order: 12,
    weight: 1,
  },
  {
    id: "communication-001",
    name: "Verbal Communication",
    nameSpanish: "Comunicación Verbal",
    description: "Expresses ideas clearly and effectively in speech",
    descriptionSpanish: "Expresa ideas de manera clara y efectiva en el habla",
    category: "communication",
    isActive: true,
    order: 13,
    weight: 1,
  },
  {
    id: "communication-002",
    name: "Written Communication",
    nameSpanish: "Comunicación Escrita",
    description: "Communicates effectively through writing",
    descriptionSpanish: "Se comunica efectivamente a través de la escritura",
    category: "communication",
    isActive: true,
    order: 14,
    weight: 1,
  },
];

// Default rating scale (5-point Likert)
export const DEFAULT_RATING_SCALE: RatingScale = {
  id: "likert-5-point",
  name: "5-Point Likert Scale",
  nameSpanish: "Escala Likert de 5 Puntos",
  description: "Standard 5-point rating scale for evaluations",
  descriptionSpanish:
    "Escala de calificación estándar de 5 puntos para evaluaciones",
  type: "likert",
  minValue: 1,
  maxValue: 5,
  labels: [
    {
      value: 1,
      label: "Strongly Disagree",
      labelSpanish: "Totalmente en Desacuerdo",
      description: "This does not describe the person at all",
      descriptionSpanish: "Esto no describe a la persona en absoluto",
    },
    {
      value: 2,
      label: "Disagree",
      labelSpanish: "En Desacuerdo",
      description: "This rarely describes the person",
      descriptionSpanish: "Esto rara vez describe a la persona",
    },
    {
      value: 3,
      label: "Neutral",
      labelSpanish: "Neutral",
      description: "This sometimes describes the person",
      descriptionSpanish: "Esto a veces describe a la persona",
    },
    {
      value: 4,
      label: "Agree",
      labelSpanish: "De Acuerdo",
      description: "This often describes the person",
      descriptionSpanish: "Esto a menudo describe a la persona",
    },
    {
      value: 5,
      label: "Strongly Agree",
      labelSpanish: "Totalmente de Acuerdo",
      description: "This always describes the person",
      descriptionSpanish: "Esto siempre describe a la persona",
    },
  ],
  options: [
    {
      value: 1,
      label: "Strongly Disagree",
      labelSpanish: "Totalmente en Desacuerdo",
      description: "This does not describe the person at all",
      descriptionSpanish: "Esto no describe a la persona en absoluto",
    },
    {
      value: 2,
      label: "Disagree",
      labelSpanish: "En Desacuerdo",
      description: "This rarely describes the person",
      descriptionSpanish: "Esto rara vez describe a la persona",
    },
    {
      value: 3,
      label: "Neutral",
      labelSpanish: "Neutral",
      description: "This sometimes describes the person",
      descriptionSpanish: "Esto a veces describe a la persona",
    },
    {
      value: 4,
      label: "Agree",
      labelSpanish: "De Acuerdo",
      description: "This often describes the person",
      descriptionSpanish: "Esto a menudo describe a la persona",
    },
    {
      value: 5,
      label: "Strongly Agree",
      labelSpanish: "Totalmente de Acuerdo",
      description: "This always describes the person",
      descriptionSpanish: "Esto siempre describe a la persona",
    },
  ],
};

// Default evaluator groups
export const DEFAULT_EVALUATOR_GROUPS: EvaluatorGroup[] = [
  {
    id: "self-group",
    name: "Self-Evaluation",
    nameSpanish: "Autoevaluación",
    type: "self",
    minRequired: 1,
    maxAllowed: 1,
    description: "The person being evaluated completes a self-assessment",
    descriptionSpanish: "La persona evaluada completa una autoevaluación",
    evaluators: [],
  },
  {
    id: "parent-group",
    name: "Parents/Guardians",
    nameSpanish: "Padres/Tutores",
    type: "parent",
    minRequired: 1,
    maxAllowed: 2,
    description: "Parents or guardians who know the person well",
    descriptionSpanish: "Padres o tutores que conocen bien a la persona",
    evaluators: [],
  },
  {
    id: "teacher-group",
    name: "Teachers/Educators",
    nameSpanish: "Profesores/Educadores",
    type: "teacher",
    minRequired: 2,
    maxAllowed: 4,
    description: "Teachers, instructors, or educational professionals",
    descriptionSpanish: "Profesores, instructores o profesionales educativos",
    evaluators: [],
  },
  {
    id: "peer-group",
    name: "Siblings/Friends",
    nameSpanish: "Hermanos/Amigos",
    type: "sibling_friend",
    minRequired: 1,
    maxAllowed: 3,
    description: "Siblings, close friends, or peers who interact regularly",
    descriptionSpanish:
      "Hermanos, amigos cercanos o compañeros que interactúan regularmente",
    evaluators: [],
  },
];

/**
 * Evaluation Group Progress Interface
 */
export interface EvaluationGroupProgress {
  evaluatorName: string;
  evaluatorEmail: string;
  relation: string;
  groupType: "Parent" | "Teacher" | "SiblingFriend" | "Self";
  evaluatedUserId: string;
  invitationToken: string;
  invitationUrl: string;
  tokenExpiryDate: string;
  isTokenUsed: boolean;
  isEvaluationCompleted: boolean;
  createdAt: string;
  isEmailSent?: boolean;
}

export interface EvaluationGroupWithId extends EvaluationGroupProgress {
  id: string;
}

export interface UserEvaluationProgress {
  userId: string;
  evaluationGroups: EvaluationGroupProgress[];
  summary: {
    totalGroups: number;
    completedEvaluations: number;
    pendingEvaluations: number;
    expiredInvitations: number;
    groupsByType: {
      Parent: number;
      Teacher: number;
      SiblingFriend: number;
      Self: number;
    };
  };
}

// API Base URL
const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL || "";

/**
 * Get user evaluation groups and progress
 */
export async function getUserEvaluationGroups(
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<EvaluationGroupWithId[]> {
  const langParam = language === "spanish" ? "sp" : "en";
  try {
    const response = await fetch(
      `${API_BASE_URL}/evaluation/user/${userId}?lang=${langParam}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return [];
      throw new Error("Failed to fetch user evaluation groups");
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    throw error;
  }
}

/**
 * Get all evaluations for students assigned to the logged-in counselor
 */
export async function getCounselorEvaluations(): Promise<CounselorEvaluationGroupResponse[]> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/api/v1/counselor/evaluations`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return [];
      throw new Error("Failed to fetch counselor evaluations");
    }

    const result = await response.json();
    return result.data || [];
  } catch (error) {
    throw error;
  }
}

/**
 * Create evaluation group with enhanced data
 */
export async function createEvaluationGroup(groupData: {
  evaluatorName: string;
  evaluatorEmail: string;
  relation: string;
  groupType: "Parent" | "Teacher" | "SiblingFriend" | "Self";
  evaluatedUserId: string;
}): Promise<EvaluationGroupWithId> {
  try {
    const response = await fetch(`${API_BASE_URL}/evaluation/create-group`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(groupData),
    });

    if (!response.ok) {
      throw new Error("Failed to create evaluation group");
    }

    const responseData = await response.json();

    // Handle different response structures
    return responseData.data || responseData;
  } catch (error) {
    throw error;
  }
}

/**
 * Update evaluation group with enhanced validation
 */
export async function updateEvaluationGroup(
  groupId: string,
  groupData: {
    evaluatorName: string;
    evaluatorEmail: string;
    relation: string;
    groupType: "Parent" | "Teacher" | "SiblingFriend";
    evaluatedUserId: string;
  }
): Promise<EvaluationGroupProgress> {
  try {
    const response = await fetch(`${API_BASE_URL}/evaluation/${groupId}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
      body: JSON.stringify(groupData),
    });

    if (!response.ok) {
      throw new Error("Failed to update evaluation group");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Delete evaluation group (soft delete)
 */
export async function deleteEvaluationGroup(groupId: string): Promise<{
  success: boolean;
  message: string;
  evaluatorName: string;
  evaluatorEmail: string;
  deletedAt: string;
}> {
  try {
    const response = await fetch(`${API_BASE_URL}/evaluation/${groupId}`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`,
      },
    });

    if (!response.ok) {
      throw new Error("Failed to delete evaluation group");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Resend invitation link
 */
export async function resendInvitationLink(groupId: string): Promise<void> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/evaluation/resend-email/${groupId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to resend invitation link");
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Send bulk email invitations to all evaluators for a user
 */
export async function sendBulkEmailInvitations(userId: string): Promise<{
  success: boolean;
  message: string;
  results?: any[];
}> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/evaluation/send-email-invitations/${userId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to send bulk email invitations");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

export async function sendSelectedEmailInvitations(
  evaluationGroupIds: string[]
): Promise<{
  success: boolean;
  message: string;
  results?: any[];
}> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/evaluation/send-invitations-selected`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ evaluationGroupIds }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to send selected email invitations");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

export async function sendSingleEmailInvitation(
  evaluationGroupId: string
): Promise<{
  success: boolean;
  message: string;
  emailSentDate?: string;
  invitationUrl?: string;
}> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/evaluation/send-invitation-email/${evaluationGroupId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to send email invitation");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

export async function resendEmailInvitation(
  evaluationGroupId: string
): Promise<{
  success: boolean;
  message: string;
  emailSentDate?: string;
  invitationUrl?: string;
  tokenExtended?: boolean;
  newExpiryDate?: string;
}> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/evaluation/resend-email/${evaluationGroupId}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to resend email invitation");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Validate evaluation group update constraints
 */
export function canUpdateEvaluationGroup(
  evaluationGroup: EvaluationGroupProgress
): {
  canUpdate: boolean;
  reason?: string;
} {
  if (evaluationGroup.isTokenUsed) {
    return {
      canUpdate: false,
      reason: "Cannot edit evaluation group after token is used",
    };
  }

  if (evaluationGroup.isEvaluationCompleted) {
    return {
      canUpdate: false,
      reason: "Cannot edit completed evaluation group",
    };
  }

  // Check if token is expired (2-day validity)
  const expiryDate = new Date(evaluationGroup.tokenExpiryDate);
  const currentDate = new Date();

  if (currentDate > expiryDate) {
    return {
      canUpdate: false,
      reason: "Cannot edit evaluation group with expired token",
    };
  }

  return { canUpdate: true };
}

/**
 * Validate evaluation group deletion constraints
 */
export function canDeleteEvaluationGroup(
  evaluationGroup: EvaluationGroupProgress
): {
  canDelete: boolean;
  reason?: string;
} {
  if (evaluationGroup.isTokenUsed) {
    return {
      canDelete: false,
      reason: "Cannot delete evaluation group after token is used",
    };
  }

  if (evaluationGroup.isEvaluationCompleted) {
    return {
      canDelete: false,
      reason: "Cannot delete completed evaluation group",
    };
  }

  return { canDelete: true };
}

/**
 * Check for duplicate relations and emails in evaluation groups
 */
export function validateEvaluationGroupUniqueness(
  existingGroups: EvaluationGroupWithId[],
  newGroupData: {
    evaluatorEmail: string;
    relation: string;
    groupType: "Parent" | "Teacher" | "SiblingFriend";
    evaluatedUserId: string;
  },
  excludeGroupId?: string
): {
  isValid: boolean;
  duplicateType?: "email" | "relation" | "both";
  existingGroup?: EvaluationGroupWithId;
} {
  // Filter out the group being updated if excludeGroupId is provided
  const groupsToCheck = excludeGroupId
    ? existingGroups.filter((group) => group.id !== excludeGroupId)
    : existingGroups;

  // Check for same evaluatedUserId and groupType
  const sameUserGroups = groupsToCheck.filter(
    (group) =>
      group.evaluatedUserId === newGroupData.evaluatedUserId &&
      group.groupType === newGroupData.groupType
  );

  // Check for duplicate email
  const duplicateEmail = sameUserGroups.find(
    (group) =>
      group.evaluatorEmail.toLowerCase() ===
      newGroupData.evaluatorEmail.toLowerCase()
  );

  // Check for duplicate relation
  const duplicateRelation = sameUserGroups.find(
    (group) =>
      group.relation.toLowerCase() === newGroupData.relation.toLowerCase()
  );

  if (duplicateEmail && duplicateRelation) {
    return {
      isValid: false,
      duplicateType: "both",
      existingGroup: duplicateEmail,
    };
  }

  if (duplicateEmail) {
    return {
      isValid: false,
      duplicateType: "email",
      existingGroup: duplicateEmail,
    };
  }

  if (duplicateRelation) {
    return {
      isValid: false,
      duplicateType: "relation",
      existingGroup: duplicateRelation,
    };
  }

  return { isValid: true };
}

/**
 * Validate phone number with country code
 */
export function validatePhoneNumber(phone: string): {
  isValid: boolean;
  error?: string;
} {
  // Remove spaces and special characters except + and numbers
  const cleanPhone = phone.replace(/[^\d+]/g, "");

  // Check if it starts with + and has country code
  if (!cleanPhone.startsWith("+")) {
    return {
      isValid: false,
      error: "Phone number must include country code (e.g., +1234567890)",
    };
  }

  // Check minimum length (country code + number should be at least 8 digits)
  if (cleanPhone.length < 8) {
    return { isValid: false, error: "Phone number is too short" };
  }

  // Check maximum length (international standard)
  if (cleanPhone.length > 15) {
    return { isValid: false, error: "Phone number is too long" };
  }

  // Check if contains only digits after the +
  const phoneDigits = cleanPhone.substring(1);
  if (!/^\d+$/.test(phoneDigits)) {
    return {
      isValid: false,
      error: "Phone number can only contain digits after country code",
    };
  }

  return { isValid: true };
}

/**
 * Check for duplicate evaluator (email or phone)
 */
export async function checkDuplicateEvaluator(
  email: string,
  phone: string,
  language: "english" | "spanish" = "english"
): Promise<{
  isDuplicate: boolean;
  duplicateField?: "email" | "phone" | "both";
  existingEvaluator?: {
    name: string;
    email: string;
    phone: string;
    groupType: string;
  };
}> {
  try {
    const params = new URLSearchParams({ email, phone });
    const langParam = language === "spanish" ? "sp" : "en";

    const response = await fetch(
      `${API_BASE_URL}/evaluation/check-duplicate?${params.toString()}&lang=${langParam}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to check for duplicate evaluator");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Validate evaluation invitation token with enhanced validation
 */
export async function validateEvaluationToken(
  token: string,
  language: "english" | "spanish" = "english"
): Promise<{
  isValid: boolean;
  evaluatorName?: string;
  evaluatorEmail?: string;
  relation?: string;
  groupType?: "Parent" | "Teacher" | "SiblingFriend";
  evaluatedUserId?: string;
  tokenExpiryDate?: string;
  isTokenUsed?: boolean;
  isEvaluationCompleted?: boolean;
  error?: string;
}> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/evaluation/validate-token?token=${token}&lang=${langParam}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        isValid: false,
        error: errorData.message || "Invalid or expired token",
      };
    }

    const result = await response.json();
    return {
      isValid: true,
      evaluatorName: result.evaluatorName,
      evaluatorEmail: result.evaluatorEmail,
      relation: result.relation,
      groupType: result.groupType,
      evaluatedUserId: result.evaluatedUserId,
      tokenExpiryDate: result.tokenExpiryDate,
      isTokenUsed: result.isTokenUsed,
      isEvaluationCompleted: result.isEvaluationCompleted,
    };
  } catch (error) {
    return {
      isValid: false,
      error: "Failed to validate token",
    };
  }
}

/**
 * Get user evaluation progress summary
 */
export function getUserEvaluationProgressSummary(
  evaluationGroups: EvaluationGroupProgress[]
): UserEvaluationProgress["summary"] {
  const now = new Date();

  const summary = {
    totalGroups: evaluationGroups.length,
    completedEvaluations: 0,
    pendingEvaluations: 0,
    expiredInvitations: 0,
    groupsByType: {
      Parent: 0,
      Teacher: 0,
      SiblingFriend: 0,
      Self: 0,
    },
  };

  evaluationGroups.forEach((group) => {
    // Count by type
    summary.groupsByType[group.groupType]++;

    // Check status
    const expiryDate = new Date(group.tokenExpiryDate);

    if (group.isEvaluationCompleted) {
      summary.completedEvaluations++;
    } else if (expiryDate < now && !group.isTokenUsed) {
      summary.expiredInvitations++;
    } else {
      summary.pendingEvaluations++;
    }
  });

  return summary;
}

/**
 * Create a new 360-degree evaluation session
 */
export async function createEvaluationSession(
  sessionData: Partial<EvaluationSession>,
  language: "english" | "spanish" = "english"
): Promise<EvaluationSession> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/api/evaluation/sessions?lang=${langParam}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(sessionData),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to create evaluation session");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Get all evaluation groups for the current user
 * Note: This replaces the non-existent getEvaluationSessions function
 */
export async function getUserEvaluationGroupsForSessions(
  userId: string,
  language: "english" | "spanish" = "english"
): Promise<EvaluationGroupWithId[]> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/evaluation/user/${userId}?lang=${langParam}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return [];
      throw new Error("Failed to fetch evaluation groups");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Get all evaluation sessions for the current user
 * DEPRECATED: This function calls a non-existent endpoint
 * Use getUserEvaluationGroupsForSessions instead
 */
export async function getEvaluationSessions(): Promise<EvaluationSession[]> {
  throw new Error(
    "This function calls a non-existent endpoint. Use getUserEvaluationGroupsForSessions instead."
  );
}

/**
 * Get a specific evaluation session by ID
 */
export async function getEvaluationSession(
  sessionId: string,
  language: "english" | "spanish" = "english"
): Promise<EvaluationSession> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/api/evaluation/sessions/${sessionId}?lang=${langParam}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return null as any;
      throw new Error("Failed to fetch evaluation session");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Add evaluators to an evaluation session
 */
export async function addEvaluators(
  sessionId: string,
  evaluators: Partial<Evaluator>[],
  language: "english" | "spanish" = "english"
): Promise<Evaluator[]> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/api/evaluation/sessions/${sessionId}/evaluators?lang=${langParam}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ evaluators }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to add evaluators");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Send invitations to evaluators
 */
export async function sendEvaluationInvitations(
  sessionId: string,
  evaluatorIds: string[],
  language: "english" | "spanish" = "english"
): Promise<EvaluationInvitation[]> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/api/evaluation/sessions/${sessionId}/invitations?lang=${langParam}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({ evaluatorIds }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to send invitations");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Submit evaluation responses
 */
export async function submitEvaluationResponses(
  sessionId: string,
  evaluatorToken: string,
  responses: Partial<EvaluationResponse>[],
  language: "english" | "spanish" = "english"
): Promise<void> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/api/evaluation/sessions/${sessionId}/responses?lang=${langParam}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${evaluatorToken}`,
        },
        body: JSON.stringify({ responses }),
      }
    );

    if (!response.ok) {
      throw new Error("Failed to submit evaluation responses");
    }
  } catch (error) {
    throw error;
  }
}

/**
 * Get evaluation report
 */
export async function getEvaluationReport(
  sessionId: string,
  language: "english" | "spanish" = "english"
): Promise<EvaluationReport> {
  try {
    const langParam = language === "spanish" ? "sp" : "en";
    const response = await fetch(
      `${API_BASE_URL}/api/evaluation/sessions/${sessionId}/report?lang=${langParam}`,
      {
        headers: {
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) return null as any;
      throw new Error("Failed to fetch evaluation report");
    }

    return await response.json();
  } catch (error) {
    throw error;
  }
}

/**
 * Validate evaluator requirements
 */
export function validateEvaluatorRequirements(
  evaluators: Evaluator[],
  groups: EvaluatorGroup[]
): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const group of groups) {
    const groupEvaluators = evaluators.filter(
      (e) => e.groupType === group.type
    );

    if (groupEvaluators.length < group.minRequired) {
      errors.push(
        `${group.name} requires at least ${group.minRequired} evaluator(s), but only ${groupEvaluators.length} provided.`
      );
    }

    if (groupEvaluators.length > group.maxAllowed) {
      errors.push(
        `${group.name} allows maximum ${group.maxAllowed} evaluator(s), but ${groupEvaluators.length} provided.`
      );
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Generate unique invitation token
 */
export function generateInvitationToken(): string {
  return (
    Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15) +
    Date.now().toString(36)
  );
}

/**
 * Calculate competency averages from responses
 */
export function calculateCompetencyAverages(
  responses: EvaluationResponse[],
  competencies: CompetencyDimension[]
): { [competencyId: string]: number } {
  const averages: { [competencyId: string]: number } = {};

  for (const competency of competencies) {
    const competencyResponses = responses.filter((r) => {
      // Find questions related to this competency
      return r.ratingValue !== undefined;
    });

    if (competencyResponses.length > 0) {
      const sum = competencyResponses.reduce(
        (acc, r) => acc + (r.ratingValue || 0),
        0
      );
      averages[competency.id] = sum / competencyResponses.length;
    } else {
      averages[competency.id] = 0;
    }
  }

  return averages;
}

/**
 * Generate evaluation questions from competency dimensions
 */
export function generateEvaluationQuestions(
  competencies: CompetencyDimension[],
  language: "english" | "spanish" = "english"
): EvaluationQuestion[] {
  const questions: EvaluationQuestion[] = [];

  competencies.forEach((competency, index) => {
    const competencyName =
      language === "spanish"
        ? (competency.nameSpanish || competency.name).toLowerCase()
        : competency.name.toLowerCase();

    // Rating question
    questions.push({
      id: `${competency.id}-rating`,
      competencyId: competency.id,
      questionText:
        language === "spanish"
          ? `¿Cómo calificaría la ${competencyName} de esta persona?`
          : `How would you rate this person's ${competencyName}?`,
      questionType: "rating",
      isRequired: true,
      order: index * 2 + 1,
      helpText:
        language === "spanish"
          ? competency.descriptionSpanish || competency.description
          : competency.description,
    });

    // Open-ended question
    questions.push({
      id: `${competency.id}-feedback`,
      competencyId: competency.id,
      questionText:
        language === "spanish"
          ? `Por favor, proporcione ejemplos específicos o comentarios sobre la ${competencyName} de esta persona.`
          : `Please provide specific examples or feedback about this person's ${competencyName}.`,
      questionType: "open_ended",
      isRequired: false,
      order: index * 2 + 2,
      helpText:
        language === "spanish"
          ? "Comparta observaciones específicas, ejemplos o sugerencias para el desarrollo."
          : "Share specific observations, examples, or suggestions for development.",
    });
  });

  return questions;
}

/**
 * Mock data for development and testing
 */
export function createMockEvaluationSession(): EvaluationSession {
  const sessionId = `eval-${Date.now()}`;

  return {
    id: sessionId,
    evaluatedPersonId: "student-001",
    evaluatedPersonName: "John Doe",
    title: "360-Degree Educational Assessment",
    description:
      "Comprehensive evaluation for career guidance and personal development",
    status: "draft",
    createdBy: "admin-001",
    createdAt: new Date().toISOString(),
    startDate: new Date().toISOString(),
    endDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14 days from now
    competencyDimensions: DEFAULT_COMPETENCY_DIMENSIONS,
    ratingScale: DEFAULT_RATING_SCALE,
    evaluatorGroups: DEFAULT_EVALUATOR_GROUPS,
    evaluators: [],
    questions: generateEvaluationQuestions(
      DEFAULT_COMPETENCY_DIMENSIONS,
      "english"
    ),
    responses: [],
    configuration: {
      id: "default-config",
      name: "Default Configuration",
      description: "Standard evaluation configuration",
      competencyDimensions: DEFAULT_COMPETENCY_DIMENSIONS,
      ratingScale: DEFAULT_RATING_SCALE,
      evaluatorRequirements: {
        self: { minimum: 1, maximum: 1 },
        parent: { minimum: 1, maximum: 2 },
        teacher: { minimum: 1, maximum: 3 },
        peer: { minimum: 1, maximum: 3 },
      },
      evaluatorGroups: DEFAULT_EVALUATOR_GROUPS,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      allowAnonymousResponses: false,
      requireAllQuestions: true,
      allowPartialSubmissions: false,
      sendReminders: true,
      reminderIntervalDays: 3,
      maxReminders: 3,
      showProgressToEvaluated: true,
      generateReportAutomatically: true,
    },
    evaluatorRequirements: {
      self: { minimum: 1, maximum: 1 },
      parent: { minimum: 1, maximum: 2 },
      teacher: { minimum: 1, maximum: 3 },
      peer: { minimum: 1, maximum: 3 },
    },
  };
}

/**
 * Creates a default evaluation configuration
 */
export function createDefaultConfiguration(): EvaluationConfiguration {
  return {
    id: `config-${Date.now()}`,
    name: "Default Configuration",
    description: "Standard evaluation configuration",
    competencyDimensions: DEFAULT_COMPETENCY_DIMENSIONS,
    ratingScale: DEFAULT_RATING_SCALE,
    evaluatorRequirements: {
      self: { minimum: 1, maximum: 1 },
      parent: { minimum: 1, maximum: 2 },
      teacher: { minimum: 1, maximum: 3 },
      peer: { minimum: 1, maximum: 3 },
    },
    evaluatorGroups: DEFAULT_EVALUATOR_GROUPS,
    isActive: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
