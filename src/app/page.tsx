import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth/session";
import { hasTrustedDeviceCookie } from "@/lib/auth/mobile-login";

export default async function HomePage() {
  const user = await getSessionUser();
  if (user) redirect("/dashboard");

  if (await hasTrustedDeviceCookie()) {
    redirect("/api/auth/device-restore");
  }

  redirect("/login");
}
