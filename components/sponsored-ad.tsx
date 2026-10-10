"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { ExternalLink, Megaphone } from "lucide-react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";
import { useReaderMembership } from "@/app/membership-runtime";

type SponsoredCampaign = {
  campaign_id: string;
  sponsor_name: string;
  title: string;
  description: string;
  destination_url: string;
  image_url: string | null;
  image_url_tablet: string | null;
  image_url_mobile: string | null;
  format: "banner" | "native" | "sponsor";
};

const supabase = createClient();

export default function SponsoredAd({ slotKey, placement, comicId, matchPageIndex, readerStopId, onCampaignAvailability, fallback, ctaOnly = false }: { slotKey: string; placement: "home" | "comic" | "reader" | "catalog" | "transition"; comicId?: string; matchPageIndex?: number; readerStopId?: string; onCampaignAvailability?: (available: boolean) => void; fallback?: ReactNode; ctaOnly?: boolean }) {
  const membership = useReaderMembership();
  const [campaign, setCampaign] = useState<SponsoredCampaign | null>(null);
  const [matchedPageHeight, setMatchedPageHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!membership.ready) return;
    if (membership.tier !== "free") {
      onCampaignAvailability?.(false);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase.rpc("get_active_sponsor_campaign", {
        p_slot_key: slotKey,
        p_comic_id: comicId || null,
      });
      if (error) {
        const details = {
          slotKey,
          comicId: comicId ?? null,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint,
        };
        if (error.code === "PGRST202") {
          console.error("Ads database function is outdated or its schema cache has not refreshed. Rerun supabase/ads-management.sql in Supabase SQL Editor.", details);
        } else {
          console.error("Unable to load sponsored campaign:", details);
        }
        if (!cancelled) onCampaignAvailability?.(false);
        return;
      }
      const row = Array.isArray(data) ? data[0] : null;
      if (!cancelled && row && typeof row === "object"
        && typeof row.campaign_id === "string"
        && typeof row.sponsor_name === "string"
        && typeof row.title === "string"
        && typeof row.destination_url === "string"
        && ["banner", "native", "sponsor"].includes(row.format)) {
        setCampaign({
          campaign_id: row.campaign_id,
          sponsor_name: row.sponsor_name,
          title: row.title,
          description: typeof row.description === "string" ? row.description : "",
          destination_url: row.destination_url,
          image_url: typeof row.image_url === "string" ? row.image_url : null,
          image_url_tablet: typeof row.image_url_tablet === "string" ? row.image_url_tablet : null,
          image_url_mobile: typeof row.image_url_mobile === "string" ? row.image_url_mobile : null,
          format: row.format,
        });
        onCampaignAvailability?.(true);
      } else if (!cancelled) {
        setCampaign(null);
        onCampaignAvailability?.(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [comicId, membership.ready, membership.tier, onCampaignAvailability, slotKey]);

  useEffect(() => {
    if (!membership.ready || membership.tier !== "free") return;
    if (placement !== "reader" || matchPageIndex === undefined) return;
    const frame = document.querySelector<HTMLElement>(`[data-reader-page="${matchPageIndex}"]`);
    if (!frame) return;

    const updateHeight = () => {
      const image = frame.querySelector("img");
      const height = image?.getBoundingClientRect().height || frame.getBoundingClientRect().height;
      if (height > 0) setMatchedPageHeight(height);
    };
    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(frame);
    const image = frame.querySelector("img");
    if (image) observer.observe(image);
    return () => observer.disconnect();
  }, [matchPageIndex, membership.ready, membership.tier, placement]);

  if (!membership.ready || membership.tier !== "free" || !campaign) return fallback ?? null;
  const sponsorLabel = campaign.format === "sponsor" ? "Sponsor" : "Iklan";
  const nativeReaderAd = (placement === "reader" || placement === "transition") && campaign.format === "native";
  const fallbackImage = campaign.image_url || campaign.image_url_tablet || campaign.image_url_mobile;
  const adStyle = nativeReaderAd && matchedPageHeight
    ? { "--reader-ad-height": `${matchedPageHeight}px` } as CSSProperties
    : undefined;
  const adContent = (
    <>
      {fallbackImage && <picture className="reader-sponsored-ad-picture">
        {campaign.image_url_mobile && <source media="(max-width: 767px)" srcSet={campaign.image_url_mobile} />}
        {campaign.image_url_tablet && <source media="(min-width: 768px) and (max-width: 1023px)" srcSet={campaign.image_url_tablet} />}
        <Image className="reader-sponsored-ad-image" src={fallbackImage} alt="" width={1200} height={600} unoptimized loading="lazy" />
      </picture>}
      <span className="reader-sponsored-ad-copy">
        <span className="reader-sponsored-ad-sponsor">{campaign.sponsor_name}</span>
        <strong>{campaign.title}</strong>
        {campaign.description && <span className="reader-sponsored-ad-description">{campaign.description}</span>}
        {ctaOnly
          ? <a className="reader-sponsored-ad-cta" href={campaign.destination_url} target="_blank" rel="noreferrer noopener sponsored" onClick={(event) => event.stopPropagation()}>Kunjungi <ExternalLink size={14} /></a>
          : <span className="reader-sponsored-ad-cta">Kunjungi <ExternalLink size={14} /></span>}
      </span>
    </>
  );

  return (
    <aside className={`reader-sponsored-ad reader-sponsored-ad-${placement}${campaign.format === "banner" ? " reader-sponsored-ad-banner" : ""}${nativeReaderAd ? " reader-sponsored-ad-native" : ""}`} data-reader-stop={readerStopId} aria-label={`${sponsorLabel}: ${campaign.sponsor_name}`} style={adStyle}>
      <div className="reader-sponsored-ad-label"><Megaphone size={13} /> {sponsorLabel}</div>
      {ctaOnly
        ? <div className="reader-sponsored-ad-link">{adContent}</div>
        : <a className="reader-sponsored-ad-link" href={campaign.destination_url} target="_blank" rel="noreferrer noopener sponsored">{adContent}</a>}
    </aside>
  );
}
