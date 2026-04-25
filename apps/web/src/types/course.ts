// Course data types and interfaces

export interface CourseModule {
  id: string;
  title: string;
  description: string;
  week: number;
  estimatedHours: number;
}

export interface Course {
  id: string;
  title: string;
  shortDescription: string;
  fullDescription: string;
  category: string;
  subcategory?: string;
  provider: string;
  instructor: string;
  language: string;
  country: string;
  region?: string;
  duration: number;
  durationUnit: string;
  difficulty: "Beginner" | "Intermediate" | "Advanced";
  estimatedHours: number;
  certificate: boolean;
  enrollmentCount: number;
  rating: number;
  reviewCount: number;
  thumbnailUrl: string;
  videoUrl?: string;
  courseraUrl: string;
  externalId: string;
  syllabus: CourseModule[];
  learningObjectives: string[];
  prerequisites: string[];
  skills: string[];
  matchingCompetencies: string[];
  careerPaths: string[];
  recommendedScore: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CourseFilter {
  search?: string;
  category?: string[];
  language?: string[];
  difficulty?: ("Beginner" | "Intermediate" | "Advanced")[];
  country?: string[];
  region?: string[];
  duration?: { min: number; max: number };
  provider?: string[];
  certificate?: boolean;
  rating?: { min: number; max: number };
}

export type CourseSortOption =
  | "recommended"
  | "rating"
  | "enrollment"
  | "newest"
  | "duration"
  | "title";

export interface CourseEnrollment {
  enrollmentId: string;
  courseId: string;
  courseTitle: string;
  courseThumbnail: string;
  courseraUrl: string;
  enrolledAt: string;
  status: "enrolled" | "in_progress" | "completed" | "dropped";
  progress: {
    completedModules: number;
    totalModules: number;
    percentage: number;
    lastAccessedAt?: string;
    estimatedCompletionDate?: string;
  };
}

export interface CourseEnrollmentPayload {
  course: Course;
  enrollmentSource: "catalog" | "recommended" | "dashboard";
}

export interface CourseProgressPayload {
  enrollmentId: string;
  completedModules?: number;
  totalModules?: number;
  percentage?: number;
  status?: "enrolled" | "in_progress" | "completed" | "dropped";
  lastAccessedAt?: string;
}

export interface CourseCompletionPayload {
  enrollmentId: string;
  completedAt?: string;
}

export interface CoursesResponse {
  courses: Course[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
  filters: {
    categories: string[];
    languages: string[];
    difficulties: string[];
    countries: string[];
  };
}

export interface RecommendedCoursesResponse {
  courses: Course[];
  recommendationReason: string;
}
