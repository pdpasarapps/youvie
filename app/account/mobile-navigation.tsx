"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { BookOpen, Bookmark, Home, LayoutDashboard, Settings2, Video } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type AccountRole = "reader" | "admin";

const supabase = createClient();

export default function AccountMobileNavigation() {
  const pathname = usePathname();
  const [role, setRole] = useState<AccountRole | null>(null);
  const [canManageVideos, setCanManageVideos] = useState(false);

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
        setRole(profile.role === "admin" ? "admin" : "reader");
        if (profile.role === "admin") {
          setCanManageVideos(true);
        } else {
          const { data: canManage, error: accessError } = await supabase.rpc("can_manage_video_catalog");
          if (accessError) {
            console.error("Could not check video upload access for account navigation:", accessError);
            return;
          }
          if (active && canManage === true) setCanManageVideos(true);
        }
      }
    };
    void loadRole();
    return () => {
      active = false;
    };
  }, []);

  if (!role) return null;

  const current = (section: string) => pathname === `/account/${section}` || (section === "overview" && pathname === "/account");

  return (
    <nav className="account-mobile-nav" aria-label="Navigasi akun">
        <Link href="/account" className={current("overview") ? "active" : ""} aria-current={current("overview") ? "page" : undefined}><LayoutDashboard size={19} /><span>Ringkasan</span></Link>
        <Link href="/"><Home size={19} /><span>Beranda</span></Link>
        <Link href="/account/reading" className={current("reading") ? "active" : ""} aria-current={current("reading") ? "page" : undefined}><BookOpen size={19} /><span>Baca</span></Link>
        <Link href="/account/favorites" className={current("favorites") ? "active" : ""} aria-current={current("favorites") ? "page" : undefined}><Bookmark size={19} /><span>Favorit</span></Link>
        <Link href="/account/account-settings" className={current("account-settings") ? "active" : ""} aria-current={current("account-settings") ? "page" : undefined}><Settings2 size={19} /><span>Akun</span></Link>
        {canManageVideos && <Link href="/admin/video-upload" className={pathname === "/admin/video-upload" ? "active" : ""} aria-current={pathname === "/admin/video-upload" ? "page" : undefined}><Video size={19} /><span>Upload video</span></Link>}
        {role === "admin" && <Link href="/admin"><Settings2 size={19} /><span>Admin</span></Link>}
    </nav>
  );
}
