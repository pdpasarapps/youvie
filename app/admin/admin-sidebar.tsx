"use client";

import {
  ArrowLeft,
  ChartNoAxesColumn,
  Clapperboard,
  ClipboardList,
  Image as ImageIcon,
  LayoutDashboard,
  List,
  Megaphone,
  ShieldCheck,
  Settings2,
  Users,
  Video,
} from "lucide-react";
import Link from "next/link";
import BrandLogo from "@/components/brand-logo";

type AdminSidebarProps = {
  activeSection: string;
};

export default function AdminSidebar({ activeSection }: AdminSidebarProps) {
  return (
    <>
      <aside className="admin-sidebar">
        <BrandLogo className="admin-brand" showName />
        <nav className="admin-sidebar-links" aria-label="Navigasi dashboard admin">
          <p className="admin-sidebar-label">Administrasi</p>
          <div className="admin-sidebar-group" aria-label="Dasbor">
            <p className="admin-sidebar-group-label">Dasbor</p>
            <Link href="/admin/overview" aria-current={activeSection === "overview" ? "page" : undefined}><LayoutDashboard size={18} /><span>Ringkasan</span></Link>
            <Link href="/admin/analytics" aria-current={activeSection === "analytics" ? "page" : undefined}><ChartNoAxesColumn size={18} /><span>Analitik drama</span></Link>
          </div>
          <div className="admin-sidebar-group" aria-label="Kelola konten">
            <p className="admin-sidebar-group-label">Kelola konten</p>
            <Link href="/admin/video-upload" aria-current={activeSection === "video-upload" ? "page" : undefined}><Video size={18} /><span>Upload video drama</span></Link>
            <Link href="/admin/users" aria-current={activeSection === "users" ? "page" : undefined}><Users size={18} /><span>Pengguna</span></Link>
            <Link href="/admin/drama" aria-current={activeSection === "drama" ? "page" : undefined}><Clapperboard size={18} /><span>Daftar drama</span></Link>
            <Link href="/admin/share-previews" aria-current={activeSection === "share-previews" ? "page" : undefined}><ImageIcon size={18} /><span>Pratinjau berbagi drama</span></Link>
            <Link href="/admin/homepage-promos" aria-current={activeSection === "homepage-promos" ? "page" : undefined}><ImageIcon size={18} /><span>Hero & promo beranda</span></Link>
          </div>
          <div className="admin-sidebar-group" aria-label="Manajemen iklan">
            <p className="admin-sidebar-group-label">Manajemen iklan</p>
            <Link href="/admin/sponsor-campaigns" aria-current={activeSection === "sponsor-campaigns" || activeSection === "ads-management" ? "page" : undefined}><Megaphone size={18} /><span>Kampanye sponsor drama</span></Link>
            <Link href="/admin/ad-requests" aria-current={activeSection === "ad-requests" ? "page" : undefined}><ClipboardList size={18} /><span>Pengajuan iklan drama</span></Link>
            <Link href="/admin/ad-slots" aria-current={activeSection === "ad-slots" || activeSection === "ads-list" ? "page" : undefined}><List size={18} /><span>Slot iklan drama</span></Link>
          </div>
          <div className="admin-sidebar-group" aria-label="Pengaturan">
            <p className="admin-sidebar-group-label">Pengaturan</p>
            <Link href="/admin/platform-settings" aria-current={activeSection === "platform-settings" ? "page" : undefined}><Settings2 size={18} /><span>Pengaturan platform</span></Link>
          </div>
        </nav>
        <div className="admin-sidebar-user">
          <span className="admin-user-avatar"><ShieldCheck size={18} /></span>
          <span><strong>Administrator</strong><small>Akses penuh</small></span>
          <Link href="/account" aria-label="Kembali ke Akun"><ArrowLeft size={17} /></Link>
        </div>
      </aside>
      <div className="admin-mobile-header">
        <BrandLogo showName />
        <Link className="admin-account-link" href="/account"><ArrowLeft size={16} /> Akun</Link>
      </div>
    </>
  );
}
