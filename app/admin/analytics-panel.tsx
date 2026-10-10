"use client";

import { useEffect, useState } from "react";
import { BarChart3, LoaderCircle, Users, Eye, UserRound } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type DailyViews = { date: string; views: number };
type TopSeries = { seriesId: string; title: string; views: number };
type TopEpisode = { episodeId: string; seriesTitle: string; seasonNumber: number; episodeNumber: number; title: string; views: number };
type AnalyticsData = {
  views: number;
  uniqueVisitors: number;
  registeredViewers: number;
  daily: DailyViews[];
  topSeries: TopSeries[];
  topEpisodes: TopEpisode[];
};

const supabase = createClient();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAnalytics(value: unknown): AnalyticsData | null {
  if (!isRecord(value)
    || typeof value.views !== "number"
    || typeof value.uniqueVisitors !== "number"
    || typeof value.registeredViewers !== "number"
    || !Array.isArray(value.daily)
    || !Array.isArray(value.topSeries)
    || !Array.isArray(value.topEpisodes)) return null;

  const daily = value.daily.flatMap((row): DailyViews[] => (
    isRecord(row) && typeof row.date === "string" && typeof row.views === "number"
      ? [{ date: row.date, views: row.views }]
      : []
  ));
  const topSeries = value.topSeries.flatMap((row): TopSeries[] => (
    isRecord(row) && typeof row.seriesId === "string"
      && typeof row.title === "string" && typeof row.views === "number"
      ? [{ seriesId: row.seriesId, title: row.title, views: row.views }]
      : []
  ));
  const topEpisodes = value.topEpisodes.flatMap((row): TopEpisode[] => (
    isRecord(row) && typeof row.episodeId === "string" && typeof row.seriesTitle === "string"
      && typeof row.seasonNumber === "number" && typeof row.episodeNumber === "number"
      && typeof row.title === "string" && typeof row.views === "number"
      ? [{
        episodeId: row.episodeId,
        seriesTitle: row.seriesTitle,
        seasonNumber: row.seasonNumber,
        episodeNumber: row.episodeNumber,
        title: row.title,
        views: row.views,
      }]
      : []
  ));

  return {
    views: value.views,
    uniqueVisitors: value.uniqueVisitors,
    registeredViewers: value.registeredViewers,
    daily,
    topSeries,
    topEpisodes,
  };
}

function formatCount(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

export default function AdminAnalyticsPanel() {
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<{ days: number; analytics: AnalyticsData | null; errorMessage: string }>(
    { days: 0, analytics: null, errorMessage: "" },
  );

  useEffect(() => {
    let active = true;
    const loadAnalytics = async () => {
      try {
        const { data, error } = await supabase.rpc("admin_drama_analytics", { p_days: days });
        if (!active) return;
        if (error) {
          console.error("Unable to load admin analytics:", error);
          setResult({
            days,
            analytics: null,
            errorMessage: error.code === "PGRST202"
              ? "Jalankan supabase/drama-analytics.sql setelah supabase/video-catalog.sql di Supabase SQL Editor."
              : "Data analitik belum dapat dimuat. Coba muat ulang halaman.",
          });
        } else {
          const parsed = parseAnalytics(data);
          if (!parsed) {
            console.error("Admin analytics returned an invalid response.");
            setResult({ days, analytics: null, errorMessage: "Format data analitik tidak valid." });
          } else {
            setResult({ days, analytics: parsed, errorMessage: "" });
          }
        }
      } catch (error) {
        console.error("Unable to load admin analytics:", error);
        if (active) {
          setResult({ days, analytics: null, errorMessage: "Data analitik belum dapat dimuat. Periksa koneksi lalu coba lagi." });
        }
      }
    };
    void loadAnalytics();
    return () => { active = false; };
  }, [days]);

  const loading = result.days !== days;
  const analytics = loading ? null : result.analytics;
  const errorMessage = loading ? "" : result.errorMessage;
  const maxDailyViews = Math.max(1, ...(analytics?.daily.map((item) => item.views) ?? [0]));

  return (
    <section className="admin-analytics-section" id="analytics" aria-labelledby="admin-analytics-title">
      <div className="admin-section-heading">
        <div><p className="eyebrow">Penayangan drama</p><h2 id="admin-analytics-title">Analitik drama</h2></div>
        <label className="admin-analytics-range">Rentang
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Rentang analitik">
            <option value={7}>7 hari</option>
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
          </select>
        </label>
      </div>
      {errorMessage
        ? <p className="admin-analytics-message" role="alert">{errorMessage}</p>
        : loading || !analytics
          ? <div className="admin-analytics-loading"><LoaderCircle className="spin" size={20} /> Memuat analitik...</div>
          : (
            <>
              <div className="admin-analytics-stats">
                <article className="admin-stat"><span>Penayangan episode</span><strong>{formatCount(analytics.views)}</strong><Eye size={20} /></article>
                <article className="admin-stat"><span>Penonton unik*</span><strong>{formatCount(analytics.uniqueVisitors)}</strong><Users size={20} /></article>
                <article className="admin-stat"><span>Penonton login</span><strong>{formatCount(analytics.registeredViewers)}</strong><UserRound size={20} /></article>
              </div>
              <p className="admin-analytics-note">*Penonton unik dihitung berdasarkan kuki acak di peramban; dapat terhitung kembali setelah kuki dihapus atau pada peramban/perangkat lain. Satu episode dihitung maksimal sekali per penonton setiap 30 menit saat video mulai diputar.</p>
              <div className="admin-analytics-chart-panel">
                <div className="admin-analytics-subheading"><h3>Tren penayangan harian</h3><span><BarChart3 size={15} /> UTC</span></div>
                {analytics.daily.length === 0
                  ? <p className="admin-analytics-empty">Belum ada data penayangan pada rentang ini.</p>
                  : <div className="admin-analytics-chart" role="img" aria-label={`Grafik ${days} hari penayangan episode drama`}>
                    {analytics.daily.map((item, index) => {
                      const showLabel = days <= 30 || index % 7 === 0 || index === analytics.daily.length - 1;
                      const date = new Date(`${item.date}T00:00:00Z`);
                      return (
                        <div className="admin-analytics-day" key={item.date} title={`${date.toLocaleDateString("id-ID", { timeZone: "UTC" })}: ${formatCount(item.views)} penayangan`}>
                          <span className="admin-analytics-bar-wrap"><span className="admin-analytics-bar" style={{ height: `${Math.max(3, item.views / maxDailyViews * 100)}%` }} /></span>
                          {showLabel && <span className="admin-analytics-day-label">{date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "UTC" })}</span>}
                        </div>
                      );
                    })}
                  </div>}
              </div>
              <div className="admin-analytics-rankings">
                <section className="admin-analytics-list">
                  <h3>Serial drama teratas</h3>
                  {analytics.topSeries.length === 0
                    ? <p className="admin-analytics-empty">Belum ada data.</p>
                    : <ol>{analytics.topSeries.map((series) => <li key={series.seriesId}>
                      <Link href="/admin/drama">{series.title}</Link><strong>{formatCount(series.views)}</strong>
                    </li>)}</ol>}
                </section>
                <section className="admin-analytics-list">
                  <h3>Episode drama teratas</h3>
                  {analytics.topEpisodes.length === 0
                    ? <p className="admin-analytics-empty">Belum ada data.</p>
                    : <ol>{analytics.topEpisodes.map((episode) => <li key={episode.episodeId}>
                      <Link href="/admin/drama">
                        <span>{episode.seriesTitle}</span> · S{episode.seasonNumber} Ep. {episode.episodeNumber}: {episode.title}
                      </Link><strong>{formatCount(episode.views)}</strong>
                    </li>)}</ol>}
                </section>
              </div>
            </>
          )}
    </section>
  );
}
