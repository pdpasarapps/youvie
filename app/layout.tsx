import type { Metadata, Viewport } from "next";
import { siteUrl } from "@/lib/seo";
import { getPlatformSettings } from "@/lib/platform-settings";
import PlatformRuntime from "./platform-runtime";
import ReaderMembershipRuntime from "./membership-runtime";
import PwaSupport from "./pwa-support";
import AppSplash from "@/components/app-splash";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  metadataBase: siteUrl,
  alternates: {
    canonical: siteUrl.toString(),
  },
  title: {
    default: "MU Komik — Platform Komik Indonesia",
    template: "%s | MU Komik",
  },
  description: "Baca komik Indonesia terbaru dari kreator lokal. Temukan komik komedi, horor, romansa, kehidupan sehari-hari, dan berbagai cerita menarik di MU Komik.",
  applicationName: "mu-komik",
  authors: [{ name: "mu-komik" }],
  creator: "mu-komik",
  publisher: "mu-komik",
  facebook: { appId: "1452978320076766" },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "mu-komik",
    url: siteUrl.toString(),
    title: "MU Komik — Platform Komik Indonesia",
    description: "Baca komik Indonesia terbaru dari kreator lokal. Temukan komik komedi, horor, romansa, kehidupan sehari-hari, dan berbagai cerita menarik di MU Komik.",
  },
  twitter: {
    card: "summary",
    title: "MU Komik — Platform Komik Indonesia",
    description: "Baca komik Indonesia terbaru dari kreator lokal. Temukan komik komedi, horor, romansa, kehidupan sehari-hari, dan berbagai cerita menarik di MU Komik.",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "mu-komik",
    statusBarStyle: "default",
  },
  icons: {
    shortcut: [{ url: "/favicon.ico", type: "image/x-icon" }],
    icon: [
      { url: "/favicon.ico", type: "image/x-icon" },
      { url: "/pwa/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/pwa/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/pwa/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#f7f6f2",
};

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": new URL("#organization", siteUrl).toString(),
      name: "MU Komik",
      url: siteUrl.toString(),
      logo: {
        "@type": "ImageObject",
        url: new URL("/logo_mukomik.jpg", siteUrl).toString(),
      },
      sameAs: [
        "https://www.instagram.com/mu_komik/",
        "https://www.tiktok.com/@mukomikz",
      ],
    },
    {
      "@type": "WebSite",
      "@id": new URL("#website", siteUrl).toString(),
      name: "MU Komik",
      url: siteUrl.toString(),
      inLanguage: "id-ID",
      description: "Platform untuk membaca komik Indonesia dan menjelajahi cerita karya kreator lokal.",
      publisher: { "@id": new URL("#organization", siteUrl).toString() },
    },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { settings } = await getPlatformSettings();
  return (
    <html lang="id" className="h-full antialiased" data-theme="light" suppressHydrationWarning>
      <body className="min-h-full flex flex-col">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, "\\u003c") }}
        />
        <ReaderMembershipRuntime>
          <PlatformRuntime initialSettings={settings}>{children}</PlatformRuntime>
        </ReaderMembershipRuntime>
        <AppSplash />
        <PwaSupport />
      </body>
    </html>
  );
}
