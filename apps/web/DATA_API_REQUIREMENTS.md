# Assessment Report Data Requirements

To enable dynamic generation of the Assessment Report PDF, the following data structure is required from the API. The report is highly visual and relies on specific content lengths to maintain layout integrity (A4 pages).

## General Info

**Endpoint:** `GET /api/assessments/{id}/report` (Proposed)

### JSON Structure

```json
{
  "candidate": {
    "name": "Maria Paula Mendoza", // Max 30 chars
    "assessmentDate": "September 23, 2025"
  },
  "executiveSummary": {
    "text": "Maria Paula shows two exceptional cognitive markers...", // Max 550 chars (~80 words)
    "summaryTitle": "Influence / Technical precision", // Max 40 chars
    "steps": [
      // Exactly 5 items required
      { "number": 1, "text": "Translate LIA and PCA results..." }, // Max 90 chars
      { "number": 2, "text": "Prioritize majors..." },
      { "number": 3, "text": "Provide an exploration plan..." },
      { "number": 4, "text": "Deliver operational plan..." },
      { "number": 5, "text": "Map recommended universities..." }
    ]
  },
  "liaSubtests": [
    // Page 2: Exactly 5 items
    {
      "title": "Detection of characteristics", // Max 40 chars
      "description": "Identifies errors, patterns and details...", // Max 140 chars
      "iconType": "glasses" // Enum: 'glasses', 'gears', 'math', 'puzzle', 'timer'
    }
  ],
  "integratedDiagnosis": {
    // Page 3
    "chartData": [
      // Exactly 5 segments
      { "label": "F", "value": 14, "color": "#1a1a2e" },
      { "label": "A", "value": 35, "color": "#0f172a" },
      { "label": "B", "value": 25, "color": "#006d77" },
      { "label": "C", "value": 9, "color": "#99e2e8" },
      { "label": "D", "value": 17, "color": "#22d3ee" }
    ],
    "legend": [
      // Exactly 5 items
      {
        "label": "A",
        "title": "Strengths", // Max 20 chars
        "description": "She quickly detects details..." // Max 80 chars
      }
    ],
    "majors": {
      "perfectFit": [
        // Max 3 items
        {
          "id": 1,
          "title": "Architecture", // Max 40 chars
          "description": "Spatial visualization...", // Max 100 chars
          "extra": "(optional suffix)" // Max 30 chars
        }
      ],
      "highlyRecommended": [
        // Max 3 items
        { "id": 4, "title": "Interior Architecture" }
      ],
      "complementary": [
        // Max 3 items
        "Naval Engineering", // Max 50 chars
        "UX/UI Design",
        "Quality Control"
      ]
    }
  },
  "notRecommended": [
    // Page 4: Max 2 items
    {
      "category": "Routine-based programs", // Max 60 chars
      "reason": "Programs that rely exclusively on repetitive routines..." // Max 120 chars
    }
  ],
  "explorationPlan": [
    // Page 4: Exactly 4 items
    {
      "phase": "Month 0–1",
      "title": "Quick confirmation", // Max 30 chars
      "activities": "Intensive SketchUp, AutoCAD course...", // Max 130 chars
      "kpiLabel": "KPI:",
      "kpi": "enjoy at least 2 of the 3 activities." // Max 60 chars
    }
  ],
  "operationalPlan": [
    // Page 5: Exactly 4 items
    {
      "phase": "Week 1–2",
      "text": "Enroll in a basic CAD course..." // Max 85 chars
    }
  ],
  "indicators": [
    // Page 5: Max 5 items
    {
      "label": "Portfolio", // Max 25 chars
      "text": "2 completed pieces in", // Max 40 chars
      "bold": "3 months.", // Max 20 chars
      "extra": "optional suffix", // Max 30 chars
      "boldEnd": "optional bold keys" // Max 20 chars
    }
  ],
  "training": [
    // Page 5: Exactly 4 items
    {
      "label": "Technical", // Max 20 chars
      "text": "AutoCAD, SketchUp, Revit..." // Max 100 chars
    }
  ],
  "universityMapping": [
    // Page 6: Max 8 items
    {
      "country": "IT", // Enum: 'IT', 'ES', 'CO', 'US', 'UK', etc. (for flag logic)
      "code": "MIL", // Max 3 chars
      "uni": "Politecnico di Milano", // Max 30 chars (will wrap)
      "prog": "Architecture;\nProduct Design", // Max 40 chars
      "type": "Degree / Laurea", // Max 30 chars
      "req": "Entrance exam /\nPortfolio", // Max 30 chars
      "high": "Top school; strong labs" // Max 40 chars
    }
  ],
  "conclusion": {
    // Page 7
    "text": "Maria Paula displays high potential...", // Max 400 chars (~60 words)
    "nextSteps": [
      // Max 5 items
      "Start the 8-week plan...", // Max 90 chars per item
      "Select 4 target universities...",
      "Request 2 portfolio reviews...",
      "Schedule decision-making coaching..."
    ]
  }
}
```

## Strict Character Limits

To prevent layout breakage on A4 PDF pages, stick to these limits.
**Note:** "Chars" includes spaces.

### Page 1 (Cover & Summary)

| Field                      | Max Chars | Notes                  |
| :------------------------- | :-------- | :--------------------- |
| **Executive Summary Text** | **550**   | ~5-6 lines max.        |
| **Summary Title**          | **40**    | Short tag on pill.     |
| **Action Steps (x5)**      | **90**    | Must fit on 1-2 lines. |

### Page 2 (Subtests)

| Field                   | Max Chars | Notes           |
| :---------------------- | :-------- | :-------------- |
| **Subtest Description** | **140**   | Approx 2 lines. |
| **Subtest Title**       | **40**    |                 |

### Page 3 (Diagnosis)

| Field                  | Max Chars | Notes                             |
| :--------------------- | :-------- | :-------------------------------- |
| **Legend Description** | **80**    | Must fit on 1 line next to title. |
| **Major Description**  | **100**   |                                   |
| **Major Title**        | **40**    |                                   |

### Page 4 (Roadmap)

| Field                      | Max Chars | Notes                  |
| :------------------------- | :-------- | :--------------------- |
| **Not Recommended Reason** | **120**   |                        |
| **Exploration Activity**   | **130**   | Critical. Max 3 lines. |
| **Exploration KPI**        | **60**    | Max 1 line.            |

### Page 5 (Operational)

| Field                    | Max Chars   | Notes                         |
| :----------------------- | :---------- | :---------------------------- |
| **Operational Activity** | **85**      | Max 2 lines per week block.   |
| **Indicator Text**       | **40 + 20** | Text + Bold segment together. |
| **Training Text**        | **100**     | Max 2 lines.                  |

### Page 6 (Universities)

| Field                | Max Chars | Notes               |
| :------------------- | :-------- | :------------------ |
| **University Name**  | **30**    | Wraps at ~15 chars. |
| **Program/Type/Req** | **30-40** | Concise labels.     |

### Page 7 (Conclusion)

| Field               | Max Chars | Notes                                 |
| :------------------ | :-------- | :------------------------------------ |
| **Conclusion Text** | **400**   | ~4-5 lines.                           |
| **Next Steps**      | **90**    | Max 1 line preferred (can wrap to 2). |
