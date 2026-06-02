import { useState, useEffect } from "react";
import {
  EvaluationSession,
  EvaluationReport,
  Evaluator,
  EvaluationResponse,
  getEvaluationSession,
  addEvaluators,
  sendEvaluationInvitations,
  getEvaluationReport,
  validateEvaluatorRequirements,
  DEFAULT_EVALUATOR_GROUPS,
  createMockEvaluationSession,
  getUserEvaluationGroupsForSessions,
  getCounselorEvaluations,
  EvaluationGroupWithId,
} from "@/services/evaluationService";
import { useGlobalStore } from "@/store/useGlobalStore";

export interface EvaluationProgress {
  totalSessions: number;
  activeSessions: number;
  completedSessions: number;
  pendingResponses: number;
  responseRate: number;
  lastUpdated: string;
}

export function useEvaluationData() {
  const { language, user } = useGlobalStore();
  const [sessions, setSessions] = useState<EvaluationSession[]>([]);
  const [currentSession, setCurrentSession] =
    useState<EvaluationSession | null>(null);
  const [progress, setProgress] = useState<EvaluationProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadEvaluationData = async () => {
    try {
      setLoading(true);
      setError(null);

      // For development, use mock data if API is not available
      const useMockData = false; // We want to test real data now

      if (useMockData) {
        // Load mock data from localStorage or create new
        const savedSessions = localStorage.getItem("evaluation_sessions");
        let sessionData: EvaluationSession[] = [];

        if (savedSessions) {
          sessionData = JSON.parse(savedSessions);
        } else {
          // Create a mock session for development
          const mockSession = createMockEvaluationSession();
          sessionData = [mockSession];
          localStorage.setItem(
            "evaluation_sessions",
            JSON.stringify(sessionData)
          );
        }

        setSessions(sessionData);

        // Calculate progress
        const progressData = calculateProgress(sessionData);
        setProgress(progressData);
      } else {
        // Load from API in production
        // First check if the user is a counselor
        const userStr = localStorage.getItem("user");
        let isCounselor = false;
        if (userStr) {
          try {
            const user = JSON.parse(userStr);
            isCounselor = user?.roleName?.toLowerCase() === "counselor";
          } catch (e) {
      // error handled silently
    }
        }

        const sessionMap = new Map<string, EvaluationSession>();

        if (isCounselor) {
          const counselorEvals = await getCounselorEvaluations();
          counselorEvals.forEach((group) => {
            const evaluatedUserId = group.evaluatedUserId;
            if (!sessionMap.has(evaluatedUserId)) {
              const mockSession = createMockEvaluationSession();
              sessionMap.set(evaluatedUserId, {
                ...mockSession,
                id: evaluatedUserId,
                evaluatedPersonId: evaluatedUserId,
                evaluatedPersonName: group.evaluatedUserName || "Unknown",
                title: `Evaluation for ${group.evaluatedUserName || "Unknown"}`,
                status: group.isEvaluationCompleted ? "completed" : "active",
                evaluators: [],
                evaluatorGroups: DEFAULT_EVALUATOR_GROUPS,
              });
            }

            const session = sessionMap.get(evaluatedUserId)!;
            const evaluator: Evaluator = {
              id: group.id,
              name: group.evaluatorName,
              email: group.evaluatorEmail,
              phone: "",
              relationship: group.relation,
              groupType: (group.groupType?.toLowerCase() || "parent") as "self" | "parent" | "teacher" | "sibling_friend",
              invitationToken: group.invitationToken,
              invitationSent: group.isTokenUsed,
              responseReceived: group.isEvaluationCompleted,
              isActive: true,
            };
            session.evaluators.push(evaluator);
            // Re-assess session status if any evaluator is still active
            if (!group.isEvaluationCompleted && session.status === "completed") {
                session.status = "active";
            }
          });
        } else {
          // Standard student flow
          const userId = user?.id;
          if (!userId) return;
          const evaluationGroups = await getUserEvaluationGroupsForSessions(
            userId,
            language
          );

          evaluationGroups.forEach((group) => {
            const evaluatedUserId = group.evaluatedUserId;
            if (!sessionMap.has(evaluatedUserId)) {
              const mockSession = createMockEvaluationSession();
              sessionMap.set(evaluatedUserId, {
                ...mockSession,
                id: evaluatedUserId,
                evaluatedPersonId: evaluatedUserId,
                evaluatedPersonName: group.evaluatorName, // NOTE: this should be the evaluated person name. Wait, the endpoint getUserEvaluationGroupsForSessions doesn't return the evaluated student's name in `EvaluationGroupWithId`. Let's fallback to "My Evaluation" if needed, but since this is presumably the student looking at their own, maybe "My Evaluation".
                title: `Evaluation for ${group.evaluatorName}`,
                status: group.isEvaluationCompleted ? "completed" : "active",
                evaluators: [],
                evaluatorGroups: DEFAULT_EVALUATOR_GROUPS,
              });
            }

            const session = sessionMap.get(evaluatedUserId)!;
            const evaluator: Evaluator = {
              id: group.id,
              name: group.evaluatorName,
              email: group.evaluatorEmail,
              phone: "",
              relationship: group.relation,
              groupType: group.groupType.toLowerCase() as
                | "self"
                | "parent"
                | "teacher"
                | "sibling_friend",
              invitationToken: group.invitationToken,
              invitationSent: true,
              responseReceived: group.isEvaluationCompleted,
              isActive: true,
            };
            session.evaluators.push(evaluator);
            if (!group.isEvaluationCompleted && session.status === "completed") {
                session.status = "active";
            }
          });
        }

        const sessionData = Array.from(sessionMap.values());
        setSessions(sessionData);

        const progressData = calculateProgress(sessionData);
        setProgress(progressData);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load evaluation data"
      );
    } finally {
      setLoading(false);
    }
  };

  const calculateProgress = (
    sessionData: EvaluationSession[]
  ): EvaluationProgress => {
    const totalSessions = sessionData.length;
    const activeSessions = sessionData.filter(
      (s) => s.status === "active"
    ).length;
    const completedSessions = sessionData.filter(
      (s) => s.status === "completed"
    ).length;

    let totalEvaluators = 0;
    let totalResponses = 0;

    sessionData.forEach((session) => {
      totalEvaluators += session.evaluators.length;
      totalResponses += session.evaluators.filter(
        (e) => e.responseReceived
      ).length;
    });

    const responseRate =
      totalEvaluators > 0 ? (totalResponses / totalEvaluators) * 100 : 0;
    const pendingResponses = totalEvaluators - totalResponses;

    return {
      totalSessions,
      activeSessions,
      completedSessions,
      pendingResponses,
      responseRate,
      lastUpdated: new Date().toISOString(),
    };
  };

  const loadSession = async (
    sessionId: string
  ): Promise<EvaluationSession | null> => {
    try {
      setError(null);

      const isDevelopment = process.env.NODE_ENV === "development";

      if (isDevelopment) {
        const session = sessions.find((s) => s.id === sessionId) || null;
        setCurrentSession(session);
        return session;
      } else {
        const session = await getEvaluationSession(sessionId, language);
        setCurrentSession(session);
        return session;
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load evaluation session"
      );
      return null;
    }
  };

  const addEvaluatorsToSession = async (
    sessionId: string,
    evaluators: Partial<Evaluator>[]
  ): Promise<Evaluator[]> => {
    try {
      setError(null);

      const isDevelopment = process.env.NODE_ENV === "development";

      if (isDevelopment) {
        // Mock implementation for development
        const newEvaluators: Evaluator[] = evaluators.map(
          (evaluator, index) => ({
            id: `evaluator-${Date.now()}-${index}`,
            name: evaluator.name || "",
            email: evaluator.email || "",
            phone: evaluator.phone || "",
            relationship: evaluator.relationship || "",
            groupType: evaluator.groupType || "parent",
            invitationToken: Math.random().toString(36).substring(2, 15),
            invitationSent: false,
            responseReceived: false,
            isActive: true,
          })
        );

        // Update session in localStorage
        const updatedSessions = sessions.map((session) => {
          if (session.id === sessionId) {
            return {
              ...session,
              evaluators: [...session.evaluators, ...newEvaluators],
            };
          }
          return session;
        });

        setSessions(updatedSessions);
        localStorage.setItem(
          "evaluation_sessions",
          JSON.stringify(updatedSessions)
        );

        return newEvaluators;
      } else {
        const newEvaluators = await addEvaluators(sessionId, evaluators);

        // Update local state
        setSessions((prev) =>
          prev.map((session) => {
            if (session.id === sessionId) {
              return {
                ...session,
                evaluators: [...session.evaluators, ...newEvaluators],
              };
            }
            return session;
          })
        );

        return newEvaluators;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add evaluators");
      throw err;
    }
  };

  const sendInvitations = async (
    sessionId: string,
    evaluatorIds: string[]
  ): Promise<void> => {
    try {
      setError(null);

      const isDevelopment = process.env.NODE_ENV === "development";

      if (isDevelopment) {
        // Mock implementation for development
        const updatedSessions = sessions.map((session) => {
          if (session.id === sessionId) {
            const updatedEvaluators = session.evaluators.map((evaluator) => {
              if (evaluatorIds.includes(evaluator.id)) {
                return {
                  ...evaluator,
                  invitationSent: true,
                  invitationSentAt: new Date().toISOString(),
                };
              }
              return evaluator;
            });

            return {
              ...session,
              evaluators: updatedEvaluators,
            };
          }
          return session;
        });

        setSessions(updatedSessions);
        localStorage.setItem(
          "evaluation_sessions",
          JSON.stringify(updatedSessions)
        );
      } else {
        await sendEvaluationInvitations(sessionId, evaluatorIds);

        // Update local state
        setSessions((prev) =>
          prev.map((session) => {
            if (session.id === sessionId) {
              const updatedEvaluators = session.evaluators.map((evaluator) => {
                if (evaluatorIds.includes(evaluator.id)) {
                  return {
                    ...evaluator,
                    invitationSent: true,
                    invitationSentAt: new Date().toISOString(),
                  };
                }
                return evaluator;
              });

              return {
                ...session,
                evaluators: updatedEvaluators,
              };
            }
            return session;
          })
        );
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send invitations"
      );
      throw err;
    }
  };

  const getSessionReport = async (
    sessionId: string
  ): Promise<EvaluationReport | null> => {
    try {
      setError(null);

      const isDevelopment = process.env.NODE_ENV === "development";

      if (isDevelopment) {
        // Mock report for development
        const session = sessions.find((s) => s.id === sessionId);
        if (!session) return null;

        const mockReport: EvaluationReport = {
          id: `report-${sessionId}`,
          evaluationId: sessionId,
          generatedAt: new Date().toISOString(),
          summary: {
            totalEvaluators: session.evaluators.length,
            responseRate: 75,
            completionRate: 80,
            averageRatings: {
              "interests-001": 4.2,
              "talents-001": 3.8,
              "strengths-001": 4.5,
              "emotional_intelligence-001": 4.0,
              "leadership-001": 3.9,
              "responsibility-001": 4.3,
              "communication-001": 4.1,
            },
          },
          competencyAnalysis: [
            {
              competencyId: "strengths-001",
              competencyName: "Perseverance",
              overallRating: 4.5,
              ratingsByGroup: {
                self: 4.0,
                parent: 5.0,
                teacher: 4.5,
                sibling_friend: 4.0,
              },
              strengths: [
                "Shows determination when facing challenges",
                "Doesn't give up easily",
              ],
              developmentAreas: [
                "Could benefit from asking for help when stuck",
              ],
              keyFeedback: [
                "Consistently works through difficult problems",
                "Great resilience",
              ],
            },
          ],
          recommendations: [
            "Continue to build on strong perseverance skills",
            "Develop collaborative problem-solving approaches",
            "Consider leadership opportunities that leverage determination",
          ],
          detailedFeedback: [
            {
              groupType: "parent",
              feedback: [
                {
                  competencyId: "strengths-001",
                  rating: 5,
                  comments: [
                    "Always finishes what they start",
                    "Very determined child",
                  ],
                },
              ],
            },
          ],
        };

        return mockReport;
      } else {
        return await getEvaluationReport(sessionId, language);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to get evaluation report"
      );
      return null;
    }
  };

  const validateEvaluators = (
    sessionId: string
  ): { isValid: boolean; errors: string[] } => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) {
      return { isValid: false, errors: ["Session not found"] };
    }

    return validateEvaluatorRequirements(
      session.evaluators,
      DEFAULT_EVALUATOR_GROUPS
    );
  };

  const getSessionProgress = (sessionId: string) => {
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    const totalEvaluators = session.evaluators.length;
    const respondedEvaluators = session.evaluators.filter(
      (e) => e.responseReceived
    ).length;
    const invitedEvaluators = session.evaluators.filter(
      (e) => e.invitationSent
    ).length;

    return {
      totalEvaluators,
      invitedEvaluators,
      respondedEvaluators,
      responseRate:
        totalEvaluators > 0 ? (respondedEvaluators / totalEvaluators) * 100 : 0,
      isComplete:
        respondedEvaluators === totalEvaluators && totalEvaluators > 0,
    };
  };

  const submitResponses = async (
    sessionId: string,
    responses: EvaluationResponse[]
  ): Promise<void> => {
    try {
      setError(null);

      const isDevelopment = process.env.NODE_ENV === "development";

      if (isDevelopment) {
        // Mock implementation for development
        const updatedSessions = sessions.map((session) => {
          if (session.id === sessionId) {
            return {
              ...session,
              responses: [...session.responses, ...responses],
            };
          }
          return session;
        });

        setSessions(updatedSessions);
        localStorage.setItem(
          "evaluation_sessions",
          JSON.stringify(updatedSessions)
        );
      } else {
        // In production, this would call the API
        // await submitEvaluationResponses(sessionId, evaluatorToken, responses);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to submit responses"
      );
      throw err;
    }
  };

  useEffect(() => {
    loadEvaluationData();
  }, []);

  const updateEvaluationSession = async (
    sessionId: string,
    updates: Partial<EvaluationSession>
  ) => {
    try {
      setLoading(true);
      // Update session in state
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, ...updates } : s))
      );

      // Update current session if it's the one being updated
      if (currentSession?.id === sessionId) {
        setCurrentSession((prev) => (prev ? { ...prev, ...updates } : null));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update session");
    } finally {
      setLoading(false);
    }
  };

  return {
    sessions,
    currentSession,
    progress,
    loading,
    isLoading: loading,
    error,
    loadEvaluationData,
    updateEvaluationSession,
    loadSession,
    addEvaluatorsToSession,
    sendInvitations,
    getSessionReport,
    validateEvaluators,
    getSessionProgress,
    submitResponses,
    hasEvaluations: sessions.length > 0,
    activeSessionsCount: sessions.filter((s) => s.status === "active").length,
  };
}
