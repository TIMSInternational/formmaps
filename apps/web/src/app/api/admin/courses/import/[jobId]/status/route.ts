import { NextResponse } from "next/server";
import { getImportJob } from "@/lib/importJobs";

export async function GET(
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

    return NextResponse.json({ success: true, data: job }, { status: 200 });
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
