export type StudentStatus = 'pending' | 'accepted' | 'active' | 'inactive';

export interface Student {
  id: string;
  name: string;
  email: string;
  status: StudentStatus;
  avatar?: string;
  joinedAt?: string;
  createdAt?: string;
  lastActive?: string;
  completedAssessments: number;
  averageScore: number;
  progress: number;
  pendingRequests?: number;
}

export interface StudentInvitePayload {
  email: string;
  name: string;
}

export interface BulkStudentInvitePayload {
  students: StudentInvitePayload[];
}

export interface StudentsResponse {
  data: Student[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SchoolAdminDashboardStats {
  totalStudents: number;
  pendingInvites: number;
  acceptedStudents: number;
  activeStudents: number;
  completedAssessments: number;
  averageScore: number;
}

export interface StudentEngagement {
  active: number;
  inactive: number;
  trend: number;
}

export interface AssessmentCompletion {
  completed: number;
  inProgress: number;
  notStarted: number;
  completionRate: number;
}

export interface AnalyticsOverview {
  studentEngagement: StudentEngagement;
  assessmentCompletion: AssessmentCompletion;
  averagePerformance: {
    score: number;
    trend: number;
  };
  timeSpent: {
    averageHours: number;
    totalHours: number;
    trend: number;
  };
}

export interface PerformanceTrendData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
  }[];
}

export interface TopPerformer {
  id: string;
  name: string;
  email: string;
  averageScore: number;
  completedAssessments: number;
  rank: number;
}

export interface StudentResult {
  id: string;
  student: {
    id: string;
    name: string;
    email: string;
  };
  assessmentName: string;
  assessmentType: string;
  score: number;
  completedAt: string;
  duration: number;
}

export interface StudentResultsResponse {
  data: StudentResult[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface StudentDetailResult {
  student: {
    id: string;
    name: string;
    email: string;
    joinedAt: string;
    status: StudentStatus;
  };
  summary: {
    totalAssessments: number;
    averageScore: number;
    totalTimeSpent: number;
    strongAreas: string[];
    improvementAreas: string[];
  };
  assessments: {
    id: string;
    name: string;
    type: string;
    score: number;
    completedAt: string;
    duration: number;
    breakdown: {
      sections: { name: string; score: number }[];
    };
  }[];
}

export interface SchoolSettings {
  school: {
    id: string;
    name: string;
    maxStudents: number;
    currentStudents: number;
    contractStart: string;
    contractEnd: string;
  };
  admin: {
    id: string;
    name: string;
    email: string;
  };
}
