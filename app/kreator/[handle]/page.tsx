import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, AtSign, Gamepad2, Globe2, Link2, MessageCircle, UserRound } from "lucide-react";
import { notFound } from "next/navigation";
import BrandLogo from "@/components/brand-logo";
import ShareProfileButton from "@/components/share-profile-button";
import { parseCreatorSocialLinks } from "@/lib/creator-social-links";
import { createPublicSupabaseClient, siteUrl } from "@/lib/seo";
import CreatorComicGrid from "@/components/creator-comic-grid";
import type { ComicTargetDevice } from "@/lib/comic-target-device";

type CreatorComic = {
  id: string;
  title: string;
  slug: string;
  genre: string;
  cover_key: string | null;
  target_device: ComicTargetDevice;
};

const publicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL;

function CreatorSocialPlatformIcon({ platform }: { platform: string }) {
  switch (platform.toLowerCase()) {
    case "instagram":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.6" cy="6.7" r=".8" className="creator-social-icon-dot" /></svg>;
    case "tiktok":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 3v11.2a4.2 4.2 0 1 1-3.6-4.15" /><path d="M14 3c.6 2.7 2.3 4.2 5 4.5" /></svg>;
    case "x":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 4 14 16M19 4 5 20" /></svg>;
    case "youtube":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="4" /><path d="m10 9 5 3-5 3z" className="creator-social-icon-fill" /></svg>;
    case "facebook":
      return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.2 21v-8h2.7l.4-3.1h-3.1v-2c0-.9.3-1.5 1.6-1.5h1.7V3.6c-.3 0-1.3-.1-2.5-.1-2.5 0-4.2 1.5-4.2 4.3v2.1H8v3.1h2.8v8z" className="creator-social-icon-fill" /></svg>;
    case "threads":
      return <AtSign size={17} aria-hidden="true" />;
    case "twitch":
      return <MessageCircle size={17} aria-hidden="true" />;
    case "discord":
      return <Gamepad2 size={17} aria-hidden="true" />;
    case "website":
      return <Globe2 size={17} aria-hidden="true" />;
    default:
      return <Link2 size={17} aria-hidden="true" />;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string }>;
}): Promise<Metadata> {
  const { handle } = await params;
  const supabase = createPublicSupabaseClient();
  if (!supabase) return { title: "Profil kreator", robots: { index: false, follow: false } };
  const { data, error } = await supabase
    .from("profiles")
    .select("display_name, bio")
    .eq("public_handle", handle)
    .eq("role", "creator")
    .eq("public_profile", true)
    .maybeSingle();
  if (error) {
    console.error("Unable to load public creator profile metadata:", error);
    return { title: "Profil kreator", robots: { index: false, follow: false } };
  }
  if (!data) return { title: "Profil kreator", robots: { index: false, follow: false } };
  const title = `${data.display_name} — Kreator Komik Indonesia`;
  const rawDescription = data.bio?.trim().replace(/\s+/g, " ")
    || `Lihat komik terbit dari kreator ${data.display_name} di MU Komik.`;
  const description = rawDescription.length <= 160
    ? rawDescription
    : `${rawDescription.slice(0, 157).replace(/\s+\S*$/, "")}...`;
  const url = new URL(`/kreator/${encodeURIComponent(handle)}`, siteUrl).toString();
  const image = new URL("/logo_mukomik.jpg", siteUrl).toString();
  return {
    title,
    description,
    keywords: [data.display_name, "kreator komik", "komik Indonesia", "MU Komik"],
    authors: [{ name: data.display_name }],
    creator: data.display_name,
    robots: { index: true, follow: true },
    alternates: { canonical: url },
    openGraph: {
      type: "profile",
      title,
      description,
      url,
      siteName: "MU Komik",
      locale: "id_ID",
      images: [{ url: image, alt: "Logo MU Komik" }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: image, alt: "Logo MU Komik" }],
    },
  };
}

export default async function CreatorProfilePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;
  const supabase = createPublicSupabaseClient();
  if (!supabase) throw new Error("Supabase public environment variables are required to load creator profiles.");

  const { data: profileWithSocial, error: profileError } = await supabase
    .from("profiles")
    .select("id, display_name, public_handle, bio, avatar_key, banner_key, social_links")
    .eq("public_handle", handle)
    .eq("role", "creator")
    .eq("public_profile", true)
    .maybeSingle();
  let profile: {
    id: string;
    public_handle: string;
    display_name: string;
    bio: string;
    avatar_key: string | null;
    banner_key: string | null;
    social_links: unknown;
  } | null = profileWithSocial;
  if (profileError?.code === "42703") {
    const profileWithoutSocial = await supabase
      .from("profiles")
      .select("id, display_name, public_handle, bio, avatar_key, banner_key")
      .eq("public_handle", handle)
      .eq("role", "creator")
      .eq("public_profile", true)
      .maybeSingle();
    if (!profileWithoutSocial.error) {
      profile = profileWithoutSocial.data ? { ...profileWithoutSocial.data, social_links: [] } : null;
    } else if (profileWithoutSocial.error.code === "42703") {
      const legacyProfile = await supabase
        .from("profiles")
        .select("id, display_name, public_handle, bio, avatar_key")
        .eq("public_handle", handle)
        .eq("role", "creator")
        .eq("public_profile", true)
        .maybeSingle();
      if (legacyProfile.error) throw new Error(`Unable to load public creator profile: ${legacyProfile.error.message}`);
      profile = legacyProfile.data ? { ...legacyProfile.data, banner_key: null, social_links: [] } : null;
    } else {
      throw new Error(`Unable to load public creator profile: ${profileWithoutSocial.error.message}`);
    }
  } else if (profileError) {
    throw new Error(`Unable to load public creator profile: ${profileError.message}`);
  }
  if (!profile) notFound();
  const socialLinks = parseCreatorSocialLinks(profile.social_links);

  let { data: comics, error: comicsError } = await supabase
    .from("comics")
    .select("id, title, slug, genre, cover_key, target_device")
    .eq("creator_id", profile.id)
    .eq("status", "published")
    .order("created_at", { ascending: false });
  if (comicsError?.code === "42703") {
    const legacyComics = await supabase
      .from("comics")
      .select("id, title, slug, genre, cover_key")
      .eq("creator_id", profile.id)
      .eq("status", "published")
      .order("created_at", { ascending: false });
    comics = legacyComics.data as typeof comics;
    comicsError = legacyComics.error;
  }
  if (comicsError) throw new Error(`Unable to load the creator's published comics: ${comicsError.message}`);

  return (
    <main className="creator-public-profile">
      <nav className="creator-public-nav" aria-label="Navigasi profil kreator">
        <BrandLogo className="wordmark reader-wordmark" showName />
        <Link className="reader-back-link" href="/"><ArrowLeft size={17} /> Jelajahi komik</Link>
      </nav>
      <header className="creator-public-header">
        <div className="creator-public-banner">
          {profile.banner_key && publicUrl
            ? <Image src={`${publicUrl.replace(/\/$/, "")}/${profile.banner_key}`} alt="" fill sizes="100vw" unoptimized priority />
            : <span>MU KOMIK <i>·</i> CERITA PARA KREATOR</span>}
        </div>
        <div className="creator-public-identity">
          <span className="creator-public-avatar">
            {profile.avatar_key && publicUrl
              ? <Image src={`${publicUrl.replace(/\/$/, "")}/${profile.avatar_key}`} alt="" fill sizes="112px" unoptimized />
              : <UserRound size={38} />}
          </span>
          <div className="creator-public-identity-copy">
            <h1>{profile.display_name || "Kreator MU Komik"}</h1>
            <ShareProfileButton creatorName={profile.display_name} />
          </div>
        </div>
        {profile.bio && <p className="creator-public-bio">{profile.bio}</p>}
        {socialLinks.length > 0 && (
          <nav className="creator-public-socials" aria-label="Tautan sosial kreator">
            {socialLinks.map((socialLink) => (
              <a href={socialLink.url} key={`${socialLink.platform}-${socialLink.url}`} target="_blank" rel="noopener noreferrer">
                <span className={`creator-social-icon creator-social-icon-${socialLink.platform.toLowerCase()}`}>
                  <CreatorSocialPlatformIcon platform={socialLink.platform} />
                </span>
                {socialLink.platform}
              </a>
            ))}
          </nav>
        )}
      </header>
      <section className="creator-public-section" aria-labelledby="creator-public-comics">
        {comics?.length ? (
          <CreatorComicGrid comics={comics as CreatorComic[]} publicUrl={publicUrl} />
        ) : (
          <>
            <div className="reader-section-heading">
              <div><p className="reader-section-kicker">KARYA PILIHAN</p><h2 id="creator-public-comics">Komik</h2></div>
              <p className="creator-public-comic-count">0 komik terbit</p>
            </div>
            <p className="creator-public-empty">Belum ada komik yang diterbitkan.</p>
          </>
        )}
      </section>
    </main>
  );
}
