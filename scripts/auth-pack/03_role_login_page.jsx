import { RoleLoginForm } from "../../src/components/auth/RoleLoginForm";

/**
 * Reference login page (JSX pack). Live route: src/app/(auth)/login/page.tsx
 * Uses next/navigation App Router.
 */
export default function RoleLoginPage() {
  return (
    <main style={{ maxWidth: 520, margin: "40px auto", padding: 24 }}>
      <h1>Kalyani · Radhaswami</h1>
      <p>Select your role, then enter your PIN</p>
      <RoleLoginForm />
    </main>
  );
}
