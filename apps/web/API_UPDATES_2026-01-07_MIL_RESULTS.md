# API Updates Required - MIL Results Page Data

**Date:** 2026-01-07

## Issue Summary
The MIL results page (`/dashboard/assessments/mil/results`) is displaying 0 values for scores, percentiles, and total questions because the current API only returns exam metadata (exam definitions) rather than user's actual exam results with scores.

## Current API Response

**Endpoint:** `GET /api/v1/mil/exams` (returns exam metadata only)

```json
[
  {
    "id": "pattern-recognition-001",
    "name": "Pattern Recognition",
    "description": "This test evaluates how quickly and accurately...",
    "type": 0,
    "timeLimitMinutes": 3,
    "totalQuestions": 60,
    "isActive": true
  }
]
```

**Problem:** This only contains exam definitions, not user-specific results (scores, completion status, time spent, etc.)

---

## Required API Endpoint

### Get User MIL Results

- [ ] **Endpoint:** `GET /api/v1/mil/results/:userId` or `GET /api/v1/mil/user-results`
- **Purpose:** Returns the user's completed exam results with scores and performance data

### Required Response Format

```json
{
  "userId": "user123",
  "overallScore": 75.6,
  "overallPercentile": 68,
  "completedExams": 3,
  "totalExams": 5,
  "lastCompletedAt": "2026-01-07T10:30:00Z",
  "examResults": [
    {
      "examId": "pattern-recognition-001",
      "examName": "Pattern Recognition",
      "status": "completed",
      "scorePercentage": 85,
      "percentile": 78,
      "correctAnswers": 51,
      "incorrectAnswers": 6,
      "skippedAnswers": 3,
      "totalQuestions": 60,
      "timeSpent": "2:45",
      "timeLimitMinutes": 3,
      "isTimeExpired": false,
      "completedAt": "2026-01-06T14:30:00Z"
    },
    {
      "examId": "verbal-reasoning-001",
      "examName": "Verbal Reasoning",
      "status": "completed",
      "scorePercentage": 78,
      "percentile": 65,
      "correctAnswers": 39,
      "incorrectAnswers": 11,
      "skippedAnswers": 0,
      "totalQuestions": 50,
      "timeSpent": "3:12",
      "timeLimitMinutes": 4,
      "isTimeExpired": false,
      "completedAt": "2026-01-05T10:15:00Z"
    },
    {
      "examId": "working-memory-001",
      "examName": "Working Memory",
      "status": "in_progress",
      "answeredQuestions": 25,
      "totalQuestions": 60,
      "timeLimitMinutes": 4
    },
    {
      "examId": "numeric-velocity-001",
      "examName": "Numeric Velocity",
      "status": "not_started",
      "totalQuestions": 60,
      "timeLimitMinutes": 4
    },
    {
      "examId": "visual-rotation-001",
      "examName": "Visual Rotation",
      "status": "not_started",
      "totalQuestions": 16,
      "timeLimitMinutes": 5
    }
  ],
  "cognitiveProfile": {
    "logicalReasoning": 82,
    "verbalProcessing": 78,
    "workingMemory": 72,
    "processingSpeed": 85,
    "spatialOrientation": 70
  }
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `examId` | string | Unique identifier matching the exam definition |
| `examName` | string | Display name of the exam |
| `status` | enum | `"completed"`, `"in_progress"`, or `"not_started"` |
| `scorePercentage` | number | Percentage score (0-100) |
| `percentile` | number | User's percentile ranking compared to other test-takers |
| `correctAnswers` | number | Number of correctly answered questions |
| `incorrectAnswers` | number | Number of incorrectly answered questions |
| `skippedAnswers` | number | Number of unanswered questions |
| `totalQuestions` | number | Total questions in the exam |
| `timeSpent` | string | Formatted time (e.g., "2:45") |
| `timeLimitMinutes` | number | Time limit for the exam |
| `isTimeExpired` | boolean | Whether the user ran out of time |
| `completedAt` | ISO date | When the exam was completed |

### Data Source

- Join `ExamResults` (or `UserExamSessions`) with `MILExams` collection
- Filter by userId from authentication
- Calculate percentiles from aggregate scoring data
- Include cognitive profile analysis if available

---

## Priority

**High** - This endpoint is required for the MIL results page to display meaningful data instead of zeros.

## Frontend File Affected

- `src/app/dashboard/assessments/mil/results/page.tsx`
- Currently uses mock data that needs to be replaced with API response

## Notes

The current implementation falls back to localStorage for backward compatibility, but the proper solution is this API endpoint returning user-specific exam results.

---

## LIA Report PDF Data Requirements (Complete Specification)

**Report Type:** Labor Intelligence Analysis (LIA)  
**Format:** 8-Page Magazine-Style PDF  
**Target Audience:** HR Managers, Hiring Teams, Candidates  

The new premium LIA Report requires a **significantly richer data payload** than standard results. This specification defines every field, its purpose, content length, and generation source.

---

### API Endpoint

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/reports/lia/:userId` | Bearer Token | Returns complete LIA report data for PDF generation |

---

### Page-by-Page Content Mapping

| Page | Title | Primary Data Sections |
|------|-------|----------------------|
| 1 | Cover | `user`, `reportDate` |
| 2 | Executive Summary | `overallScore`, `executiveSummary` |
| 3 | Cognitive Profile | `subtests`, `cognitiveSynergy` |
| 4 | Behavioral Insights | `behavioralObservations` |
| 5 | Professional DNA | `workStyleAnalysis`, `environmentalFit` |
| 6 | Career Alignment | `careerRecommendations` |
| 7 | Learning Roadmap | `learningDevelopment` |
| 8 | Conclusion | `summary` |

---

### Complete Data Schema

#### 1. User & Report Metadata

| Field | Type | Required | Source | Example |
|-------|------|----------|--------|---------|
| `user.id` | `string` | ✅ | Database | `"USR-2026-0107"` |
| `user.name` | `string` | ✅ | Database | `"Alex Johnson"` |
| `user.email` | `string` | ✅ | Database | `"alex@example.com"` |
| `reportDate` | `ISO 8601 string` | ✅ | System | `"2026-01-07T10:30:00Z"` |

---

#### 2. Overall Score (Page 2 - Executive Summary)

| Field | Type | Source | Calculation/Notes |
|-------|------|--------|-------------------|
| `overallScore.percentage` | `number` | Calculated | Weighted average of all subtest scores. Formula: `Σ(subtest.score × weight) / Σ(weights)` |
| `overallScore.percentileRank` | `number` | Calculated | User's rank among all test-takers (0-100). Requires cohort comparison table. |
| `overallScore.classification` | `string` | Rule-Based | See classification matrix below |

**Classification Matrix:**
| Percentile Range | Classification |
|-----------------|----------------|
| 90-100 | `"Elite Performer"` |
| 75-89 | `"High Potential"` |
| 50-74 | `"Solid Contributor"` |
| 25-49 | `"Developing Talent"` |
| 0-24 | `"Growth Required"` |

---

#### 3. Subtests Array (Page 3 - Cognitive Profile)

Each subtest object contains:

| Field | Type | Word Count | Source | Notes |
|-------|------|------------|--------|-------|
| `subtests[i].name` | `string` | N/A | Static | Exam name from MIL catalog |
| `subtests[i].score` | `number` | N/A | Calculated | 0-100 percentage |
| `subtests[i].percentile` | `number` | N/A | Calculated | Cohort comparison |
| `subtests[i].timeSpent` | `string` | N/A | Recorded | Format: `"MM:SS"` |
| `subtests[i].accuracy` | `number` | N/A | Calculated | `(correct / attempted) × 100` |
| `subtests[i].interpretation` | `string` | **20-35 words** | **AI Generation** | Contextual explanation of what this score means for workplace performance |

**Standard Subtests (5 required):**
1. Feature Detection / Pattern Recognition
2. Verbal Reasoning
3. Working Memory
4. Numeric Speed / Quantitative Processing
5. Spatial Orientation / Visual Rotation

---

#### 4. Executive Summary (Page 2)

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `executiveSummary.highlights` | `string[]` | **20-30 words each** (3 bullets) | **AI Inference** | "Summarize the candidate's TOP 3 cognitive strengths based on their highest-scoring subtests. Each bullet should explain WHY this strength matters in a workplace context." |
| `executiveSummary.developmentAreas` | `string[]` | **20-30 words each** (2 bullets) | **AI Inference** | "Identify 2 areas requiring development based on lowest scores. Frame constructively with improvement potential." |
| `executiveSummary.strategicImplications` | `string` | **80-120 words** | **AI Generation** | "Write an executive-ready paragraph synthesizing the candidate's overall value proposition. Address: (1) What type of roles they're suited for, (2) How they add value to teams, (3) What management approach works best for them." |

---

#### 5. Cognitive Synergy (Page 3)

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `cognitiveSynergy` | `string` | **60-100 words** | **AI Generation** | "Analyze how the user's TOP 2 strengths interact with each other. Example: 'High Numeric Speed + High Working Memory = Real-time Analyst profile.' Explain what this combination enables that individual scores don't reveal." |

---

#### 6. Behavioral Observations (Page 4)

*Derived from session telemetry: timestamps, click patterns, answer changes, time distribution.*

| Field | Type | Word Count | Source | Derivation Logic |
|-------|------|------------|--------|-----------------|
| `behavioralObservations.speedAccuracyBalance` | `string` | **35-50 words** | **Heuristic + AI** | Compare avg response time vs accuracy. Fast+Accurate = "Efficient". Fast+Inaccurate = "Impulsive". Slow+Accurate = "Methodical". |
| `behavioralObservations.stressResponse` | `string` | **35-50 words** | **Heuristic + AI** | Compare performance in first 80% vs last 20% of time limit. Score drop = "Stress-sensitive". Improvement = "Performs under pressure". |
| `behavioralObservations.attentionPattern` | `string` | **35-50 words** | **Heuristic + AI** | Calculate variance in response times. Low variance = "Consistent focus". High variance = "Variable engagement". |
| `behavioralObservations.problemSolvingApproach` | `string` | **35-50 words** | **AI Inference** | Analyze answer change patterns. Many changes = "Iterative refiner". No changes = "First-instinct decision maker". |

---

#### 7. Work Style Analysis (Page 5)

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `workStyleAnalysis.workPreference` | `string` | **40-60 words** | **AI Generation** | "Based on the cognitive profile, describe what type of work environment this person thrives in. Consider: structured vs ambiguous, data-rich vs creative, solo vs collaborative." |
| `workStyleAnalysis.decisionMaking` | `string` | **30-45 words** | **AI Generation** | "Describe their decision-making style: Evidence-based? Intuitive? Risk-averse? Include practical implications for managers." |
| `workStyleAnalysis.communicationStyle` | `string` | **30-45 words** | **AI Generation** | "How do they likely communicate? Concise? Detailed? Data-driven? Visual? Include tips for effective collaboration." |
| `workStyleAnalysis.leadershipPotential` | `string` | **40-60 words** | **AI Generation** | "Assess leadership potential. What type of leader would they be? Technical? Operational? Inspirational? What development is needed?" |
| `workStyleAnalysis.teamDynamics` | `string` | **40-60 words** | **AI Generation** | "What role do they play in a team? The Anchor? The Challenger? The Executor? How do they stabilize or energize groups?" |

---

#### 8. Environmental Fit (Page 5)

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `environmentalFit` | `string` | **70-100 words** | **AI Generation** | "Recommend the ideal organizational environment. Address: (1) Company stage (Startup/Scaleup/Enterprise), (2) Industry type, (3) Management style that works best, (4) Potential friction points to avoid." |

---

#### 9. Career Recommendations (Page 6)

| Field | Type | Source | Notes |
|-------|------|--------|-------|
| `careerRecommendations.roles` | `Object[]` | **Database + AI** | Top 5 matching job titles |
| `careerRecommendations.roles[i].title` | `string` | Database | Standard job title |
| `careerRecommendations.roles[i].matchScore` | `number` | Algorithm | 0-100 match percentage |
| `careerRecommendations.roles[i].description` | `string` (20-35 words) | **AI Generation** | "Explain WHY this role is a good match for this specific candidate's cognitive profile." |
| `careerRecommendations.industries` | `string[]` | Algorithm | 4-6 recommended industries |
| `careerRecommendations.skillsGap` | `string[]` | **AI Inference** | 2-4 skills needed for advancement (15-25 words each) |
| `careerRecommendations.motivators` | `string[]` | **AI Inference** | 3-5 intrinsic motivators (e.g., "Technical Mastery", "Order & Stability") |

---

#### 10. Learning & Development (Page 7)

| Field | Type | Word Count | Source | Notes |
|-------|------|------------|--------|-------|
| `learningDevelopment.learningStyle` | `string` | **40-60 words** | **AI Generation** | Describe preferred learning modality (Visual/Logical/Kinesthetic) with practical recommendations |
| `learningDevelopment.agilityScore` | `number` | Calculated | 0-100 adaptability score based on session metrics |
| `learningDevelopment.recommendedCourses` | `string[]` | **Recommender System** | 3-5 specific course names from course library |
| `learningDevelopment.actionPlan` | `Object[]` | **AI Generation** | 30-60-90 day development plan |
| `learningDevelopment.actionPlan[i].period` | `string` | Static | `"Month 1: Foundation"`, `"Month 2: Application"`, `"Month 3: Expansion"` |
| `learningDevelopment.actionPlan[i].action` | `string` | **25-40 words** | **AI Generation** | Specific, actionable steps tailored to the candidate's weak areas |
| `learningDevelopment.coachingRecommended` | `boolean` | Rule-Based | `true` if any subtest < 60 or significant behavioral flags |

---

#### 11. Summary & Conclusion (Page 8)

| Field | Type | Word Count | Source | Notes |
|-------|------|------------|--------|-------|
| `summary.keyTakeaways` | `string[]` | **15-25 words each** (3 bullets) | **AI Inference** | Top 3 most important conclusions for decision-makers |
| `summary.successFactors` | `string[]` | **5-10 words each** (3-4 items) | **AI Inference** | What makes this candidate likely to succeed |
| `summary.riskFactors` | `string[]` | **5-10 words each** (2-3 items) | **AI Inference** | Potential challenges or areas of concern |
| `summary.nextAssessmentDate` | `string` | Static | Typically 6 months from report date |
| `summary.methodology` | `string` | **60-80 words** | Static | Standard legal/methodology disclaimer about test validity, cohort size, etc. |

---

### Additional Comprehensive Insight Sections

The following sections provide **exhaustive analysis** for HR decision-makers, managers, and coaches. These are OPTIONAL but recommended for premium reports.

---

#### 12. Personality Inferences (What This Indicates About the User)

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `personalityInferences.cognitiveStyle` | `string` | **50-70 words** | **AI Generation** | "Based on the test-taking patterns, infer whether this person is an Analytical Thinker, Creative Visionary, Practical Executor, or Systematic Organizer. Explain the implications for how they approach work." |
| `personalityInferences.workingPace` | `string` | **30-40 words** | **AI Generation** | "Describe their natural work rhythm: Sprinter (intense bursts), Marathon (steady pace), or Adaptive (situation-dependent). What does this mean for project assignments?" |
| `personalityInferences.riskTolerance` | `string` | **30-40 words** | **AI Generation** | "Infer risk appetite from decision patterns: Risk-Averse, Calculated Risk-Taker, or Bold. Include implications for innovation roles." |
| `personalityInferences.detailOrientation` | `string` | **30-40 words** | **AI Generation** | "Assess attention to detail vs big-picture thinking. Are they a 'forest' or 'trees' person? Both? Include role suitability." |
| `personalityInferences.socialEnergy` | `string` | **30-40 words** | **AI Generation** | "Infer introversion/extraversion tendencies from session behavior (breaks taken, pacing). Impact on team meeting frequency and collaboration style." |
| `personalityInferences.perfectionismLevel` | `string` | **30-40 words** | **AI Generation** | "Assess perfectionism from accuracy-vs-completion tradeoffs. High perfectionism = quality roles. Low = speed roles. Flag if extreme." |

---

#### 13. Manager & HR Guidance

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `managerGuidance.feedbackStyle` | `string` | **40-60 words** | **AI Generation** | "How should a manager deliver feedback to this person? Direct? Supportive? Data-backed? Written or verbal? Include specific phrasing tips." |
| `managerGuidance.motivationTriggers` | `string[]` | **15-20 words each** (4-5 items) | **AI Inference** | "What motivates this person? Recognition? Autonomy? Mastery? Security? Challenge? List with brief explanations." |
| `managerGuidance.demotivationWarnings` | `string[]` | **15-20 words each** (3-4 items) | **AI Inference** | "What demotivates or frustrates this person? Micromanagement? Ambiguity? Lack of growth? Include warning signs to watch for." |
| `managerGuidance.meetingPreference` | `string` | **25-35 words** | **AI Generation** | "Does this person prefer frequent check-ins or autonomous stretch periods? Structured agendas or organic discussion? 1:1s or group settings?" |
| `managerGuidance.conflictResolution` | `string` | **40-50 words** | **AI Generation** | "How does this person likely handle workplace conflict? Avoidant? Confrontational? Diplomatic? Data-driven? Include de-escalation tips." |
| `managerGuidance.recognitionStyle` | `string` | **30-40 words** | **AI Generation** | "How should achievements be recognized? Public praise? Private acknowledgment? Tangible rewards? Titles? Include cultural considerations." |

---

#### 14. Onboarding Recommendations

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `onboarding.learningCurveEstimate` | `string` | **30-40 words** | **AI Generation** | "How quickly will this person become productive? Fast ramp-up in analytical roles, slower in creative ones. Provide timeline estimate." |
| `onboarding.structureLevel` | `string` | **30-40 words** | **AI Generation** | "Does this person need highly structured onboarding (checklists, mentors) or prefer exploratory self-directed learning? Include specific recommendations." |
| `onboarding.buddyMatching` | `string` | **40-50 words** | **AI Generation** | "What type of onboarding buddy or mentor would work best? Someone similar (comfort) or complementary (growth)? Describe ideal mentor profile." |
| `onboarding.firstWeekPriorities` | `string[]` | **15-25 words each** (3-4 items) | **AI Generation** | "Specific priorities for the first week to maximize engagement and early wins. Tailor to cognitive strengths." |
| `onboarding.potentialChallenges` | `string[]` | **15-25 words each** (2-3 items) | **AI Generation** | "What might trip this person up during onboarding? Information overload? Social expectations? Lack of clarity? Include mitigation strategies." |

---

#### 15. Retention Risk Analysis

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `retention.riskLevel` | `enum` | N/A | **AI Inference** | `"Low"`, `"Medium"`, `"High"` based on motivator alignment and organizational fit |
| `retention.riskFactors` | `string[]` | **20-30 words each** (2-4 items) | **AI Inference** | "What might cause this person to leave? Lack of challenge? Slow promotion? Better offers? Include specific organizational risks." |
| `retention.retentionStrategies` | `string[]` | **25-35 words each** (3-4 items) | **AI Generation** | "Specific actions to retain this employee: stretch assignments, mentorship, fast-track programs, flexibility. Tailor to their motivators." |
| `retention.flightIndicators` | `string[]` | **15-20 words each** (3-4 items) | **AI Inference** | "Early warning signs that this person may be disengaging: reduced initiative, meeting avoidance, skill-building outside role. Include detection tips." |
| `retention.loyaltyDrivers` | `string[]` | **15-20 words each** (3-4 items) | **AI Inference** | "What builds long-term loyalty for this person? Mission alignment? Team bonds? Career clarity? Compensation? Rank by importance." |

---

#### 16. Interview Follow-up Questions

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `interviewQuestions.probeWeaknesses` | `string[]` | **25-40 words each** (3-4 questions) | **AI Generation** | "Questions to probe potential weaknesses or blind spots revealed by the assessment. Include what answer to look for." |
| `interviewQuestions.validateStrengths` | `string[]` | **25-40 words each** (3-4 questions) | **AI Generation** | "Questions to confirm top strengths with real examples from past experience. Include behavioral indicators to watch for." |
| `interviewQuestions.cultureFit` | `string[]` | **25-40 words each** (2-3 questions) | **AI Generation** | "Questions to assess alignment with company culture based on inferred work style. Include red-flag answers." |
| `interviewQuestions.careerAspirations` | `string[]` | **25-40 words each** (2-3 questions) | **AI Generation** | "Questions to understand long-term goals and check alignment with available growth paths. Include realistic expectation-setting." |

---

#### 17. Team Compatibility Matrix

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `teamCompatibility.bestPairings` | `Object[]` | N/A | **AI Inference** | Cognitive profiles that complement this person. Array of `{ profileType: string, reason: string (30 words) }` |
| `teamCompatibility.potentialFriction` | `Object[]` | N/A | **AI Inference** | Cognitive profiles that may clash. Array of `{ profileType: string, reason: string (30 words), mitigation: string (20 words) }` |
| `teamCompatibility.idealTeamRole` | `string` | **40-50 words** | **AI Generation** | "What role should this person play in a team? The Analyst? The Executor? The Devil's Advocate? The Stabilizer? Include handoff recommendations." |
| `teamCompatibility.collaborationTips` | `string[]` | **20-30 words each** (3-4 items) | **AI Generation** | "Practical tips for teammates working with this person. Communication preferences, handoff styles, meeting behavior." |

---

#### 18. Long-term Trajectory Prediction

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `trajectory.oneYearOutlook` | `string` | **50-70 words** | **AI Generation** | "Where could this person be in 1 year with proper support? Role progression, skill mastery, responsibility scope." |
| `trajectory.threeYearOutlook` | `string` | **50-70 words** | **AI Generation** | "Where could this person be in 3 years? Management track? Specialist depth? Lateral moves? Include conditions required." |
| `trajectory.ceilingFactors` | `string[]` | **20-30 words each** (2-3 items) | **AI Inference** | "What might limit this person's growth if unaddressed? Soft-skill gaps? Narrow expertise? Risk aversion? Include development priority." |
| `trajectory.accelerators` | `string[]` | **20-30 words each** (2-3 items) | **AI Inference** | "What could accelerate their growth? Mentorship? Stretch projects? External training? Cross-functional exposure? Prioritize by impact." |
| `trajectory.alternativePaths` | `string[]` | **30-40 words each** (2-3 items) | **AI Generation** | "If their primary path doesn't work out, what are viable alternatives? Pivot options based on transferable cognitive strengths." |

---

#### 19. Warning Signs & Red Flags

| Field | Type | Word Count | Source | AI Prompt Guidance |
|-------|------|------------|--------|-------------------|
| `warnings.behavioralFlags` | `string[]` | **25-35 words each** (0-3 items) | **AI Inference** | "Any concerning patterns observed during assessment? Extreme rushing? Refusal to complete? Unusual breaks? Include severity and recommended action." |
| `warnings.roleUnsuitability` | `string[]` | **25-35 words each** (2-3 items) | **AI Inference** | "Roles this person should NOT be placed in based on cognitive profile. Example: 'High-ambiguity creative roles' or 'Customer-facing crisis management'." |
| `warnings.burnoutRisk` | `string` | **40-50 words** | **AI Generation** | "Assess burnout susceptibility based on perfectionism, work pace, and stress response. Include early warning signs and prevention strategies." |
| `warnings.overconfidenceCheck` | `string` | **30-40 words** | **AI Inference** | "Is there a gap between confidence displayed and actual performance? Flag if self-assessment seems miscalibrated. Include coaching recommendation." |
| `warnings.ethicalConsiderations` | `string` | **40-50 words** | **AI Generation** | "Any flags relevant to integrity roles (finance, compliance, security)? Based on shortcut-taking patterns, rule-following behavior during assessment." |

---

### AI Generation Summary (Updated)

| Generation Type | Fields Count | Total Word Output |
|----------------|--------------|-------------------|
| **AI Required** | 55+ fields | ~3,500-4,500 words |
| **Heuristic Analysis** | 8 fields | ~300-400 words |
| **Database/Calculated** | 15+ fields | Numeric/Categorical |
| **Static/Template** | 5 fields | ~100 words |

> **Note:** The additional sections (12-19) are OPTIONAL for basic reports but RECOMMENDED for premium/executive reports. They can be generated on-demand or cached for high-value candidates.

---

### Complete JSON Schema Example

```json
{
  "user": {
    "id": "USR-2026-0107",
    "name": "Alex Johnson",
    "email": "alex.johnson@example.com"
  },
  "reportDate": "2026-01-07T10:30:00Z",
  "overallScore": {
    "percentage": 78.5,
    "percentileRank": 82,
    "classification": "High Potential"
  },
  "executiveSummary": {
    "highlights": [
      "Exceptional processing speed (Top 15%) indicates ability to handle high-velocity data and make rapid preliminary judgments in time-sensitive environments.",
      "Strong pattern recognition ideal for analytics, suggesting natural aptitude for identifying market trends or systemic anomalies before they become obvious.",
      "Robust working memory capacity allows simultaneous manipulation of multiple complex variables without cognitive overload."
    ],
    "developmentAreas": [
      "Spatial reasoning requires targeted practice; 3D visualization tasks may initially take longer to process accurately.",
      "Verbal logic consistency under pressure drops slightly, suggesting need for structured communication frameworks during crisis moments."
    ],
    "strategicImplications": "Alex's profile suggests a candidate ready for high-impact individual contributor roles in data-heavy domains. While raw cognitive throughput is elite, influence skills and strategic communication will be the primary lever for career advancement. Organizations should position Alex in roles where 'getting the right answer' is more critical than 'selling the answer' in the short term, while providing mentorship on soft-skill influence."
  },
  "subtests": [
    {
      "name": "Feature Detection",
      "score": 85,
      "percentile": 88,
      "timeSpent": "04:32",
      "accuracy": 90,
      "interpretation": "Rapid anomaly identification capabilities. Best utilized in quality assurance, fraud detection, or systems monitoring roles where vigilance is key."
    },
    {
      "name": "Verbal Reasoning",
      "score": 75,
      "percentile": 72,
      "timeSpent": "08:45",
      "accuracy": 80,
      "interpretation": "Strong logical argument evaluation. Can deconstruct complex texts effectively, though may benefit from 'bottom-line-up-front' training for executive communication."
    },
    {
      "name": "Working Memory",
      "score": 82,
      "percentile": 80,
      "timeSpent": "06:20",
      "accuracy": 85,
      "interpretation": "High information retention. Capable of mental math and holding multi-step instructions without written reference."
    },
    {
      "name": "Numeric Speed",
      "score": 88,
      "percentile": 91,
      "timeSpent": "05:15",
      "accuracy": 92,
      "interpretation": "Precise quantitative processing. Demonstrates natural affinity for financial modeling and statistical analysis."
    },
    {
      "name": "Spatial Orientation",
      "score": 72,
      "percentile": 68,
      "timeSpent": "09:50",
      "accuracy": 75,
      "interpretation": "Moderate 3D visualization skills. May require digital tools or physical models to visualize complex architectural or mechanical structures."
    }
  ],
  "cognitiveSynergy": "The combination of high 'Numeric Speed' and 'Working Memory' creates a powerful 'Real-time Analyst' profile. This synergy allows Alex to not only crunch numbers quickly but also contextually store intermediate results to form a coherent bigger picture. This is rarely seen in candidates who specialize only in one or the other.",
  "behavioralObservations": {
    "speedAccuracyBalance": "Prioritizes accuracy slightly over speed, ensuring high-quality output. Very deliberate interaction style. In scenarios requiring '80/20' decisions, Alex may struggle to let go of perfectionism.",
    "stressResponse": "Maintains composure under pressure; response time increases slightly but error rate remains stable. Likely to become quieter and more focused during crises rather than agitated.",
    "attentionPattern": "Sustained focus maintained throughout 45-minute session without performance dips. Indicates high mental stamina and suitability for long, deep-work sessions.",
    "problemSolvingApproach": "Methodical decomposition of complex problems rather than intuitive leaps. Breaks down challenges into constituent parts, solves serially, and reconstructs the solution."
  },
  "workStyleAnalysis": {
    "workPreference": "Thrives in structured, data-rich environments. Prefers clear objectives over ambiguity. Struggles in 'blank slate' creative roles without defined constraints.",
    "decisionMaking": "Evidence-based. Likely to delay decisions to gather complete data sets. May need a 'bias for action' nudge in low-stakes situations.",
    "communicationStyle": "Concise and factual. Tends to communicate in bullet points and data tables. May need encouragement to share speculative ideas or brainstorm.",
    "leadershipPotential": "Leading by example through technical competence. Potential for operational leadership. Will command respect through subject matter expertise rather than charisma.",
    "teamDynamics": "Steadying influence in chaotic teams. Provides structure and rigorous validation. Often plays the role of the 'Devil's Advocate' to ground overly optimistic plans."
  },
  "environmentalFit": "Ideal fit for mature organizations with established processes or R&D departments. May experience friction in early-stage startups where 'chaos engineering' is the norm. Best managed by setting clear KPIs and allowing autonomy in execution.",
  "careerRecommendations": {
    "roles": [
      {
        "title": "Data Scientist",
        "matchScore": 94,
        "description": "Perfect alignment with pattern recognition and numeric speed. The role rewards the exact mix of accuracy and memory Alex possesses."
      },
      {
        "title": "Systems Analyst",
        "matchScore": 89,
        "description": "Leverages systematic problem-solving approach to audit and improve complex technical workflows."
      },
      {
        "title": "Financial Modeler",
        "matchScore": 86,
        "description": "Utilizes high accuracy and working memory to construct and maintain error-free financial projections."
      },
      {
        "title": "Quality Assurance Lead",
        "matchScore": 83,
        "description": "Benefits from attention to detail and anomaly detection. A natural fit for finding the 'needle in the haystack'."
      },
      {
        "title": "Logistics Coordinator",
        "matchScore": 80,
        "description": "Requires rapid processing and organizational skills to manage complex, moving supply chains."
      }
    ],
    "industries": ["FinTech", "Cybersecurity", "Logistics", "Biotech", "Actuarial Science"],
    "skillsGap": [
      "Strategic storytelling (translating data insights into compelling business narratives)",
      "Cross-functional negotiation and stakeholder influence",
      "Abstract creative thinking without predefined constraints"
    ],
    "motivators": ["Technical Mastery", "Order & Stability", "Measurable Impact", "Clear Progression Metrics"]
  },
  "learningDevelopment": {
    "learningStyle": "Logical-Mathematical: Learns best through classifying, categorizing, and thinking abstractly about patterns. Prefers case studies and real data sets over theoretical lectures.",
    "agilityScore": 82,
    "recommendedCourses": [
      "Advanced Predictive Modeling (Coursera)",
      "Strategic Communication for Analysts (Harvard Online)",
      "Agile Project Management Fundamentals (PMI)"
    ],
    "actionPlan": [
      {
        "period": "Month 1: Foundation",
        "action": "Complete 'Spatial Reasoning' module to address gap. Focus on mental rotation exercises. Establish baseline metrics for current role performance."
      },
      {
        "period": "Month 2: Application",
        "action": "Lead a small data-cleanup project to apply precision skills. Present findings to a non-technical stakeholder to practice translation and influence."
      },
      {
        "period": "Month 3: Expansion",
        "action": "Mentor a junior peer to develop communication softness. Take ownership of one 'ambiguous' project to stretch comfort zone beyond structured tasks."
      }
    ],
    "coachingRecommended": true
  },
  "summary": {
    "keyTakeaways": [
      "High analytical potential confirmed with elite-tier numeric processing.",
      "Ready for specialist individual contributor roles in data-intensive domains.",
      "Leadership path requires deliberate soft-skills focus and influence development."
    ],
    "successFactors": ["Technical precision", "Reliability under pressure", "Deep focus capacity"],
    "riskFactors": ["Analysis paralysis in ambiguous situations", "Resistance to rapid, unstructured change"],
    "nextAssessmentDate": "July 2026",
    "methodology": "This assessment utilizes the TIMCARE Cognitive Battery (TCB-v4), comprised of adaptive subtests normalized against a global cohort of 50,000+ professionals. Reliability coefficient: 0.92. Validity coefficient: 0.88. Results should be interpreted as one data point among multiple hiring factors."
  },

  "personalityInferences": {
    "cognitiveStyle": "Analytical Thinker with strong systematic tendencies. Alex approaches problems through logical decomposition and evidence gathering. Thrives when given complex puzzles with clear success criteria. May struggle with purely creative tasks lacking defined parameters.",
    "workingPace": "Marathon with Sprinter capability. Prefers steady, consistent output but can shift into high-intensity mode for deadlines. Best not to rely on sprint mode frequently to avoid quality degradation.",
    "riskTolerance": "Calculated Risk-Taker. Will take measured risks when data supports the decision. Unlikely to make bold bets without evidence. Good for roles requiring careful judgment, less suited for pure innovation roles.",
    "detailOrientation": "Trees-first, forest-aware. Naturally focuses on details but can pull back to see bigger picture when prompted. May need reminders to communicate the 'so what' to stakeholders.",
    "socialEnergy": "Moderate introvert. Prefers focused solo work but functions well in small team settings. May need recovery time after large meetings. Schedule deep work in mornings.",
    "perfectionismLevel": "Moderate-high. Prioritizes accuracy over speed. In time-constrained situations, may need explicit permission to deliver 'good enough' rather than perfect."
  },

  "managerGuidance": {
    "feedbackStyle": "Data-backed and specific. Alex responds best to feedback that includes concrete examples and metrics. Avoid vague praise like 'good job' - instead say 'your analysis caught the billing discrepancy that saved $50K'. Written feedback preferred for complex topics.",
    "motivationTriggers": [
      "Technical mastery and skill-building opportunities drive engagement",
      "Clear metrics showing measurable impact of their work",
      "Autonomy to choose HOW to solve problems (not just WHAT to solve)",
      "Recognition for thoroughness and accuracy, especially from peers",
      "Exposure to complex, novel problems that stretch capabilities"
    ],
    "demotivationWarnings": [
      "Micromanagement of their analytical process kills motivation",
      "Frequent context-switching prevents deep work and causes frustration",
      "Lack of clear success criteria makes them anxious and hesitant",
      "Being rushed to deliver before they feel work is complete"
    ],
    "meetingPreference": "Prefers fewer, more structured meetings with clear agendas. Benefits from 1:1s for complex discussions. Group meetings work when focused on information-sharing, not ideation. Send pre-reads 24 hours ahead.",
    "conflictResolution": "Data-driven diplomat. In conflicts, Alex will gather facts before taking a position. May appear slow to respond but this is processing time. De-escalate by asking 'what data would help us resolve this?' rather than forcing immediate resolution.",
    "recognitionStyle": "Private acknowledgment preferred over public praise. Specific recognition of craft quality resonates more than general accolades. Consider peer-to-peer recognition channels. Tangible rewards (learning budget) valued over titles."
  },

  "onboarding": {
    "learningCurveEstimate": "Expect full productivity in 60-75 days for analytical roles. Alex will self-accelerate by seeking documentation and patterns. May take longer (90+ days) if role requires heavy stakeholder relationship-building.",
    "structureLevel": "Moderate-high structure recommended. Provide clear 30-60-90 day plan with defined milestones. Alex will appreciate checklists but also wants room to explore systems independently. Avoid 'sink or swim' approaches.",
    "buddyMatching": "Pair with a complementary profile: Someone stronger in communication/influence who respects analytical depth. Avoid pairing with another deep analyst (insufficient cultural context). Ideal: Senior with 2+ years tenure who can explain unwritten rules.",
    "firstWeekPriorities": [
      "Day 1-2: Complete system access and tool setup (immediate frustration reducer)",
      "Day 3: Review historical data/reports to understand context before meetings",
      "Day 4-5: Shadow 2-3 key meetings to observe team dynamics and norms",
      "End of Week: Small quick-win task to build confidence and demonstrate value"
    ],
    "potentialChallenges": [
      "May over-prepare before speaking up, causing silent first weeks - actively invite input",
      "Could get lost in system exploration - provide guided tours instead of open access",
      "Might not ask for help early - schedule proactive check-ins every 2-3 days initially"
    ]
  },

  "retention": {
    "riskLevel": "Medium",
    "riskFactors": [
      "Limited advancement visibility may cause exit at 18-24 month mark",
      "If forced into highly ambiguous or chaotic environment without support",
      "Compensation below market for specialized skills (data science, quantitative analysis)",
      "Manager mismatch with micromanagement style"
    ],
    "retentionStrategies": [
      "Provide clear 12-month development roadmap with skill milestones",
      "Offer stretch assignments that challenge technically without overwhelming",
      "Connect to mentor network of senior analytical professionals",
      "Ensure competitive total compensation especially in quantitative skills market",
      "Give visibility to senior leaders through project presentations"
    ],
    "flightIndicators": [
      "Reduced initiative on improvement suggestions - may signal disengagement",
      "Visible upskilling in areas outside current role (e.g., new certifications)",
      "Declining optional meetings and team social events",
      "Increased focus on documentation (preparing for transition)"
    ],
    "loyaltyDrivers": [
      "Career path clarity with defined checkpoints ranked #1",
      "Quality of technical challenges and learning opportunities",
      "Respect and recognition from peers for expertise",
      "Work-life predictability (no surprise fire drills)",
      "Trust and autonomy from management"
    ]
  },

  "interviewQuestions": {
    "probeWeaknesses": [
      "Tell me about a time you had to make a decision with incomplete data. How did you handle the ambiguity? (Watch for: discomfort, overthinking, or clear coping strategies)",
      "Describe a situation where you had to convince a skeptical audience of your analysis. What approach did you take? (Watch for: storytelling ability, frustration with 'non-believers')",
      "When have you had to deliver work before you felt it was ready? What was the outcome? (Watch for: perfectionism acknowledgment, recovery ability)"
    ],
    "validateStrengths": [
      "Walk me through your most complex analytical project. What made it challenging? (Watch for: depth of explanation, structured thinking, pride in rigor)",
      "How do you ensure accuracy when working under time pressure? (Watch for: specific techniques, not just 'I double-check')",
      "Give an example of a pattern or anomaly you spotted that others missed. (Watch for: specific examples with measurable impact)"
    ],
    "cultureFit": [
      "How do you prefer to receive feedback on your work? (Red flag: defensiveness about any critique approach)",
      "Describe your ideal work environment. (Red flag: only describes solo work, no collaboration mentioned)"
    ],
    "careerAspirations": [
      "Where do you see yourself in 3 years? (Check alignment with available paths)",
      "What skills are you actively trying to develop right now? (Check growth mindset and self-awareness)"
    ]
  },

  "teamCompatibility": {
    "bestPairings": [
      {
        "profileType": "Creative Communicator",
        "reason": "Complements Alex's analytical depth with storytelling ability. Alex provides rigor, partner provides narrative - together they create compelling, accurate outputs."
      },
      {
        "profileType": "Action-Oriented Executor",
        "reason": "Alex's thorough analysis benefits from someone who can push for timely decisions. Prevents analysis paralysis while maintaining quality standards."
      },
      {
        "profileType": "Strategic Networker",
        "reason": "Can open doors and build relationships that Alex's technical work deserves but may not self-promote. Mutual benefit: credibility + visibility."
      }
    ],
    "potentialFriction": [
      {
        "profileType": "Rapid Intuitive",
        "reason": "May clash over pace and evidence requirements. Intuitive wants fast decisions; Alex wants complete data.",
        "mitigation": "Establish explicit decision frameworks upfront. Define 'minimum viable evidence' thresholds."
      },
      {
        "profileType": "High-Chaos Creative",
        "reason": "Thrives in ambiguity that frustrates Alex. May see Alex as 'too slow' while Alex views them as 'reckless'.",
        "mitigation": "Separate ideation (creative leads) from validation (Alex leads) phases explicitly."
      }
    ],
    "idealTeamRole": "The Validator / Quality Anchor. Alex excels at pressure-testing ideas, catching errors, and ensuring deliverables meet rigorous standards. Best positioned after initial ideation, before final delivery. Should not be the 'idea generator' in brainstorms but invaluable in feasibility assessment.",
    "collaborationTips": [
      "Send detailed briefs in writing before meetings for Alex to process in advance",
      "Allow 'think time' before expecting responses on complex questions",
      "Frame requests with clear success criteria and relevant constraints",
      "Respect focus time - batch non-urgent questions rather than frequent interruptions"
    ]
  },

  "trajectory": {
    "oneYearOutlook": "With proper support, Alex could become the team's go-to technical expert in their analytical domain. Expected to own increasingly complex individual contributor projects. May begin informal mentoring of junior analysts. Key milestone: lead one high-visibility analysis that reaches senior leadership.",
    "threeYearOutlook": "Two divergent paths possible: (1) Deep Specialist track - recognized subject matter expert consulted across teams; or (2) Technical Lead track - managing 2-3 junior analysts while maintaining hands-on work. Leadership track requires deliberate soft-skill investment starting now.",
    "ceilingFactors": [
      "Communication and influence skills - current blocker for executive visibility",
      "Comfort with ambiguity - limits suitability for exploratory/innovation roles",
      "Delegation trust - may struggle to let others complete work 'their way'"
    ],
    "accelerators": [
      "Executive communication coaching - highest leverage investment",
      "Cross-functional project exposure - builds stakeholder relationships",
      "Structured mentorship from senior leader who made similar transition"
    ],
    "alternativePaths": [
      "If management doesn't appeal: Principal/Staff-level IC track with advisory responsibilities",
      "If current domain saturates: Lateral to data engineering or ML ops leveraging quantitative foundation",
      "If seeking variety: Internal consulting/CoE role providing expertise across business units"
    ]
  },

  "warnings": {
    "behavioralFlags": [
      "No significant flags observed. Session completed within normal parameters."
    ],
    "roleUnsuitability": [
      "Avoid: High-chaos startup environments with constantly shifting priorities and no documentation",
      "Avoid: Pure creative/ideation roles with no analytical component (copywriting, brand strategy)",
      "Avoid: Customer-facing crisis roles requiring rapid improvisation under emotional pressure"
    ],
    "burnoutRisk": "Moderate. Perfectionism combined with high workload could lead to unsustainable effort. Watch for: working late consistently, reluctance to mark work 'complete', stress over minor errors. Prevention: Explicit 'good enough' permission, realistic deadlines, quality-over-quantity messaging.",
    "overconfidenceCheck": "Calibration appears accurate. Self-assessment generally aligned with objective performance. No significant overestimation of abilities observed. Likely to accurately assess own limitations.",
    "ethicalConsiderations": "No red flags for integrity roles. Completed all questions without shortcuts or pattern-guessing. Demonstrated rule-following behavior throughout assessment. Suitable for roles requiring precision and compliance (finance, audit, security)."
  }
}
```

---

### Backend Implementation Notes

1. **AI Pipeline Required**: A multi-step LLM chain is needed to generate narrative content. Recommend using GPT-4 or Claude with structured output.

2. **Caching Strategy**: Report data is expensive to generate. Cache completed reports by `userId + assessmentSessionId` with 30-day TTL.

3. **Generation Triggers**: 
   - Automatic: When user completes all 5 MIL subtests
   - Manual: Admin action or user clicks "Generate Full Report"

4. **Word Count Validation**: Implement server-side validation to ensure AI outputs meet minimum/maximum word counts before storing.

5. **Fallback Content**: If AI generation fails, use templated fallback content based on score ranges (Low/Medium/High).

---

### Priority: **CRITICAL**

This endpoint blocks the premium PDF export feature. Frontend component `LIAReportPDF.tsx` is ready and awaiting real API data.

