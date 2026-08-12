/**
 * Read-only role dashboard preview for /__kwos_dev_console.
 * No auth session — visual check only.
 */
export default async function RolePreviewPage({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  const allowed = ["admin", "ceo", "accountant", "salesman"];
  const label = allowed.includes(role) ? role : "unknown";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f7f2e7",
        color: "#221a2e",
        fontFamily: "system-ui, sans-serif",
        padding: 24,
      }}
    >
      <p
        style={{
          fontSize: 11,
          letterSpacing: 1,
          fontWeight: 700,
          color: "#7c2142",
          textTransform: "uppercase",
        }}
      >
        Preview only · no session
      </p>
      <h1 style={{ fontSize: 28, fontWeight: 700, margin: "8px 0 4px" }}>
        Kalyani · Radhaswami
      </h1>
      <p style={{ color: "#8a8296", marginBottom: 24, textTransform: "capitalize" }}>
        {label} dashboard (diagnostic shell)
      </p>
      <div
        style={{
          border: "1px solid #e4dac4",
          borderRadius: 16,
          background: "#fff",
          padding: 20,
        }}
      >
        <h2 style={{ fontSize: 20, fontWeight: 700, textTransform: "capitalize" }}>
          {label} workspace
        </h2>
        <p style={{ marginTop: 8, color: "#666", fontSize: 14 }}>
          This is a read-only layout preview used by the hidden KWOS diagnostic
          console. It does not create a real login or touch app_users.
        </p>
        <ul style={{ marginTop: 16, paddingLeft: 18, color: "#444", fontSize: 14 }}>
          {label === "admin" && (
            <>
              <li>Users</li>
              <li>Company</li>
              <li>License</li>
              <li>Reports</li>
            </>
          )}
          {label === "ceo" && (
            <>
              <li>Dashboard</li>
              <li>Reports</li>
              <li>Users</li>
              <li>Alerts</li>
            </>
          )}
          {label === "accountant" && (
            <>
              <li>Sales</li>
              <li>Incentives</li>
              <li>Reports</li>
            </>
          )}
          {label === "salesman" && (
            <>
              <li>Today</li>
              <li>New sale</li>
              <li>Follow-ups</li>
              <li>Parties</li>
            </>
          )}
          {!allowed.includes(label) && <li>Unknown role</li>}
        </ul>
      </div>
    </div>
  );
}
