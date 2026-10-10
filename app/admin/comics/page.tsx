import { redirect } from "next/navigation";

export default function LegacyComicsAdminPage(): never {
  redirect("/admin/drama");
}
