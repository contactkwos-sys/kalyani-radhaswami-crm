"use client";

// ============================================================================
// 04_role_guard.jsx
// Wrap every protected page with <RequireRole role="salesman">...</RequireRole>.
// This is the CLIENT-SIDE convenience layer only — the real enforcement is
// the RLS policies in 01_supabase_schema.sql. Never rely on this component
// alone (this is exactly what broke CEO Mode before — see project notes).
// ============================================================================
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/browser";
import { getMyRole, ROLE_HOME, type LoginRole } from "@/lib/auth/auth-lib";

export default function RequireRole({
  role,
  children,
}: {
  role: LoginRole;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [status, setStatus] = useState<"checking" | "ok" | "denied">("checking"); // checking | ok | denied

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        router.replace("/login");
        return;
      }
      try {
        const myRole = await getMyRole();
        if (cancelled) return;
        if (myRole === role) {
          setStatus("ok");
        } else {
          // Logged in, but this isn't their page — bounce to their own home,
          // never show them someone else's screen even for a flash.
          router.replace(ROLE_HOME[myRole] || "/login");
        }
      } catch {
        router.replace("/login");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, [role, router]);

  if (status !== "ok") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8a8296",
        }}
      >
        Checking access…
      </div>
    );
  }

  return children;
}

// ----------------------------------------------------------------------------
// USAGE EXAMPLE — e.g. app/salesman/page.jsx
//
// import RequireRole from "@/components/auth/RequireRole";
//
// export default function SalesmanPage() {
//   return (
//     <RequireRole role="salesman">
//       <SalesmanDashboard />
//     </RequireRole>
//   );
// }
//
// Repeat for app/admin/page.jsx (role="admin"), app/ceo/page.jsx (role="ceo"),
// app/accountant/page.jsx (role="accountant"). Each role only ever lands on
// its own route — there is no shared "full app shell" anymore.
// ----------------------------------------------------------------------------
