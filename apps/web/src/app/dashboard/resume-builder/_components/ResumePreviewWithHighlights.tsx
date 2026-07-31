"use client";

import { useMemo } from "react";
import type { Resume } from "@/services/resumeService";
import type { TailoredResume } from "@/types/resume";

interface ChangeDecision {
  section: string;
  index?: number;
  accepted: boolean;
}

interface ResumePreviewWithHighlightsProps {
  originalResume: Resume;
  tailoredResume: TailoredResume;
  decisions: ChangeDecision[];
  onToggleDecision: (section: string, index?: number) => void;
}

const HL_ON = "bg-[#d4edda] cursor-pointer hover:bg-[#c3e6cb] rounded-[1px]";
const HL_OFF = "bg-[#f8d7da] line-through opacity-50 cursor-pointer hover:bg-[#f5c6cb] rounded-[1px]";

function Hl({ original, tailored, accepted, onToggle, className = "" }: {
  original: string; tailored: string; accepted: boolean; onToggle: () => void; className?: string;
}) {
  const changed = original.trim() !== tailored.trim();
  const text = accepted ? tailored : original;
  if (!changed) return <span className={className}>{text}</span>;
  return (
    <span className={`${accepted ? HL_ON : HL_OFF} ${className}`} onClick={onToggle}
      title={accepted ? "Click to reject" : "Click to accept"}>{text}</span>
  );
}

export function ResumePreviewWithHighlights({
  originalResume, tailoredResume, decisions, onToggleDecision,
}: ResumePreviewWithHighlightsProps) {
  const isAccepted = (section: string, index?: number) => {
    const d = decisions.find(d => d.section === section && d.index === index);
    return d ? d.accepted : true;
  };

  const getTailoredExp = (origCompany: string, origIndex: number) => {
    return tailoredResume.tailoredExperience?.find(
      t => t.company.toLowerCase().includes(origCompany.toLowerCase().split(" ")[0])
    ) || tailoredResume.tailoredExperience?.[origIndex] || null;
  };

  const originalSkills = useMemo(
    () => Object.values(originalResume.skills?.skills || {}).flat(),
    [originalResume]
  );

  const p = originalResume.personal;
  const summaryAccepted = isAccepted("summary");
  const skillsAccepted = isAccepted("skills");

  // Categorize tailored skills for display
  const categorizedSkills = useMemo(() => {
    const skills = skillsAccepted ? (tailoredResume.tailoredSkills || []) : originalSkills;
    // Check if any skill contains ":" indicating pre-categorized format
    const hasCats = skills.some(s => s.includes(":"));
    if (hasCats) {
      const cats: Record<string, string[]> = {};
      skills.forEach(s => {
        if (s.includes(":")) {
          const [cat, ...rest] = s.split(":");
          cats[cat.trim()] = rest.join(":").split(",").map(x => x.trim()).filter(Boolean);
        } else {
          if (!cats["Other"]) cats["Other"] = [];
          cats["Other"].push(s);
        }
      });
      return cats;
    }
    // Return as flat
    return { "": skills };
  }, [tailoredResume.tailoredSkills, originalSkills, skillsAccepted]);

  return (
    <div className="bg-white rounded-lg border border-border overflow-auto shadow-sm"
      style={{ fontFamily: "'Times New Roman', Times, Georgia, serif", color: "#000" }}>
      <div style={{ width: 612, minHeight: 792, padding: "30px 40px", margin: "0 auto", fontSize: 9.5, lineHeight: 1.2 }}>

        {/* NAME */}
        <div style={{ textAlign: "center", borderBottom: "1.5px solid #000", paddingBottom: 2, marginBottom: 1 }}>
          <div style={{ fontSize: 18, fontWeight: "bold", letterSpacing: "0.03em" }}>
            {p?.fullName || "YOUR NAME"}
          </div>
        </div>
        <div style={{ textAlign: "center", fontSize: 8.5, marginTop: 1, marginBottom: 5 }}>
          {[p?.phone, p?.email, p?.linkedIn ? "LinkedIn" : null, p?.website ? "GitHub" : null].filter(Boolean).join(" | ")}
        </div>

        {/* SUMMARY */}
        {(originalResume.summary || tailoredResume.tailoredSummary) && (
          <Section title="SUMMARY">
            <div style={{ fontSize: 9, lineHeight: 1.3 }}>
              <Hl original={originalResume.summary || ""} tailored={tailoredResume.tailoredSummary || originalResume.summary || ""}
                accepted={summaryAccepted} onToggle={() => onToggleDecision("summary")} />
            </div>
          </Section>
        )}

        {/* EDUCATION */}
        {originalResume.education?.length > 0 && (
          <Section title="EDUCATION">
            {originalResume.education.map((edu, i) => (
              <div key={i} style={{ marginBottom: 2 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>
                    <b>{edu.institution}</b>
                    {edu.degree ? <> | <i>{edu.degree}</i></> : null}
                  </span>
                  <span style={{ flexShrink: 0, marginLeft: 8 }}>
                    {edu.location} {edu.startDate}{edu.endDate ? ` - ${edu.endDate}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </Section>
        )}

        {/* RELEVANT EXPERIENCE */}
        {originalResume.experience?.length > 0 && (
          <Section title="RELEVANT EXPERIENCE">
            {originalResume.experience.map((exp, i) => {
              const tailored = getTailoredExp(exp.company, i);
              const expAccepted = isAccepted("experience", i);
              const origBullets = exp.descriptions || [];
              const tailoredBullets = tailored?.descriptions || origBullets;
              const maxLen = Math.max(origBullets.length, tailoredBullets.length);

              return (
                <div key={i} style={{ marginBottom: 4 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <b>{exp.company}</b>
                    <span style={{ flexShrink: 0, marginLeft: 8 }}>
                      {exp.startDate}{exp.endDate ? ` - ${exp.endDate}` : ""}
                    </span>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <i>{tailored?.title || exp.title}</i>
                    <i style={{ flexShrink: 0, marginLeft: 8 }}>{exp.location}</i>
                  </div>
                  <ul style={{ margin: "1px 0 0 0", paddingLeft: 12, listStyleType: "disc" }}>
                    {Array.from({ length: maxLen }).map((_, bIdx) => (
                      <li key={bIdx} style={{ fontSize: 9, lineHeight: 1.25, paddingLeft: 1 }}>
                        <Hl original={origBullets[bIdx] || ""} tailored={tailoredBullets[bIdx] || origBullets[bIdx] || ""}
                          accepted={expAccepted} onToggle={() => onToggleDecision("experience", i)} />
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </Section>
        )}

        {/* TECHNICAL SKILLS */}
        {(originalSkills.length > 0 || tailoredResume.tailoredSkills?.length > 0) && (
          <Section title="TECHNICAL SKILLS">
            <ul style={{ margin: 0, paddingLeft: 12, listStyleType: "disc" }}
              onClick={() => onToggleDecision("skills")}>
              {Object.entries(categorizedSkills).map(([cat, skills]) => (
                <li key={cat || "flat"} style={{ fontSize: 9, lineHeight: 1.3, cursor: "pointer" }}>
                  {cat ? <><b>{cat}:</b> </> : null}
                  {skills.map((s, i) => {
                    const isNew = !originalSkills.map(o => o.toLowerCase()).includes(s.toLowerCase());
                    return (
                      <span key={i}>
                        <span className={isNew ? HL_ON : ""}>{s}</span>
                        {i < skills.length - 1 ? ", " : ""}
                      </span>
                    );
                  })}
                </li>
              ))}
            </ul>
          </Section>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{
        fontSize: 10.5, fontWeight: "bold", textTransform: "uppercase" as const,
        borderBottom: "1px solid #000", paddingBottom: 1, marginBottom: 2, letterSpacing: "0.01em",
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}
