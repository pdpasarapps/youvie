import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") {
    return NextResponse.json({ error: "Cross-site requests are not allowed" }, { status: 403 });
  }
  try {
    if (new URL(origin).host !== request.headers.get("host")) {
      return NextResponse.json({ error: "Cross-origin requests are not allowed" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "Invalid request origin" }, { status: 403 });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > 1024) {
    return NextResponse.json({ error: "Request body is too large" }, { status: 413 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON request body" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || !("comicId" in body)
    || typeof body.comicId !== "string" || !uuidPattern.test(body.comicId)) {
    return NextResponse.json({ error: "A valid comic ID is required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Unable to record a comic share: Supabase URL or service-role key is missing.");
    return NextResponse.json({ error: "Analytics storage is not configured" }, { status: 500 });
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await serviceClient.rpc("record_comic_share", { p_comic_id: body.comicId });
  if (error) {
    console.error("Unable to record a comic share:", error);
    return NextResponse.json({ error: "Comic share could not be recorded" }, { status: 500 });
  }

  return NextResponse.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
}
