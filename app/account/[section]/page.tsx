import { notFound } from "next/navigation";
import AccountContent, { type AccountSection } from "../account-content";

const accountSections = [
  "reading",
  "favorites",
  "account-settings",
  "creator-application",
  "creator-profile",
  "creator-guide",
  "creator",
  "komiku",
  "terbitkan-komik",
  "analitik-komik",
] as const satisfies readonly AccountSection[];

export default async function AccountSectionPage({
  params,
}: PageProps<"/account/[section]">) {
  const { section: requestedSection } = await params;
  const section = accountSections.find((candidate) => candidate === requestedSection);
  if (!section) notFound();

  return <AccountContent section={section} />;
}
