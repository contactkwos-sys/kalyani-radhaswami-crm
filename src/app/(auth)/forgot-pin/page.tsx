import { BrandingFooter } from "@/components/branding/BrandingFooter";
import { ForgotPinForm } from "@/components/auth/ForgotPinForm";

export default function ForgotPinPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <div className="relative flex flex-1 items-center justify-center px-4 py-10">
        <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(15,106,90,0.12),transparent_45%),linear-gradient(320deg,rgba(28,36,48,0.08),transparent_40%)]" />
        <div className="relative w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--surface)]/95 p-8 shadow-[0_20px_60px_rgba(28,36,48,0.08)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Secure recovery
          </p>
          <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-semibold text-[var(--ink)]">
            Forgot PIN
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Kalyani Thread &amp; Radhaswami Thread
          </p>
          <div className="mt-6">
            <ForgotPinForm />
          </div>
        </div>
      </div>
      <BrandingFooter />
    </div>
  );
}
