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
    default: "Youvie — Drama Pendek Indonesia",
    template: "%s | Youvie",
  },
  description: "Tonton drama pendek Indonesia dengan cerita seru dalam episode singkat di Youvie.",
  applicationName: "Youvie",
  authors: [{ name: "Youvie" }],
  creator: "Youvie",
  publisher: "Youvie",
  facebook: { appId: "1452978320076766" },
  openGraph: {
    type: "website",
    locale: "id_ID",
    siteName: "Youvie",
    url: siteUrl.toString(),
    title: "Youvie — Drama Pendek Indonesia",
    description: "Tonton drama pendek Indonesia dengan cerita seru dalam episode singkat di Youvie.",
    images: [{ url: "/pwa/icon-512.png", width: 512, height: 512, alt: "Youvie" }],
  },
  twitter: {
    card: "summary",
    title: "Youvie — Drama Pendek Indonesia",
    description: "Tonton drama pendek Indonesia dengan cerita seru dalam episode singkat di Youvie.",
    images: ["/pwa/icon-512.png"],
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
    title: "Youvie",
    statusBarStyle: "default",
  },
  icons: {
    shortcut: [{ url: "/pwa/icon.svg", type: "image/svg+xml" }],
    icon: [
      { url: "/pwa/icon.svg", type: "image/svg+xml" },
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
      name: "Youvie",
      url: siteUrl.toString(),
      logo: {
        "@type": "ImageObject",
        url: new URL("/pwa/icon.svg", siteUrl).toString(),
      },
      sameAs: [
        "https://www.instagram.com/mu_komik/",
        "https://www.tiktok.com/@mukomikz",
      ],
    },
    {
      "@type": "WebSite",
      "@id": new URL("#website", siteUrl).toString(),
      name: "Youvie",
      url: siteUrl.toString(),
      inLanguage: "id-ID",
      description: "Youvie adalah platform untuk menonton serial drama pendek dalam episode.",
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
