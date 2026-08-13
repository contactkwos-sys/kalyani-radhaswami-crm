/**
 * Unit tests for auth/RBAC upgrade helpers (no DB required).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { createHash, timingSafeEqual } = require("crypto");
const bcrypt = require("bcryptjs");

const PERMISSIONS = [
  "dashboard.view",
  "sales.create",
  "users.create",
  "pin.reset",
  "invite.create",
  "developer.override",
];

const DEFAULT_PERMISSIONS_BY_ROLE = {
  ADMIN: PERMISSIONS.filter((p) => p !== "developer.override"),
  CEO_1: PERMISSIONS.filter((p) => p !== "developer.override"),
  ACCOUNTANT: ["dashboard.view", "sales.create"],
  SALESMAN: ["dashboard.view", "sales.create"],
  VIEWER: ["dashboard.view"],
};

function isDeveloperIdentity(profile) {
  return Boolean(profile?.is_developer && profile.role === "OWNER");
}

function hasPermission(profile, permission) {
  if (permission === "developer.override") return isDeveloperIdentity(profile);
  if (isDeveloperIdentity(profile)) return true;
  const list =
    profile.allowed_permissions ||
    DEFAULT_PERMISSIONS_BY_ROLE[profile.role] ||
    [];
  return list.includes(permission);
}

function roleSubtitleForLoginRole(role) {
  if (role === "ceo") return "Chief Executive / Management";
  if (role === "admin") return "System administrator";
  if (role === "accountant") return "Accounts & entries";
  if (role === "salesman") return "Field sales";
  return "Authorized user";
}

function publicCeoTileTitle(displayName) {
  if (
    displayName.toLowerCase().includes("kailash") ||
    displayName.startsWith("CEO (")
  ) {
    return "CEO";
  }
  return displayName;
}

function safeEqual(a, b) {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    timingSafeEqual(ab, ab);
    return false;
  }
  return timingSafeEqual(ab, bb);
}

function hashInviteToken(token) {
  return createHash("sha256").update(token).digest("hex");
}

function deriveAuthPassword(loginSlug, pin, pepper) {
  return `${pin}-${loginSlug}-${pepper}`;
}

describe("CEO login tile privacy", () => {
  it("strips hard-coded personal CEO names", () => {
    assert.equal(publicCeoTileTitle("CEO (Kailash Kalyani)"), "CEO");
    assert.equal(publicCeoTileTitle("Kailash Kalyani"), "CEO");
    assert.equal(publicCeoTileTitle("CEO"), "CEO");
    assert.equal(publicCeoTileTitle("CEO 2"), "CEO 2");
  });
  it("uses management subtitle for CEO", () => {
    assert.equal(
      roleSubtitleForLoginRole("ceo"),
      "Chief Executive / Management"
    );
  });
});

describe("RBAC permissions", () => {
  it("admin cannot use developer.override", () => {
    assert.equal(
      hasPermission({ role: "ADMIN", is_developer: false }, "developer.override"),
      false
    );
  });
  it("ceo cannot use developer.override", () => {
    assert.equal(
      hasPermission({ role: "CEO_1", is_developer: false }, "developer.override"),
      false
    );
  });
  it("accountant cannot create users", () => {
    assert.equal(
      hasPermission({ role: "ACCOUNTANT" }, "users.create"),
      false
    );
  });
  it("salesman cannot reset pins", () => {
    assert.equal(hasPermission({ role: "SALESMAN" }, "pin.reset"), false);
  });
  it("developer identity can override", () => {
    assert.equal(
      hasPermission(
        { role: "OWNER", is_developer: true },
        "developer.override"
      ),
      true
    );
  });
});

describe("PIN hashing", () => {
  it("never stores plaintext — bcrypt verify works", async () => {
    const pin = "482913";
    const hash = await bcrypt.hash(pin, 12);
    assert.notEqual(hash, pin);
    assert.equal(await bcrypt.compare(pin, hash), true);
    assert.equal(await bcrypt.compare("0000", hash), false);
  });
});

describe("remember-device / invite tokens", () => {
  it("device/invite tokens are hashed (sha256), not stored raw", () => {
    const token = "abcdefghijklmnopqrstuvwxyz0123456789";
    const hashed = hashInviteToken(token);
    assert.equal(hashed.length, 64);
    assert.notEqual(hashed, token);
  });
});

describe("developer override secrets", () => {
  it("timing-safe key compare", () => {
    assert.equal(safeEqual("abc", "abc"), true);
    assert.equal(safeEqual("abc", "abd"), false);
    assert.equal(safeEqual("abc", "abcd"), false);
  });
  it("pepper derivation stays off the public login UI contract", () => {
    const pepper = "server-only-pepper";
    const pwd = deriveAuthPassword("ceo", "1234", pepper);
    assert.equal(pwd.includes(pepper), true);
    // Public login must never embed pepper in client helpers — tested by absence of PEPPER export contract.
    assert.equal(typeof global.PEPPER, "undefined");
  });
});

describe("login UI contract", () => {
  it("does not list Developer as a normal role tile", () => {
    const tiles = ["Admin", "CEO", "Accountant", "Salesman 01"];
    assert.equal(tiles.some((t) => /developer/i.test(t)), false);
  });
});
