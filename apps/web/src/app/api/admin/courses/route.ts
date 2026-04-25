import { NextResponse } from "next/server";
import { getAllAdminCourses, seedFromMock } from "@/lib/adminCoursesStore";
import { mockCourses } from "@/data/mockCourses";

// For now we seed admin store from mock once
// Only seed and enable the local in-app admin API if explicitly enabled
const USE_LOCAL_API = process.env.NEXT_PUBLIC_USE_LOCAL_API === "true";
if (USE_LOCAL_API) {
  seedFromMock(mockCourses);
}

export async function GET(req: Request) {
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
    const url = new URL(req.url);
    const page = Number(url.searchParams.get("page") ?? 1);
    const limit = Number(url.searchParams.get("limit") ?? 50);
    const search = url.searchParams.get("search") ?? "";

    let results = getAllAdminCourses();
    if (search) {
      const s = search.toLowerCase();
      results = results.filter(
        (c) =>
          c.title.toLowerCase().includes(s) ||
          c.provider.toLowerCase().includes(s)
      );
    }

    const offset = (page - 1) * limit;
    const paged = results.slice(offset, offset + limit);

    return NextResponse.json(
      {
        success: true,
        data: {
          courses: paged,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(results.length / limit),
            totalItems: results.length,
            itemsPerPage: limit,
          },
        },
      },
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

export async function POST(req: Request) {
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
    const payload = await req.json();
    const { createAdminCourse } = await import("@/lib/adminCoursesStore");
    const created = createAdminCourse(payload);
    return NextResponse.json({ success: true, data: created }, { status: 201 });
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
