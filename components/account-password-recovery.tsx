"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { ArrowLeft, KeyRound, LoaderCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const supabase = createClient();
const RECOVERY_SESSION_KEY = "mu-komik-password-recovery";

export default function AccountPasswordRecovery() {
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const mismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" && session?.user) {
        window.sessionStorage.setItem(RECOVERY_SESSION_KEY, "true");
        setStatus("ready");
      }
    });

    let active = true;
    const verifyRecoverySession = async () => {
      if (window.sessionStorage.getItem(RECOVERY_SESSION_KEY) !== "true") return;
      const { data, error } = await supabase.auth.getUser();
      if (!active) return;
      if (error) {
        console.error("Unable to verify password recovery session:", error);
        window.sessionStorage.removeItem(RECOVERY_SESSION_KEY);
        setStatus("invalid");
        return;
      }
      setStatus(data.user ? "ready" : "invalid");
      if (!data.user) window.sessionStorage.removeItem(RECOVERY_SESSION_KEY);
    };
    void verifyRecoverySession();
    const timeout = window.setTimeout(() => {
      if (active) setStatus((current) => current === "checking" ? "invalid" : current);
    }, 8000);

    return () => {
      active = false;
      window.clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFeedback(null);
    if (newPassword.length < 8) {
      setFeedback({ type: "error", message: "Kata sandi baru minimal 8 karakter." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setFeedback({ type: "error", message: "Konfirmasi kata sandi belum cocok." });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        console.error("Unable to update password from recovery link:", error);
        setFeedback({
          type: "error",
          message: error.code === "same_password"
            ? "Kata sandi baru harus berbeda dari kata sandi sebelumnya."
            : "Kata sandi gagal diperbarui. Minta tautan reset baru lalu coba lagi.",
        });
      } else {
        window.sessionStorage.removeItem(RECOVERY_SESSION_KEY);
        setNewPassword("");
        setConfirmPassword("");
        setUpdated(true);
        setFeedback({ type: "success", message: "Kata sandi berhasil diperbarui." });
      }
    } catch (error) {
      console.error("Password recovery update request failed:", error);
      setFeedback({ type: "error", message: "Kata sandi gagal diperbarui. Periksa koneksi lalu coba lagi." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="auth-shell account-password-recovery-shell">
      <Link className="auth-back" href="/login"><ArrowLeft size={16} /> Kembali ke masuk</Link>
      <section className="auth-card account-password-recovery-card">
        <div className="auth-card-top"><span className="auth-icon"><KeyRound size={19} /></span><span>Keamanan akun</span></div>
        <h1>Atur ulang kata sandi</h1>
        {status === "checking" && <p className="auth-subtitle" role="status"><LoaderCircle className="spin" size={16} /> Memverifikasi tautan reset...</p>}
        {status === "invalid" && (
          <div className="account-password-recovery-state">
            <p className="form-error" role="alert">Tautan reset tidak valid atau sudah kedaluwarsa. Minta tautan baru dari pengaturan akun.</p>
            <Link className="button button-dark auth-submit" href="/login">Kembali ke masuk</Link>
          </div>
        )}
        {status === "ready" && !updated && (
          <>
            <p className="auth-subtitle">Buat kata sandi baru minimal 8 karakter.</p>
            <form className="auth-form" onSubmit={(event) => void updatePassword(event)}>
              <label>
                <span>Kata sandi baru</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  required
                />
              </label>
              <label>
                <span>Konfirmasi kata sandi baru</span>
                <input
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  aria-invalid={mismatch || undefined}
                  required
                />
                <small className={mismatch ? "account-password-mismatch" : ""} aria-live="polite">
                  {mismatch ? "Konfirmasi kata sandi belum cocok." : "Masukkan kembali kata sandi baru."}
                </small>
              </label>
              {feedback && <p className={feedback.type === "error" ? "form-error" : "form-message"} role={feedback.type === "error" ? "alert" : "status"}>{feedback.message}</p>}
              <button className="button button-dark auth-submit" type="submit" disabled={saving}>
                {saving ? "Memperbarui..." : "Simpan kata sandi baru"}
              </button>
            </form>
          </>
        )}
        {updated && (
          <div className="account-password-recovery-state">
            <p className="form-message" role="status">{feedback?.message}</p>
            <Link className="button button-dark auth-submit" href="/account/account-settings">Kembali ke pengaturan akun</Link>
          </div>
        )}
      </section>
    </main>
  );
}
