/**
 * Unit tests for module defaults + developer display privacy.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const CRM_MODULES = [
  "dashboard",
  "sales",
  "parties",
  "users",
  "accounts",
  "security",
  "reports",
];

const DEFAULT_MODULES_BY_ROLE = {
  OWNER: [...CRM_MODULES],
  SALESMAN: ["dashboard", "sales", "parties", "reports"],
  ACCOUNTANT: ["dashboard", "sales", "accounts", "reports"],
};

function isDeveloperIdentity(profile) {
  return Boolean(profile?.is_developer && profile.role === "OWNER");
}

function displayProfileName(profile) {
  if (isDeveloperIdentity(profile)) return "System Administration";
  return profile.full_name;
}

function displayRoleLabel(profile) {
  if (isDeveloperIdentity(profile)) return "Administrator";
  return profile.role;
}

function isVisibleInUserManagement(user, viewerIsDeveloper) {
  if (viewerIsDeveloper) return true;
  if (isDeveloperIdentity(user)) return false;
  return true;
}

function hasModuleAccess(profile, module) {
  if (isDeveloperIdentity(profile)) return true;
  const mods = profile.allowed_modules || DEFAULT_MODULES_BY_ROLE[profile.role] || [];
  return mods.includes(module);
}

describe("developer display privacy", () => {
  it("masks developer personal name", () => {
    assert.equal(
      displayProfileName({
        full_name: "Secret Developer",
        role: "OWNER",
        is_developer: true,
      }),
      "System Administration"
    );
  });
  it("keeps business CEO name", () => {
    assert.equal(
      displayProfileName({
        full_name: "Kailash Kalyani",
        role: "OWNER",
        is_developer: false,
      }),
      "Kailash Kalyani"
    );
  });
  it("hides developer from normal user management", () => {
    assert.equal(
      isVisibleInUserManagement(
        { role: "OWNER", is_developer: true },
        false
      ),
      false
    );
    assert.equal(
      isVisibleInUserManagement(
        { role: "OWNER", is_developer: true },
        true
      ),
      true
    );
  });
  it("labels developer as Administrator", () => {
    assert.equal(
      displayRoleLabel({ role: "OWNER", is_developer: true }),
      "Administrator"
    );
  });
});

describe("module permissions", () => {
  it("blocks salesman from users module", () => {
    assert.equal(
      hasModuleAccess(
        { role: "SALESMAN", allowed_modules: DEFAULT_MODULES_BY_ROLE.SALESMAN },
        "users"
      ),
      false
    );
  });
  it("allows accountant accounts but not users", () => {
    const p = {
      role: "ACCOUNTANT",
      allowed_modules: DEFAULT_MODULES_BY_ROLE.ACCOUNTANT,
    };
    assert.equal(hasModuleAccess(p, "accounts"), true);
    assert.equal(hasModuleAccess(p, "users"), false);
  });
  it("gives developer all modules", () => {
    assert.equal(
      hasModuleAccess(
        { role: "OWNER", is_developer: true },
        "security"
      ),
      true
    );
  });
});
