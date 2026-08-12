import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentProfile } from "@/lib/auth/session";
import { listAuditLogs } from "@/lib/security/user-admin";

export default async function AuditLogsPage() {
  const profile = await getCurrentProfile();
  if (!profile) redirect("/login");
  if (!["OWNER","CEO_1","CEO_2","CEO_3","ADMIN"].includes(profile.role)) {
    redirect("/dashboard");
  }

  const logs = await listAuditLogs({ limit: 150 });

  return (
    <div className="space-y-6">
      <div>
        <Link
          href="/settings/users"
          className="text-sm text-[var(--accent)] hover:underline"
        >
          ← User Management
        </Link>
        <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-[var(--accent)]">
          Settings → Security / Audit
        </p>
        <h2 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
          Audit logs
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          PIN values and override secrets are never stored in these logs.
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="min-w-full text-left text-sm">
          <thead className="text-xs uppercase text-[var(--muted)]">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Module</th>
              <th className="px-4 py-3">Target / meta</th>
              <th className="px-4 py-3">IP / device</th>
              <th className="px-4 py-3">Result</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => {
              const meta = (log.metadata || {}) as Record<string, unknown>;
              const success =
                meta.success === undefined
                  ? "—"
                  : meta.success
                    ? "OK"
                    : "FAIL";
              return (
                <tr key={log.id} className="border-t border-[var(--border)] align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">
                    {log.user_id ? String(log.user_id).slice(0, 8) : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium">{log.action}</td>
                  <td className="px-4 py-3">{log.module}</td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)] max-w-xs break-words">
                    {meta.target_user
                      ? `user:${String(meta.target_user).slice(0, 8)} `
                      : ""}
                    {meta.operation ? `op:${String(meta.operation)} ` : ""}
                    {meta.reason ? `reason:${String(meta.reason)}` : ""}
                  </td>
                  <td className="px-4 py-3 text-xs text-[var(--muted)]">
                    {log.ip_address || "—"}
                    {log.user_agent ? (
                      <span className="block truncate max-w-[12rem]">
                        {log.user_agent}
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">{success}</td>
                </tr>
              );
            })}
            {logs.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-[var(--muted)]" colSpan={7}>
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
