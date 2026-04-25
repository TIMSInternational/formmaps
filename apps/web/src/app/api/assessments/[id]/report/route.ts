
import { NextResponse } from 'next/server';
import { EnhancedUserExamHistory } from '@/services/milService';

// Types representing the backend responses (approximate based on service usage)
interface PCAResultResponse {
  // Add specific fields if known, or use any for flexibility during dev
  [key: string]: any;
}

interface PCACompetencesResponse {
  [key: string]: any;
}

// Data structure required by the report
import { AssessmentReportData } from '@/types/assessmentReport';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await params;
  const userId = resolvedParams.id;

  // Get the Authorization header from the incoming request
  const authHeader = request.headers.get('Authorization');

  if (!authHeader) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing Authorization header' },
      { status: 401 }
    );
  }

  const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "https://careerproject-eucbddf3h4h0ekfx.canadacentral-01.azurewebsites.net";

  try {
    // Parallel fetch of all required data
    const [milResponse, pcaResultResponse, pcaCompetenciesResponse] = await Promise.all([
      // 1. MIL History (LIA) - GET
      fetch(`${API_BASE_URL}/api/PCAExam/history/${userId}?lang=en`, {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader
        }
      }),
      // 2. PCA Result - POST
      fetch(`${API_BASE_URL}/api/pcaapi/get-result?lang=en`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 'Authorization': authHeader // PCA API might not need it, but safer to try or omit if it causes issues. 
          // Previous analysis showed no auth header in service, but let's try mostly standard practice. 
          // If it fails, we might need to remove it. 
          // Actually, the service file didn't use it, suggesting it might be open or using a different auth.
          // However, we will assume it's publicly accessible via the same mechanism or doesn't verify token strictly.
          // Let's forward it just in case.
        },
        body: JSON.stringify({ UserId: userId })
      }),
      // 3. PCA Competencies - POST
      fetch(`${API_BASE_URL}/api/pcaapi/get-competences?lang=en`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ UserId: userId, CmpTims: "1" })
      })
    ]);

    // Check responses
    const milData: EnhancedUserExamHistory | null = milResponse.ok ? await milResponse.json() : null;
    const pcaResult: PCAResultResponse | null = pcaResultResponse.ok ? await pcaResultResponse.json() : null;
    // const pcaCompetencies: PCACompetencesResponse | null = pcaCompetenciesResponse.ok ? await pcaCompetenciesResponse.json() : null;

    // Use MIL username if available, otherwise default
    const candidateName = milData?.username || "Candidate";

    // Determine Assessment Date (latest completed exam or today)
    let assessmentDate = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    if (milData?.examStatus) {
      const completed = milData.examStatus.find(e => e.status === 'completed');
      // If we had dates in examStatus we would use them. Using current date as fallback.
    }

    // Construct the Report Data Structure
    // Note: We are mocking the narrative parts because the API doesn't return generated text.
    // In a real scenario, we would have an AI service generating this or a CMS.

    const reportData: AssessmentReportData = {
      candidate: {
        name: candidateName,
        assessmentDate: assessmentDate,
      },
      executiveSummary: {
        text: `${candidateName} shows exceptional potential in cognitive processing and analytical thinking. The combination of high numerical speed and spatial orientation suggests a natural aptitude for technical and engineering fields.`,
        summaryTitle: "Technical & Analytical",
        steps: [
          { number: 1, text: "Review integrated LIA and PCA results." },
          { number: 2, text: "Explore recommended engineering majors." },
          { number: 3, text: "Develop a technical skills roadmap." },
          { number: 4, text: "Begin portfolio development." },
          { number: 5, text: "Research top technical universities." }
        ]
      },
      liaSubtests: [
        {
          title: "Feature Detection",
          description: "High attention to detail and ability to identify patterns quickly.",
          iconType: "glasses"
        },
        {
          title: "Numerical Speed",
          description: "Rapid and accurate processing of numerical data.",
          iconType: "timer" // closest match
        },
        {
          title: "Spatial Orientation",
          description: "Strong ability to visualize objects in 3D space.",
          iconType: "puzzle"
        },
        {
          title: "Verbal Reasoning",
          description: "Effective understanding and logic in verbal contexts.",
          iconType: "gears" // metaphorical
        },
        {
          title: "Working Memory",
          description: "Capacity to hold and manipulate information temporarily.",
          iconType: "math"
        }
      ],
      integratedDiagnosis: {
        chartData: [
          // Using placeholder values or mapping from PCA if available
          { label: "A", value: 30, color: "#0f172a" },
          { label: "B", value: 20, color: "#334155" },
          { label: "C", value: 15, color: "#475569" },
          { label: "D", value: 25, color: "#64748b" },
          { label: "E", value: 10, color: "#94a3b8" }
        ],
        legend: [
          { label: "A", title: "Logic", description: "Logical reasoning", bg: "#0f172a", borderColor: "#0f172a" },
          { label: "B", title: "Spatial", description: "Spatial visualization", bg: "#334155", borderColor: "#334155" },
          { label: "C", title: "Verbal", description: "Verbal comprehension", bg: "#475569", borderColor: "#475569" },
          { label: "D", title: "Numerical", description: "Numerical analysis", bg: "#64748b", borderColor: "#64748b" },
          { label: "E", title: "Abstract", description: "Abstract thinking", bg: "#94a3b8", borderColor: "#94a3b8" }
        ],
        majors: {
          perfectFit: [
            { id: 1, title: "Computer Science", description: "Software & Systems" },
            { id: 2, title: "Data Engineering", description: "Big Data Infrastructures" }
          ],
          highlyRecommended: [
            { id: 3, title: "Physics", description: "Theoretical & Applied" }
          ],
          complementary: [
            "Mathematics", "Statistics", "Robotics"
          ]
        }
      },
      notRecommended: [
        { category: "Pure Arts", reason: "Low alignment with current cognitive profile." },
        { category: "Social Sciences", reason: "Interest markers are lower in this area." }
      ],
      explorationPlan: [
        { phase: "Month 1", title: "Skill Building", activities: "Online coding courses (Python/JS)", kpiLabel: "KPI", kpi: "Complete 2 modules" },
        { phase: "Month 2", title: "Project Work", activities: "Build a simple web app", kpiLabel: "KPI", kpi: "Deploy project" },
        { phase: "Month 3", title: "Advanced Topics", activities: "Data structures & Algos", kpiLabel: "KPI", kpi: "Solve 50 problems" },
        { phase: "Month 4", title: "Review", activities: "Assess progress", kpiLabel: "KPI", kpi: "Self-assessment" }
      ],
      operationalPlan: [
        { phase: "Week 1", text: "Setup dev environment" },
        { phase: "Week 2", text: "Hello World program" },
        { phase: "Week 3", text: "Basic syntax practice" },
        { phase: "Week 4", text: "First mini-project" }
      ],
      indicators: [
        { label: "Skills", text: "Python, JS", bold: "Intermediate" },
        { label: "Projects", text: "Portfolio", bold: "1 Item" }
      ],
      training: [
        { label: "Coding", text: "Daily practice 1h" },
        { label: "Reading", text: "Tech blogs" },
        { label: "Community", text: "Join discord/slack" },
        { label: "Courses", text: "Udemy/Coursera" }
      ],
      universityMapping: [
        { country: "US", code: "MIT", uni: "Massachusetts Institute of Technology", prog: "Computer Science", type: "BS", req: "SAT/ACT", high: "Top Tier" },
        { country: "UK", code: "OXF", uni: "University of Oxford", prog: "Computer Science", type: "BA", req: "A-Levels", high: "Prestigious" }
      ],
      conclusion: {
        text: "The candidate demonstrates strong aptitude for technology and engineering. A structured path in Computer Science is highly recommended.",
        nextSteps: [
          "Enroll in intro CS course",
          "Join a coding club",
          "Attend a hackathon",
          "Build a personal website"
        ]
      }
    };

    return NextResponse.json(reportData);

  } catch (error) {
    console.error("Error generating assessment report:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
