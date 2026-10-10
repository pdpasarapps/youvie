import HomePageClient from "./homepage-client";
import { getHomepageCatalog } from "@/lib/homepage-data";
import { redirect } from "next/navigation";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  if (typeof params.episode === "string") {
    const requestedPosition = typeof params.time === "string" ? Number(params.time) : 0;
    const resumeAtSeconds = Number.isFinite(requestedPosition) ? Math.max(0, requestedPosition) : 0;
    redirect(`/watch/${encodeURIComponent(params.episode)}/player?time=${resumeAtSeconds}`);
  }
  const catalog = await getHomepageCatalog();
  return <HomePageClient {...catalog} />;
}
