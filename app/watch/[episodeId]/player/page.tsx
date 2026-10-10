import { notFound } from "next/navigation";
import DramaVideoReader from "../video-reader";
import { getDramaReaderSeed } from "@/lib/drama-reader-data";

export default async function WatchEpisodePlayerPage({
  params,
  searchParams,
}: PageProps<"/watch/[episodeId]/player">) {
  const [{ episodeId }, query] = await Promise.all([params, searchParams]);
  const seed = await getDramaReaderSeed(episodeId);
  if (!seed) notFound();
  const requestedTime = typeof query.time === "string" ? Number(query.time) : 0;
  const resumeAtSeconds = Number.isFinite(requestedTime) ? Math.max(0, requestedTime) : 0;
  return <DramaVideoReader seed={seed} resumeAtSeconds={resumeAtSeconds} />;
}
