"use client";

import { useState, useSyncExternalStore, type FormEvent } from "react";
import { Eye, EyeOff, KeyRound, Laptop, Moon, Shield, Sun, Type } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const THEME_STORAGE_KEY = "mu-komik-theme";
const supabase = createClient();

type Theme = "light" | "dark";
type UiTextSize = "standard" | "large";

const getThemeSnapshot = (): Theme => document.documentElement.dataset.theme === "dark" ? "dark" : "light";
const getTextSizeSnapshot = (): UiTextSize => document.documentElement.dataset.uiTextSize === "large" ? "large" : "standard";
const subscribeToTheme = (onThemeChange: () => void) => {
  window.addEventListener("storage", onThemeChange);
  window.addEventListener("mu-komik-theme-change", onThemeChange);
  onThemeChange();
  return () => {
    window.removeEventListener("storage", onThemeChange);
    window.removeEventListener("mu-komik-theme-change", onThemeChange);
  };
};
const subscribeToTextSize = (onTextSizeChange: () => void) => {
  window.addEventListener("storage", onTextSizeChange);
  window.addEventListener("mu-komik-text-size-change", onTextSizeChange);
  onTextSizeChange();
  return () => {
    window.removeEventListener("storage", onTextSizeChange);
    window.removeEventListener("mu-komik-text-size-change", onTextSizeChange);
  };
};

export default function AccountSecuritySettings() {
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, () => "light");
  const textSize = useSyncExternalStore(subscribeToTextSize, getTextSizeSnapshot, () => "standard");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordFeedback, setPasswordFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [sendingResetEmail, setSendingResetEmail] = useState(false);
  const [resetEmailFeedback, setResetEmailFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const [signingOutOthers, setSigningOutOthers] = useState(false);
  const [sessionFeedback, setSessionFeedback] = useState<{ type: "error" | "success"; message: string } | null>(null);
  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  const changeTheme = (nextTheme: Theme) => {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
    document.documentElement.dataset.theme = nextTheme;
    window.dispatchEvent(new Event("mu-komik-theme-change"));
  };

  const changeTextSize = (nextTextSize: UiTextSize) => {
    window.localStorage.setItem("mu-komik-ui-text-size", nextTextSize);
    document.documentElement.dataset.uiTextSize = nextTextSize;
    window.dispatchEvent(new Event("mu-komik-text-size-change"));
  };

  const updatePassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPasswordFeedback(null);
    if (newPassword.length < 8) {
      setPasswordFeedback({ type: "error", message: "Kata sandi baru minimal 8 karakter." });
      return;
    }
    if (!currentPassword) {
      setPasswordFeedback({ type: "error", message: "Masukkan kata sandi saat ini untuk melanjutkan." });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordFeedback({ type: "error", message: "Konfirmasi kata sandi belum cocok." });
      return;
    }

    setSavingPassword(true);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.email) {
        if (userError) console.error("Unable to load account for password verification:", userError);
        setPasswordFeedback({ type: "error", message: "Sesi akun tidak dapat diverifikasi. Silakan masuk kembali." });
        return;
      }

      const { error: verificationError } = await supabase.auth.signInWithPassword({
        email: userData.user.email,
        password: currentPassword,
      });
      if (verificationError) {
        console.error("Current account password verification failed:", verificationError);
        setPasswordFeedback({
          type: "error",
          message: verificationError.code === "invalid_credentials" || verificationError.code === "invalid_login_credentials"
            ? "Kata sandi saat ini tidak sesuai."
            : "Kata sandi saat ini tidak dapat diverifikasi. Coba lagi.",
        });
        return;
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        console.error("Unable to update account password:", error);
        setPasswordFeedback({
          type: "error",
          message: error.code === "same_password"
            ? "Kata sandi baru harus berbeda dari kata sandi saat ini."
            : "Kata sandi gagal diperbarui. Coba lagi atau masuk kembali.",
        });
      } else {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setPasswordFeedback({ type: "success", message: "Kata sandi berhasil diperbarui." });
      }
    } catch (error) {
      console.error("Account password update request failed:", error);
      setPasswordFeedback({ type: "error", message: "Kata sandi gagal diperbarui. Periksa koneksi lalu coba lagi." });
    } finally {
      setSavingPassword(false);
    }
  };

  const sendPasswordResetEmail = async () => {
    setSendingResetEmail(true);
    setResetEmailFeedback(null);
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError || !userData.user?.email) {
        if (userError) console.error("Unable to load account email for password reset:", userError);
        setResetEmailFeedback({ type: "error", message: "Email akun tidak dapat diverifikasi. Silakan masuk kembali." });
        return;
      }

      const { error } = await supabase.auth.resetPasswordForEmail(userData.user.email, {
        redirectTo: `${window.location.origin}/account/reset-password`,
      });
      if (error) {
        console.error("Unable to send account password reset email:", error);
        setResetEmailFeedback({ type: "error", message: "Email reset kata sandi gagal dikirim. Coba lagi nanti." });
      } else {
        setResetEmailFeedback({ type: "success", message: `Tautan reset dikirim ke ${userData.user.email}. Periksa kotak masuk dan folder spam.` });
      }
    } catch (error) {
      console.error("Account password reset request failed:", error);
      setResetEmailFeedback({ type: "error", message: "Permintaan reset gagal. Periksa koneksi lalu coba lagi." });
    } finally {
      setSendingResetEmail(false);
    }
  };

  const signOutOtherSessions = async () => {
    setSigningOutOthers(true);
    setSessionFeedback(null);
    try {
      const { error } = await supabase.auth.signOut({ scope: "others" });
      if (error) {
        console.error("Unable to sign out other account sessions:", error);
        setSessionFeedback({ type: "error", message: "Sesi lain gagal dikeluarkan. Coba lagi." });
      } else {
        setSessionFeedback({ type: "success", message: "Sesi lain sudah dikeluarkan. Kamu tetap masuk di perangkat ini." });
      }
    } catch (error) {
      console.error("Other session sign-out request failed:", error);
      setSessionFeedback({ type: "error", message: "Sesi lain gagal dikeluarkan. Periksa koneksi lalu coba lagi." });
    } finally {
      setSigningOutOthers(false);
    }
  };

  return (
    <section className="account-extra-settings" aria-labelledby="account-extra-settings-title">
      <div className="reader-preferences-heading">
        <div>
          <p className="eyebrow">Tampilan dan keamanan</p>
          <h3 id="account-extra-settings-title">Pengaturan lainnya</h3>
        </div>
      </div>

      <div className="account-extra-setting">
        <div className="account-extra-setting-heading">
          <span className="account-extra-setting-icon"><Moon size={18} /></span>
          <div>
            <strong>Tema tampilan</strong>
            <small>Berlaku di seluruh MU Komik dan tersimpan di browser ini.</small>
          </div>
        </div>
        <div className="account-theme-options" role="group" aria-label="Pilih tema">
          <button type="button" aria-pressed={theme === "light"} className={theme === "light" ? "selected" : ""} onClick={() => changeTheme("light")}>
            <Sun size={16} /> Terang
          </button>
          <button type="button" aria-pressed={theme === "dark"} className={theme === "dark" ? "selected" : ""} onClick={() => changeTheme("dark")}>
            <Moon size={16} /> Gelap
          </button>
        </div>
      </div>

      <div className="account-extra-setting">
        <div className="account-extra-setting-heading">
          <span className="account-extra-setting-icon"><Type size={18} /></span>
          <div>
            <strong>Ukuran teks dan kontrol</strong>
            <small>Perbesar teks antarmuka dan tombol navigasi, terutama saat membaca di ponsel. Pengaturan tersimpan di browser ini.</small>
          </div>
        </div>
        <div className="account-theme-options" role="group" aria-label="Pilih ukuran teks dan kontrol">
          <button type="button" aria-pressed={textSize === "standard"} className={textSize === "standard" ? "selected" : ""} onClick={() => changeTextSize("standard")}>
            Standar
          </button>
          <button type="button" aria-pressed={textSize === "large"} className={textSize === "large" ? "selected" : ""} onClick={() => changeTextSize("large")}>
            Lebih besar
          </button>
        </div>
      </div>

      <form className="account-extra-setting account-password-form" onSubmit={(event) => void updatePassword(event)}>
        <div className="account-extra-setting-heading">
          <span className="account-extra-setting-icon"><KeyRound size={18} /></span>
          <div>
            <strong>Ganti kata sandi</strong>
            <small>Pilih kata sandi baru minimal 8 karakter yang belum pernah kamu pakai sebelumnya.</small>
          </div>
        </div>
        <div className="account-password-fields">
          <label>
            <span>Kata sandi saat ini</span>
            <span className="account-password-input-wrap">
              <input
                id="account-current-password"
                type={showCurrentPassword ? "text" : "password"}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setPasswordFeedback(null);
                }}
                disabled={savingPassword}
                required
              />
              <button
                className="account-password-visibility"
                type="button"
                aria-label={showCurrentPassword ? "Sembunyikan kata sandi saat ini" : "Tampilkan kata sandi saat ini"}
                aria-controls="account-current-password"
                onClick={() => setShowCurrentPassword((visible) => !visible)}
              >{showCurrentPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </span>
          </label>
          <label>
            <span>Kata sandi baru</span>
            <span className="account-password-input-wrap">
              <input
                id="account-new-password"
                type={showNewPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                value={newPassword}
                onChange={(event) => {
                  setNewPassword(event.target.value);
                  setPasswordFeedback(null);
                }}
                aria-describedby="account-new-password-hint"
                disabled={savingPassword}
                required
              />
              <button
                className="account-password-visibility"
                type="button"
                aria-label={showNewPassword ? "Sembunyikan kata sandi baru" : "Tampilkan kata sandi baru"}
                aria-controls="account-new-password"
                onClick={() => setShowNewPassword((visible) => !visible)}
              >{showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </span>
            <small id="account-new-password-hint">Minimal 8 karakter.</small>
          </label>
          <label>
            <span>Konfirmasi kata sandi baru</span>
            <span className="account-password-input-wrap">
              <input
                id="account-confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                autoComplete="new-password"
                minLength={8}
                value={confirmPassword}
                onChange={(event) => {
                  setConfirmPassword(event.target.value);
                  setPasswordFeedback(null);
                }}
                aria-describedby="account-confirm-password-hint"
                aria-invalid={passwordMismatch || undefined}
                disabled={savingPassword}
                required
              />
              <button
                className="account-password-visibility"
                type="button"
                aria-label={showConfirmPassword ? "Sembunyikan konfirmasi kata sandi" : "Tampilkan konfirmasi kata sandi"}
                aria-controls="account-confirm-password"
                onClick={() => setShowConfirmPassword((visible) => !visible)}
              >{showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </span>
            <small id="account-confirm-password-hint" className={passwordMismatch ? "account-password-mismatch" : ""} aria-live="polite">
              {passwordMismatch ? "Konfirmasi kata sandi belum cocok." : "Masukkan kembali kata sandi baru."}
            </small>
          </label>
        </div>
        {passwordFeedback && <p className={`account-security-message ${passwordFeedback.type}`} role={passwordFeedback.type === "error" ? "alert" : "status"}>{passwordFeedback.message}</p>}
        <button className="button button-dark account-security-button" type="submit" disabled={savingPassword}>
          {savingPassword ? "Memperbarui..." : "Perbarui kata sandi"}
        </button>
        <div className="account-password-reset">
          <button className="account-password-reset-link" type="button" onClick={() => void sendPasswordResetEmail()} disabled={sendingResetEmail}>
            {sendingResetEmail ? "Mengirim tautan..." : "Lupa kata sandi saat ini?"}
          </button>
          {resetEmailFeedback && <p className={`account-security-message ${resetEmailFeedback.type}`} role={resetEmailFeedback.type === "error" ? "alert" : "status"}>{resetEmailFeedback.message}</p>}
        </div>
      </form>

      <div className="account-extra-setting">
        <div className="account-extra-setting-heading">
          <span className="account-extra-setting-icon"><Shield size={18} /></span>
          <div>
            <strong>Sesi aktif</strong>
            <small>Keluar dari perangkat lain jika kamu tidak mengenali sesi tersebut.</small>
          </div>
        </div>
        {sessionFeedback && <p className={`account-security-message ${sessionFeedback.type}`} role={sessionFeedback.type === "error" ? "alert" : "status"}>{sessionFeedback.message}</p>}
        <button className="button button-light account-security-button" type="button" onClick={() => void signOutOtherSessions()} disabled={signingOutOthers}>
          <Laptop size={16} /> {signingOutOthers ? "Mengeluarkan sesi..." : "Keluar dari perangkat lain"}
        </button>
      </div>
    </section>
  );
}
