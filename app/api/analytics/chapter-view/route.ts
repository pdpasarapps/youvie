import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const visitorCookieName = "mu_analytics_visitor";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const analyticsRequestTimeoutMs = 8000;

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
  if (!body || typeof body !== "object" || !("chapterId" in body)
    || typeof body.chapterId !== "string" || !uuidPattern.test(body.chapterId)) {
    return NextResponse.json({ error: "A valid chapter ID is required" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseKey || !serviceRoleKey) {
    console.error("Unable to record a chapter view: Supabase URL, anon key, or service-role key is missing.");
    return NextResponse.json({ error: "Analytics storage is not configured" }, { status: 500 });
  }

  const authorization = request.headers.get("authorization");
  let accessToken: string | undefined;
  if (authorization) {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (!match) return NextResponse.json({ error: "Invalid authorization header" }, { status: 401 });
    accessToken = match[1];
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let userId: string | null = null;
  if (accessToken) {
    const { data, error } = await supabase.auth.getUser(accessToken);
    if (error || !data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    userId = data.user.id;
  }

  const existingVisitorId = request.cookies.get(visitorCookieName)?.value;
  const visitorId = existingVisitorId && uuidPattern.test(existingVisitorId)
    ? existingVisitorId
    : crypto.randomUUID();
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await serviceClient.rpc("record_comic_view", {
    p_chapter_id: body.chapterId,
    p_visitor_id: visitorId,
    p_user_id: userId,
  }).abortSignal(AbortSignal.timeout(analyticsRequestTimeoutMs));
  if (error) {
    const errorMessage = error.message || "Supabase returned an empty analytics error";
    console.error("Unable to record a chapter view:", {
      code: error.code || "UNKNOWN",
      message: errorMessage,
      details: error.details || null,
      hint: error.hint || null,
    });
    const normalizedErrorMessage = errorMessage.toLowerCase();
    const isTimeout = error.code === "57014"
      || normalizedErrorMessage.includes("timeout")
      || normalizedErrorMessage.includes("timed out")
      || normalizedErrorMessage.includes("abort");
    return NextResponse.json(
      { error: "Chapter view could not be recorded" },
      { status: isTimeout ? 503 : 500 },
    );
  }

  const response = NextResponse.json({ recorded: true }, { headers: { "Cache-Control": "no-store" } });
  if (!existingVisitorId || !uuidPattern.test(existingVisitorId)) {
    response.cookies.set(visitorCookieName, visitorId, {
      httpOnly: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  }
  return response;
}
