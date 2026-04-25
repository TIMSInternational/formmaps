import React from "react";
import { Glasses, Settings, Calculator, Puzzle, Timer } from "lucide-react";
import type { AssessmentReportData } from "@/types/assessmentReport";

// Default mock data used for standalone preview at /print/nexa
const defaultMockData: AssessmentReportData = {
  candidate: {
    name: "Maria Paula Mendoza",
    assessmentDate: "Septiembre 23/2025",
  },
  executiveSummary: {
    text: "Maria Paula shows two exceptional cognitive markers: Detection of Characteristics = 96% (Exceptional) and Spatial Orientation / Visualization = Exceptional (78%). Her PCA shows high Influence, a service orientation, a strong concern for quality, and low Dominance. In simple terms: she has a keen eye for detail, can visualize in 2D/3D with ease, and relates very well to others — making her an ideal candidate for Architecture, Industrial Design, and programs that combine design with technical precision.",
    summaryTitle: "Influence / Technical precision",
    steps: [
      { number: 1, text: "Translate LIA and PCA results into clear study recommendations." },
      { number: 2, text: "Prioritize majors (Top-10) with cognitive behavioral justification." },
      { number: 3, text: "Provide an exploration and decision plan (0–12 months) for a student." },
      { number: 4, text: "Deliver an immediate operational plan (8 weeks) and tracking KPIs." },
      { number: 5, text: "Map recommended universities and facilitate immediate application actions." },
    ],
  },
  liaSubtests: [
    { title: "Detection of characteristics", description: "Identifies errors, patterns and details; agile learning and precise execution — key for quality control and project review.", iconType: "glasses" },
    { title: "Reasoning", description: "verbal fluency and logical analysis: Useful for argumentation, problem solving and presenting proposals.", iconType: "gears" },
    { title: "Numerical speed and accuracy", description: "Agility for practical calculations; sufficient for basic technical tasks.", iconType: "math" },
    { title: "Working memory", description: "Retention and manipulation of information; for Sara it is adequate, and it is advisable to support it with tools.", iconType: "puzzle" },
    { title: "Orientation / General visualization", description: "Mental rotation, interpretation of plans and 3D prototyping — a differentiating ability for spatially oriented majors.", iconType: "timer" },
  ],
  integratedDiagnosis: {
    chartData: [
      { label: "F", value: 14, color: "#1a1a2e" },
      { label: "A", value: 35, color: "#0f172a" },
      { label: "B", value: 25, color: "#006d77" },
      { label: "C", value: 9, color: "#99e2e8" },
      { label: "D", value: 17, color: "#22d3ee" },
    ],
    legend: [
      { label: "A", title: "Strengths:", description: "She quickly detects details and communicates very well with others.", bg: "#0f172a", borderColor: "#0f172a" },
      { label: "B", title: "Opportunities:", description: "Her reasoning and verbal skills are good and can grow even more.", bg: "#006d77", borderColor: "#008996" },
      { label: "C", title: "Stable Areas:", description: "Her memory works well when information is clear and organized.", bg: "#99e2e8", borderColor: "#22d3ee" },
      { label: "D", title: "Risks:", description: "She may struggle to make firm decisions in difficult situations.", bg: "#22d3ee", borderColor: "#22d3ee" },
      { label: "F", title: "Needs:", description: "She benefits from checklists and step-by-step tasks to stay on track.", bg: "#1a1a2e", borderColor: "#008996" },
    ],
    majors: {
      perfectFit: [
        { id: 1, title: "Architecture", description: "Spatial visualization + portfolio from the start; client interaction." },
        { id: 2, title: "Industrial Design / Product Design", description: "3D prototyping, testing and product improvement." },
        { id: 3, title: "Civil Engineering", description: "plan reading, site control and technical management.", extra: "(project design and supervision)" },
      ],
      highlyRecommended: [
        { id: 4, title: "Interior Architecture / Interior Design" },
        { id: 5, title: "Mechanical Engineering", extra: "(design and prototyping)" },
        { id: 6, title: "Materials Engineering / Materials Science" },
      ],
      complementary: [
        "Naval Engineering / Naval Architecture",
        "UX/UI with physical prototyping / 3D product focus",
        "Technical Quality Control / Quality Engineering",
      ],
    },
  },
  notRecommended: [
    { category: "Programs that rely exclusively on repetitive routines with little visualization", reason: "(e.g., some pure branches of accounting without a technical component)." },
    { category: "Programs that demand high dominance or aggressive sales without support", reason: "(due to low dominance)." },
  ],
  explorationPlan: [
    { phase: "Month 0–1", title: "Quick confirmation", activities: "Intensive SketchUp, AutoCAD course (20–40 h); drawing workshop (10–20 h); 1-day job-shadowing at a studio/workshop.", kpi: "enjoy at least 2 of the 3 activities.", kpiLabel: "KPI:" },
    { phase: "Month 1–3", title: "Minimum portfolio", activities: "Create 2 projects, (A) plan + elevation + 3D view of a space; (B) documented object/prototype.", kpi: "from 2 professionals", kpiLabel: "Request feedback:" },
    { phase: "Month 3–6", title: "Technical validation", activities: "Intermediate courses (BIM / SolidWorks); micro-internship 2–4 weeks.", kpi: "improved portfolio and positive feedback from 1 professional.", kpiLabel: "KPI:" },
    { phase: "Month 6–12", title: "Decision and admission", activities: "Select 2–4 programs (1–2 reach schools, 1–2 safe options). Prepare final portfolio, letters and admission tests.", kpi: "submitted to at least 2 programs.", kpiLabel: "KPI:" },
  ],
  operationalPlan: [
    { phase: "Week 1–2", text: "Enroll in a basic CAD course; define the portfolio project" },
    { phase: "Week 3–4", text: "Execute the first draft; feedback session with a mentor." },
    { phase: "Week 5–6", text: "3D modeling; second feedback and adjustment." },
    { phase: "Week 7–8", text: "Present portfolio version 1; list target universities; prepare admission steps." },
  ],
  indicators: [],
  training: [],
  universityMapping: [],
  conclusion: { text: "", nextSteps: [] },
};

interface NexaReportProps {
  data?: AssessmentReportData;
}

export default function NexaValuesPage({ data }: NexaReportProps = {}) {
  // Merge provided data with defaults — use provided data if available, otherwise fallback
  const d = data || defaultMockData;
  const candidateName = d.candidate.name;
  const candidateDate = d.candidate.assessmentDate;
  const firstName = candidateName.split(" ")[0];
  return (
    <div className="min-h-screen bg-gray-100 py-8 flex flex-col items-center gap-8 print:py-0 print:gap-0 print:bg-white">
      <style type="text/css" media="print">
        {`
           @page { size: A4; margin: 0mm; }
           body { margin: 0px; }
        `}
      </style>
      {/* --- PAGE 1: EXECUTIVE SUMMARY --- */}
      <div className="w-[210mm] h-[297mm] bg-white relative overflow-hidden shadow-none print:shadow-none print:w-[210mm] print:h-[297mm] print:break-after-page print:overflow-hidden sidebar-print-page">
        {/* Reference Overlay */}
        {/* <div className="absolute inset-0 z-50 hidden  opacity-50 pointer-events-none print:hidden">
          <img
            src="/image.png"
            alt="Reference Design"
            className="w-[210mm] h-[297mm]"
          />
        </div> */}
        {/* --- HEADER --- */}
        <div className="relative h-[82mm] w-full">
          <div className="absolute inset-0 w-full h-full">
            <svg
              viewBox="0 0 1000 800"
              preserveAspectRatio="none"
              className="w-full h-full"
            >
              {/* 1. Teal Bar - drawn first (background) */}
              <polygon
                points="150,270 1000,270 1000,490 250,490"
                fill="#008996"
              />

              {/* 2. Light Cyan Triangle - Reduced width wedge */}
              <polygon
                points="300,490 380,490 340,660"
                fill="rgb(120 217 234)"
              />

              {/* 3. Dark Blue Trapezoid - drawn last (foreground) to cover edges */}
              <polygon points="0,0 190,0 340,660 0,660" fill="rgb(0, 59, 89)" />
            </svg>

            {/* Date - Top Right */}
            <div className="absolute top-[12mm] right-10 z-10">
              <span className="text-sm font-bold text-slate-700 tracking-wide font-montserrat">
                {candidateDate}
              </span>
            </div>

            {/* Name - Centered in Teal Bar */}
            <div className="absolute top-[22mm] h-[40%] right-0 w-[60%] flex items-center justify-start pl-4 z-10">
              <h1 className="text-white font-bold text-3xl tracking-wide whitespace-nowrap font-montserrat">
                {candidateName}
              </h1>
            </div>
          </div>

          {/* Logo - Top Left in Dark Blue */}
          <div className="absolute top-[25mm] left-10 z-20">
            <div className="flex flex-col text-white">
              <h2 className="text-5xl font-medium tracking-tight leading-[0.85] font-montserrat">
                NEXA
              </h2>
              <h3 className="text-sm font-bold text-[#67e8f9] tracking-[0.3em] ml-0.5 mt-2 font-montserrat">
                LOGO ACA
              </h3>
            </div>
          </div>
        </div>

        {/* --- CONTENT SECTION --- */}
        <div className="px-10  pb-16">
          <div className="flex flex-row gap-4 ">
            {/* Left Column: Summary Box & Illustration */}
            <div className="w-[40%] flex flex-col items-center mt-[-3mm] pr-2">
              <div className="bg-[#eff6ff] rounded-[2.5rem] p-6 relative overflow-hidden shadow-sm border border-slate-100">
                <p className="text-[rgb(0,59,89)] font-bold text-[1.1rem] leading-tight mb-5 text-left font-roboto tracking-tight">
                  This report practically integrates the results of Sara
                  Decarlini’s Work Intelligence Assessment (LIA) and Personal
                  Competences Analysis (PCA) to guide her vocational decision.
                  The structure provides a clear presentation and an appropriate
                  level of detail, with a practical focus designed to support
                  students deciding whether to enter undergraduate programs or
                  technical study tracks.
                </p>
              </div>

              {/* Illustration Area */}
              <div className="mt-8 relative w-full flex flex-col items-center">
                <div className="w-[300px] h-[300px] relative">
                  <div className="w-full h-full   overflow-hidden bg-[#fcd34d] flex items-center justify-center">
                    <img
                      src="/report/1.jpeg"
                      className="w-[160%] max-w-none ml-[-5%] mt-[10%]"
                      alt="Profile Illustration"
                    />
                  </div>
                </div>

                {/* Pill */}
                <div className="mt-[-54px] z-10 bg-[#008996] rounded-full py-2.5 px-10 text-center shadow-none ">
                  <span className="text-white font-bold text-xs tracking-wide font-antonio">
                    {d.executiveSummary.summaryTitle || "Influence / Technical precision"}
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Text & Steps */}
            <div className="w-[60%] pt-2 -mt-[20mm]">
              <h2 className="text-[#008996] text-3xl font-bold mb-2 font-antonio">
                Executive Summary
              </h2>
              <p className="text-[#1e293b] text-md leading-6 mb-12 text-justify font-medium font-roboto">
                {d.executiveSummary.text}
              </p>

              <div className="space-y-8">
                {d.executiveSummary.steps.map((step) => (
                  <div
                    key={step.number}
                    className="flex flex-row items-center gap-2"
                  >
                    <div className="min-w-[70px] flex justify-center">
                      {/* Distinct Cyan Number */}
                      <span className="text-[rgb(120,217,234)] font-semibold text-7xl leading-none font-montserrat">
                        {step.number}
                      </span>
                    </div>
                    <div className="flex-1 pt-1">
                      <p className="text-[rgb(0,59,89)] font-bold text-md leading-tight font-roboto">
                        {step.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* --- PAGE 2: SUBTESTS --- */}
      <div className="w-[210mm] h-[297mm] bg-white relative overflow-hidden shadow-none print:shadow-none print:w-[210mm] print:h-[297mm] print:break-after-page print:overflow-hidden flex flex-col pt-[30px]">
        {/* Header - 3 Bars (Absolute to prevent being hidden by flow issues) */}
        <div className="absolute top-0 left-0 w-full flex flex-row h-[22px] gap-2">
          <div className="flex-1 bg-[#008996]"></div>
          <div className="flex-1 bg-[#008996]"></div>
          <div className="flex-1 bg-[#008996]"></div>
        </div>

        {/* Header Text Row */}
        <div className="flex flex-row justify-between items-end px-10 mb-10 pt-4">
          <h2 className="text-slate-800 text-sm font-bold font-montserrat">
            {candidateName}
          </h2>
          <span className="text-slate-800 text-sm font-montserrat">
            {candidateDate}
          </span>
        </div>

        <div className="px-10 pb-12">
          <h2 className="text-[#008996] text-3xl font-bold mb-2 font-montserrat tracking-tight">
            1. Operational meaning of the LIA subtests
          </h2>
          <p className="text-[#0f172a] text-lg font-medium mb-12 font-roboto">
            Summary applied to the student
          </p>

          <div className="flex flex-col gap-5">
            {d.liaSubtests.map((subtest, i) => {
              const iconMap: Record<string, React.ReactNode> = {
                glasses: <Glasses size={40} className="text-[#008996]" strokeWidth={2} />,
                gears: (
                  <div className="relative w-10 h-10">
                    <Settings size={28} className="text-[#008996] absolute top-[-2px] left-[-2px]" strokeWidth={2} />
                    <Settings size={22} className="text-[#008996] absolute bottom-[-2px] right-[-2px]" strokeWidth={2} />
                  </div>
                ),
                math: (
                  <div className="text-[#008996] font-bold text-3xl leading-none flex flex-col items-center justify-center gap-1">
                    <div className="flex gap-2"><span>+</span><span>-</span></div>
                    <div className="flex gap-2"><span>×</span><span>÷</span></div>
                  </div>
                ),
                puzzle: (
                  <div className="grid grid-cols-2 gap-0.5 w-9 h-9">
                    <Puzzle size={18} className="text-[#008996] rotate-90" strokeWidth={2} />
                    <Puzzle size={18} className="text-[#008996] rotate-180" strokeWidth={2} />
                    <Puzzle size={18} className="text-[#008996]" strokeWidth={2} />
                    <Puzzle size={18} className="text-[#008996] -rotate-90" strokeWidth={2} />
                  </div>
                ),
                timer: <Timer size={40} className="text-[#008996]" strokeWidth={2} />,
              };
              return (
                <div key={i} className="flex flex-row items-center bg-[#f3f4f6] rounded-[100px] p-4 pr-8 gap-6 min-h-[125px]">
                  <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center shrink-0 shadow-none ml-1.5">
                    <div className="w-16 h-16 rounded-full flex items-center justify-center">
                      {iconMap[subtest.iconType] || <Glasses size={40} className="text-[#008996]" strokeWidth={2} />}
                    </div>
                  </div>
                  <div className="flex flex-col flex-1">
                    <p className="text-[rgb(0,59,89)] text-[0.95rem] leading-snug font-roboto font-medium px-1">
                      <span className="font-bold">{subtest.title}:</span>{" "}{subtest.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* --- PAGE 3: DIAGNOSIS & MAJORS --- */}
      <div className="w-[210mm] h-[297mm] bg-white relative overflow-hidden shadow-none print:shadow-none print:w-[210mm] print:h-[297mm] print:break-after-page print:overflow-hidden flex flex-col pt-[30px]">

        {/* Header - 3 Bars (Absolute to prevent being hidden by flow issues) */}
        <div className="absolute top-0 left-0 w-full flex flex-row h-[22px] gap-2">
          <div className="flex-1 bg-[#008996]"></div>
          <div className="flex-1 bg-[#008996]"></div>
          <div className="flex-1 bg-[#008996]"></div>
        </div>

        {/* Header Text Row */}
        <div className="flex flex-row justify-between items-end px-10 mb-10 pt-4">
          <h2 className="text-slate-800 text-sm font-bold font-montserrat">{candidateName}</h2>
          <span className="text-slate-800 text-sm font-montserrat">{candidateDate}</span>
        </div>

        <div className="px-10 pb-12">
          <h2 className="text-[#008996] text-3xl font-bold mb-2 font-montserrat tracking-tight">
            2. Integrated diagnosis (MIL+PCA)
          </h2>
          <p className="text-[#0f172a] text-xl font-medium mb-8 font-roboto">Strengths and risks</p>

          {/* DIAGNOSIS CONTENT */}
          <div className="bg-[#f3f4f6] rounded-[3rem] p-8 pb-10 mb-12 flex flex-row gap-6 items-center relative overflow-hidden">

            {/* Custom Donut Chart Visualization - Dynamic with variable stroke widths */}
            {(() => {
              // Chart Data - ORDER: Starting from TOP going CLOCKWISE
              // Reference shows: 14% (dark) at top, then 35% (navy), 25% (teal), 9% (light cyan), 17% (cyan)
              const chartData = d.integratedDiagnosis.chartData;

              // Calculate total to normalize
              const total = chartData.reduce((sum, item) => sum + item.value, 0);

              // Find min/max values for scaling stroke width
              const minValue = Math.min(...chartData.map(d => d.value));
              const maxValue = Math.max(...chartData.map(d => d.value));
              const minStroke = 10;
              const maxStroke = 22;

              const centerX = 50;
              const centerY = 50;
              const baseRadius = 32;
              const startAngle = -90; // Start from top (12 o'clock)

              // Build segments with calculated positions and dynamic stroke widths
              let cumulativePercent = 0;
              const segments = chartData.map((item) => {
                const normalizedValue = (item.value / total) * 100;

                // Dynamic stroke width based on value
                const strokeWidth = minStroke + ((item.value - minValue) / (maxValue - minValue)) * (maxStroke - minStroke);

                const circumference = 2 * Math.PI * baseRadius;
                const segmentLength = (normalizedValue / 100) * circumference;
                const gapSize = 1.5;
                const adjustedSegmentLength = Math.max(0, segmentLength - gapSize);
                const dashOffset = -(cumulativePercent / 100) * circumference - gapSize / 2;

                // Midpoint angle for label/percentage positioning
                const midAngleDeg = startAngle + (cumulativePercent + normalizedValue / 2) * 3.6;
                const midAngleRad = (midAngleDeg * Math.PI) / 180;

                // Calculate outer edge for dashed ring
                const outerRingR = baseRadius + maxStroke / 2 + 6;

                // Label positioned MUCH further outside
                const labelRadius = outerRingR + 12;
                const labelX = centerX + labelRadius * Math.cos(midAngleRad);
                const labelY = centerY + labelRadius * Math.sin(midAngleRad);

                // Percentage position (center of this segment's stroke)
                const percentX = centerX + baseRadius * Math.cos(midAngleRad);
                const percentY = centerY + baseRadius * Math.sin(midAngleRad);

                // Tick line from outer ring to label - longer line
                const lineStartX = centerX + outerRingR * Math.cos(midAngleRad);
                const lineStartY = centerY + outerRingR * Math.sin(midAngleRad);
                const lineEndX = centerX + (labelRadius - 3) * Math.cos(midAngleRad);
                const lineEndY = centerY + (labelRadius - 3) * Math.sin(midAngleRad);

                cumulativePercent += normalizedValue;

                return {
                  ...item,
                  normalizedValue,
                  strokeWidth,
                  adjustedSegmentLength,
                  dashOffset,
                  dashArray: `${adjustedSegmentLength} ${circumference - adjustedSegmentLength}`,
                  circumference,
                  labelX,
                  labelY,
                  percentX,
                  percentY,
                  lineStartX,
                  lineStartY,
                  lineEndX,
                  lineEndY,
                  midAngleRad,
                };
              });

              const outerRingRadius = baseRadius + maxStroke / 2 + 6;
              const innerRadius = baseRadius - maxStroke / 2 - 2;

              return (
                <div className="relative w-[280px] h-[280px] shrink-0">
                  <svg viewBox="0 0 100 100" className="w-full h-full" style={{ overflow: 'visible' }}>
                    {/* Outer dashed ring */}
                    <circle
                      cx={centerX}
                      cy={centerY}
                      r={outerRingRadius}
                      fill="none"
                      stroke="#94a3b8"
                      strokeWidth="0.6"
                      strokeDasharray="2 1.5"
                    />

                    {/* Donut segments - each with dynamic stroke width based on value */}
                    {segments.map((seg, i) => (
                      <circle
                        key={i}
                        cx={centerX}
                        cy={centerY}
                        r={baseRadius}
                        fill="none"
                        stroke={seg.color}
                        strokeWidth={seg.strokeWidth}
                        strokeDasharray={seg.dashArray}
                        strokeDashoffset={seg.dashOffset}
                        transform={`rotate(${startAngle} ${centerX} ${centerY})`}
                      />
                    ))}

                    {/* Inner white circle */}
                    <circle cx={centerX} cy={centerY} r={innerRadius} fill="white" />

                    {/* Tick lines from outer ring to labels - dashed style */}
                    {segments.map((seg, i) => (
                      <line
                        key={`line-${i}`}
                        x1={seg.lineStartX}
                        y1={seg.lineStartY}
                        x2={seg.lineEndX}
                        y2={seg.lineEndY}
                        stroke="#94a3b8"
                        strokeWidth="0.5"
                        strokeDasharray="1.5 1"
                      />
                    ))}

                    {/* Labels (F, A, B, C, D) outside the ring - LARGER */}
                    {segments.map((seg, i) => (
                      <text
                        key={`label-${i}`}
                        x={seg.labelX}
                        y={seg.labelY}
                        textAnchor="middle"
                        dominantBaseline="middle"
                        className="fill-slate-500 font-semibold"
                        style={{ fontSize: '6px', fontFamily: 'sans-serif' }}
                      >
                        {seg.label}
                      </text>
                    ))}

                    {/* Percentages inside segments */}
                    {segments.map((seg, i) => {
                      // Use teal text for light backgrounds
                      const isLightBg = seg.color === "#99e2e8";
                      return (
                        <text
                          key={`percent-${i}`}
                          x={seg.percentX}
                          y={seg.percentY}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          className={`font-bold ${isLightBg ? "fill-[#006d77]" : "fill-white"}`}
                          style={{ fontSize: '4.5px' }}
                        >
                          {seg.value}%
                        </text>
                      );
                    })}
                  </svg>

                  {/* Center Icon - Chess Pawn */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-5xl" style={{ color: "#c9a66b" }}>♟</span>
                  </div>
                </div>
              );
            })()}

            {/* Legend List - Compact with title and desc on same line */}
            <div className="flex flex-col flex-1 gap-0">
              {/* Legend List - Compact with title and desc on same line */}
              <div className="flex flex-col flex-1 gap-0">
                {d.integratedDiagnosis.legend.map((item, i) => (
                  <div
                    key={i}
                    className="flex flex-row items-stretch py-1.5"
                    style={{ borderBottom: `3px solid ${item.borderColor}` }}
                  >
                    <div
                      className="w-10 flex items-center justify-center text-white font-bold text-lg mr-3 shrink-0 rounded-[6px] self-stretch"
                      style={{ backgroundColor: item.bg, color: item.bg === "#99e2e8" ? "#006d77" : "white" }}
                    >
                      {item.label}
                    </div>
                    <p className="text-[13px] leading-snug self-center">
                      <span className="font-bold text-[#0f172a]">{item.title}</span>{" "}
                      <span className="text-slate-500 font-roboto">{item.description}</span>
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <h2 className="text-[#008996] text-2xl font-bold mb-1 font-montserrat tracking-tight">
            3. Prioritized top majors
          </h2>
          <p className="text-slate-500 text-base mb-6 font-roboto">
            LIA fit (detection + orientation) and PCA (influence, service, quality)
          </p>

          <div className="space-y-5">
            {/* Perfect Fit */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-[#0f172a] font-bold text-sm whitespace-nowrap font-montserrat">Perfect fit</h3>
                <div className="h-[1px] bg-[#008996] flex-1"></div>
              </div>
              <ul className="space-y-1 pl-8">
                {d.integratedDiagnosis.majors.perfectFit.map((item) => (
                  <li key={item.id} className="text-[#0f172a] text-sm font-roboto">
                    <span className="font-bold">{item.id}. {item.title}</span>
                    {item.extra && <span className="italic text-slate-500"> {item.extra}</span>}
                    {item.description && <span className="text-slate-600">: {item.description}</span>}
                  </li>
                ))}
              </ul>
            </div>

            {/* Highly Recommended */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-[#0f172a] font-bold text-sm whitespace-nowrap font-montserrat">Highly recommended</h3>
                <div className="h-[1px] bg-[#008996] flex-1"></div>
              </div>
              <ul className="space-y-1 pl-8">
                {d.integratedDiagnosis.majors.highlyRecommended.map((item) => (
                  <li key={item.id} className="text-[#0f172a] text-sm font-roboto">
                    <span className="font-bold">{item.id}. {item.title}</span>
                    {item.extra && <span className="text-slate-500"> {item.extra}</span>}
                  </li>
                ))}
              </ul>
            </div>

            {/* Complementary */}
            <div>
              <div className="flex items-center gap-3 mb-2">
                <h3 className="text-[#0f172a] font-bold text-sm whitespace-nowrap font-montserrat">Complementary</h3>
                <div className="h-[1px] bg-[#008996] flex-1"></div>
              </div>
              <ul className="space-y-1 pl-8">
                {d.integratedDiagnosis.majors.complementary.map((item, i) => (
                  <li key={i} className="text-[#0f172a] text-sm font-bold font-roboto">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* ========== PAGE 4 ========== */}
      <div
        className="bg-white w-[210mm] min-h-[297mm] mx-auto shadow-lg flex flex-col relative print:w-[210mm] print:h-[297mm] print:overflow-hidden"
        style={{ breakAfter: "page" }}
      >
        {/* Alignment Overlay - Hidden in Print */}
        <div className="absolute hidden  inset-0 z-50 opacity-40 pointer-events-none print:hidden">
          <img src="/report/2.png" alt="Reference Overlay" className="w-full h-full" />
        </div>

        {/* Top teal bar - Updated to match Page 2/3 style (3 segments, absolute) */}
        <div className="absolute top-0 left-0 w-full flex flex-row h-[21px] gap-6 px-10">
          <div className="flex-1 bg-[#008996] "></div>
          <div className="flex-1 bg-[#008996]"></div>
          <div className="flex-1 bg-[#008996] mr-1"></div>
        </div>

        {/* Content */}
        <div className="px-10 pb-6 pt-12 flex-1">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 ">
            <span className=" text-sm font-roboto">{candidateName}</span>
            <span className=" text-sm font-roboto  tracking-wide">{candidateDate}</span>
          </div>

          {/* Section 4: Majors NOT recommended */}
          <h2 className="text-[#008996] text-[22px] font-bold mb-6 font-montserrat  mt-[44px]">
            4. Majors NOT recommended for {firstName}
          </h2>

          <div className="space-y-6 mb-12">
            {d.notRecommended.map((item, i) => (
              <p key={i} className="text-[#0f172a] text-[13px] font-roboto leading-snug">
                <span className="font-bold block mb-1 tracking-wide text-">{item.category}</span>
                <span className="text-slate-500 italic font-medium">{item.reason}</span>
              </p>
            ))}
          </div>

          {/* Section 5: Exploration and decision plan */}
          <h2 className="text-[#008996] text-xl font-bold mb-1 font-montserrat tracking-wide pt-9">
            5. Exploration and decision plan (0–12 months)
          </h2>
          <p className="text-[#0f172a] text-[18px] mb-6 font-roboto font-medium tracking-wider">Step-by-step for a student</p>

          <div className="relative mb-10">
            {/* Mountain icon - positioned at top right of the timeline */}
            <div className="absolute -right-3 -top-4 w-16 h-16 z-10">
              <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-lg">
                <circle cx="32" cy="32" r="30" fill="#0f172a" stroke="white" strokeWidth="2" />
                <g transform="translate(10, 10) scale(0.7)">
                  {/* Back mountain */}
                  <polygon points="20,48 36,20 52,48" fill="#94a3b8" />
                  {/* Front mountain */}
                  <polygon points="8,48 28,16 48,48" fill="#cbd5e1" />
                  {/* Snow cap */}
                  <polygon points="28,16 32,24 24,24" fill="white" />
                  {/* Flag pole */}
                  <line x1="28" y1="16" x2="28" y2="6" stroke="#cbd5e1" strokeWidth="1.5" />
                  {/* Flag */}
                  <polygon points="28,6 38,10 28,14" fill="#ef4444" />
                </g>
              </svg>
            </div>

            {/* Timeline headers - rectangular style */}
            <div className="flex w-full h-[38px] font-montserrat text-[13px] font-bold mb-6">
              {d.explorationPlan.map((phase, i, arr) => {
                const bg = ["bg-[#0f3443]", "bg-[#008996]", "bg-[#22d3ee]", "bg-[#b2f0f5]"][i] || "bg-gray-200";
                const text = i === 3 ? "text-[#006d77]" : "text-white";
                const round = i === 0 ? "rounded-l-md" : i === arr.length - 1 ? "rounded-r-md" : "";
                return (
                  <div key={i} className={`flex-1 ${bg} ${text} flex items-center justify-center ${round} font-bold`}>
                    {phase.phase}
                  </div>
                );
              })}
            </div>

            {/* Timeline content */}
            <div className="flex bg-white pt-2 w-[90%]">
              {d.explorationPlan.map((phase, i, arr) => (
                <div key={i} className={`flex-1 p-2 ${i === arr.length - 1 ? 'pr-0' : 'pr-3 border-r border-slate-100'}`}>
                  <h4 className="font-bold text-[18px] text-[#008996] mb-1 leading-tight">{phase.title}</h4>
                  <p className="text-[14px] text-slate-600 font-medium leading-snug mb-4">
                    {phase.activities}
                  </p>
                  <p className="text-[14px] text-slate-700">
                    <span className="font-bold">{phase.kpiLabel}</span> {phase.kpi}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Section 6: Immediate operational plan */}
          <h2 className="text-[#008996] text-2xl font-bold mb-1 pt-10 font-montserrat tracking-tight">
            6. Immediate operational plan: 8 weeks
          </h2>
          <p className="text-[#0f172a] text-[18px] mb-6 font-roboto font-medium tracking-wide">Action checklist</p>

          <div className="relative">
            {/* Clipboard icon */}
            <div className="absolute -right-3 -top-4 w-16 h-16 z-10">
              <svg viewBox="0 0 64 64" className="w-full h-full drop-shadow-lg">
                <circle cx="32" cy="32" r="30" fill="#cffafe" stroke="white" strokeWidth="2" />
                <g transform="translate(10, 10) scale(0.7)">
                  {/* Clipboard body */}
                  <rect x="14" y="12" width="36" height="44" rx="3" fill="#fef3c7" stroke="#d97706" strokeWidth="1" />
                  {/* Clip */}
                  <rect x="24" y="6" width="16" height="10" rx="2" fill="#22d3ee" />
                  <rect x="28" y="4" width="8" height="4" rx="1" fill="#0891b2" />
                  {/* Lines */}
                  <line x1="22" y1="26" x2="42" y2="26" stroke="#d97706" strokeWidth="1.5" />
                  <line x1="22" y1="34" x2="42" y2="34" stroke="#d97706" strokeWidth="1.5" />
                  <line x1="22" y1="42" x2="38" y2="42" stroke="#d97706" strokeWidth="1.5" />
                </g>
              </svg>
            </div>

            {/* Timeline headers with checkmarks - arrow style */}
            <div className="flex w-full h-[38px] font-montserrat text-[13px] font-bold relative mb-6">
              {d.operationalPlan.map((phase, i, arr) => {
                const styles = [
                  { bg: "bg-[#0f172a]", text: "text-white", z: "z-40", ml: "", clip: 'polygon(0 0, calc(100% - 15px) 0, 100% 50%, calc(100% - 15px) 100%, 0 100%)', pl: '' },
                  { bg: "bg-[#008996]", text: "text-white", z: "z-30", ml: "-ml-[15px]", clip: 'polygon(0 0, calc(100% - 15px) 0, 100% 50%, calc(100% - 15px) 100%, 0 100%)', pl: '15px' },
                  { bg: "bg-[#22d3ee]", text: "text-white", z: "z-20", ml: "-ml-[15px]", clip: 'polygon(0 0, calc(100% - 15px) 0, 100% 50%, calc(100% - 15px) 100%, 0 100%)', pl: '15px' },
                  { bg: "bg-[#b2f0f5]", text: "text-[#006d77]", z: "z-10", ml: "-ml-[15px]", clip: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)', pl: '15px' }
                ];
                const s = styles[i] || styles[styles.length - 1];
                // For last item, use close polygon
                const clip = i === arr.length - 1 ? 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' : s.clip;

                return (
                  <div
                    key={i}
                    className={`flex-1 ${s.bg} ${s.text} flex items-center justify-center gap-2 ${i === 0 ? "rounded-l-md" : ""} ${i === arr.length - 1 ? "rounded-r-md" : ""} ${s.ml} ${s.z} relative font-bold`}
                    style={{ clipPath: clip, paddingLeft: s.pl }}
                  >
                    {phase.phase}
                    <svg className="w-4 h-4" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="#22c55e" /><path d="M5,8 L7,10 L11,6" stroke="white" strokeWidth="1.5" fill="none" /></svg>
                  </div>
                );
              })}
            </div>

            {/* Timeline content */}
            <div className="flex bg-white pt-2 w-[90%]">
              {d.operationalPlan.map((phase, i, arr) => (
                <div key={i} className={`flex-1 p-2 ${i === arr.length - 1 ? 'pr-0' : 'pr-3 border-r border-slate-100'}`}>
                  <p className="text-[14px] text-slate-600 leading-snug font-medium mb-4">
                    {phase.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom teal bar */}
        <div className="w-full h-3 bg-[#008996] mt-auto"></div>
      </div>

    </div>
  );
}
