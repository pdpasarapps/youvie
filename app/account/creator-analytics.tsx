"use client";

import { useEffect, useState } from "react";
import { BarChart3, Eye, LoaderCircle, UserRound, Users } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type DailyViews = { date: string; views: number };
type TopComic = { comicId: string; slug: string; title: string; views: number };
type TopChapter = { chapterId: string; comicSlug: string; comicTitle: string; chapterNumber: number; title: string; views: number };
type AnalyticsData = {
  views: number;
  uniqueVisitors: number;
  registeredReaders: number;
  daily: DailyViews[];
  topComics: TopComic[];
  topChapters: TopChapter[];
};

const supabase = createClient();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function parseAnalytics(value: unknown): AnalyticsData | null {
  if (!isRecord(value)
    || typeof value.views !== "number"
    || typeof value.uniqueVisitors !== "number"
    || typeof value.registeredReaders !== "number"
    || !Array.isArray(value.daily)
    || !Array.isArray(value.topComics)
    || !Array.isArray(value.topChapters)) return null;

  const daily = value.daily.flatMap((row): DailyViews[] => (
    isRecord(row) && typeof row.date === "string" && typeof row.views === "number"
      ? [{ date: row.date, views: row.views }]
      : []
  ));
  const topComics = value.topComics.flatMap((row): TopComic[] => (
    isRecord(row) && typeof row.comicId === "string" && typeof row.slug === "string"
      && typeof row.title === "string" && typeof row.views === "number"
      ? [{ comicId: row.comicId, slug: row.slug, title: row.title, views: row.views }]
      : []
  ));
  const topChapters = value.topChapters.flatMap((row): TopChapter[] => (
    isRecord(row) && typeof row.chapterId === "string" && typeof row.comicSlug === "string"
      && typeof row.comicTitle === "string" && typeof row.chapterNumber === "number"
      && typeof row.title === "string" && typeof row.views === "number"
      ? [{
        chapterId: row.chapterId,
        comicSlug: row.comicSlug,
        comicTitle: row.comicTitle,
        chapterNumber: row.chapterNumber,
        title: row.title,
        views: row.views,
      }]
      : []
  ));

  return {
    views: value.views,
    uniqueVisitors: value.uniqueVisitors,
    registeredReaders: value.registeredReaders,
    daily,
    topComics,
    topChapters,
  };
}

function formatCount(value: number) {
  return new Intl.NumberFormat("id-ID").format(value);
}

export default function CreatorAnalytics() {
  const [days, setDays] = useState(7);
  const [result, setResult] = useState<{ days: number; analytics: AnalyticsData | null; errorMessage: string }>(
    { days: 0, analytics: null, errorMessage: "" },
  );

  useEffect(() => {
    let active = true;
    const loadAnalytics = async () => {
      const { data, error } = await supabase.rpc("creator_comic_analytics", { p_days: days });
      if (!active) return;
      if (error) {
        console.error("Unable to load creator comic analytics:", error);
        setResult({
          days,
          analytics: null,
          errorMessage: error.code === "PGRST202"
            ? "Analitik belum tersedia. Jalankan ulang supabase/comic-analytics.sql di Supabase SQL Editor."
            : "Data analitik belum dapat dimuat. Coba muat ulang halaman.",
        });
        return;
      }

      const analytics = parseAnalytics(data);
      if (!analytics) {
        console.error("Creator comic analytics returned an invalid response.", data);
        setResult({ days, analytics: null, errorMessage: "Format data analitik tidak valid." });
        return;
      }
      setResult({ days, analytics, errorMessage: "" });
    };
    void loadAnalytics().catch((error: unknown) => {
      console.error("Unable to load creator comic analytics:", error);
      if (active) setResult({ days, analytics: null, errorMessage: "Data analitik belum dapat dimuat. Periksa koneksi lalu coba lagi." });
    });
    return () => { active = false; };
  }, [days]);

  const loading = result.days !== days;
  const analytics = loading ? null : result.analytics;
  const errorMessage = loading ? "" : result.errorMessage;
  const maxDailyViews = Math.max(1, ...(analytics?.daily.map((item) => item.views) ?? [0]));

  return (
    <section className="creator-analytics-page" aria-labelledby="creator-analytics-title">
      <header className="creator-analytics-heading">
        <div>
          <p className="eyebrow">Performa ceritamu</p>
          <h1 id="creator-analytics-title">Analitik komik</h1>
          <p>Pantau pembaca dan episode yang paling banyak dibaca.</p>
        </div>
        <label className="admin-analytics-range">Rentang
          <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Rentang analitik">
            <option value={7}>7 hari</option>
            <option value={30}>30 hari</option>
            <option value={90}>90 hari</option>
          </select>
        </label>
      </header>
      {errorMessage
        ? <p className="admin-analytics-message" role="alert">{errorMessage}</p>
        : loading || !analytics
          ? <div className="admin-analytics-loading"><LoaderCircle className="spin" size={20} /> Memuat analitik...</div>
          : <>
              <div className="admin-analytics-stats">
                <article className="admin-stat"><span>Kunjungan episode</span><strong>{formatCount(analytics.views)}</strong><Eye size={20} /></article>
                <article className="admin-stat"><span>Pembaca unik*</span><strong>{formatCount(analytics.uniqueVisitors)}</strong><Users size={20} /></article>
                <article className="admin-stat"><span>Pembaca login</span><strong>{formatCount(analytics.registeredReaders)}</strong><UserRound size={20} /></article>
              </div>
              <p className="admin-analytics-note">*Pembaca unik dihitung berdasarkan kuki peramban. Satu episode dihitung maksimal sekali per pembaca setiap 30 menit.</p>
              <div className="admin-analytics-chart-panel">
                <div className="admin-analytics-subheading"><h3>Tren kunjungan harian</h3><span><BarChart3 size={15} /> UTC</span></div>
                {analytics.daily.every((item) => item.views === 0)
                  ? <p className="admin-analytics-empty">Belum ada kunjungan pada rentang ini.</p>
                  : <div className="admin-analytics-chart" role="img" aria-label={`Grafik ${days} hari kunjungan episode`}>
                      {analytics.daily.map((item, index) => {
                        const showLabel = days <= 30 || index % 7 === 0 || index === analytics.daily.length - 1;
                        const date = new Date(`${item.date}T00:00:00Z`);
                        return <div className="admin-analytics-day" key={item.date} title={`${date.toLocaleDateString("id-ID", { timeZone: "UTC" })}: ${formatCount(item.views)} kunjungan`}>
                          <span className="admin-analytics-bar-wrap"><span className="admin-analytics-bar" style={{ height: `${Math.max(3, item.views / maxDailyViews * 100)}%` }} /></span>
                          {showLabel && <span className="admin-analytics-day-label">{date.toLocaleDateString("id-ID", { day: "2-digit", month: "short", timeZone: "UTC" })}</span>}
                        </div>;
                      })}
                    </div>}
              </div>
              <div className="admin-analytics-rankings">
                <section className="admin-analytics-list">
                  <h3>Komik teratas</h3>
                  {analytics.topComics.length === 0 ? <p className="admin-analytics-empty">Belum ada data.</p> : <ol>{analytics.topComics.map((comic) => (
                    <li key={comic.comicId}><Link href={`/comic/${comic.slug}`}>{comic.title}</Link><strong>{formatCount(comic.views)}</strong></li>
                  ))}</ol>}
                </section>
                <section className="admin-analytics-list">
                  <h3>Episode teratas</h3>
                  {analytics.topChapters.length === 0 ? <p className="admin-analytics-empty">Belum ada data.</p> : <ol>{analytics.topChapters.map((chapter) => (
                    <li key={chapter.chapterId}><Link href={`/comic/${chapter.comicSlug}/chapter/${chapter.chapterId}`}><span>{chapter.comicTitle}</span> · Bab {chapter.chapterNumber}: {chapter.title}</Link><strong>{formatCount(chapter.views)}</strong></li>
                  ))}</ol>}
                </section>
              </div>
            </>}
    </section>
  );
}
