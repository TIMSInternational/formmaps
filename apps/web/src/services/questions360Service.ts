import { apiRequest } from "@/lib/api/apiClient";

// Question360 Interfaces
export interface Question360 {
  id: string;
  questionEnglishText: string;
  questionSpanishText: string;
  category: string;
  relationType: "Parent" | "Teacher" | "Other" | "Self";
  questionNumber: number;
  isSubQuestion: boolean;
  parentQuestionId?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuestion360Request {
  questionEnglishText: string;
  questionSpanishText: string;
  category: string;
  relationType: "Parent" | "Teacher" | "Other" | "Self";
  questionNumber: number;
  isSubQuestion: boolean;
  parentQuestionId?: string;
}

export interface UpdateQuestion360Request extends CreateQuestion360Request {
  isActive: boolean;
}

export interface BulkCreateQuestion360Request {
  questions: CreateQuestion360Request[];
}

// Questions360 Service
export const questions360Service = {
  // Get all questions
  async getAllQuestions(): Promise<Question360[]> {
    try {
      const response = await apiRequest<any>("/api/Question360/all", {
        method: "GET",
      });
      console.log("🔍 API Response for getAllQuestions:", response);

      // Extract data from response object
      const data = response?.data;

      // Ensure data is an array
      if (!Array.isArray(data)) {
        console.warn("⚠️ API returned non-array data:", typeof data, data);
        return [];
      }

      return data;
    } catch (error) {
      console.error("❌ Error in getAllQuestions service:", error);
      throw error;
    }
  },

  // Get question by ID
  async getQuestionById(id: string): Promise<Question360> {
    const response = await apiRequest<Question360>(`/api/Question360/${id}`, {
      method: "GET",
    });
    return response;
  },

  // Get questions by category
  async getQuestionsByCategory(category: string): Promise<Question360[]> {
    const response = await apiRequest<Question360[]>(
      `/api/Question360/category/${category}`,
      {
        method: "GET",
      }
    );
    return response;
  },

  // Get sub-questions by parent ID
  async getSubQuestions(parentQuestionId: string): Promise<Question360[]> {
    const response = await apiRequest<Question360[]>(
      `/api/Question360/sub-questions/${parentQuestionId}`,
      {
        method: "GET",
      }
    );
    return response;
  },

  // Get questions by relation type
  async getQuestionsByRelationType(
    relationType: string
  ): Promise<Question360[]> {
    const response = await apiRequest<Question360[]>(
      `/api/Question360/relation/${relationType}`,
      {
        method: "GET",
      }
    );
    return response;
  },

  // Create new question
  async createQuestion(data: CreateQuestion360Request): Promise<Question360> {
    const response = await apiRequest<Question360>("/api/Question360", {
      method: "POST",
      data,
    });
    return response;
  },

  // Update question
  async updateQuestion(
    id: string,
    data: UpdateQuestion360Request
  ): Promise<Question360> {
    const response = await apiRequest<Question360>(`/api/Question360/${id}`, {
      method: "PUT",
      data,
    });
    return response;
  },

  // Delete question (soft delete)
  async deleteQuestion(
    id: string
  ): Promise<{ success: boolean; message: string }> {
    const response = await apiRequest<{ success: boolean; message: string }>(
      `/api/Question360/${id}`,
      {
        method: "DELETE",
      }
    );
    return response;
  },

  // Activate question
  async activateQuestion(id: string): Promise<Question360> {
    const response = await apiRequest<Question360>(
      `/api/Question360/${id}/activate`,
      {
        method: "PATCH",
      }
    );
    return response;
  },

  // Deactivate question
  async deactivateQuestion(id: string): Promise<Question360> {
    const response = await apiRequest<Question360>(
      `/api/Question360/${id}/deactivate`,
      {
        method: "PATCH",
      }
    );
    return response;
  },

  // Bulk create questions
  async bulkCreateQuestions(data: BulkCreateQuestion360Request): Promise<{
    success: boolean;
    created: number;
    failed: number;
    errors?: string[];
  }> {
    const response = await apiRequest<{
      success: boolean;
      created: number;
      failed: number;
      errors?: string[];
    }>("/api/Question360/bulk", {
      method: "POST",
      data,
    });
    return response;
  },
};

// Helper functions
export const getRelationTypeOptions = () => [
  { value: "Parent", label: "Parent" },
  { value: "Teacher", label: "Teacher" },
  { value: "Other", label: "Other" },
  { value: "Self", label: "Self" },
];

export const getCommonCategories = () => [
  "Communication",
  "Leadership",
  "Problem Solving",
  "Creativity",
  "Social Skills",
  "Academic Performance",
  "Work Ethic",
  "Team Collaboration",
  "Critical Thinking",
  "Emotional Intelligence",
  "Adaptability",
  "Initiative",
  "Time Management",
  "Technical Skills",
  "Interpersonal Skills",
];
