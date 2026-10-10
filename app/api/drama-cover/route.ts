import { NextRequest } from "next/server";
import { createPublicSupabaseClient } from "@/lib/seo";

const coverPathPattern =
  /^series\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/cover-[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;
const imageContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);

function coverError(message: string, status: number) {
  return Response.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } },
  );
}

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key || !coverPathPattern.test(key)) {
    return coverError("Invalid drama cover key", 400);
  }

  const supabase = createPublicSupabaseClient();
  if (!supabase) {
    console.error("Unable to serve drama cover: Supabase public environment variables are missing.");
    return coverError("Drama cover service is not configured", 500);
  }

  const { data, error } = await supabase.storage.from("drama-media").createSignedUrl(key, 3600);
  if (error || !data?.signedUrl) {
    console.error("Unable to sign published drama cover:", {
      message: error?.message ?? "Supabase returned no signed cover URL.",
      key,
    });
    return coverError("Drama cover is unavailable", 404);
  }

  try {
    const image = await fetch(data.signedUrl, { cache: "force-cache" });
    if (!image.ok || !image.body) {
      console.error("Unable to fetch signed drama cover:", { status: image.status, key });
      return coverError("Drama cover is unavailable", 502);
    }

    const contentType = image.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!contentType || !imageContentTypes.has(contentType)) {
      console.error("Signed drama cover has an unsupported content type:", { contentType, key });
      return coverError("Drama cover has an unsupported format", 502);
    }

    const headers = new Headers({
      "Cache-Control": "public, max-age=31536000, s-maxage=31536000, immutable",
      "Content-Type": contentType,
      "X-Content-Type-Options": "nosniff",
    });
    const contentLength = image.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new Response(image.body, { headers });
  } catch (fetchError) {
    console.error("Failed to serve drama cover:", { error: fetchError, key });
    return coverError("Drama cover could not be loaded", 502);
  }
}
