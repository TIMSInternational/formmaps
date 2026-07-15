export interface EvaluationQuestion {
  id: string;
  questionText: string;
  questionTextSpanish?: string;
  questionType: "rating" | "open_ended" | "both";
  isRequired: boolean;
  order: number;
  helpText?: string;
  hasRealQuestionText?: boolean;
  category?: string;
  relationType?: string;
  isSubQuestion?: boolean;
  parentQuestionId?: string | null;
}

export interface ApiQuestion {
  id?: string;
  questionEnglishText: string;
  questionSpanishText?: string;
  questionNumber: number;
  category?: string;
  relationType?: string;
  isSubQuestion?: boolean;
  parentQuestionId?: string | null;
}

export interface ApiEvaluatorData {
  evolutorGroupId: string;
  evaluatedUserId: string;
  evaluatedUserEmail: string;
  evaluatedUserName: string;
  evaluatorName: string;
  evaluatorEmail: string;
  relationType: string;
  relation: string;
  groupType: string;
  isEvaluationCompleted: boolean;
  totalQuestions: number;
  limitedQuestions: number;
  responseScale?: ResponseScale;
  expiresAt?: string;
  isTokenUsed?: boolean;
}

export interface ApiResponse {
  success: boolean;
  data?: {
    evolutorGroupId: string;
    evaluatedUserId: string;
    evaluatedUserEmail: string;
    evaluatedUserName: string;
    evaluatorName: string;
    evaluatorEmail: string;
    relationType: string;
    relation: string;
    groupType: string;
    isEvaluationCompleted: boolean;
    totalQuestions: number;
    limitedQuestions: number;
    questions: ApiQuestion[];
    responseScale?: ResponseScale;
    expiresAt?: string;
    isTokenUsed?: boolean;
  };
  questions?: ApiQuestion[];
  evaluatorData?: ApiEvaluatorData;
  responseScale?: ResponseScale;
  totalQuestions?: number;
  message?: string;
  errorMessage?: string;
}

export interface ResponseScale {
  minValue: number;
  maxValue: number;
  labels: Array<{
    value: number;
    label: string;
    labelSpanish?: string;
  }>;
}

export interface EvaluationData {
  questions: EvaluationQuestion[];
  evaluatorGroupId: string;
  responseScale: ResponseScale;
}

export interface QuestionResponse {
  rating?: number;
  textResponse?: string;
  selectedValues?: string[];
  rankingOrder?: { value: string; rank: number }[];
  textValue?: string;
}

export const DEFAULT_RESPONSE_SCALE: ResponseScale = {
  minValue: 1,
  maxValue: 5,
  labels: [
    { value: 1, label: "Strongly Disagree", labelSpanish: "Totalmente en desacuerdo" },
    { value: 2, label: "Disagree", labelSpanish: "En desacuerdo" },
    { value: 3, label: "Neutral", labelSpanish: "Neutral" },
    { value: 4, label: "Agree", labelSpanish: "De acuerdo" },
    { value: 5, label: "Strongly Agree", labelSpanish: "Totalmente de acuerdo" },
  ],
};
