"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { LoadingSpinner } from "@/components/LoadingSpinner";
import {
  AlertCircle,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Star,
  Plus,
  Minus,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Lottie from "react-lottie";
import { useGlobalStore } from "@/store/useGlobalStore";

interface EvaluationQuestion {
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

interface EvaluationGroup {
  id: string;
  evaluatorName: string;
  evaluatorEmail: string;
  relation: string;
  groupType: string;
  evaluatedUserId: string;
  token: string;
  expiresAt: string;
  isTokenUsed: boolean;
  isEvaluationCompleted: boolean;
}

// API Response interfaces
interface ApiQuestion {
  id?: string;
  questionEnglishText: string;
  questionSpanishText?: string;
  questionNumber: number;
  category?: string;
  relationType?: string;
  isSubQuestion?: boolean;
  parentQuestionId?: string | null;
}

interface ApiEvaluatorData {
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

interface ApiResponse {
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

interface ResponseScale {
  minValue: number;
  maxValue: number;
  labels: Array<{
    value: number;
    label: string;
    labelSpanish?: string;
  }>;
}

interface SubmitAnswer {
  questionNumber: number;
  questionText: string;
  rating?: number;
  comment: string;
}

interface SubmitData {
  evaluationGroupId: string;
  evaluatorEmail: string;
  answers: SubmitAnswer[];
  comment: string;
}

interface ErrorResponse {
  message?: string;
}

interface EvaluationData {
  evaluationGroup: EvaluationGroup;
  questions: EvaluationQuestion[];
  responseScale: {
    minValue: number;
    maxValue: number;
    labels: {
      value: number;
      label: string;
      labelSpanish?: string;
      description?: string;
    }[];
  };
  totalQuestions: number;
}

export default function EvaluatorPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, language } = useGlobalStore();
  const token = searchParams.get("t");

  const [isLoading, setIsLoading] = useState(true);
  const [isValidating, setIsValidating] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evaluationData, setEvaluationData] = useState<EvaluationData | null>(
    null
  );
  const [evaluatorData, setEvaluatorData] = useState<ApiEvaluatorData | null>(
    null
  );
  const [responses, setResponses] = useState<
    Record<string, { rating?: number; textResponse?: string }>
  >({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [direction, setDirection] = useState(0);
  const [showComments, setShowComments] = useState(false);
  const [alreadySubmitted, setAlreadySubmitted] = useState(false);
  const [showEvaluationDetails, setShowEvaluationDetails] = useState(false);

  // Lottie animation options
  const successAnimationOptions = {
    loop: false,
    autoplay: true,
    animationData: {
      v: "5.7.1",
      meta: { g: "LottieFiles AE 0.1.20" },
      fr: 30,
      ip: 0,
      op: 60,
      w: 200,
      h: 200,
      nm: "Success Check",
      ddd: 0,
      assets: [],
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: "Check Outlines",
          sr: 1,
          ks: {
            o: { a: 0, k: 100, ix: 11 },
            r: { a: 0, k: 0, ix: 10 },
            p: { a: 0, k: [100, 100, 0], ix: 2 },
            a: { a: 0, k: [0, 0, 0], ix: 1 },
            s: { a: 0, k: [100, 100, 100], ix: 6 },
          },
          ao: 0,
          shapes: [
            {
              ty: "gr",
              it: [
                {
                  ind: 0,
                  ty: 4,
                  nm: "Check",
                  sr: 1,
                  ks: {
                    o: { a: 0, k: 100, ix: 11 },
                    r: { a: 0, k: 0, ix: 10 },
                    p: { a: 0, k: [0, 0, 0], ix: 2 },
                    a: { a: 0, k: [0, 0, 0], ix: 1 },
                    s: { a: 0, k: [100, 100, 100], ix: 6 },
                  },
                  ao: 0,
                  shapes: [
                    {
                      ty: "sh",
                      it: [
                        {
                          ty: "st",
                          c: { a: 0, k: [0.2, 0.8, 0.4, 1], ix: 3 },
                          o: { a: 0, k: 100, ix: 4 },
                          w: { a: 0, k: 8, ix: 5 },
                          lc: 2,
                          lj: 2,
                          bm: 0,
                          nm: "Stroke 1",
                          mn: "ADBE Vector Graphic - Stroke",
                          hd: false,
                        },
                        {
                          ty: "tr",
                          p: { a: 0, k: [0, 0], ix: 2 },
                          a: { a: 0, k: [0, 0], ix: 1 },
                          s: { a: 0, k: [100, 100], ix: 3 },
                          r: { a: 0, k: 0, ix: 6 },
                          o: { a: 0, k: 100, ix: 7 },
                          sk: { a: 0, k: 0, ix: 4 },
                          sa: { a: 0, k: 0, ix: 5 },
                          nm: "Transform",
                        },
                      ],
                      np: 3,
                      cix: 2,
                      bm: 0,
                      ix: 1,
                      mn: "ADBE Vector Group",
                      hd: false,
                    },
                    {
                      ty: "tm",
                      s: {
                        a: 1,
                        k: [
                          {
                            i: { x: [0.667], y: [1] },
                            o: { x: [0.333], y: [0] },
                            t: 20,
                            s: [0],
                          },
                          { t: 40, s: [100] },
                        ],
                        ix: 1,
                      },
                      e: { a: 0, k: 100, ix: 2 },
                      o: { a: 0, k: 0, ix: 3 },
                      m: 1,
                      ix: 2,
                      nm: "Trim Paths 1",
                      mn: "ADBE Vector Filter - Trim",
                      hd: false,
                    },
                  ],
                  ip: 20,
                  op: 60,
                  st: 20,
                  bm: 0,
                },
                {
                  ty: "gr",
                  it: [
                    {
                      ty: "el",
                      d: 1,
                      s: { a: 0, k: [80, 80], ix: 2 },
                      p: { a: 0, k: [0, 0], ix: 3 },
                      nm: "Ellipse Path 1",
                      mn: "ADBE Vector Shape - Ellipse",
                      hd: false,
                    },
                    {
                      ty: "st",
                      c: { a: 0, k: [0.2, 0.8, 0.4, 1], ix: 3 },
                      o: { a: 0, k: 100, ix: 4 },
                      w: { a: 0, k: 8, ix: 5 },
                      lc: 2,
                      lj: 2,
                      bm: 0,
                      nm: "Stroke 1",
                      mn: "ADBE Vector Graphic - Stroke",
                      hd: false,
                    },
                  ],
                  np: 3,
                  cix: 2,
                  bm: 0,
                  ix: 2,
                  mn: "ADBE Vector Group",
                  hd: false,
                },
              ],
              fFamily: "Arial",
              fWeight: "Regular",
              fStyle: "",
              fName: "",
              nm: "Check Outlines",
              mn: "ADBE Vector Group",
              hd: false,
            },
          ],
          ip: 0,
          op: 60,
          st: 0,
          bm: 0,
        },
      ],
    },
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };

  const submittedAnimationOptions = {
    loop: false,
    autoplay: true,
    animationData: {
      v: "5.7.1",
      meta: { g: "LottieFiles AE 0.1.20" },
      fr: 30,
      ip: 0,
      op: 60,
      w: 200,
      h: 200,
      nm: "Already Submitted",
      ddd: 0,
      assets: [],
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: "Check Circle",
          sr: 1,
          ks: {
            o: { a: 0, k: 100, ix: 11 },
            r: { a: 0, k: 0, ix: 10 },
            p: { a: 0, k: [100, 100, 0], ix: 2 },
            a: { a: 0, k: [0, 0, 0], ix: 1 },
            s: { a: 0, k: [100, 100, 100], ix: 6 },
          },
          ao: 0,
          shapes: [
            {
              ty: "gr",
              it: [
                {
                  ty: "el",
                  d: 1,
                  s: { a: 0, k: [80, 80], ix: 2 },
                  p: { a: 0, k: [0, 0], ix: 3 },
                  nm: "Circle",
                  mn: "ADBE Vector Shape - Ellipse",
                  hd: false,
                },
                {
                  ty: "st",
                  c: { a: 0, k: [0.2, 0.6, 1, 1], ix: 3 },
                  o: { a: 0, k: 100, ix: 4 },
                  w: { a: 0, k: 6, ix: 5 },
                  lc: 2,
                  lj: 2,
                  bm: 0,
                  nm: "Stroke 1",
                  mn: "ADBE Vector Graphic - Stroke",
                  hd: false,
                },
              ],
              np: 3,
              cix: 2,
              bm: 0,
              ix: 1,
              mn: "ADBE Vector Group",
              hd: false,
            },
            {
              ty: "gr",
              it: [
                {
                  ind: 0,
                  ty: 4,
                  nm: "Check",
                  sr: 1,
                  ks: {
                    o: { a: 0, k: 100, ix: 11 },
                    r: { a: 0, k: 0, ix: 10 },
                    p: { a: 0, k: [0, 0, 0], ix: 2 },
                    a: { a: 0, k: [0, 0, 0], ix: 1 },
                    s: { a: 0, k: [100, 100, 100], ix: 6 },
                  },
                  ao: 0,
                  shapes: [
                    {
                      ty: "sh",
                      it: [
                        {
                          ty: "st",
                          c: { a: 0, k: [0.2, 0.6, 1, 1], ix: 3 },
                          o: { a: 0, k: 100, ix: 4 },
                          w: { a: 0, k: 6, ix: 5 },
                          lc: 2,
                          lj: 2,
                          bm: 0,
                          nm: "Stroke 1",
                          mn: "ADBE Vector Graphic - Stroke",
                          hd: false,
                        },
                        {
                          ty: "tr",
                          p: { a: 0, k: [0, 0], ix: 2 },
                          a: { a: 0, k: [0, 0], ix: 1 },
                          s: { a: 0, k: [100, 100], ix: 3 },
                          r: { a: 0, k: 0, ix: 6 },
                          o: { a: 0, k: 100, ix: 7 },
                          sk: { a: 0, k: 0, ix: 4 },
                          sa: { a: 0, k: 0, ix: 5 },
                          nm: "Transform",
                        },
                      ],
                      np: 3,
                      cix: 2,
                      bm: 0,
                      ix: 1,
                      mn: "ADBE Vector Group",
                      hd: false,
                    },
                    {
                      ty: "tm",
                      s: {
                        a: 1,
                        k: [
                          {
                            i: { x: [0.667], y: [1] },
                            o: { x: [0.333], y: [0] },
                            t: 20,
                            s: [0],
                          },
                          { t: 40, s: [100] },
                        ],
                        ix: 1,
                      },
                      e: { a: 0, k: 100, ix: 2 },
                      o: { a: 0, k: 0, ix: 3 },
                      m: 1,
                      ix: 2,
                      nm: "Trim Paths 1",
                      mn: "ADBE Vector Filter - Trim",
                      hd: false,
                    },
                  ],
                  ip: 20,
                  op: 60,
                  st: 20,
                  bm: 0,
                },
              ],
              fFamily: "Arial",
              fWeight: "Regular",
              fStyle: "",
              fName: "",
              nm: "Check",
              mn: "ADBE Vector Group",
              hd: false,
            },
          ],
          ip: 0,
          op: 60,
          st: 0,
          bm: 0,
        },
      ],
    },
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };

  const loadingAnimationOptions = {
    loop: true,
    autoplay: true,
    animationData: {
      v: "5.7.1",
      meta: { g: "LottieFiles AE 0.1.20" },
      fr: 30,
      ip: 0,
      op: 120,
      w: 200,
      h: 200,
      nm: "Loading Spinner",
      ddd: 0,
      assets: [],
      layers: [
        {
          ddd: 0,
          ind: 1,
          ty: 4,
          nm: "Spinner",
          sr: 1,
          ks: {
            o: { a: 0, k: 100, ix: 11 },
            r: {
              a: 1,
              k: [
                {
                  i: { x: [0.667], y: [1] },
                  o: { x: [0.333], y: [0] },
                  t: 0,
                  s: [0],
                },
                { t: 120, s: [360] },
              ],
              ix: 10,
            },
            p: { a: 0, k: [100, 100, 0], ix: 2 },
            a: { a: 0, k: [0, 0, 0], ix: 1 },
            s: { a: 0, k: [100, 100, 100], ix: 6 },
          },
          ao: 0,
          shapes: [
            {
              ty: "gr",
              it: [
                {
                  ty: "rc",
                  d: 1,
                  s: { a: 0, k: [20, 60], ix: 2 },
                  p: { a: 0, k: [0, 0], ix: 3 },
                  r: { a: 0, k: 10, ix: 4 },
                  nm: "Rectangle Path 1",
                  mn: "ADBE Vector Shape - Rect",
                  hd: false,
                },
                {
                  ty: "fl",
                  c: { a: 0, k: [0.2, 0.6, 1, 1], ix: 4 },
                  o: { a: 0, k: 100, ix: 5 },
                  r: 1,
                  bm: 0,
                  nm: "Fill 1",
                  mn: "ADBE Vector Graphic - Fill",
                  hd: false,
                },
                {
                  ty: "tr",
                  p: { a: 0, k: [0, -20], ix: 2 },
                  a: { a: 0, k: [0, 0], ix: 1 },
                  s: { a: 0, k: [100, 100], ix: 3 },
                  r: { a: 0, k: 0, ix: 6 },
                  o: { a: 0, k: 100, ix: 7 },
                  sk: { a: 0, k: 0, ix: 4 },
                  sa: { a: 0, k: 0, ix: 5 },
                  nm: "Transform",
                },
              ],
              np: 3,
              cix: 2,
              bm: 0,
              ix: 1,
              mn: "ADBE Vector Group",
              hd: false,
            },
          ],
          ip: 0,
          op: 120,
          st: 0,
          bm: 0,
        },
      ],
    },
    rendererSettings: {
      preserveAspectRatio: "xMidYMid slice",
    },
  };

  // Skip token validation and directly fetch evaluation questions
  useEffect(() => {
    if (!token) {
      setError("No token provided");
      setIsValidating(false);
      setIsLoading(false);
      return;
    }

    // Directly use token as group ID to fetch questions (no validation needed)
    fetchEvaluationQuestions(token);
  }, [token]);

  const fetchEvaluationQuestions = async (groupId: string) => {
    try {
      // Use the correct API endpoint from Postman collection - no authorization needed
      const langParam = language === "spanish" ? "sp" : "en";
      const response = await fetch(
        `https://careerproject-eucbddf3h4h0ekfx.canadacentral-01.azurewebsites.net/evaluation/360evolutor/${groupId}?lang=${langParam}`
      );
      const data: ApiResponse = await response.json();

      console.log("API Response:", data); // Debug log to see response structure
      console.log("Data object:", data.data); // Debug log to see what's inside data

      if (!response.ok) {
        setError(
          data.message || `Failed to load questions: ${response.status}`
        );
        return;
      }

      if (data.errorMessage && data.errorMessage !== "") {
        setError(data.errorMessage);
        return;
      }

      // Handle different possible response structures
      let questions: ApiQuestion[] = [];
      let evaluatorData: ApiEvaluatorData | null = null;

      if (data.data && data.data.questions) {
        // Direct data.data structure with all evaluator info
        questions = data.data.questions;
        evaluatorData = {
          evolutorGroupId: data.data.evolutorGroupId,
          evaluatedUserId: data.data.evaluatedUserId,
          evaluatedUserEmail: data.data.evaluatedUserEmail,
          evaluatedUserName: data.data.evaluatedUserName,
          evaluatorName: data.data.evaluatorName,
          evaluatorEmail: data.data.evaluatorEmail,
          relationType: data.data.relationType,
          relation: data.data.relation,
          groupType: data.data.groupType,
          isEvaluationCompleted: data.data.isEvaluationCompleted,
          totalQuestions: data.data.totalQuestions,
          limitedQuestions: data.data.limitedQuestions,
          responseScale: data.data.responseScale,
          expiresAt: data.data.expiresAt,
          isTokenUsed: data.data.isTokenUsed,
        };
      } else if (data.questions) {
        // Fallback for old structure
        questions = data.questions;
        evaluatorData = data.evaluatorData || null;
      } else if (data.data && Array.isArray(data.data)) {
        questions = data.data as ApiQuestion[];
      } else {
        console.error("Unexpected API response structure:", data);
        setError("Invalid response format from server");
        return;
      }

      console.log("Extracted questions:", questions); // Debug log to see extracted questions
      console.log("First question object:", questions[0]); // Debug log to see actual question structure
      console.log("Evaluator data:", evaluatorData); // Debug log to see evaluator data

      // Map API question structure to component expected structure
      const mappedQuestions = questions.map((q: ApiQuestion, index: number) => {
        console.log(`Question ${index}:`, q); // Debug each question
        const questionText =
          q.questionEnglishText || `Question ${q.questionNumber || index + 1}`;

        // Check if we have actual question text (not just generic fallback)
        const hasRealQuestionText = !!(
          q.questionEnglishText &&
          q.questionEnglishText.trim() !== "" &&
          !q.questionEnglishText.startsWith("Question ")
        );

        return {
          id: q.id || `q${index}`,
          questionText: questionText,
          questionTextSpanish: q.questionSpanishText,
          questionType: "rating" as const, // Default to rating type
          isRequired: false, // Default to not required
          order: q.questionNumber || index + 1,
          helpText: undefined, // Remove category display
          hasRealQuestionText, // Flag to track if we have real question text
          category: q.category,
          relationType: q.relationType,
          isSubQuestion: q.isSubQuestion,
          parentQuestionId: q.parentQuestionId,
        };
      });

      // Check if any questions have real text
      const hasAnyRealQuestions = mappedQuestions.some(
        (q) => q.hasRealQuestionText
      );

      if (!hasAnyRealQuestions && questions.length > 0) {
        console.warn(
          "API returned questions but without actual question text content"
        );
        setError(
          "The evaluation questions are not properly configured. Please contact your administrator."
        );
        return;
      }

      console.log("Mapped questions:", mappedQuestions); // Debug log to see mapped questions

      // Create evaluation group from API response data
      const mockEvaluationGroup: EvaluationGroup = {
        id: groupId,
        evaluatorName: evaluatorData?.evaluatorName || "Evaluator",
        evaluatorEmail:
          evaluatorData?.evaluatorEmail || "evaluator@example.com", // Get email from API response
        relation: evaluatorData?.relation || "Unknown",
        groupType: evaluatorData?.groupType || "Unknown",
        evaluatedUserId: evaluatorData?.evaluatedUserId || "",
        token: token || "",
        expiresAt: evaluatorData?.expiresAt || "",
        isTokenUsed: evaluatorData?.isTokenUsed || false,
        isEvaluationCompleted: evaluatorData?.isEvaluationCompleted || false,
      };

      // Create default response scale if not provided
      const defaultResponseScale = {
        minValue: 1,
        maxValue: 5,
        labels: [
          {
            value: 1,
            label: "Not at all",
            labelSpanish: "Para nada",
          },
          {
            value: 2,
            label: "A little",
            labelSpanish: "Un poco",
          },
          {
            value: 3,
            label: "Somewhat",
            labelSpanish: "Algo",
          },
          {
            value: 4,
            label: "Quite a lot",
            labelSpanish: "Bastante",
          },
          {
            value: 5,
            label: "Very much",
            labelSpanish: "Mucho",
          },
        ],
      };

      setEvaluationData({
        evaluationGroup: mockEvaluationGroup,
        questions: mappedQuestions,
        responseScale:
          (evaluatorData && evaluatorData.responseScale) ||
          (data.data && data.data.responseScale) ||
          data.responseScale ||
          defaultResponseScale,
        totalQuestions:
          (evaluatorData && evaluatorData.totalQuestions) ||
          (data.data && data.data.totalQuestions) ||
          data.totalQuestions ||
          mappedQuestions.length,
      });

      // Set evaluator data for display
      setEvaluatorData(evaluatorData);

      // Check if evaluation is already completed
      if (mockEvaluationGroup.isEvaluationCompleted) {
        setAlreadySubmitted(true);
      }
    } catch (err: unknown) {
      console.error("Fetch error:", err);
      setError("Failed to load evaluation questions");
    } finally {
      setIsValidating(false);
      setIsLoading(false);
    }
  };

  const nextStep = () => {
    if (currentStep < (evaluationData?.questions?.length || 0) - 1) {
      setDirection(1);
      setCurrentStep(currentStep + 1);
      setShowComments(false); // Reset comments visibility
    }
  };

  const prevStep = () => {
    if (currentStep > 0) {
      setDirection(-1);
      setCurrentStep(currentStep - 1);
      setShowComments(false); // Reset comments visibility
    }
  };

  const goToStep = (step: number) => {
    setDirection(step > currentStep ? 1 : -1);
    setCurrentStep(step);
    setShowComments(false); // Reset comments visibility
  };

  const currentQuestion = evaluationData?.questions?.[currentStep];
  const progress = evaluationData
    ? ((currentStep + 1) / evaluationData.questions.length) * 100
    : 0;

  const handleResponseChange = (
    questionId: string,
    field: "rating" | "textResponse",
    value: string | number
  ) => {
    setResponses((prev) => ({
      ...prev,
      [questionId]: {
        ...prev[questionId],
        [field]: value,
      },
    }));
  };

  const handleSubmit = async () => {
    if (
      !evaluationData ||
      !evaluationData.questions ||
      evaluationData.questions.length === 0
    ) {
      setError("No evaluation data available");
      return;
    }

    // Check if questions have real content
    const questionsWithoutRealText = evaluationData.questions.filter(
      (q) => !q.hasRealQuestionText
    );
    if (questionsWithoutRealText.length > 0) {
      setError(
        "Some evaluation questions are not properly configured. Please contact your administrator."
      );
      return;
    }

    // Validate required responses
    const missingRequired = evaluationData.questions
      .filter((q) => q.isRequired)
      .filter(
        (q) => !responses[q.id]?.rating && !responses[q.id]?.textResponse
      );

    if (missingRequired.length > 0) {
      setError("Please answer all required questions");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    console.log("Debug - evaluationData.questions:", evaluationData.questions);
    console.log("Debug - responses:", responses);

    try {
      const submitData: SubmitData = {
        evaluationGroupId: token || "", // Use token directly as group ID
        evaluatorEmail:
          evaluatorData?.evaluatorEmail ||
          evaluationData.evaluationGroup.evaluatorEmail, // Use evaluator email from API response
        answers: Object.entries(responses).map(([questionId, response]) => {
          const question = evaluationData.questions.find(
            (q) => q.id === questionId
          );
          console.log(
            `Debug - questionId: ${questionId}, question found:`,
            question
          );

          // Use the English question text for submission (API expects English)
          let questionText = question?.questionText || "";
          if (!questionText || questionText.trim() === "") {
            questionText = `Question ${question?.order || questionId}`;
          }

          console.log(`Debug - questionText for ${questionId}:`, questionText);
          return {
            questionNumber:
              question?.order || parseInt(questionId.replace("q", "")), // Use order field which maps to questionNumber
            questionText: questionText, // Always send English text to API
            rating: response.rating,
            comment: response.textResponse || "",
          };
        }),
        comment: "", // General comment can be empty
      };

      // Submit to the correct feedback endpoint from Postman collection
      const langParam = language === "spanish" ? "sp" : "en";
      const response = await fetch(
        `https://careerproject-eucbddf3h4h0ekfx.canadacentral-01.azurewebsites.net/evaluation/submit-feedback?lang=${langParam}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(submitData),
        }
      );

      if (response.ok) {
        setSuccess(true);
      } else {
        const errorData: ErrorResponse = await response.json();
        setError(errorData.message || "Failed to submit evaluation");
      }
    } catch (err: unknown) {
      console.error("Submission error:", err);
      setError("Failed to submit evaluation. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading || isValidating) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center w-full max-w-md mx-auto">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="mb-6"
          >
            <Lottie
              options={loadingAnimationOptions}
              height={100}
              width={100}
              style={{ margin: "0 auto" }}
            />
          </motion.div>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.5 }}
            className="text-gray-600"
          >
            Loading evaluation...
          </motion.p>
        </div>
      </div>
    );
  }

  if (error && !evaluationData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Card className="w-full max-w-md shadow-xl border-0 bg-white relative">
          <CardHeader className="text-center pb-2">
            <div className="flex justify-center mb-6">
              <div className="relative">
                {/* Clean background glow */}
                <div className="w-28 h-28 bg-blue-50 rounded-full opacity-60"></div>

                {/* Main icon container */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-20 h-20 bg-white rounded-full shadow-lg flex items-center justify-center border border-slate-200">
                    {/* Link icon */}
                    <svg
                      className="w-10 h-10 text-blue-600"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.5}
                        d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"
                      />
                    </svg>
                  </div>
                </div>
              </div>
            </div>
            <CardTitle className="text-slate-800 text-xl font-semibold">
              Link Not Available
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-2">
            <CardDescription className="text-slate-600 text-center leading-relaxed mb-4">
              {error}
            </CardDescription>
            <div className="text-center">
              <div className="inline-flex items-center px-4 py-2 bg-blue-50 rounded-lg border border-blue-200">
                <svg
                  className="w-4 h-4 text-blue-600 mr-2"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                  />
                </svg>
                <p className="text-sm text-blue-800 font-medium">
                  Please contact your administrator
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-green-50 via-white to-blue-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm overflow-hidden">
            {/* Animated background gradient */}
            <div className="absolute inset-0 bg-gradient-to-br from-green-400/10 via-blue-400/5 to-purple-400/10 animate-pulse"></div>

            <CardContent className="relative p-8 text-center">
              {/* Lottie Success Animation */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  delay: 0.2,
                  duration: 0.5,
                  type: "spring",
                  bounce: 0.4,
                }}
                className="mb-6"
              >
                <Lottie
                  options={successAnimationOptions}
                  height={120}
                  width={120}
                  style={{ margin: "0 auto" }}
                />
              </motion.div>

              {/* Title */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.4 }}
                className="mb-4"
              >
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                  Thank You! 🎉
                </h2>
                <div className="w-16 h-1 bg-gradient-to-r from-green-400 to-blue-500 mx-auto rounded-full"></div>
              </motion.div>

              {/* Message */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.4 }}
                className="mb-6"
              >
                <p className="text-gray-600 text-lg leading-relaxed">
                  Your evaluation has been submitted successfully!
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Your feedback helps us provide better career guidance.
                </p>
              </motion.div>

              {/* Decorative elements */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1, duration: 0.4 }}
                className="flex justify-center space-x-2"
              >
                <div
                  className="w-2 h-2 bg-green-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.1s" }}
                ></div>
                <div
                  className="w-2 h-2 bg-purple-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0.2s" }}
                ></div>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (alreadySubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-gray-50 p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="w-full max-w-md"
        >
          <Card className="shadow-2xl border-0 bg-white/95 backdrop-blur-sm overflow-hidden">
            <CardContent className="relative p-8 text-center">
              {/* Lottie Already Submitted Animation */}
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{
                  delay: 0.2,
                  duration: 0.5,
                  type: "spring",
                  bounce: 0.4,
                }}
                className="mb-6"
              >
                <Lottie
                  options={submittedAnimationOptions}
                  height={120}
                  width={120}
                  style={{ margin: "0 auto" }}
                />
              </motion.div>

              {/* Title */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.4 }}
                className="mb-4"
              >
                <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">
                  Already Submitted
                </h2>
                <div className="w-16 h-1 bg-gradient-to-r from-blue-400 to-blue-500 mx-auto rounded-full"></div>
              </motion.div>

              {/* Message */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.4 }}
                className="mb-6"
              >
                <p className="text-gray-600 text-lg leading-relaxed">
                  Thank you, your evaluation has already been submitted.
                </p>
                <p className="text-sm text-gray-500 mt-2">
                  Your response has been recorded successfully!
                </p>
              </motion.div>

              {/* Button */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, duration: 0.4 }}
              >
                <Button
                  onClick={() =>
                    evaluationData?.evaluationGroup.groupType === "Parent" &&
                    evaluationData?.evaluationGroup.relation === "Self"
                      ? router.push("/dashboard")
                      : router.push("/")
                  }
                  className="w-full bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700"
                >
                  {evaluationData?.evaluationGroup.groupType === "Parent" &&
                  evaluationData?.evaluationGroup.relation === "Self"
                    ? "Back to Dashboard"
                    : "Return to Homepage"}
                </Button>
              </motion.div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    );
  }

  if (!evaluationData) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 py-4 md:py-8">
      <div className="max-w-4xl mx-auto px-4 pb-24 md:pb-8">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-6 md:mb-8"
        >
          {/* <div className="inline-flex items-center justify-center w-12 h-12 md:w-16 md:h-16 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full mb-3 md:mb-4">
            <Star className="w-6 h-6 md:w-8 md:h-8 text-white" />
          </div> */}
          <div className="flex items-center justify-center gap-4 mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900">
              360°{" "}
              {language === "spanish"
                ? "Evaluación de Carrera"
                : "Career Evaluation"}
            </h1>
          </div>
          <p className="text-sm md:text-base text-gray-600">
            {language === "spanish"
              ? "Ayúdanos a comprender las preferencias y fortalezas profesionales"
              : "Help us understand career preferences and strengths"}
          </p>
        </motion.div>

        {/* Evaluator Information - Collapsible */}
        {evaluatorData && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mb-6 md:mb-8"
          >
            <div className="bg-white rounded-lg shadow-sm border">
              <button
                onClick={() => setShowEvaluationDetails(!showEvaluationDetails)}
                className="w-full flex items-center justify-between p-3 md:p-4 text-left hover:bg-gray-50 transition-colors"
              >
                <h2 className="text-base md:text-lg font-semibold text-gray-900">
                  {language === "spanish"
                    ? "Detalles de la Evaluación"
                    : "Evaluation Details"}
                </h2>
                <ChevronDown
                  className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${
                    showEvaluationDetails ? "rotate-180" : ""
                  }`}
                />
              </button>
              <AnimatePresence>
                {showEvaluationDetails && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 md:px-6 pb-4 md:pb-6">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="font-medium text-gray-700">
                            {language === "spanish"
                              ? "Evaluador:"
                              : "Evaluator:"}
                          </span>{" "}
                          <span className="text-gray-900">
                            {evaluatorData.evaluatorName}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">
                            {language === "spanish"
                              ? "Evaluando a:"
                              : "Evaluating:"}
                          </span>{" "}
                          <span className="text-gray-900">
                            {evaluatorData.evaluatedUserName}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">
                            {language === "spanish"
                              ? "Relación:"
                              : "Relationship:"}
                          </span>{" "}
                          <span className="text-gray-900">
                            {evaluatorData.relation}
                          </span>
                        </div>
                        <div>
                          <span className="font-medium text-gray-700">
                            {language === "spanish"
                              ? "Tipo de Grupo:"
                              : "Group Type:"}
                          </span>{" "}
                          <span className="text-gray-900">
                            {evaluatorData.groupType}
                          </span>
                        </div>
                        {evaluatorData.expiresAt && (
                          <div className="md:col-span-2">
                            <span className="font-medium text-gray-700">
                              {language === "spanish" ? "Expira:" : "Expires:"}
                            </span>{" "}
                            <span className="text-gray-900">
                              {new Date(
                                evaluatorData.expiresAt
                              ).toLocaleDateString()}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        {/* Progress Bar */}
        {evaluationData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="mb-6 md:mb-8"
          >
            <div className="bg-white rounded-lg shadow-sm border p-4 md:p-6">
              <div className="flex justify-between items-center mb-3 md:mb-4">
                <span className="text-sm font-medium text-gray-700">
                  {language === "spanish"
                    ? `Pregunta ${currentStep + 1} de ${
                        evaluationData.questions.length
                      }`
                    : `Question ${currentStep + 1} of ${
                        evaluationData.questions.length
                      }`}
                </span>
                <span className="text-sm text-gray-500">
                  {Math.round(progress)}%{" "}
                  {language === "spanish" ? "Completo" : "Complete"}
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 md:h-3">
                <motion.div
                  className="bg-gradient-to-r from-blue-500 to-purple-600 h-2 md:h-3 rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.5 }}
                />
              </div>
            </div>
          </motion.div>
        )}

        {/* Error Alert */}
        {error && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mb-4 md:mb-6"
          >
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">
                {error}
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Question Card */}
        <AnimatePresence mode="wait" custom={direction}>
          {currentQuestion && (
            <motion.div
              key={currentStep}
              custom={direction}
              initial={{ opacity: 0, x: direction > 0 ? 300 : -300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction > 0 ? -300 : 300 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
            >
              <Card className="shadow-lg border-0 bg-white/80 backdrop-blur-sm">
                <CardHeader className="">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div className="w-7 h-7 md:w-8 md:h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-full flex items-center justify-center">
                        <span className="text-white text-xs md:text-sm font-semibold">
                          {currentStep + 1}
                        </span>
                      </div>
                      <span className="text-xs md:text-sm text-gray-500">
                        {language === "spanish" ? "Pregunta" : "Question"}
                      </span>
                    </div>
                  </div>
                  <CardTitle className="text-lg md:text-xl leading-relaxed  text-gray-900">
                    {language === "spanish" &&
                    currentQuestion.questionTextSpanish
                      ? currentQuestion.questionTextSpanish
                      : currentQuestion.questionText}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 md:space-y-6 ">
                  {/* Rating Section */}
                  <div>
                    <Label className="text-sm md:text-base font-semibold text-gray-800 mb-2 md:mb-3 block">
                      {language === "spanish"
                        ? "¿Qué tanto estás de acuerdo con la afirmación anterior?"
                        : "How much do you agree with the above statement?"}
                    </Label>

                    {/* Rating Grid with Comments Button */}
                    <div className="grid grid-cols-1  gap-3 md:gap-4">
                      {/* Rating Options - Takes 2 columns on desktop */}
                      <div className="">
                        <RadioGroup
                          value={
                            responses[currentQuestion.id]?.rating?.toString() ||
                            ""
                          }
                          onValueChange={(value) =>
                            handleResponseChange(
                              currentQuestion.id,
                              "rating",
                              parseInt(value)
                            )
                          }
                          className="grid grid-cols-1 md:grid-cols-2 gap-2 md:gap-3 "
                        >
                          {evaluationData?.responseScale.labels.map(
                            (option, index) => (
                              <motion.div
                                key={option.value}
                                initial={{ opacity: 0, y: 20 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{
                                  duration: 0.3,
                                  delay: index * 0.1,
                                }}
                                className="relative"
                              >
                                <div className="relative">
                                  <label
                                    htmlFor={`${currentQuestion.id}-${option.value}`}
                                    className="flex items-center space-x-3 p-3 md:p-4 rounded-lg border-2 border-gray-200 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200 cursor-pointer w-full"
                                  >
                                    <RadioGroupItem
                                      value={option.value.toString()}
                                      id={`${currentQuestion.id}-${option.value}`}
                                      className="text-blue-600"
                                    />
                                    <span className="flex-1 text-sm md:text-base font-medium text-gray-700">
                                      {language === "spanish" &&
                                      option.labelSpanish
                                        ? option.labelSpanish
                                        : option.label}
                                    </span>
                                  </label>
                                </div>
                              </motion.div>
                            )
                          )}
                          <div className="md:col-span-1 cursor-pointer flex md:flex-col md:justify-center md:items-center">
                            <Button
                              onClick={() => setShowComments(!showComments)}
                              variant="outline"
                              className="w-full  md:w-full md:h-auto flex items-center justify-center space-x-2 p-3 md:p-4 border-dashed border-2 hover:border-blue-300 hover:bg-blue-50 transition-all duration-200"
                            >
                              {showComments ? (
                                <>
                                  <Minus className="w-4 h-4 text-gray-500" />
                                  <span className="text-sm font-medium text-gray-600">
                                    {language === "spanish"
                                      ? "Ocultar Comentarios"
                                      : "Hide Comments"}
                                  </span>
                                </>
                              ) : (
                                <>
                                  <Plus className="w-4 h-4 text-blue-500" />
                                  <span className="text-sm font-medium text-gray-600">
                                    {language === "spanish"
                                      ? "Agregar Comentarios"
                                      : "Add Comments"}
                                  </span>
                                </>
                              )}
                            </Button>
                          </div>
                        </RadioGroup>
                      </div>

                      {/* Comments Button - Takes 1 column on desktop */}
                    </div>

                    {/* Comments Textarea - Shows when button is clicked */}
                    {showComments && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                        className="mt-4 pt-4 border-t border-gray-200"
                      >
                        <Label
                          htmlFor={`text-${currentQuestion.id}`}
                          className="text-sm font-medium text-gray-600 mb-2 block"
                        >
                          {language === "spanish"
                            ? "Comentarios adicionales (opcional)"
                            : "Additional comments (optional)"}
                        </Label>
                        <Textarea
                          id={`text-${currentQuestion.id}`}
                          placeholder={
                            language === "spanish"
                              ? "Comparte cualquier pensamiento adicional..."
                              : "Share any additional thoughts..."
                          }
                          value={
                            responses[currentQuestion.id]?.textResponse || ""
                          }
                          onChange={(e) =>
                            handleResponseChange(
                              currentQuestion.id,
                              "textResponse",
                              e.target.value
                            )
                          }
                          rows={3}
                          className="resize-none border-gray-300 focus:border-blue-500 focus:ring-blue-500 text-sm md:text-base"
                        />
                      </motion.div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fixed Navigation */}
      {evaluationData && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-sm border-t border-gray-200 px-4 py-4 md:relative md:bg-transparent md:backdrop-blur-none md:border-0 md:px-0 md:py-0 md:mt-8"
        >
          <div className="max-w-4xl mx-auto">
            <div className="flex flex-row md:flex-row md:justify-between md:items-center gap-4">
              {/* Previous Button */}
              <Button
                onClick={prevStep}
                disabled={currentStep === 0}
                variant="outline"
                className="flex items-center justify-center space-x-2 w-auto md:w-auto order-2 md:order-1 px-3 md:px-4"
                size="lg"
              >
                <ChevronLeft className="w-4 h-4" />
                <span className="hidden md:inline">
                  {language === "spanish" ? "Anterior" : "Previous"}
                </span>
              </Button>

              {/* Progress Dots - Hidden on mobile, shown on desktop */}
              <div className="hidden md:flex space-x-2 order-1 md:order-2">
                {evaluationData.questions.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => goToStep(index)}
                    className={`w-3 h-3 rounded-full transition-all duration-200 ${
                      index === currentStep
                        ? "bg-blue-600 scale-125"
                        : index < currentStep
                        ? "bg-green-500"
                        : "bg-gray-300 hover:bg-gray-400"
                    }`}
                  />
                ))}
              </div>

              {/* Next/Submit Button */}
              <div className="order-3 flex-1">
                {currentStep === evaluationData.questions.length - 1 ? (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="flex items-center justify-center space-x-2 w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 px-4 md:px-6"
                    size="lg"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="w-4 h-4 flex items-center justify-center">
                          <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        </div>
                        <span className="hidden md:inline">
                          {language === "spanish"
                            ? "Enviando..."
                            : "Submitting..."}
                        </span>
                        <span className="md:hidden">
                          {language === "spanish" ? "Enviar" : "Submit"}
                        </span>
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        <span className="hidden md:inline">
                          {language === "spanish"
                            ? "Enviar Evaluación"
                            : "Submit Evaluation"}
                        </span>
                        <span className="md:hidden">
                          {language === "spanish" ? "Enviar" : "Submit"}
                        </span>
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={nextStep}
                    className="flex items-center justify-center space-x-2 w-full bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 px-4 md:px-6"
                    size="lg"
                  >
                    <span className="hidden md:inline">
                      {language === "spanish" ? "Siguiente" : "Next"}
                    </span>
                    <span className="md:hidden">
                      {language === "spanish" ? "Siguiente" : "Next"}
                    </span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}
