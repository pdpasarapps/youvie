import { Camera, Mail, Music2 } from "lucide-react";

export default function PlatformLinks({ includeEmail = true }: { includeEmail?: boolean }) {
  return (
    <nav className="platform-links" aria-label="Media sosial dan kontak mu-komik">
      <a href="https://www.instagram.com/mu_komik/" target="_blank" rel="noreferrer"><Camera size={15} /> Instagram</a>
      <a href="https://www.tiktok.com/@mukomikz" target="_blank" rel="noreferrer"><Music2 size={15} /> TikTok</a>
      {includeEmail && <a href="mailto:mu.komiks.apps@gmail.com"><Mail size={15} /> Email</a>}
    </nav>
  );
}
