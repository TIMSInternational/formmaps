import { NextResponse } from "next/server";
import { getImportJob } from "@/lib/importJobs";
import { adminCreateCourse } from "@/services/courseService";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ jobId: string }> }
) {
  const USE_LOCAL_API = process.env.NEXT_PUBLIC_USE_LOCAL_API === "true";
  if (!USE_LOCAL_API) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Local import API disabled" },
      },
      { status: 404 }
    );
  }
  try {
    const { jobId } = await params;
    const job = getImportJob(jobId);
    if (!job) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Import job not found" },
        },
        { status: 404 }
      );
    }

    if (job.status !== "done") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_REQUEST", message: "Import job not ready" },
        },
        { status: 400 }
      );
    }

    const body = await req.json();
    const overrides = body?.overrides ?? {};

    const preview = job.result?.coursePreview;
    if (!preview) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "No preview data available",
          },
        },
        { status: 400 }
      );
    }

    const coursePayload = {
      title: overrides.title ?? preview.title,
      shortDescription:
        overrides.shortDescription ?? preview.shortDescription ?? "",
      fullDescription:
        overrides.fullDescription ?? preview.fullDescription ?? "",
      category: overrides.category ?? preview.category ?? "Imported",
      provider: preview.provider ?? "Unknown",
      thumbnailUrl: preview.thumbnailUrl ?? "",
      videoUrl: preview.videoUrl ?? undefined,
      duration: preview.duration ?? undefined,
      estimatedHours: preview.estimatedHours ?? undefined,
      language: preview.language ?? undefined,
      externalId: preview.externalId,
      courseraUrl: preview.sourceUrl,
      skills: (preview.rawMetadata?.skills ?? []) as any,
      matchingCompetencies: (preview.rawMetadata?.matchingCompetencies ??
        []) as any,
      isActive: true,
      recommendedScore: 0,
      difficulty: "Beginner",
      syllabus: [],
      id: undefined,
    };

    const created = await adminCreateCourse(coursePayload as any);

    return NextResponse.json(
      { success: true, data: { id: created?.id } },
      { status: 201 }
    );
  } catch (err) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "INTERNAL_ERROR", message: (err as Error).message },
      },
      { status: 500 }
    );
  }
}
