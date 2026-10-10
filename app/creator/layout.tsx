import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ruang Kreator",
  robots: { index: false, follow: false },
};

export default function CreatorLayout({ children }: LayoutProps<"/creator">) {
  return children;
}
