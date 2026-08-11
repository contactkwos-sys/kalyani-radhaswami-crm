import { BrandingFooter } from "@/components/branding/BrandingFooter";
import { LoginForm } from "@/components/auth/LoginForm";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,106,90,0.12),transparent_45%),linear-gradient(320deg,rgba(28,36,48,0.08),transparent_40%)]" />
        <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 p-8 shadow-[0_20px_60px_rgba(28,36,48,0.08)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Sales Force Management
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
            Kalyani Thread
            <span className="block text-2xl text-[var(--muted)]">
              &amp; Radhaswami Thread
            </span>
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Secure sign-in for owner, managers, salesmen and accountants.
          </p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
      </div>
      <BrandingFooter />
    </div>
  );
}
