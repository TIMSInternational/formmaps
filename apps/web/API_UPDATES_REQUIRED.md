# Backend API Updates Required

## Overview
This document outlines the required updates for the admin analytics APIs to properly populate the frontend dashboard charts and data.

---

## 1. Analytics API - Revenue Data

**Endpoint:** `GET /api/v1/admin/analytics?period={week|month|year}`

### Current Issue
The `revenueData` array is returning empty:
```json
{
  "revenueData": []
}
```

### Required Response Format
```json
{
  "revenueData": [
    { "month": "Jan", "revenue": 1200.50, "transactions": 15 },
    { "month": "Feb", "revenue": 1850.00, "transactions": 22 },
    { "month": "Mar", "revenue": 2100.75, "transactions": 28 }
  ]
}
```

### Data Source
- Aggregate data from the `Payments` or `Transactions` collection
- Group by month/week based on the `period` parameter
- Sum `revenue` and count `transactions` per period

## Admin Analytics
- [ ] **CSV Export Endpoint**: Create an endpoint (e.g., `GET /api/admin/analytics/export`) that returns a CSV file containing key analytics data (Revenue, User Growth, Top Coaches, etc.) for a specified period. The frontend "Download" button currently has no backend support.

## Admin Users Management
- [ ] **Edit User Endpoint**: `PUT /api/v1/admin/users/:id` to update user details (name, email, role).
- [ ] **Deactivate/Activate Endpoint**: `PATCH /api/v1/admin/users/:id/status` to toggle user status between "active" and "inactive".
- [ ] **Delete User Endpoint**: `DELETE /api/v1/admin/users/:id` to permanently remove a user (optional/if needed).
- [ ] **User Stats Endpoint**: `GET /api/v1/admin/users/stats` to return a breakdown of users by role (Student, Coach, Admin) and detailed status counts, which is currently approximated using general analytics.

---

## 2. Analytics API - User Growth Data

**Endpoint:** `GET /api/v1/admin/analytics?period={week|month|year}`

### Current Response
```json
{
  "userGrowthData": [
    { "period": "Dec", "users": 19, "newUsers": 5 }
  ]
}
```

### Issue
- Only returning 1 data point
- Should return multiple periods for trend visualization

### Required Response Format
```json
{
  "userGrowthData": [
    { "period": "Oct", "users": 25, "newUsers": 8 },
    { "period": "Nov", "users": 32, "newUsers": 7 },
    { "period": "Dec", "users": 38, "newUsers": 6 },
    { "period": "Jan", "users": 42, "newUsers": 4 }
  ]
}
```

### Data Source
- Aggregate data from the `Users` collection
- Group by month for `period=month`, week for `period=week`
- Calculate cumulative `users` count and `newUsers` registered in that period

---

## 3. Analytics API - Top Coaches

**Endpoint:** `GET /api/v1/admin/analytics?period={week|month|year}`

### Current Response
```json
{
  "topCoaches": []
}
```

### Required Response Format
```json
{
  "topCoaches": [
    {
      "id": "coach123",
      "name": "John Smith",
      "earnings": 2500.00,
      "sessions": 45,
      "rating": 4.8
    },
    {
      "id": "coach456",
      "name": "Jane Doe",
      "earnings": 2100.00,
      "sessions": 38,
      "rating": 4.9
    }
  ]
}
```

### Data Source
- Join `Coaches` with `Bookings` and `Payments` collections
- Aggregate earnings and session counts per coach
- Include average rating from reviews
- Sort by earnings (descending) and limit to top 5-10

---

## 4. Analytics API - Top Courses

**Endpoint:** `GET /api/v1/admin/analytics?period={week|month|year}`

### Current Response
```json
{
  "topCourses": []
}
```

### Required Response Format
```json
{
  "topCourses": [
    {
      "id": "course123",
      "title": "Career Development Fundamentals",
      "enrollments": 156,
      "revenue": 4680.00,
      "rating": 4.7
    },
    {
      "id": "course456",
      "title": "Leadership Skills",
      "enrollments": 98,
      "revenue": 2940.00,
      "rating": 4.5
    }
  ]
}
```

### Data Source
- Join `Courses` with `Enrollments` and `Payments` collections
- Count enrollments and sum revenue per course
- Include average rating
- Sort by enrollments or revenue (descending) and limit to top 5-10

---

## 5. Recent Activity - Field Name Consistency

**Endpoint:** `GET /api/v1/admin/analytics?period={week|month|year}`

### Current Response
```json
{
  "recentActivity": [
    {
      "type": "transaction",
      "message": "Payment completed: $20.00",
      "date": "2026-01-06T16:42:27.0488215Z"
    }
  ]
}
```

### Issue
- Using `date` field instead of `timestamp`

### Recommendation
Either:
1. **Rename to `timestamp`** for consistency with frontend expectations
2. **Or keep `date`** (frontend has been updated to handle both)

---

## Summary Table

| Data Field | Current Status | Action Required |
|------------|----------------|-----------------|
| `revenueData` | Empty array `[]` | Populate from Payments/Transactions |
| `userGrowthData` | Only 1 data point | Return multiple periods for trend chart |
| `topCoaches` | Empty array `[]` | Aggregate from Coaches + Bookings |
| `topCourses` | Empty array `[]` | Aggregate from Courses + Enrollments |
| `recentActivity.date` | Works | ✅ Frontend updated to handle |

---

## Frontend Compatibility Notes

The frontend has been updated to handle:
- ✅ `period` field in userGrowthData (instead of `month`)
- ✅ `date` field in recentActivity (in addition to `timestamp`)
- ✅ Empty arrays (displays empty state gracefully)

No frontend changes needed once backend populates the data correctly.

## 6. Admin Platform Settings
- [ ] **Get Settings Endpoint**: `GET /api/v1/admin/settings` should return:
    ```json
    {
      "general": {
        "siteName": "TimCare",
        "supportEmail": "support@timcare.com",
        "maintenanceMode": false
      },
      "finance": {
        "platformFeePercent": 15,
        "currency": "USD",
        "payoutSchedule": "monthly"
      },
      "security": {
        "sessionTimeoutMinutes": 60
      },
      "system": {
        "maxUploadSizeMB": 10
      },
      "legal": {
        "privacyUrl": "https://timcare.com/privacy",
        "termsUrl": "https://timcare.com/terms",
        "helpUrl": "https://help.timcare.com"
      }
    }
    ```
- [ ] **Update Settings Endpoint**: `PUT /api/v1/admin/settings` to update any of the above fields.

## 7. User Transactions & Payments
- [ ] **Export Transactions Endpoint**: `GET /api/v1/transactions/export?format=csv&startDate=...&endDate=...` to generate a downloadable report of user transactions.
- [ ] **Payment Methods API**: Endpoints to list (`GET /api/v1/user/payment-methods`) and manage (`POST`, `DELETE`) saved payment cards. The frontend currently has a placeholder for this.

## 8. Coach Billing & Invoices
- [ ] **Get Billing Data Endpoint**: `GET /api/v1/coach/billing?page=1&limit=10` should return:
    ```json
    {
      "currentPeriod": {
        "period": "Nov 1 - Nov 30, 2024",
        "totalBookings": 24,
        "totalRevenue": 2400.00,
        "platformFeeAmount": 360.00,
        "status": "pending",
        "dueDate": "Dec 5, 2024"
      },
      "billingHistory": {
        "items": [
          {
            "id": "inv_123",
            "period": "Oct 1 - Oct 31, 2024",
            "totalRevenue": 2100.00,
            "platformFeeAmount": 315.00,
            "status": "paid"
          }
        ],
        "total": 12,
        "page": 1,
        "limit": 10,
        "totalPages": 2
      }
    }
    ```
- [ ] **Download Invoice Endpoint**: `GET /api/v1/coach/billing/:id/download` to retrieve a PDF invoice.

## 9. Resume Builder
The Resume Builder feature relies on several endpoints that are currently missing or returning 404 errors.

- [ ] **Get Default Resume Template**: `GET /api/resume/default`
    - **Purpose**: Returns a default resume structure to initialize the builder when a user starts from scratch.
    - **Required Response**:
        ```json
        {
          "personal": { "fullName": "", "email": "", "phone": "", "location": "" },
          "skills": { "skills": {} },
          "experience": [],
          "education": [],
          "summary": ""
        }
        ```

- [ ] **Create Resume**: `POST /api/resume`
    - **Purpose**: Saves a new resume.
    - **Payload**: `CreateResumePayload` (personal, skills, experience, education, etc.)
    - **Response**: The created `Resume` object including `_id`.

- [ ] **Data Management Endpoints**:
    - `GET /api/resume`: List all resumes for the user.
    - `GET /api/resume/:id`: Get a specific resume by ID.
    - `PUT /api/resume/:id`: Update a specific resume.
    - `DELETE /api/resume/:id`: Delete a specific resume.

- [ ] **AI Generation Endpoint**: `POST /api/resume/ask`
    - **Purpose**: Generates content (summaries, bullet points) using AI.
    - **Payload**: `{ "Prompt": "..." }`
    - **Response**: `{ "generated_content": "..." }` or `{ "data": { "generated_content": "..." } }`

---

## 10. Export Reports APIs

The frontend needs comprehensive data bundles for PDF report generation. Each endpoint should return all data needed to render a complete, professional PDF report.

### 10.1 LIA Assessment Report

- [ ] **Get LIA Report Data**: `GET /api/v1/reports/lia/:userId`
    - **Purpose**: Returns complete LIA assessment data for PDF generation
    - **Required Response**:
        ```json
        {
          "user": {
            "id": "user123",
            "name": "John Doe",
            "email": "john@example.com"
          },
          "reportDate": "2026-01-07T00:00:00Z",
          "overallScore": {
            "percentage": 78.5,
            "percentileRank": 82,
            "classification": "Above Average"
          },
          "subtests": [
            {
              "examId": "feature-detection-001",
              "examName": "Feature Detection",
              "examType": 0,
              "status": "completed",
              "scorePercentage": 85.0,
              "accuracyPercentage": 90.0,
              "totalQuestions": 20,
              "correctAnswers": 18,
              "incorrectAnswers": 2,
              "timeSpent": "04:32",
              "timeLimitMinutes": 5,
              "isTimeExpired": false,
              "completionDate": "2026-01-05T14:30:00Z",
              "percentileRank": 88,
              "strengthAreas": ["Speed", "Pattern Recognition"],
              "improvementAreas": ["Attention to Detail"]
            }
          ],
          "cognitiveProfile": {
            "verbalReasoning": 75,
            "workingMemory": 82,
            "processingSpeed": 88,
            "spatialOrientation": 72,
            "featureDetection": 85
          },
          "recommendations": [
            "Focus on improving spatial orientation through practice exercises",
            "Maintain strong performance in processing speed tasks"
          ],
          "historicalComparison": {
            "previousAttempts": 2,
            "improvement": "+5.2%"
          }
        }
        ```

### 10.2 PCA Personality Profile Report

- [ ] **Get PCA Report Data**: `GET /api/v1/reports/pca/:userId`
    - **Purpose**: Returns complete PCA personality assessment data for PDF generation
    - **Required Response**:
        ```json
        {
          "user": {
            "id": "user123",
            "name": "John Doe",
            "email": "john@example.com"
          },
          "reportDate": "2026-01-07T00:00:00Z",
          "pcaCod": "PCA12345",
          "completionDate": "2026-01-04T10:00:00Z",
          "discProfile": {
            "dominance": {
              "natural": 72,
              "adapted": 65,
              "description": "High drive for results and challenges"
            },
            "influence": {
              "natural": 45,
              "adapted": 55,
              "description": "Moderate social engagement"
            },
            "steadiness": {
              "natural": 38,
              "adapted": 42,
              "description": "Preference for variety over routine"
            },
            "conscientiousness": {
              "natural": 68,
              "adapted": 70,
              "description": "Strong attention to quality and accuracy"
            }
          },
          "primaryStyle": "DC",
          "secondaryStyle": "D",
          "profileSummary": "A results-oriented individual who values both achievement and precision...",
          "competencies": [
            {
              "name": "Leadership",
              "score": 4.2,
              "maxScore": 5,
              "category": "Interpersonal"
            },
            {
              "name": "Analytical Thinking",
              "score": 4.5,
              "maxScore": 5,
              "category": "Cognitive"
            }
          ],
          "careerRecommendations": [
            {
              "careerTitle": "Project Manager",
              "matchScore": 92,
              "reasons": ["High D aligns with leadership demands", "C supports quality focus"]
            }
          ],
          "communicationStyle": {
            "strengths": ["Direct and clear communication", "Results-focused discussions"],
            "challenges": ["May appear impatient", "Could benefit from more empathy"]
          },
          "workEnvironmentPreferences": [
            "Challenging projects with clear goals",
            "Autonomy in decision-making",
            "Recognition for achievements"
          ]
        }
        ```

### 10.3 360° Evaluation Report (Enhanced)

- [ ] **Get Enhanced Evaluation Report**: `GET /api/v1/reports/evaluation/:sessionId`
    - **Purpose**: Returns complete 360° evaluation data with aggregated feedback for PDF generation
    - **Required Response**:
        ```json
        {
          "sessionId": "session123",
          "evaluatedPerson": {
            "id": "user123",
            "name": "John Doe",
            "email": "john@example.com"
          },
          "reportDate": "2026-01-07T00:00:00Z",
          "evaluationPeriod": {
            "startDate": "2025-12-01",
            "endDate": "2025-12-31"
          },
          "responseRate": {
            "total": 10,
            "completed": 8,
            "percentage": 80
          },
          "evaluatorBreakdown": {
            "self": { "completed": 1, "total": 1 },
            "parent": { "completed": 2, "total": 2 },
            "teacher": { "completed": 3, "total": 4 },
            "peer": { "completed": 2, "total": 3 }
          },
          "overallScore": 4.2,
          "competencyReports": [
            {
              "competencyName": "Communication",
              "description": "Ability to effectively convey ideas",
              "averageRating": 4.3,
              "ratings": {
                "self": 4.5,
                "parent": 4.2,
                "teacher": 4.4,
                "peer": 4.1
              },
              "variance": 0.14,
              "feedback": [
                {
                  "group": "teacher",
                  "comment": "Excellent presentation skills",
                  "evaluatorName": "Ms. Smith"
                }
              ],
              "strengths": ["Clear articulation", "Active listening"],
              "improvements": ["Written communication could be more detailed"]
            }
          ],
          "topStrengths": ["Leadership", "Problem Solving", "Communication"],
          "developmentAreas": ["Time Management", "Patience"],
          "recommendations": [
            "Continue developing leadership skills through mentoring opportunities",
            "Practice patience in collaborative settings"
          ],
          "historicalTrend": {
            "previousSessions": [
              { "date": "2025-06-01", "overallScore": 3.8 }
            ],
            "improvement": "+0.4"
          }
        }
        ```

### 10.4 Career Progress Timeline Report

- [ ] **Get Timeline Report Data**: `GET /api/v1/reports/timeline/:userId`
    - **Purpose**: Returns aggregated timeline data with statistics for PDF generation
    - **Required Response**:
        ```json
        {
          "user": {
            "id": "user123",
            "name": "John Doe"
          },
          "reportDate": "2026-01-07T00:00:00Z",
          "dateRange": {
            "startDate": "2025-01-01",
            "endDate": "2026-01-07"
          },
          "overallProgress": {
            "completedAssessments": 8,
            "totalAssessments": 12,
            "percentageComplete": 67
          },
          "assessmentSummary": {
            "pca": {
              "status": "completed",
              "completedDate": "2025-03-15",
              "overallScore": 78
            },
            "mil": {
              "status": "in_progress",
              "completedSubtests": 3,
              "totalSubtests": 5,
              "averageScore": 82
            },
            "evaluation": {
              "status": "completed",
              "completedEvaluations": 8,
              "totalEvaluators": 10
            },
            "courses": {
              "enrolled": 5,
              "completed": 2,
              "inProgress": 2,
              "dropped": 1
            }
          },
          "milestones": [
            {
              "title": "Completed PCA Assessment",
              "date": "2025-03-15",
              "type": "pca",
              "achievement": "First Assessment Complete"
            }
          ],
          "monthlyActivity": [
            { "month": "2025-01", "events": 3 },
            { "month": "2025-02", "events": 5 }
          ],
          "recentEvents": [
            {
              "id": "evt1",
              "title": "Completed Verbal Reasoning Subtest",
              "type": "mil",
              "date": "2026-01-05",
              "status": "completed",
              "score": 88
            }
          ]
        }
        ```

### 10.5 Coaching Session Summary Report

- [ ] **Get Coaching Report Data**: `GET /api/v1/reports/coaching/:userId`
    - **Purpose**: Returns coaching session history and progress for PDF generation
    - **Required Response**:
        ```json
        {
          "user": {
            "id": "user123",
            "name": "John Doe"
          },
          "reportDate": "2026-01-07T00:00:00Z",
          "dateRange": {
            "startDate": "2025-01-01",
            "endDate": "2026-01-07"
          },
          "summary": {
            "totalSessions": 12,
            "completedSessions": 10,
            "totalHours": 12.5,
            "coachesWorkedWith": 2
          },
          "coaches": [
            {
              "id": "coach1",
              "name": "Jane Smith",
              "specialization": "Career Development",
              "sessionsCompleted": 8,
              "rating": 4.8
            }
          ],
          "sessions": [
            {
              "id": "session1",
              "date": "2026-01-03",
              "duration": 60,
              "coachName": "Jane Smith",
              "topic": "Career Goal Setting",
              "status": "completed",
              "notes": "Discussed short-term career goals...",
              "actionItems": [
                "Update resume",
                "Research target companies"
              ],
              "rating": 5
            }
          ],
          "goals": [
            {
              "title": "Land a new job in tech",
              "status": "in_progress",
              "milestones": [
                { "title": "Resume updated", "completed": true },
                { "title": "Applied to 10 companies", "completed": false }
              ]
            }
          ],
          "progressMetrics": {
            "goalsSet": 5,
            "goalsAchieved": 2,
            "actionItemsCompleted": 15,
            "actionItemsTotal": 20
          }
        }
        ```

### 10.6 Benchmark Comparison Report

- [ ] **Get Benchmark Report Data**: `GET /api/v1/reports/benchmark`
    - **Query Params**: `?userId={userId}&career={careerSlug}&country={countryCode}`
    - **Purpose**: Returns personalized benchmark data compared to market for PDF generation
    - **Required Response**:
        ```json
        {
          "user": {
            "id": "user123",
            "name": "John Doe"
          },
          "reportDate": "2026-01-07T00:00:00Z",
          "selectedCareer": {
            "title": "Software Engineer",
            "slug": "software-engineer"
          },
          "selectedCountry": "USA",
          "salaryBenchmarks": {
            "junior": { "min": 70000, "avg": 85000, "max": 110000 },
            "mid": { "min": 100000, "avg": 130000, "max": 160000 },
            "senior": { "min": 150000, "avg": 180000, "max": 250000 },
            "currency": "USD"
          },
          "userPosition": {
            "currentLevel": "mid",
            "estimatedSalary": 125000,
            "percentile": 65
          },
          "skillGaps": [
            {
              "skill": "AWS Cloud Architecture",
              "currentLevel": "beginner",
              "requiredLevel": "advanced",
              "marketValueBoost": 15000,
              "priority": "high"
            }
          ],
          "marketInsights": {
            "demandGrowth": "+12%",
            "jobPostings": 15000,
            "remotePercentage": 45,
            "averageFillTime": "45 days"
          },
          "roiProjection": {
            "currentSalary": 125000,
            "potentialSalary": 155000,
            "investmentHours": 120,
            "timeToROI": "6 months"
          },
          "recommendedCertifications": [
            {
              "name": "AWS Solutions Architect",
              "provider": "Amazon",
              "duration": "3 months",
              "expectedBoost": "+$15,000"
            }
          ]
        }
        ```

---

## Summary of Export Report Endpoints

| Endpoint | Method | Priority | Status |
|----------|--------|----------|--------|
| `/api/v1/reports/lia/:userId` | GET | High | [ ] Not Started |
| `/api/v1/reports/pca/:userId` | GET | High | [ ] Not Started |
| `/api/v1/reports/evaluation/:sessionId` | GET | Medium | [ ] Not Started |
| `/api/v1/reports/timeline/:userId` | GET | Medium | [ ] Not Started |
| `/api/v1/reports/coaching/:userId` | GET | Medium | [ ] Not Started |
| `/api/v1/reports/benchmark` | GET | Low | [ ] Not Started |
