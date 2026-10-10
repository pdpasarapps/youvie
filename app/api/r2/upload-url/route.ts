import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Direct uploads are no longer supported. Use the validated image upload endpoint." },
    { status: 410 },
  );
}
