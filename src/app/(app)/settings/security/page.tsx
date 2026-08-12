import { redirect } from "next/navigation";

/** Owner/Developer Access removed from CEO Settings → Security. */
export default function SecuritySettingsPage() {
  redirect("/dashboard");
}
