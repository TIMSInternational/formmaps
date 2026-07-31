import { NextResponse } from "next/server";
import { toggleActiveCourse } from "@/lib/adminCoursesStore";

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const USE_LOCAL_API = process.env.NEXT_PUBLIC_USE_LOCAL_API === "true";
  if (!USE_LOCAL_API) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "NOT_FOUND", message: "Local admin API disabled" },
      },
      { status: 404 }
    );
  }
  try {
    const { id } = await params;
    const updated = toggleActiveCourse(id);
    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Course not found" },
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: updated }, { status: 200 });
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
