"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { LoaderCircle, Search } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { getComicGenreLabel } from "@/lib/comic-genres";

type CampaignStatus = "draft" | "active" | "paused" | "completed";
type TargetPlacement = "all" | "comic_detail" | "reader" | "episode_transition" | "both";
type AdsListTab = "campaigns" | "slots";
type AdSlot = {
  id: string;
  name: string;
  slot_key: string;
  format: "banner" | "native" | "sponsor";
  description: string;
  is_active: boolean;
  created_at: string;
};
type Comic = { id: string; title: string };
type SponsorCampaign = {
  id: string;
  sponsor_name: string;
  title: string;
  description: string;
  destination_url: string;
  slot_id: string | null;
  target_comic_id: string | null;
  target_placement: TargetPlacement;
  target_genres: string[];
  starts_on: string;
  ends_on: string;
  status: CampaignStatus;
  created_at: string;
};

const supabase = createClient();
const statusLabels: Record<CampaignStatus, string> = {
  draft: "Draf",
  active: "Aktif",
  paused: "Dijeda",
  completed: "Selesai",
};
const formatLabels = { banner: "Banner", native: "Terintegrasi", sponsor: "Sponsor" } as const;

function databaseErrorMessage(error: { code?: string; message: string }) {
  if (error.code === "42P01" || error.code === "PGRST205") {
    return "Tabel iklan belum tersedia. Jalankan supabase/ads-management.sql di Supabase SQL Editor.";
  }
  if (error.code === "42703" || error.code === "PGRST202") {
    return "Skema penargetan minat belum diterapkan. Jalankan supabase/reader-profiling.sql setelah supabase/ads-management.sql di Supabase SQL Editor, lalu muat ulang halaman.";
  }
  if (error.code === "42501" || error.code === "PGRST301") {
    return "Akses ditolak. Pastikan akun memiliki peran admin dan kebijakan database sudah diterapkan.";
  }
  return "Daftar iklan gagal dimuat. Periksa koneksi dan coba muat ulang halaman.";
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function AdsListPanel() {
  const [campaigns, setCampaigns] = useState<SponsorCampaign[]>([]);
  const [slots, setSlots] = useState<AdSlot[]>([]);
  const [comics, setComics] = useState<Comic[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CampaignStatus | "all">("all");
  const [slotStatusFilter, setSlotStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [activeTab, setActiveTab] = useState<AdsListTab>("campaigns");
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");
  const campaignsTabRef = useRef<HTMLButtonElement>(null);
  const slotsTabRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [campaignResult, slotResult, comicResult] = await Promise.all([
        supabase.from("sponsor_campaigns").select("id, sponsor_name, title, description, destination_url, slot_id, target_comic_id, target_placement, target_genres, starts_on, ends_on, status, created_at").order("created_at", { ascending: false }),
        supabase.from("ad_slots").select("id, name, slot_key, format, description, is_active, created_at").order("created_at", { ascending: false }),
        supabase.from("comics").select("id, title"),
      ]);
      if (cancelled) return;
      const error = campaignResult.error || slotResult.error || comicResult.error;
      if (error) {
        console.error("Unable to load ads list:", {
          code: error.code ?? "unknown",
          message: error.message,
          details: error.details ?? null,
          hint: error.hint ?? null,
        });
        setErrorMessage(databaseErrorMessage(error));
      } else {
        setCampaigns((campaignResult.data ?? []) as SponsorCampaign[]);
        setSlots((slotResult.data ?? []) as AdSlot[]);
        setComics((comicResult.data ?? []) as Comic[]);
      }
      setLoading(false);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return campaigns.filter((campaign) => {
      const matchesStatus = statusFilter === "all" || campaign.status === statusFilter;
      const slot = slots.find((item) => item.id === campaign.slot_id);
      const comic = comics.find((item) => item.id === campaign.target_comic_id);
      const matchesSearch = !query || [
        campaign.title,
        campaign.sponsor_name,
        campaign.description,
        slot?.name ?? "",
        comic?.title ?? "",
        ...campaign.target_genres.map(getComicGenreLabel),
      ].some((value) => value.toLocaleLowerCase("id-ID").includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [campaigns, comics, search, slots, statusFilter]);

  const filteredSlots = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("id-ID");
    return slots.filter((slot) => {
      const matchesStatus = slotStatusFilter === "all"
        || (slotStatusFilter === "active" ? slot.is_active : !slot.is_active);
      const matchesSearch = !query || [
        slot.name,
        slot.slot_key,
        slot.description,
        formatLabels[slot.format],
      ].some((value) => value.toLocaleLowerCase("id-ID").includes(query));
      return matchesStatus && matchesSearch;
    });
  }, [search, slotStatusFilter, slots]);

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextTab = event.key === "Home"
      ? "campaigns"
      : event.key === "End"
        ? "slots"
        : event.key === "ArrowRight"
          ? activeTab === "campaigns" ? "slots" : "campaigns"
          : activeTab === "campaigns" ? "slots" : "campaigns";
    setActiveTab(nextTab);
    (nextTab === "campaigns" ? campaignsTabRef : slotsTabRef).current?.focus();
  };

  if (loading) {
    return <div className="ads-panel-loading"><LoaderCircle className="spin" size={20} /> Memuat daftar iklan...</div>;
  }

  return (
    <div className="ads-list-panel">
      {errorMessage ? <p className="admin-settings-error" role="alert">{errorMessage}</p> : <>
        <div className="ads-list-tabs" role="tablist" aria-label="Jenis daftar iklan">
          <button ref={campaignsTabRef} id="ads-campaigns-tab" type="button" role="tab" aria-selected={activeTab === "campaigns"} aria-controls="ads-campaigns-panel" tabIndex={activeTab === "campaigns" ? 0 : -1} onClick={() => setActiveTab("campaigns")} onKeyDown={handleTabKeyDown}>
            Kampanye sponsor <span>{campaigns.length}</span>
          </button>
          <button ref={slotsTabRef} id="ads-slots-tab" type="button" role="tab" aria-selected={activeTab === "slots"} aria-controls="ads-slots-panel" tabIndex={activeTab === "slots" ? 0 : -1} onClick={() => setActiveTab("slots")} onKeyDown={handleTabKeyDown}>
            Slot iklan <span>{slots.length}</span>
          </button>
        </div>
        <div className="ads-list-toolbar">
          <label className="admin-search"><Search size={17} /><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder={activeTab === "campaigns" ? "Cari kampanye atau sponsor..." : "Cari nama, kode, atau format slot..."} aria-label={activeTab === "campaigns" ? "Cari kampanye atau sponsor" : "Cari slot iklan"} /></label>
          {activeTab === "campaigns"
            ? <label className="ads-list-status-filter"><span>Status</span><select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as CampaignStatus | "all")}><option value="all">Semua status</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
            : <label className="ads-list-status-filter"><span>Status</span><select value={slotStatusFilter} onChange={(event) => setSlotStatusFilter(event.target.value as "all" | "active" | "inactive")}><option value="all">Semua status</option><option value="active">Aktif</option><option value="inactive">Nonaktif</option></select></label>}
        </div>
        {activeTab === "campaigns" ? <section id="ads-campaigns-panel" role="tabpanel" aria-labelledby="ads-campaigns-tab" tabIndex={0}>
          <p className="ads-list-summary">Menampilkan {filteredCampaigns.length} dari {campaigns.length} kampanye</p>
          {filteredCampaigns.length ? <div className="request-table-wrap ads-list-table-wrap">
            <table className="request-table ads-list-table">
              <thead><tr><th>Kampanye</th><th>Sponsor</th><th>Slot</th><th>Periode</th><th>Status</th><th>Tujuan</th></tr></thead>
              <tbody>{filteredCampaigns.map((campaign) => {
                const slot = slots.find((item) => item.id === campaign.slot_id);
                const comic = comics.find((item) => item.id === campaign.target_comic_id);
                const statusClass = campaign.status === "active" ? "approved" : campaign.status === "draft" ? "pending" : "rejected";
                const placementLabel = campaign.target_placement === "comic_detail"
                  ? "Detail komik"
                  : campaign.target_placement === "reader"
                    ? "Halaman baca"
                    : campaign.target_placement === "episode_transition"
                      ? "Antar episode"
                    : campaign.target_placement === "both"
                      ? "Detail & baca"
                      : "Semua komik";
                return <tr key={campaign.id}>
                  <td><strong>{campaign.title}</strong>{campaign.description && <small>{campaign.description}</small>}{campaign.target_genres.length > 0 && <small>Minat: {campaign.target_genres.map(getComicGenreLabel).join(", ")}</small>}</td>
                  <td>{campaign.sponsor_name}</td>
                  <td>{comic ? <><strong>{comic.title}</strong><small>{placementLabel}</small></> : slot ? <><strong>{slot.name}</strong><small>{formatLabels[slot.format]}{slot.is_active ? "" : " · Nonaktif"}</small></> : <span className="ads-list-muted">Belum ditentukan</span>}</td>
                  <td>{formatDate(campaign.starts_on)}<small>s.d. {formatDate(campaign.ends_on)}</small></td>
                  <td><span className={`request-status request-${statusClass}`}>{statusLabels[campaign.status]}</span></td>
                  <td><a className="admin-action-link" href={campaign.destination_url} target="_blank" rel="noreferrer">Buka tautan ↗</a></td>
                </tr>;
              })}</tbody>
            </table>
          </div> : <div className="admin-empty ads-list-empty">
            <p>{campaigns.length ? "Tidak ada kampanye yang cocok dengan pencarian atau filter ini." : "Belum ada kampanye iklan atau sponsor."}</p>
            {!campaigns.length && <Link className="admin-action-link" href="/admin/ads-management">Buat kampanye pertama</Link>}
          </div>}
        </section> : <section id="ads-slots-panel" role="tabpanel" aria-labelledby="ads-slots-tab" tabIndex={0}>
          <p className="ads-list-summary">Menampilkan {filteredSlots.length} dari {slots.length} slot</p>
          {filteredSlots.length ? <div className="request-table-wrap ads-list-table-wrap">
            <table className="request-table ads-slots-table">
              <thead><tr><th>Nama slot</th><th>Kode</th><th>Format</th><th>Kampanye</th><th>Status</th></tr></thead>
              <tbody>{filteredSlots.map((slot) => {
                const linkedCampaigns = campaigns.filter((campaign) => campaign.slot_id === slot.id);
                return <tr key={slot.id}>
                  <td><strong>{slot.name}</strong>{slot.description && <small>{slot.description}</small>}</td>
                  <td><code>{slot.slot_key}</code></td>
                  <td>{formatLabels[slot.format]}</td>
                  <td>{linkedCampaigns.length ? linkedCampaigns.map((campaign) => campaign.title).join(", ") : <span className="ads-list-muted">Belum digunakan</span>}</td>
                  <td><span className={`request-status request-${slot.is_active ? "approved" : "rejected"}`}>{slot.is_active ? "Aktif" : "Nonaktif"}</span></td>
                </tr>;
              })}</tbody>
            </table>
          </div> : <div className="admin-empty ads-list-empty">
            <p>{slots.length ? "Tidak ada slot yang cocok dengan pencarian atau filter ini." : "Belum ada slot iklan yang dibuat."}</p>
            {!slots.length && <Link className="admin-action-link" href="/admin/ads-management">Buat slot iklan</Link>}
          </div>}
        </section>}
      </>}
    </div>
  );
}
