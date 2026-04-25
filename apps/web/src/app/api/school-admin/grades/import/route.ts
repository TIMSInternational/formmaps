import { NextResponse } from "next/server";
import Papa from "papaparse";

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ success: false, message: "No file provided" }, { status: 400 });
    }

    const text = await file.text();
    const parsed = Papa.parse(text, { header: true, skipEmptyLines: true });
    const rows = parsed.data as any[];

    // Basic validation (server stub for local development)
    const errors: any[] = [];
    const required = ["student_id", "student_email", "course_code", "semester", "grade", "credits", "status"];
    const header = Object.keys(rows[0] || {}).map((h) => String(h).trim().toLowerCase());
    for (const col of required) {
      if (!header.includes(col)) errors.push({ message: `Missing column: ${col}` });
    }

    // Return validation summary and create a fake job id for async processing
    return NextResponse.json(
      {
        success: true,
        jobId: `job-${Date.now()}`,
        rowsProcessed: rows.length,
        errors,
      },
      { status: 202 }
    );
  } catch (err: any) {
    return NextResponse.json({ success: false, message: err.message || "Import failed" }, { status: 500 });
  }
}
