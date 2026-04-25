**Total Endpoints Required:** 6  
**Timeline:** Backend dev to implement these endpoints  
**Model/Provider:** Backend dev's choice (not specified in frontend)

---

## API Endpoints

### 1. Generate Professional Summary

**Endpoint:**

```
POST /api/resume/generate/professional-summary
```

**Description:** Generate an ATS-optimized professional summary based on career profile and skills.

**Request Headers:**

```
Content-Type: application/json
Authorization: Bearer <JWT_TOKEN>
```

**Request Body:**

```json
{
  "careerLevel": "mid-career",
  "industry": "technology",
  "yearsOfExperience": 6,
  "keySkills": ["React", "Node.js", "AWS", "System Design"],
  "targetRole": "Senior Full-Stack Engineer",
  "achievements": ["Led team of 5 engineers", "Reduced API latency by 40%"],
  "tone": "professional",
  "maxWords": 80
}
```

**Request Body Validation:**

- `careerLevel` (required): `enum` - "entry-level" | "mid-career" | "senior" | "executive"
- `industry` (required): `string` - Max 100 chars
- `yearsOfExperience` (required): `number` - Range 0-70
- `keySkills` (required): `array[string]` - Min 1, Max 20 items, each max 50 chars
- `targetRole` (optional): `string` - Max 100 chars
- `achievements` (optional): `array[string]` - Max 10 items, each max 200 chars
- `tone` (optional): `enum` - "professional" | "achievement-focused" | "impact-driven" | "leadership-focused"
- `maxWords` (optional): `number` - Range 20-200, default 80

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "generated_content": "Results-driven Senior Software Engineer with 6+ years designing scalable solutions using React and Node.js. Expert in AWS cloud architecture and system design. Led team of 5 engineers while reducing API latency by 40%. Proven ability to deliver high-impact projects. Seeking Senior Full-Stack Engineer role to drive innovation.",
    "wordCount": 48,
    "keywordsIncluded": [
      "React",
      "Node.js",
      "AWS",
      "system design",
      "team leadership"
    ],
    "atsScore": 0.87,
    "tone": "professional"
  },
  "metadata": {
    "generatedAt": "2024-10-31T10:30:00Z",
    "tokensUsed": 256
  }
}
```

**Error Responses:**

- `400` - MISSING_REQUIRED_FIELDS: Missing required fields
- `400` - INVALID_CAREER_LEVEL: Invalid careerLevel value
- `400` - INVALID_SKILLS: Invalid keySkills array
- `429` - RATE_LIMIT_EXCEEDED: Too many requests
- `500` - GENERATION_FAILED: LLM generation failed
- `504` - GENERATION_TIMEOUT: Generation took too long

**Error Response Format:**

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Error description",
    "details": {}
  }
}
```

---

### 2. Generate Job Bullet Points

**Endpoint:**

```
POST /api/resume/generate/job-bullets
```

**Description:** Generate 4-6 achievement-focused bullet points for a job entry. **CRITICAL for ATS optimization.**

**Request Body:**

```json
{
  "jobTitle": "Senior Software Engineer",
  "company": "TechCorp",
  "industry": "Technology",
  "duration": "3 years",
  "responsibilities": [
    "Led development of core platform features",
    "Managed junior developers",
    "Optimized database performance"
  ],
  "keySkills": ["React", "Node.js", "AWS"],
  "achievements": [
    "Doubled system throughput",
    "Reduced deployment time from 2 hours to 10 minutes"
  ],
  "bulletCount": 5,
  "tone": "achievement-focused"
}
```

**Request Body Validation:**

- `jobTitle` (required): `string` - Max 100 chars
- `company` (required): `string` - Max 100 chars
- `industry` (optional): `string` - Max 100 chars
- `duration` (optional): `string` - Max 50 chars
- `responsibilities` (required): `array[string]` - Min 1, Max 10 items
- `keySkills` (required): `array[string]` - Min 1, Max 15 items
- `achievements` (optional): `array[string]` - Max 5 items
- `bulletCount` (optional): `number` - Range 3-8, default 5
- `tone` (optional): `enum` - "achievement-focused" | "impact-driven" | "leadership-focused" | "technical"

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "bulletPoints": [
      "Led development of microservices architecture handling 10M+ requests/day, improving system scalability and enabling 5x traffic increase",
      "Optimized PostgreSQL database queries and implemented Redis caching layer, reducing average API response time by 65%",
      "Mentored team of 4 junior developers through code reviews and technical training, resulting in 2 promotions",
      "Designed and implemented CI/CD pipeline using GitHub Actions and AWS, reducing deployment time from 2 hours to 10 minutes",
      "Drove adoption of TypeScript across codebase, improving code quality metrics and reducing production bugs by 40%"
    ],
    "wordCounts": [19, 18, 17, 18, 17],
    "totalWords": 89,
    "atsScore": 0.91,
    "keywordsIncluded": [
      "microservices",
      "scalability",
      "PostgreSQL",
      "Redis",
      "API",
      "mentoring",
      "CI/CD",
      "TypeScript"
    ],
    "tone": "achievement-focused"
  },
  "metadata": {
    "generatedAt": "2024-10-31T10:32:00Z",
    "tokensUsed": 512
  }
}
```

**Key Requirements for Response:**

- Each bullet must start with strong action verb (Led, Designed, Implemented, etc.)
- Include quantifiable metrics (%, $, time, scale)
- 15-20 words per bullet (optimal for ATS)
- Total 4-6 bullets
- No personal pronouns
- Avoid generic statements

---

### 3. Generate Career Objective

**Endpoint:**

```
POST /api/resume/generate/career-objective
```

**Description:** Generate a role-specific career objective statement.

**Request Body:**

```json
{
  "careerLevel": "mid-career",
  "yearsOfExperience": 6,
  "targetRole": "Senior Product Manager",
  "targetIndustry": "SaaS",
  "keyStrengths": ["Product strategy", "Team leadership", "Data analysis"],
  "maxWords": 50
}
```

**Request Body Validation:**

- `careerLevel` (required): `enum` - "entry-level" | "mid-career" | "senior" | "executive"
- `yearsOfExperience` (required): `number` - Range 0-70
- `targetRole` (required): `string` - Max 100 chars
- `targetIndustry` (required): `string` - Max 100 chars
- `keyStrengths` (required): `array[string]` - Min 1, Max 5 items
- `maxWords` (optional): `number` - Range 20-100, default 50

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "generated_content": "Seeking Senior Product Manager position at growth-stage SaaS company. Leverage 6+ years of product strategy and team leadership experience to drive innovation and accelerate market adoption. Proven ability to combine data-driven insights with strategic vision.",
    "wordCount": 38,
    "atsScore": 0.84
  },
  "metadata": {
    "generatedAt": "2024-10-31T10:34:00Z",
    "tokensUsed": 128
  }
}
```

---

### 4. Generate Project Description

**Endpoint:**

```
POST /api/resume/generate/project-description
```

**Description:** Generate a comprehensive project description with outcomes and technical highlights.

**Request Body:**

```json
{
  "projectTitle": "Real-time Analytics Dashboard",
  "yourRole": "Lead Full-Stack Developer",
  "technologies": ["React", "Node.js", "PostgreSQL", "WebSockets"],
  "objectives": [
    "Real-time data visualization",
    "Handle high-frequency updates",
    "Multi-user collaboration"
  ],
  "outcomes": [
    "Adopted by 50+ enterprise customers",
    "Handles 100K+ concurrent connections",
    "99.9% uptime SLA"
  ],
  "maxWords": 100
}
```

**Request Body Validation:**

- `projectTitle` (required): `string` - Max 100 chars
- `yourRole` (required): `string` - Max 100 chars
- `technologies` (optional): `array[string]` - Max 10 items
- `objectives` (optional): `array[string]` - Max 5 items
- `outcomes` (optional): `array[string]` - Max 5 items
- `maxWords` (optional): `number` - Range 50-200, default 100

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "generated_content": "Led development of real-time analytics dashboard built with React, Node.js, and PostgreSQL. Architected WebSocket-based system handling 100K+ concurrent connections with 99.9% uptime. Implemented real-time data visualization enabling users to monitor metrics and trends instantly. Adopted by 50+ enterprise customers processing 500M+ data points daily. Increased customer retention by 35% through improved real-time insights.",
    "wordCount": 68,
    "atsScore": 0.85,
    "technologiesHighlighted": ["React", "Node.js", "PostgreSQL", "WebSockets"],
    "metricsHighlighted": [
      "100K+ concurrent",
      "99.9% uptime",
      "500M+ data points",
      "50+ enterprise customers",
      "35% retention increase"
    ]
  },
  "metadata": {
    "generatedAt": "2024-10-31T10:36:00Z",
    "tokensUsed": 256
  }
}
```

---

### 5. Analyze ATS Score

**Endpoint:**

```
POST /api/resume/analyze/ats-score
```

**Description:** Analyze resume content against job description for ATS compatibility.

**Request Body:**

```json
{
  "resumeContent": {
    "summary": "Results-driven engineer with 5+ years...",
    "experience": [
      {
        "title": "Senior Engineer",
        "bullets": [
          "Led development of microservices...",
          "Improved performance by 40%..."
        ]
      }
    ],
    "skills": ["React", "Node.js", "AWS"]
  },
  "jobDescription": "We are looking for a Senior Engineer with React and AWS experience... Required: Python, Docker, Kubernetes",
  "targetKeywords": ["React", "AWS", "microservices"]
}
```

**Request Body Validation:**

- `resumeContent` (required): `object` - Contains summary, experience, skills
- `jobDescription` (required): `string` - Max 5000 chars
- `targetKeywords` (optional): `array[string]` - Max 20 items

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "atsScore": 0.87,
    "breakdown": {
      "keywordMatch": 0.92,
      "formatting": 0.95,
      "structure": 0.88,
      "contentQuality": 0.75
    },
    "rating": "Good",
    "percentage": 87,
    "matchedKeywords": [
      "React",
      "AWS",
      "engineer",
      "leadership",
      "performance"
    ],
    "missingKeywords": ["Docker", "Kubernetes", "Python"],
    "suggestions": [
      "Add Docker/Kubernetes experience to skills section",
      "Include more specific metrics in experience section",
      "Emphasize system design experience"
    ]
  },
  "metadata": {
    "generatedAt": "2024-10-31T10:40:00Z",
    "tokensUsed": 384
  }
}
```

**ATS Score Interpretation:**

- 0.90-1.0: Excellent (likely to pass ATS)
- 0.75-0.89: Good (good chance to pass ATS)
- 0.50-0.74: Fair (improve keyword alignment)
- 0.00-0.49: Poor (major modifications needed)

---

### 6. Generate Alternatives

**Endpoint:**

```
POST /api/resume/generate/alternatives
```

**Description:** Generate multiple content variations with different tones/approaches.

**Request Body:**

```json
{
  "contentType": "job-bullets",
  "context": {
    "jobTitle": "Senior Engineer",
    "company": "TechCorp",
    "responsibilities": ["Leading team", "Architecture design"],
    "keySkills": ["React", "Node.js"],
    "achievements": ["Doubled throughput", "Reduced latency by 60%"]
  },
  "variationCount": 3,
  "tones": ["achievement-focused", "impact-driven", "leadership-focused"]
}
```

**Request Body Validation:**

- `contentType` (required): `enum` - "summary" | "objective" | "bullets" | "project"
- `context` (required): `object` - Varies based on contentType
- `variationCount` (optional): `number` - Range 2-5, default 3
- `tones` (optional): `array[enum]` - Up to 5 items

**Response (200 OK):**

```json
{
  "success": true,
  "data": {
    "alternatives": [
      {
        "id": "alt-1",
        "tone": "achievement-focused",
        "content": "Led development of microservices architecture handling 10M+ requests/day, improving system scalability...",
        "atsScore": 0.91
      },
      {
        "id": "alt-2",
        "tone": "impact-driven",
        "content": "Architected and deployed distributed system that doubled throughput and reduced latency by 60%...",
        "atsScore": 0.89
      },
      {
        "id": "alt-3",
        "tone": "leadership-focused",
        "content": "Built and mentored engineering team while delivering scalable architecture supporting 10M+ requests daily...",
        "atsScore": 0.85
      }
    ]
  },
  "metadata": {
    "generatedAt": "2024-10-31T10:38:00Z",
    "tokensUsed": 768
  }
}
```

---

## Error Handling

### Standard Error Response Format

All endpoints should return errors in this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {
      "field": "field name that caused error",
      "value": "invalid value provided"
    }
  }
}
```

### Common Error Codes

| Code                     | Status | Meaning                                     |
| ------------------------ | ------ | ------------------------------------------- |
| MISSING_REQUIRED_FIELDS  | 400    | Required field(s) missing from request      |
| INVALID_ENUM_VALUE       | 400    | Invalid enum value provided                 |
| INVALID_RANGE            | 400    | Number out of acceptable range              |
| INVALID_ARRAY_LENGTH     | 400    | Array doesn't meet min/max requirements     |
| RATE_LIMIT_EXCEEDED      | 429    | Too many requests (implement rate limiting) |
| INVALID_TOKEN            | 401    | JWT token missing or invalid                |
| INSUFFICIENT_PERMISSIONS | 403    | User doesn't have permission                |
| GENERATION_FAILED        | 500    | LLM generation failed                       |
| GENERATION_TIMEOUT       | 504    | Generation took longer than timeout         |
| INTERNAL_ERROR           | 500    | Unexpected server error                     |

---

## Authentication

All endpoints require JWT authentication:

**Header:**

```
Authorization: Bearer <JWT_TOKEN>
```

**Extract user ID from JWT for:**

- Rate limiting (per-user quotas)
- Usage tracking
- Analytics logging

---

## Rate Limiting

### Recommended Quotas

```
Free Tier:
- 10 requests per minute per user
- 20 generations per month total

Pro Tier:
- 30 requests per minute per user
- 500 generations per month total

Enterprise:
- Unlimited requests
- Custom quotas
```

### Rate Limit Headers (Include in Response)

```
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 9
X-RateLimit-Reset: 1698748200
```

---

## Performance Targets

All endpoints should aim for these response times:

| Endpoint             | Target | P95 | P99 |
| -------------------- | ------ | --- | --- |
| professional-summary | 2-3s   | 4s  | 5s  |
| career-objective     | 1-2s   | 3s  | 4s  |
| job-bullets          | 3-4s   | 5s  | 6s  |
| project-description  | 2-3s   | 4s  | 5s  |
| ats-score            | 500ms  | 1s  | 2s  |
| alternatives         | 5-7s   | 10s | 12s |

---

## Implementation Notes for Backend Dev

1. **LLM Model Choice:** Backend dev to choose appropriate model (GPT-4o, Claude, etc.)
2. **Prompt Engineering:** Optimize prompts for quality and cost-efficiency
3. **Caching:** Consider caching common generations to reduce API calls
4. **Async Processing:** Use job queues for long-running generations
5. **Monitoring:** Log all API calls for analytics and debugging
6. **Input Validation:** Validate all inputs against specified types and ranges
7. **Error Handling:** Always return standardized error responses
8. **Response Times:** Aim for target performance times listed above

---

## Frontend Integration Notes

Frontend is ready with:

- ✅ Components that call these endpoints
- ✅ Error handling and retry logic
- ✅ Loading states and spinners
- ✅ Rate limit handling
- ✅ User feedback messages

Once these endpoints are implemented, frontend will:

1. Call the appropriate endpoint based on user action
2. Pass all validated data
3. Handle responses and display results
4. Manage loading, error, and success states

---

**Status:** Ready for Backend Implementation  
**Frontend Status:** Complete and Waiting  
**Next Step:** Backend dev implements these 6 endpoints
