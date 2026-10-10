import { redirect } from "next/navigation";

export default async function CreatorComicPage({
  params,
  searchParams,
}: PageProps<"/creator/comic/[comicId]">) {
  const [{ comicId }, query] = await Promise.all([params, searchParams]);
  const search = new URLSearchParams();

  for (const [key, value] of Object.entries(query)) {
    if (Array.isArray(value)) {
      for (const item of value) search.append(key, item);
    } else if (value !== undefined) {
      search.set(key, value);
    }
  }

  const queryString = search.toString();
  redirect(`/account/komik/${encodeURIComponent(comicId)}${queryString ? `?${queryString}` : ""}`);
}
