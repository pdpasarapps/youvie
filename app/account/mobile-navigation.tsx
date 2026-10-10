"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BarChart3, BookOpen, Bookmark, CircleHelp, Home, LayoutDashboard, Library, Menu, Plus, Settings2, Sparkles, UserRound, X } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { usePlatformSettings } from "../platform-runtime";

type AccountRole = "reader" | "creator" | "admin";

const supabase = createClient();

export default function AccountMobileNavigation() {
  const pathname = usePathname();
  const { settings } = usePlatformSettings();
  const [role, setRole] = useState<AccountRole | null>(null);
  const [creatorMobileNavOpen, setCreatorMobileNavOpen] = useState(false);

  useEffect(() => {
    let active = true;
    const loadRole = async () => {
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        console.error("Could not check session for account navigation:", sessionError);
        return;
      }
      if (!sessionData.session) return;

      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        if (userError.name === "AuthSessionMissingError") return;
        console.error("Could not identify user for account navigation:", userError);
        return;
      }
      if (!userData.user) return;
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (profileError) {
        console.error("Could not load role for account navigation:", profileError);
        return;
      }
      if (active && (profile?.role === "reader" || profile?.role === "creator" || profile?.role === "admin")) {
        setRole(profile.role);
      }
    };
    void loadRole();
    return () => {
      active = false;
    };
  }, []);

  if (!role) return null;

  const current = (section: string) => pathname === `/account/${section}` || (section === "overview" && pathname === "/account");
  const isComicEditor = pathname.startsWith("/account/komik/");

  return (
    <>
      <nav
        id="account-mobile-navigation"
        className={`account-mobile-nav${role === "creator" ? ` account-mobile-nav-floating${creatorMobileNavOpen ? "" : " account-mobile-nav-hidden"}` : ""}`}
        aria-label="Navigasi akun"
        aria-hidden={role === "creator" && !creatorMobileNavOpen}
        inert={role === "creator" && !creatorMobileNavOpen}
      >
        <Link href="/account" className={current("overview") ? "active" : ""} aria-current={current("overview") ? "page" : undefined}><LayoutDashboard size={19} /><span>Ringkasan</span></Link>
        <Link href="/"><Home size={19} /><span>Beranda</span></Link>
        <Link href="/account/reading" className={current("reading") ? "active" : ""} aria-current={current("reading") ? "page" : undefined}><BookOpen size={19} /><span>Baca</span></Link>
        <Link href="/account/favorites" className={current("favorites") ? "active" : ""} aria-current={current("favorites") ? "page" : undefined}><Bookmark size={19} /><span>Favorit</span></Link>
        {role === "reader" && settings.feature_flags.creators && <Link href="/account/creator-application" className={current("creator-application") ? "active" : ""} aria-current={current("creator-application") ? "page" : undefined}><Sparkles size={19} /><span>Kreator</span></Link>}
        {role === "creator" && <>
          <Link href="/account/creator" className={current("creator") ? "active" : ""} aria-current={current("creator") ? "page" : undefined}><Sparkles size={19} /><span>Kreator</span></Link>
          <Link href="/account/komiku" className={current("komiku") || isComicEditor ? "active" : ""} aria-current={current("komiku") || isComicEditor ? "page" : undefined}><Library size={19} /><span>Komikku</span></Link>
          <Link href="/account/terbitkan-komik" className={current("terbitkan-komik") ? "active" : ""} aria-current={current("terbitkan-komik") ? "page" : undefined}><Plus size={19} /><span>Terbitkan</span></Link>
          <Link href="/account/analitik-komik" className={current("analitik-komik") ? "active" : ""} aria-current={current("analitik-komik") ? "page" : undefined}><BarChart3 size={19} /><span>Analitik</span></Link>
        </>}
        <Link href="/account/account-settings" className={current("account-settings") ? "active" : ""} aria-current={current("account-settings") ? "page" : undefined}><Settings2 size={19} /><span>Akun</span></Link>
        {role === "creator" && <>
          <Link href="/account/creator-profile" className={current("creator-profile") ? "active" : ""} aria-current={current("creator-profile") ? "page" : undefined}><UserRound size={19} /><span>Profil</span></Link>
          <Link href="/account/creator-guide" className={current("creator-guide") ? "active" : ""} aria-current={current("creator-guide") ? "page" : undefined}><CircleHelp size={19} /><span>Panduan</span></Link>
        </>}
        {role === "admin" && <Link href="/admin"><Settings2 size={19} /><span>Admin</span></Link>}
      </nav>
      {role === "creator" && (
        <button
          type="button"
          className="account-mobile-nav-toggle"
          aria-label={creatorMobileNavOpen ? "Sembunyikan menu navigasi" : "Tampilkan menu navigasi"}
          aria-controls="account-mobile-navigation"
          aria-expanded={creatorMobileNavOpen}
          onClick={() => setCreatorMobileNavOpen((isOpen) => !isOpen)}
        >
          {creatorMobileNavOpen ? <X size={20} /> : <Menu size={20} />}
        </button>
      )}
    </>
  );
}
