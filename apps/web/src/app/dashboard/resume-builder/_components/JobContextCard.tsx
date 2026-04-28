"use client";

import type { ExtractedJobData } from "@/types/resume";
import { Briefcase, MapPin } from "lucide-react";

interface JobContextCardProps {
  extractedJob: ExtractedJobData;
}

export function JobContextCard({ extractedJob }: JobContextCardProps) {
  const allSkills = [
    ...extractedJob.requiredSkills,
    ...extractedJob.preferredSkills,
  ];

  return (
    <div className="dash-card p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-foreground/5">
          <Briefcase className="h-4 w-4 text-foreground" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">
            Tailored for
          </p>
          <p className="text-sm font-semibold text-foreground mt-0.5">
            {extractedJob.jobTitle}
            {extractedJob.company ? ` at ${extractedJob.company}` : ""}
          </p>

          {(extractedJob.location || extractedJob.employmentType) && (
            <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
              {extractedJob.location && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {extractedJob.location}
                </span>
              )}
              {extractedJob.location && extractedJob.employmentType && (
                <span>&middot;</span>
              )}
              {extractedJob.employmentType && (
                <span>{extractedJob.employmentType}</span>
              )}
            </div>
          )}

          {allSkills.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-2.5">
              {allSkills.slice(0, 8).map((skill) => (
                <span
                  key={skill}
                  className="inline-flex items-center rounded-md bg-foreground/5 px-2 py-0.5 text-xs text-foreground"
                >
                  {skill}
                </span>
              ))}
              {allSkills.length > 8 && (
                <span className="text-xs text-muted-foreground self-center">
                  +{allSkills.length - 8} more
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
