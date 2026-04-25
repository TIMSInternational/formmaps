export type ImportStatus = "pending" | "in_progress" | "failed" | "done";

export type CoursePreview = {
  title: string;
  shortDescription?: string;
  fullDescription?: string;
  provider?: string;
  instructor?: string | string[];
  thumbnailUrl?: string;
  videoUrl?: string;
  duration?: number;
  durationUnit?: string;
  estimatedHours?: number;
  language?: string;
  category?: string;
  externalId?: string;
  sourceUrl?: string;
  notes?: string;
  rawMetadata?: any;
};

export type ImportJob = {
  jobId: string;
  url: string;
  source?: string;
  status: ImportStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: { coursePreview: CoursePreview };
  error?: { code: string; message: string } | null;
};

const JOBS = new Map<string, ImportJob>();

export function createImportJob(url: string, source?: string) {
  const jobId = `import_job_${Date.now()}`;
  const job: ImportJob = {
    jobId,
    url,
    source,
    status: "pending",
    createdAt: new Date().toISOString(),
    error: null,
  };
  JOBS.set(jobId, job);
  return job;
}

export function getImportJob(jobId: string) {
  return JOBS.get(jobId) ?? null;
}

export function setImportJob(job: ImportJob) {
  JOBS.set(job.jobId, job);
}

// Small helper that simulates fetching the provider and creating a preview
export async function simulateImportWorker(jobId: string) {
  const job = JOBS.get(jobId);
  if (!job) return;
  try {
    job.status = "in_progress";
    job.startedAt = new Date().toISOString();
    setImportJob(job);

    // Simulate async external fetch with a short delay
    await new Promise((r) => setTimeout(r, 1200));

    // Fake parse to create a plausible preview
    const url = new URL(job.url);
    const pathParts = url.pathname.split("/").filter(Boolean);
    const titleFromPath = pathParts[pathParts.length - 1] || url.hostname;

    const preview = {
      title: decodeURIComponent(titleFromPath).replace(/[-_]+/g, " "),
      shortDescription: `A short summary imported from ${url.hostname}`,
      fullDescription: `<p>Imported from ${url.href}. Please review and edit before saving.</p>`,
      provider: url.hostname,
      instructor: "Unknown",
      thumbnailUrl: `https://${url.hostname}/thumbnail.jpg`,
      videoUrl: undefined,
      duration: 4,
      durationUnit: "weeks",
      estimatedHours: 3,
      language: "English",
      category: "Imported",
      externalId: `external_${titleFromPath}_${Date.now()}`,
      sourceUrl: job.url,
      notes: "Mock import - replace with real fetch in production",
    };

    job.status = "done";
    job.completedAt = new Date().toISOString();
    job.result = { coursePreview: preview };
    setImportJob(job);
  } catch (err) {
    job.status = "failed";
    job.error = {
      code: "EXTERNAL_API_ERROR",
      message: (err as Error).message ?? "Unknown",
    };
    setImportJob(job);
  }
}
