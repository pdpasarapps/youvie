import HomePageClient from "./homepage-client";
import { getHomepageCatalog } from "@/lib/homepage-data";

export default async function HomePage() {
  const catalog = await getHomepageCatalog();
  return <HomePageClient {...catalog} />;
}
