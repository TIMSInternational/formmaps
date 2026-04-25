/**
 * LLM Client for AI Content Generation
 *
 * Handles all interactions with OpenAI GPT-4o or Claude API
 * Supports content generation, caching, and retry logic
 */

export interface GenerationConfig {
  model?: "gpt-4o" | "gpt-4o-mini" | "claude-3-5-sonnet";
  temperature?: number;
  maxTokens?: number;
  retries?: number;
}

export interface GenerationResponse {
  success: boolean;
  content: string;
  tokensUsed: number;
  generatedAt: string;
  model: string;
}

export interface BatchGenerationResponse {
  success: boolean;
  contents: string[];
  tokensUsed: number;
  generatedAt: string;
  model: string;
}

const DEFAULT_CONFIG: GenerationConfig = {
  model: "gpt-4o-mini", // More cost-effective than gpt-4o
  temperature: 0.7,
  maxTokens: 1000,
  retries: 2,
};

/**
 * Call OpenAI API to generate content
 */
export async function callOpenAI(
  messages: Array<{ role: string; content: string }>,
  config: GenerationConfig = DEFAULT_CONFIG
): Promise<GenerationResponse> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const body = {
    model: config.model || DEFAULT_CONFIG.model,
    messages,
    temperature: config.temperature ?? DEFAULT_CONFIG.temperature,
    max_tokens: config.maxTokens ?? DEFAULT_CONFIG.maxTokens,
  };

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error.message}`);
    }

    const data = await response.json();
    const content = data.choices[0].message.content;
    const tokensUsed = data.usage.total_tokens;

    return {
      success: true,
      content,
      tokensUsed,
      generatedAt: new Date().toISOString(),
      model: config.model || DEFAULT_CONFIG.model!,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Generate professional summary
 */
export async function generateProfessionalSummary(
  careerLevel: string,
  industry: string,
  yearsOfExperience: number,
  keySkills: string[],
  targetRole?: string,
  achievements?: string[]
): Promise<string> {
  const prompt = `Generate a professional summary for a resume.

Career Level: ${careerLevel}
Industry: ${industry}
Years of Experience: ${yearsOfExperience}
Key Skills: ${keySkills.join(", ")}
${targetRole ? `Target Role: ${targetRole}` : ""}
${
  achievements && achievements.length > 0
    ? `Achievements: ${achievements.join(", ")}`
    : ""
}

Requirements:
- 50-100 words
- Include 3-5 relevant keywords
- Use strong action verbs
- Include quantifiable achievements where possible
- Optimize for ATS systems
- Professional tone
- No personal pronouns (use action verbs instead)

Generate only the summary text, nothing else.`;

  const response = await callOpenAI([
    {
      role: "user",
      content: prompt,
    },
  ]);

  return response.content.trim();
}

/**
 * Generate job bullet points
 */
export async function generateJobBullets(
  jobTitle: string,
  company: string,
  industry: string,
  responsibilities: string[],
  keySkills: string[],
  achievements: string[],
  bulletCount: number = 5
): Promise<string[]> {
  const prompt = `Generate ${bulletCount} achievement-focused bullet points for a resume job entry.

Job Title: ${jobTitle}
Company: ${company}
Industry: ${industry}
Responsibilities: ${responsibilities.join(", ")}
Key Skills: ${keySkills.join(", ")}
Achievements: ${achievements.join(", ")}

Requirements:
- ${bulletCount} bullet points (one per line, start with • symbol)
- 15-20 words per bullet point
- Start each with strong action verb (Led, Designed, Implemented, Achieved, Managed, etc.)
- Include quantifiable metrics (%, $, time, scale)
- Demonstrate impact, not just tasks
- Optimize for ATS systems
- Use specific technical terminology
- Avoid personal pronouns

Generate only the bullet points, one per line starting with •`;

  const response = await callOpenAI([
    {
      role: "user",
      content: prompt,
    },
  ]);

  return response.content
    .split("\n")
    .filter((line) => line.trim().startsWith("•"))
    .map((line) => line.trim().substring(1).trim())
    .filter((line) => line.length > 0);
}

/**
 * Generate career objective
 */
export async function generateCareerObjective(
  careerLevel: string,
  yearsOfExperience: number,
  targetRole: string,
  targetIndustry: string,
  keyStrengths: string[]
): Promise<string> {
  const prompt = `Generate a career objective statement for a resume.

Career Level: ${careerLevel}
Years of Experience: ${yearsOfExperience}
Target Role: ${targetRole}
Target Industry: ${targetIndustry}
Key Strengths: ${keyStrengths.join(", ")}

Requirements:
- 30-50 words
- Role-specific keywords
- Specific role/position (not generic)
- Include value proposition
- Avoid generic phrases like "seeking a challenging opportunity"
- Professional tone
- Optimize for ATS systems

Generate only the objective statement, nothing else.`;

  const response = await callOpenAI([
    {
      role: "user",
      content: prompt,
    },
  ]);

  return response.content.trim();
}

/**
 * Generate project description
 */
export async function generateProjectDescription(
  projectTitle: string,
  yourRole: string,
  technologies: string[],
  objectives: string[],
  outcomes: string[]
): Promise<string> {
  const prompt = `Generate a project description for a resume.

Project Title: ${projectTitle}
Your Role: ${yourRole}
Technologies: ${technologies.join(", ")}
Objectives: ${objectives.join(", ")}
Outcomes: ${outcomes.join(", ")}

Requirements:
- 80-120 words
- Outcome-focused
- Include specific technology names
- Highlight metrics and results
- Show impact of project
- Use action verbs
- Professional tone
- Optimize for ATS systems

Generate only the description text, nothing else.`;

  const response = await callOpenAI([
    {
      role: "user",
      content: prompt,
    },
  ]);

  return response.content.trim();
}

/**
 * Calculate ATS score for content
 */
export async function calculateATSScore(
  jobDescription: string,
  resumeContent: string,
  targetKeywords?: string[]
): Promise<{
  score: number;
  breakdown: {
    keywordMatch: number;
    formatting: number;
    structure: number;
    contentQuality: number;
  };
  matchedKeywords: string[];
  missingKeywords: string[];
}> {
  const prompt = `Analyze a resume against a job description for ATS compatibility.

Job Description:
${jobDescription}

Resume Content:
${resumeContent}

${
  targetKeywords
    ? `Target Keywords to Look For: ${targetKeywords.join(", ")}`
    : ""
}

Provide analysis in this exact JSON format:
{
  "keywordMatch": <0-1 decimal>,
  "formatting": <0-1 decimal>,
  "structure": <0-1 decimal>,
  "contentQuality": <0-1 decimal>,
  "matchedKeywords": [<array of found keywords>],
  "missingKeywords": [<array of important missing keywords>],
  "suggestions": [<array of improvement suggestions>]
}

Focus on:
- Keyword Match: How many job description keywords are in resume (0-1 scale)
- Formatting: ATS-friendly formatting like no special characters, proper sections (0-1 scale)
- Structure: Proper organization and hierarchy (0-1 scale)
- Content Quality: Achievement-focus, metrics, specific claims (0-1 scale)

Return ONLY valid JSON, no markdown or explanations.`;

  const response = await callOpenAI([
    {
      role: "user",
      content: prompt,
    },
  ]);

  try {
    const analysis = JSON.parse(response.content);

    // Calculate overall score with weighted formula
    const overallScore =
      0.35 * analysis.keywordMatch +
      0.25 * analysis.formatting +
      0.2 * analysis.structure +
      0.2 * analysis.contentQuality;

    return {
      score: Math.min(1, Math.max(0, overallScore)),
      breakdown: {
        keywordMatch: analysis.keywordMatch,
        formatting: analysis.formatting,
        structure: analysis.structure,
        contentQuality: analysis.contentQuality,
      },
      matchedKeywords: analysis.matchedKeywords || [],
      missingKeywords: analysis.missingKeywords || [],
    };
  } catch (error) {
    throw new Error("Failed to calculate ATS score");
  }
}

/**
 * Generate multiple content variations
 */
export async function generateAlternatives(
  contentType: "summary" | "objective" | "bullets" | "project",
  context: Record<string, any>,
  variationCount: number = 3,
  tones: string[] = []
): Promise<string[]> {
  const tonesDescription =
    tones.length > 0
      ? `Use these tones for variations: ${tones.join(", ")}`
      : "Use varied tones (professional, achievement-focused, impact-driven)";

  let prompt = "";

  if (contentType === "summary") {
    prompt = `Generate ${variationCount} different professional summary variations.

Career Level: ${context.careerLevel}
Industry: ${context.industry}
Years of Experience: ${context.yearsOfExperience}
Key Skills: ${context.keySkills?.join(", ")}

${tonesDescription}

Requirements:
- Each variation should be 50-100 words
- Include 3-5 relevant keywords
- Different emphasis in each (one skills-focused, one achievement-focused, one impact-focused)
- Optimize for ATS

Format: Return numbered list with each variation separated by "---"`;
  } else if (contentType === "bullets") {
    prompt = `Generate ${variationCount} different sets of 3 job bullet points with different tones/emphasis.

Job Title: ${context.jobTitle}
Company: ${context.company}
${tonesDescription}

Requirements:
- 3 bullets per variation
- 15-20 words per bullet
- Start with action verb
- Include metrics
- Different emphasis in each variation

Format: Each set separated by "---"`;
  }

  const response = await callOpenAI([
    {
      role: "user",
      content: prompt,
    },
  ]);

  return response.content
    .split("---")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Extract keywords from job description
 */
export async function extractKeywords(
  jobDescription: string,
  limit: number = 20
): Promise<string[]> {
  const prompt = `Extract the top ${limit} most important keywords from this job description for resume optimization.

Job Description:
${jobDescription}

Requirements:
- Extract ONLY important keywords (skills, tools, technologies, certifications)
- Exclude common words like "and", "the", "or"
- Return as comma-separated list
- Most important first
- Only return the keywords, nothing else`;

  const response = await callOpenAI([
    {
      role: "user",
      content: prompt,
    },
  ]);

  return response.content
    .split(",")
    .map((keyword) => keyword.trim())
    .filter((keyword) => keyword.length > 0)
    .slice(0, limit);
}
