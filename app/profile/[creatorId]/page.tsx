import { permanentRedirect, notFound } from "next/navigation";
import { createPublicSupabaseClient } from "@/lib/seo";

export default async function LegacyCreatorProfilePage({
  params,
}: {
  params: Promise<{ creatorId: string }>;
}) {
  const { creatorId } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(creatorId)) notFound();
  const supabase = createPublicSupabaseClient();
  if (!supabase) throw new Error("Supabase public environment variables are required to redirect creator profiles.");

  const { data, error } = await supabase
    .from("profiles")
    .select("public_handle")
    .eq("id", creatorId)
    .eq("role", "creator")
    .eq("public_profile", true)
    .maybeSingle();
  if (error) {
    console.error("Unable to resolve legacy creator profile URL:", { creatorId, error });
    throw new Error(`Unable to resolve legacy creator profile URL: ${error.message}`);
  }
  if (!data?.public_handle) notFound();
  permanentRedirect(`/kreator/${encodeURIComponent(data.public_handle)}`);
}
