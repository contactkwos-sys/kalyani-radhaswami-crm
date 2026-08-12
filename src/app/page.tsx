import { redirect } from "next/navigation";
import { getSessionUser, getCurrentProfile } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/role-login";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) {
    const profile = await getCurrentProfile();
    redirect(profile ? homeForRole(profile.role) : "/dashboard");
  }
  redirect("/login");
}
