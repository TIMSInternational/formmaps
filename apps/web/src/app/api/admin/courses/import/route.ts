import { NextResponse } from "next/server";
import { createImportJob, simulateImportWorker } from "@/lib/importJobs";

function isValidProvider(url: string) {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const allowlist = [
      "coursera.org",
      "www.coursera.org",
      "edx.org",
      "www.edx.org",
    ];
    return allowlist.some((d) => host.endsWith(d));
  } catch (err) {
    return false;
  }
}

export async function POST(req: Request) {
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
    const { url, source } = await req.json();
    if (!url || typeof url !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_REQUEST", message: "Missing url" },
        },
        { status: 400 }
      );
    }

    if (!isValidProvider(url)) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "UNSUPPORTED_DOMAIN",
            message: "Provider domain not supported for import",
          },
        },
        { status: 403 }
      );
    }

    const job = createImportJob(url, source);

    // Kick off the worker in the background
    void simulateImportWorker(job.jobId);

    return NextResponse.json(
      {
        success: true,
        jobId: job.jobId,
        statusUrl: `/api/admin/courses/import/${job.jobId}/status`,
      },
      { status: 202 }
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
