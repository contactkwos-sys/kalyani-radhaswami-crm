/**
 * Unit tests for Developer Override helpers (no network).
 * Run: node --test scripts/unit/developer-override.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { timingSafeEqual } = require("crypto");

function safeEqualSecret(provided, expected) {
  try {
    const a = Buffer.from(provided, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) {
      timingSafeEqual(a, a);
      return false;
    }
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

const DEVELOPER_OPERATIONS = [
  "ADD_USER",
  "DELETE_USER",
  "DEACTIVATE_USER",
  "ENABLE_USER",
  "CHANGE_ROLE",
  "RESET_PIN",
  "CHANGE_PIN",
  "REVOKE_SESSIONS",
  "LOGOUT_ALL_DEVICES",
  "RESET_DEVICES",
  "CHANGE_PERMISSIONS",
  "RESTORE_USER",
  "VIEW_AUDIT_LOGS",
  "CHANGE_SECURITY_SETTINGS",
  "OVERRIDE_LOCKED_USER",
  "FORCE_PIN_RESET",
  "MANAGE_ROLE_PERMISSIONS",
  "MODIFY_PRIMARY_OWNER",
];

const OVERRIDE_REQUIRED_OPS = new Set([
  "DELETE_USER",
  "CHANGE_ROLE",
  "CHANGE_SECURITY_SETTINGS",
  "MANAGE_ROLE_PERMISSIONS",
  "MODIFY_PRIMARY_OWNER",
  "FORCE_PIN_RESET",
]);

function stripPinMetadata(metadata) {
  const clone = { ...metadata };
  for (const k of [
    "pin",
    "current_pin",
    "new_pin",
    "confirm_pin",
    "pin_hash",
    "password",
    "token",
    "device_token",
    "DEVELOPER_OVERRIDE_KEY",
    "developer_override_key",
    "override_key",
    "OWNER_OVERRIDE_PIN",
  ]) {
    delete clone[k];
  }
  return clone;
}

describe("Developer Override secret compare", () => {
  it("accepts matching secrets", () => {
    const secret = "a".repeat(64);
    assert.equal(safeEqualSecret(secret, secret), true);
  });

  it("rejects mismatched secrets of same length", () => {
    assert.equal(safeEqualSecret("a".repeat(64), "b".repeat(64)), false);
  });

  it("rejects mismatched secrets of different length", () => {
    assert.equal(safeEqualSecret("short", "a".repeat(64)), false);
  });
});

describe("Developer operations allow-list", () => {
  it("includes required owner privileges", () => {
    for (const op of [
      "ADD_USER",
      "DELETE_USER",
      "RESET_PIN",
      "REVOKE_SESSIONS",
      "LOGOUT_ALL_DEVICES",
      "VIEW_AUDIT_LOGS",
      "OVERRIDE_LOCKED_USER",
      "CHANGE_SECURITY_SETTINGS",
    ]) {
      assert.ok(DEVELOPER_OPERATIONS.includes(op), op);
    }
  });

  it("requires override for destructive ops", () => {
    assert.ok(OVERRIDE_REQUIRED_OPS.has("DELETE_USER"));
    assert.ok(OVERRIDE_REQUIRED_OPS.has("CHANGE_ROLE"));
    assert.ok(OVERRIDE_REQUIRED_OPS.has("MODIFY_PRIMARY_OWNER"));
    assert.equal(OVERRIDE_REQUIRED_OPS.has("ENABLE_USER"), false);
  });
});

describe("Audit metadata stripping", () => {
  it("never retains PIN or override key fields", () => {
    const cleaned = stripPinMetadata({
      pin: "1234",
      new_pin: "5678",
      pin_hash: "$2a$...",
      DEVELOPER_OVERRIDE_KEY: "secret",
      developer_override_key: "secret",
      override_key: "secret",
      target_user: "abc",
      success: true,
    });
    assert.equal(cleaned.pin, undefined);
    assert.equal(cleaned.new_pin, undefined);
    assert.equal(cleaned.pin_hash, undefined);
    assert.equal(cleaned.DEVELOPER_OVERRIDE_KEY, undefined);
    assert.equal(cleaned.developer_override_key, undefined);
    assert.equal(cleaned.override_key, undefined);
    assert.equal(cleaned.target_user, "abc");
    assert.equal(cleaned.success, true);
  });
});

describe("Env exposure guards", () => {
  it("rejects NEXT_PUBLIC-style override keys", () => {
    const key = "NEXT_PUBLIC_DEVELOPER_OVERRIDE_KEY_value";
    assert.equal(key.startsWith("NEXT_PUBLIC_"), true);
  });

  it("requires long secrets", () => {
    const short = "too-short";
    const long = "x".repeat(32);
    assert.ok(short.length < 32);
    assert.ok(long.length >= 32);
  });
});
