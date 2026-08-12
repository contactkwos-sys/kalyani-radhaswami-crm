import { redirect } from "next/navigation";
import { BrandingFooter } from "@/components/branding/BrandingFooter";
import { RoleLoginForm } from "@/components/auth/RoleLoginForm";
import { getSessionUser, getCurrentProfile } from "@/lib/auth/session";
import { homeForRole } from "@/lib/auth/role-login";

export default async function LoginPage() {
  const user = await getSessionUser();
  if (user) {
    const profile = await getCurrentProfile();
    redirect(profile ? homeForRole(profile.role) : "/dashboard");
  }

  return (
    <div className="flex min-h-screen flex-col">
      <div className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,106,90,0.12),transparent_45%),linear-gradient(320deg,rgba(28,36,48,0.08),transparent_40%)]" />
        <div className="relative w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 p-8 shadow-[0_20px_60px_rgba(28,36,48,0.08)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Sales Force Management
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
            Kalyani · Radhaswami
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Select your role, then enter your PIN
          </p>
          <div className="mt-6">
            <RoleLoginForm />
          </div>
        </div>
      </div>
      <BrandingFooter />
    </div>
  );
}
