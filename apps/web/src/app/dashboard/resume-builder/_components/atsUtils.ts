export function extractKeywords(text: string): string[] {
  if (!text) return [];
  // basic keyword extraction: split by non-word, lowercase, filter short words
  return Array.from(
    new Set(
      text
        .toLowerCase()
        .split(/[^a-z0-9]+/)
        .filter((w) => w && w.length > 2)
    )
  );
}

export function getResumeText(data: any): string {
  // Flatten resume fields to plain text for keyword matching
  let txt = "";
  if (!data) return txt;
  const { personalInfo, experience = [], education = [], skills = [] } = data;
  txt +=
    (personalInfo?.summary || "") +
    " " +
    (personalInfo?.fullName || "") +
    " " +
    (personalInfo?.professionalTitle || "") +
    " ";
  experience.forEach((e: any) => {
    txt += `${e.jobTitle} ${e.company} ${e.location} ${
      e.description?.join(" ") || ""
    } `;
  });
  education.forEach((ed: any) => {
    txt += `${ed.degree} ${ed.institution} ${ed.location} `;
  });
  skills.forEach((s: any) => {
    txt += `${s.name} `;
  });

  return txt.trim();
}

export function getATSScore(resumeData: any, jobDescription: string) {
  const jobKeywords = extractKeywords(jobDescription);
  if (jobKeywords.length === 0) return { score: 0, matched: [], missing: [] };

  const resumeText = getResumeText(resumeData);
  const resumeKeywords = extractKeywords(resumeText);

  const matched = jobKeywords.filter((k) => resumeKeywords.includes(k));
  const missing = jobKeywords.filter((k) => !resumeKeywords.includes(k));

  const score = Math.round((matched.length / jobKeywords.length) * 100);

  return { score, matched, missing };
}
