import { notFound, redirect } from "next/navigation";
import AccountContent, { type AccountSection } from "../account-content";

const accountSections = [
  "watching",
  "favorites",
  "account-settings",
] as const satisfies readonly AccountSection[];

export default async function AccountSectionPage({
  params,
}: PageProps<"/account/[section]">) {
  const { section: requestedSection } = await params;
  if (requestedSection === "reading") redirect("/account/watching");
  const section = accountSections.find((candidate) => candidate === requestedSection);
  if (!section) notFound();

  return <AccountContent section={section} />;
}
