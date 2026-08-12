/**
 * Unit tests for role hierarchy + mobile normalization.
 * Run: node --test scripts/unit/roles-auth.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const ROLE_RANK = {
  OWNER: 100,
  CEO_1: 90,
  CEO_2: 80,
  CEO_3: 70,
  ADMIN: 60,
  SALES_MANAGER: 40,
  ACCOUNTANT: 30,
  SALESMAN: 20,
  VIEWER: 10,
};

const EXECUTIVE_ROLES = ["OWNER", "CEO_1", "CEO_2", "CEO_3", "ADMIN"];

function isExecutiveRole(role) {
  return EXECUTIVE_ROLES.includes(role);
}

function roleRank(role) {
  return ROLE_RANK[role] ?? 0;
}

function canManageTargetRole(actorRole, targetRole, opts = {}) {
  if (opts.sameUser) return true;
  if (opts.actorIsDeveloper && actorRole === "OWNER") return true;
  if (!isExecutiveRole(actorRole)) return false;
  if (actorRole === "OWNER") return true;
  return roleRank(actorRole) > roleRank(targetRole);
}

function canResetOtherUserPin(actorRole, targetRole, opts = {}) {
  if (!isExecutiveRole(actorRole)) return false;
  return canManageTargetRole(actorRole, targetRole, opts);
}

function normalizeMobile(input) {
  const digits = String(input || "").replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return digits;
  if (digits.length === 12 && digits.startsWith("91")) return digits.slice(2);
  if (digits.length >= 10 && digits.length <= 15) {
    if (digits.length > 10 && digits.endsWith(digits.slice(-10))) {
      const last10 = digits.slice(-10);
      if (last10.length === 10) return last10;
    }
    return digits;
  }
  return null;
}

describe("normalizeMobile", () => {
  it("accepts 10-digit local numbers", () => {
    assert.equal(normalizeMobile("9876543210"), "9876543210");
  });
  it("accepts +91 spaced format", () => {
    assert.equal(normalizeMobile("+91 9876543210"), "9876543210");
  });
  it("accepts +919876543210", () => {
    assert.equal(normalizeMobile("+919876543210"), "9876543210");
  });
  it("rejects short numbers", () => {
    assert.equal(normalizeMobile("12345"), null);
  });
});

describe("role hierarchy PIN reset", () => {
  it("blocks salesman from resetting anyone", () => {
    assert.equal(canResetOtherUserPin("SALESMAN", "SALESMAN"), false);
    assert.equal(canResetOtherUserPin("SALESMAN", "OWNER"), false);
  });
  it("allows CEO 1 to reset salesman but not Owner", () => {
    assert.equal(canResetOtherUserPin("CEO_1", "SALESMAN"), true);
    assert.equal(canResetOtherUserPin("CEO_1", "OWNER"), false);
    assert.equal(canResetOtherUserPin("CEO_1", "CEO_1"), false);
  });
  it("allows Owner/Developer to reset anyone", () => {
    assert.equal(canResetOtherUserPin("OWNER", "CEO_1"), true);
    assert.equal(
      canResetOtherUserPin("OWNER", "OWNER", { actorIsDeveloper: true }),
      true
    );
  });
  it("allows CEO 2 to reset ADMIN but not CEO 1", () => {
    assert.equal(canResetOtherUserPin("CEO_2", "ADMIN"), true);
    assert.equal(canResetOtherUserPin("CEO_2", "CEO_1"), false);
  });
});
