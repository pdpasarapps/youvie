import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  return [{
    url: siteUrl.toString(),
    changeFrequency: "daily",
    priority: 1,
  }, {
    url: new URL("/manifesto", siteUrl).toString(),
    changeFrequency: "monthly",
    priority: 0.6,
  }, {
    url: new URL("/syarat-ketentuan", siteUrl).toString(),
    changeFrequency: "yearly",
    priority: 0.4,
  }];
}
