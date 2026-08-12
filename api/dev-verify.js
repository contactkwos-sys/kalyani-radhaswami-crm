/**
 * Netlify Function: api/dev-verify.js
 * Compares against DEV_OVERRIDE_KEY (or DEVELOPER_OVERRIDE_KEY) which lives ONLY
 * in Netlify environment variables — never in the frontend bundle, never in the database.
 */
exports.handler = async (event) => {
  const json = (statusCode, body) => ({
    statusCode,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (event.httpMethod !== "POST") {
    return json(405, { ok: false, error: "Not allowed" });
  }
  try {
    const { key } = JSON.parse(event.body || "{}");
    const expected =
      process.env.DEV_OVERRIDE_KEY || process.env.DEVELOPER_OVERRIDE_KEY;
    const ok = !!expected && typeof key === "string" && key === expected;
    return json(ok ? 200 : 401, { ok });
  } catch {
    return json(500, { ok: false });
  }
};
