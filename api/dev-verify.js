/**
 * Netlify Function: verify DEV_OVERRIDE_KEY
 * Env: DEV_OVERRIDE_KEY
 */
const { timingSafeEqual } = require("crypto");

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ""));
  const bb = Buffer.from(String(b || ""));
  if (aa.length !== bb.length) return false;
  return timingSafeEqual(aa, bb);
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Method not allowed" }) };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const expected = process.env.DEV_OVERRIDE_KEY || "";
    if (!expected) {
      return {
        statusCode: 503,
        body: JSON.stringify({ error: "DEV_OVERRIDE_KEY not configured" }),
      };
    }
    if (!safeEqual(body.key, expected)) {
      return { statusCode: 401, body: JSON.stringify({ error: "Invalid key" }) };
    }
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (e) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: e.message || "Server error" }),
    };
  }
};
