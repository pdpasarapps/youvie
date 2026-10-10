import type { Metadata } from "next";
import AccountMobileNavigation from "./mobile-navigation";

export const metadata: Metadata = {
  title: "Akun",
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: LayoutProps<"/account">) {
  return (
    <>
      {children}
      <AccountMobileNavigation />
    </>
  );
}
