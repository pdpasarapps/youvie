import Image from "next/image";
import Link from "next/link";

type BrandLogoProps = {
  className?: string;
  linked?: boolean;
  showName?: boolean;
};

export default function BrandLogo({ className = "wordmark", linked = true, showName = false }: BrandLogoProps) {
  const logo = (
    <>
      <Image className="wordmark-image" src="/pwa/icon.svg" alt="Youvie" width={150} height={150} priority />
      {showName && <span className="wordmark-brand-name">Youvie</span>}
    </>
  );

  return linked
    ? <Link className={className} href="/" aria-label="Youvie - Beranda">{logo}</Link>
    : <span className={className}>{logo}</span>;
}
