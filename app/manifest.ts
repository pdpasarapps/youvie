import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Youvie — Drama Pendek Indonesia",
    short_name: "Youvie",
    description: "Temukan dan tonton serial drama pendek Indonesia dalam episode di Youvie.",
    lang: "id-ID",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f1efe8",
    theme_color: "#1e2524",
    categories: ["entertainment", "video"],
    icons: [
      { src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa/icon-192-maskable.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/pwa/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Jelajahi drama", short_name: "Jelajahi", url: "/#drama-catalog", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Lanjut menonton", short_name: "Tonton", url: "/account/watching", icons: [{ src: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
