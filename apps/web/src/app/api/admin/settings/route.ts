import { NextResponse } from "next/server";

// In-memory store for settings (replace with DB in production)
const settings = {
  platformFee: 15,
};

export async function GET() {
  return NextResponse.json(settings);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (typeof body.platformFee === "number") {
      settings.platformFee = body.platformFee;
    }

    return NextResponse.json(settings);
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
