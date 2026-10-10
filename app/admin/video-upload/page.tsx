"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, Check, LoaderCircle, ShieldCheck, Trash2, Upload, Video } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Profile = {
  id: string;
  display_name: string;
  role: "reader" | "creator" | "admin";
};

type VideoUploader = {
  user_id: string;
  created_at: string;
};

const supabase = createClient();

export default function VideoUploadPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [authorized, setAuthorized] = useState(false);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [uploaders, setUploaders] = useState<VideoUploader[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const loadAccess = async () => {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) {
        console.error("Unable to verify video upload access:", userError);
        if (active) {
          setError("Akses akun belum dapat diverifikasi. Muat ulang halaman atau masuk kembali.");
          setLoading(false);
        }
        return;
      }
      if (!userData.user) {
        router.replace("/login");
        return;
      }

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userData.user.id)
        .maybeSingle();
      if (profileError) {
        console.error("Unable to load video uploader profile:", profileError);
        if (active) {
          setError("Profil akun belum dapat dimuat.");
          setLoading(false);
        }
        return;
      }

      const admin = profile?.role === "admin";
      const { data: canManage, error: accessError } = await supabase.rpc("can_manage_video_catalog");
      if (accessError) {
        console.error("Unable to check video catalog access:", accessError);
        if (active) {
          setError("Jalankan supabase/video-catalog.sql di Supabase SQL Editor sebelum menggunakan halaman ini.");
          setLoading(false);
        }
        return;
      }

      if (!active) return;
      setIsAdmin(admin);
      setAuthorized(canManage === true);
      setLoading(false);

      if (admin && canManage) {
        const [profileResult, uploaderResult] = await Promise.all([
          supabase.from("profiles").select("id, display_name, role").order("display_name"),
          supabase.from("video_uploaders").select("user_id, created_at").order("created_at", { ascending: false }),
        ]);
        const loadError = profileResult.error || uploaderResult.error;
        if (loadError) {
          console.error("Unable to load video uploader management data:", loadError);
          if (active) setError("Daftar akun atau izin upload tidak dapat dimuat.");
          return;
        }
        if (active) {
          setProfiles((profileResult.data ?? []) as Profile[]);
          setUploaders((uploaderResult.data ?? []) as VideoUploader[]);
        }
      }
    };

    void loadAccess();
    return () => {
      active = false;
    };
  }, [router]);

  const grantAccess = async () => {
    if (!selectedUserId || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    const { data: userData, error: userError } = await supabase.auth.getUser();
    if (userError || !userData.user) {
      console.error("Unable to verify admin before granting video access:", userError);
      setError("Sesi akun tidak valid. Masuk kembali sebelum mengubah akses.");
      setSaving(false);
      return;
    }

    const { error: insertError } = await supabase.from("video_uploaders").insert({
      user_id: selectedUserId,
      granted_by: userData.user.id,
    });
    if (insertError) {
      console.error("Unable to grant video upload access:", insertError);
      setError("Izin upload tidak berhasil diberikan.");
      setSaving(false);
      return;
    }

    const grantedAt = new Date().toISOString();
    setUploaders((current) => [{ user_id: selectedUserId, created_at: grantedAt }, ...current]);
    setSelectedUserId("");
    setMessage("Izin upload video berhasil diberikan.");
    setSaving(false);
  };

  const revokeAccess = async (userId: string) => {
    if (saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    const { error: deleteError } = await supabase.from("video_uploaders").delete().eq("user_id", userId);
    if (deleteError) {
      console.error("Unable to revoke video upload access:", deleteError);
      setError("Izin upload tidak berhasil dicabut.");
      setSaving(false);
      return;
    }
    setUploaders((current) => current.filter((uploader) => uploader.user_id !== userId));
    setMessage("Izin upload video berhasil dicabut.");
    setSaving(false);
  };

  if (loading) {
    return <main className="admin-shell"><div className="admin-main"><LoaderCircle className="spin" size={24} aria-label="Memeriksa akses upload" /></div></main>;
  }

  if (!authorized) {
    return (
      <main className="admin-shell"><div className="admin-main">
        <section className="admin-empty" role={error ? "alert" : "status"}>
          <ShieldCheck size={28} />
          <h1>{error ? "Akses belum tersedia" : "Akses upload dibatasi"}</h1>
          <p>{error || "Halaman upload video hanya dapat digunakan admin dan pengguna yang diberi izin."}</p>
          <Link className="button button-light" href="/account"><ArrowLeft size={16} /> Kembali ke akun</Link>
        </section>
      </div></main>
    );
  }

  const availableProfiles = profiles.filter((profile) =>
    profile.role !== "admin" && !uploaders.some((uploader) => uploader.user_id === profile.id),
  );

  return (
    <main className="admin-shell"><div className="admin-main">
      <header className="admin-header">
        <Link className="button button-light" href={isAdmin ? "/admin" : "/account"}><ArrowLeft size={16} /> Kembali</Link>
        <div><p className="eyebrow">Youvie · Studio</p><h1>Upload video drama</h1></div>
      </header>

      {error && <p className="admin-video-message admin-video-message-error" role="alert">{error}</p>}
      {message && <p className="admin-video-message" role="status"><Check size={16} /> {message}</p>}

      <section className="admin-empty" aria-labelledby="video-provider-title">
        <Video size={30} />
        <h2 id="video-provider-title">Pengaturan streaming belum dipilih</h2>
        <p>Struktur serial, season, dan episode disiapkan lewat <code>supabase/video-catalog.sql</code>. Upload berkas dan pemutaran video baru akan diaktifkan setelah layanan streaming diputuskan.</p>
        <p>Semua data katalog video dibatasi untuk admin dan pengguna yang mendapat izin upload.</p>
      </section>

      {isAdmin && (
        <section className="admin-management-section" aria-labelledby="video-uploaders-title">
          <div className="admin-section-heading">
            <div><p className="eyebrow">Akses terbatas</p><h2 id="video-uploaders-title">Admin dan pengunggah video</h2></div>
            <span>{uploaders.length} izin khusus</span>
          </div>
          <div className="admin-video-access-controls">
            <select aria-label="Pilih akun untuk diberi izin upload" value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)}>
              <option value="">Pilih akun…</option>
              {availableProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.display_name || "Tanpa nama"} · {profile.id.slice(0, 8)}</option>
              ))}
            </select>
            <button className="button button-dark" type="button" onClick={() => void grantAccess()} disabled={!selectedUserId || saving}>
              {saving ? <LoaderCircle className="animate-spin" size={16} /> : <Upload size={16} />} Beri izin upload
            </button>
          </div>
          {!uploaders.length ? (
            <p className="admin-empty">Belum ada pengguna dengan izin khusus. Semua admin tetap dapat mengelola katalog.</p>
          ) : (
            <div className="request-table-wrap">
              <table className="request-table">
                <thead><tr><th>Pengguna</th><th>Izin diberikan</th><th>Tindakan</th></tr></thead>
                <tbody>{uploaders.map((uploader) => {
                  const profile = profiles.find((item) => item.id === uploader.user_id);
                  return (
                    <tr key={uploader.user_id}>
                      <td><strong>{profile?.display_name || "Akun"}</strong><code>{uploader.user_id}</code></td>
                      <td>{new Date(uploader.created_at).toLocaleDateString("id-ID")}</td>
                      <td><button className="reject-button" type="button" onClick={() => void revokeAccess(uploader.user_id)} disabled={saving}><Trash2 size={15} /> Cabut izin</button></td>
                    </tr>
                  );
                })}</tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div></main>
  );
}
