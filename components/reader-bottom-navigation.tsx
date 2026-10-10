"use client";

import { useEffect, useState } from "react";
import { Bookmark, Clapperboard, Home, LogIn, PlaySquare, UserRound } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export default function ReaderBottomNavigation() {
  const pathname = usePathname();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const isReaderPage = pathname === "/"
    || /^\/watch\/[^/]+$/.test(pathname)
    || /^\/comic\/[^/]+$/.test(pathname)
    || /^\/creator\/[^/]+$/.test(pathname);
  useEffect(() => {
    let active = true;
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setIsAuthenticated(Boolean(session));
    });

    void supabase.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error("Unable to check session for reader navigation:", error);
        return;
      }
      if (active) setIsAuthenticated(Boolean(data.session));
    }).catch((error: unknown) => {
      console.error("Unable to check session for reader navigation:", error);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!isReaderPage) return null;

  const isDramaPage = pathname.startsWith("/watch/");

  return (
    <nav className="reader-bottom-nav" aria-label="Navigasi pembaca">
      <Link href="/" className={pathname === "/" ? "active" : ""} aria-current={pathname === "/" ? "page" : undefined}>
        <Home size={20} /><span>Beranda</span>
      </Link>
      <Link href="/#drama-catalog" className={isDramaPage ? "active" : ""} aria-current={pathname === "/" ? "page" : undefined}>
        <Clapperboard size={20} /><span>Drama</span>
      </Link>
      <Link href="/account/watching" className={pathname === "/account/watching" ? "active" : ""} aria-current={pathname === "/account/watching" ? "page" : undefined}>
        <PlaySquare size={20} /><span>Tontonan</span>
      </Link>
      <Link href="/account/favorites" className={pathname === "/account/favorites" ? "active" : ""} aria-current={pathname === "/account/favorites" ? "page" : undefined}>
        <Bookmark size={20} /><span>Favorit</span>
      </Link>
      <Link href={isAuthenticated ? "/account" : "/login"}>
        {isAuthenticated ? <UserRound size={20} /> : <LogIn size={20} />}
        <span>{isAuthenticated ? "Akun" : "Masuk"}</span>
      </Link>
    </nav>
  );
}
