"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";
import PlatformLinks from "@/components/platform-links";
import type { PlatformSettings } from "@/lib/platform-settings";

const PlatformSettingsContext = createContext<{ settings: PlatformSettings; updateSettings: (settings: PlatformSettings) => void } | null>(null);

export function usePlatformSettings() {
  const context = useContext(PlatformSettingsContext);
  if (!context) throw new Error("usePlatformSettings must be used inside PlatformRuntime.");
  return context;
}

export default function PlatformRuntime({
  children,
  initialSettings,
}: {
  children: ReactNode;
  initialSettings: PlatformSettings;
}) {
  const pathname = usePathname();
  const [settings, updateSettings] = useState(initialSettings);
  const context = useMemo(() => ({ settings, updateSettings }), [settings]);
  const adminOrLoginRoute = pathname === "/login" || pathname === "/admin" || pathname.startsWith("/admin/");
  const gatedFeature = pathname.startsWith("/comic/")
    ? !settings.feature_flags.reading
    : (pathname.startsWith("/kreator/") || pathname.startsWith("/profile/") || [
        "/account/creator",
        "/account/komiku",
        "/account/terbitkan-komik",
        "/account/analitik-komik",
        "/account/creator-profile",
        "/account/creator-guide",
      ].some((route) => pathname === route || pathname.startsWith(`${route}/`)))
      ? !settings.feature_flags.creators
      : pathname === "/account/favorites"
        ? !settings.feature_flags.favorites
        : false;

  let content = children;
  if (settings.maintenance_enabled && !adminOrLoginRoute) {
    content = (
      <main className="reader-detail-page reader-not-found-page platform-maintenance-page">
        <nav className="reader-subnav">
          <BrandLogo className="wordmark reader-wordmark" showName />
          <span className="platform-maintenance-status">Pemeliharaan</span>
        </nav>
        <section className="reader-detail-not-found">
          <Image
            className="reader-not-found-illustration platform-maintenance-illustration"
            src="/pemelihraan.png"
            alt="Kreator MU-Komik sedang memperbaiki platform"
            width={1536}
            height={1024}
            priority
            unoptimized
          />
          <h1>Kami sedang berbenah.</h1>
          <p>{settings.maintenance_message}</p>
          <Link className="reader-primary-button" href="/">Kembali lagi nanti</Link>
          <PlatformLinks includeEmail={false} />
        </section>
      </main>
    );
  } else if (gatedFeature) {
    content = (
      <main className="platform-state-page">
        <p className="eyebrow">Fitur sementara dijeda</p>
        <h1>Fitur ini sedang tidak tersedia.</h1>
        <p>Tim MU-Komik sedang menyiapkan kembali fitur ini. Silakan coba lagi nanti.</p>
      </main>
    );
  } else if (settings.announcement_enabled && settings.announcement_message) {
    content = (
      <>
        <aside className="platform-announcement" role="status">{settings.announcement_message}</aside>
        {children}
      </>
    );
  }

  return <PlatformSettingsContext.Provider value={context}>{content}</PlatformSettingsContext.Provider>;
}
