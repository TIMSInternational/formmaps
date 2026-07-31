import { NextResponse } from "next/server";
import {
  getAdminCourse,
  updateAdminCourse,
  deleteAdminCourse,
} from "@/lib/adminCoursesStore";

export async function GET(
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
    const course = getAdminCourse(id);
    if (!course) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Course not found" },
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true, data: course }, { status: 200 });
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
    const payload = await req.json();
    const updated = updateAdminCourse(id, payload);
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
        error: { code: "INVALID_REQUEST", message: (err as Error).message },
      },
      { status: 400 }
    );
  }
}

export async function DELETE(
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
    const ok = deleteAdminCourse(id);
    if (!ok) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "NOT_FOUND", message: "Course not found" },
        },
        { status: 404 }
      );
    }

    return NextResponse.json(
      { success: true, message: "Course removed successfully" },
      { status: 200 }
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
