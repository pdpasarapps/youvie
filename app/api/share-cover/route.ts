import { NextRequest } from "next/server";

const imageContentTypes = new Set(["image/avif", "image/gif", "image/jpeg", "image/png", "image/webp"]);
const coverKeyPattern = /^comics\/[0-9a-f-]{36}\/cover\/[a-zA-Z0-9._-]+$/i;

export async function GET(request: NextRequest) {
  const key = request.nextUrl.searchParams.get("key");
  if (!key || !coverKeyPattern.test(key) || key.split("/").some((part) => part === "." || part === "..")) {
    return Response.json({ error: "Invalid comic cover key" }, { status: 400 });
  }

  const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL;
  if (!publicUrl) {
    return Response.json({ error: "Public R2 URL is not configured" }, { status: 500 });
  }

  let coverUrl: URL;
  try {
    const baseUrl = new URL(publicUrl);
    if (baseUrl.protocol !== "https:") {
      return Response.json({ error: "Public R2 URL must use HTTPS" }, { status: 500 });
    }
    baseUrl.pathname = `${baseUrl.pathname.replace(/\/?$/, "/")}${key.split("/").map(encodeURIComponent).join("/")}`;
    coverUrl = baseUrl;
  } catch (error) {
    console.error("Invalid public R2 URL configuration:", error);
    return Response.json({ error: "Public R2 URL is invalid" }, { status: 500 });
  }

  try {
    const upstream = await fetch(coverUrl, { cache: "force-cache" });
    if (!upstream.ok) {
      console.error("Unable to fetch public comic cover:", { status: upstream.status, key });
      return Response.json({ error: "Comic cover is unavailable" }, { status: upstream.status === 404 ? 404 : 502 });
    }

    const contentType = upstream.headers.get("content-type")?.split(";")[0].trim().toLowerCase();
    if (!contentType || !imageContentTypes.has(contentType) || !upstream.body) {
      console.error("Public comic cover response has an unsupported content type:", { contentType, key });
      return Response.json({ error: "Comic cover response is not a supported image" }, { status: 502 });
    }

    const headers = new Headers({
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=14400, s-maxage=86400",
      "X-Content-Type-Options": "nosniff",
    });
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers.set("Content-Length", contentLength);
    return new Response(upstream.body, { headers });
  } catch (error) {
    console.error("Failed to fetch comic cover for sharing:", error);
    return Response.json({ error: "Comic cover could not be prepared for sharing" }, { status: 502 });
  }
}
