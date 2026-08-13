/**
 * Netlify function: api/dev-verify
 * Timing-safe override key check. Optional mobile + bcrypt PIN hash.
 */
const { timingSafeEqual } = require("crypto");
const bcrypt = require("bcryptjs");

function safeEqual(a, b) {
  try {
    const ab = Buffer.from(String(a || ""), "utf8");
    const bb = Buffer.from(String(b || ""), "utf8");
    if (ab.length !== bb.length) {
      timingSafeEqual(ab, ab);
      return false;
    }
    return timingSafeEqual(ab, bb);
  } catch {
    return false;
  }
}

function normalizeMobile(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  return digits.length >= 10 ? digits.slice(-10) : null;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Not allowed" };
  }
  try {
    const body = JSON.parse(event.body || "{}");
    const expected =
      process.env.DEV_OVERRIDE_KEY || process.env.DEVELOPER_OVERRIDE_KEY || "";
    let ok = false;

    if (body.key && expected && safeEqual(body.key, expected)) ok = true;

    if (!ok && body.mobile && body.pin) {
      const configured = normalizeMobile(process.env.DEVELOPER_OVERRIDE_MOBILE || "");
      const hash = process.env.DEVELOPER_OVERRIDE_PIN_HASH || "";
      const mobile = normalizeMobile(body.mobile);
      if (
        configured &&
        hash &&
        mobile &&
        safeEqual(mobile, configured) &&
        (await bcrypt.compare(String(body.pin), hash))
      ) {
        ok = true;
      }
    }

    if (!expected && !process.env.DEVELOPER_OVERRIDE_PIN_HASH) {
      return {
        statusCode: 503,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ok: false,
          error: "DEV_OVERRIDE_KEY not configured on server",
        }),
      };
    }

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
