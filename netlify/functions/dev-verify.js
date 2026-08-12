/**
 * Netlify Function: api/dev-verify.js
 * Compares against DEV_OVERRIDE_KEY which lives ONLY in Netlify environment
 * variables — never in the frontend bundle, never in the database.
 */
exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Not allowed" };
  }
  try {
    const { key } = JSON.parse(event.body || "{}");
    const expected = process.env.DEV_OVERRIDE_KEY; // set in Netlify site settings
    const ok = !!expected && key === expected;
    return {
      statusCode: ok ? 200 : 401,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok }),
    };
  } catch {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false }),
    };
  }
};
