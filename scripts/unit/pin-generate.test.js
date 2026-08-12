/**
 * Unit tests for temporary PIN generation helpers.
 * Run: node --test scripts/unit/pin-generate.test.js
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const { randomInt } = require("crypto");

const PIN_MIN_LEN = 4;
const PIN_MAX_LEN = 8;
const DEFAULT_GENERATED_PIN_LEN = 6;

function generateTemporaryPin(length = DEFAULT_GENERATED_PIN_LEN) {
  const len = Math.min(
    PIN_MAX_LEN,
    Math.max(PIN_MIN_LEN, Math.floor(length) || DEFAULT_GENERATED_PIN_LEN)
  );
  let pin = "";
  for (let i = 0; i < len; i += 1) {
    pin += String(randomInt(0, 10));
  }
  return pin;
}

function isValidPin(pin) {
  return /^[0-9]+$/.test(pin) && pin.length >= PIN_MIN_LEN && pin.length <= PIN_MAX_LEN;
}

describe("generateTemporaryPin", () => {
  it("defaults to 6 digits", () => {
    const pin = generateTemporaryPin();
    assert.equal(pin.length, 6);
    assert.equal(isValidPin(pin), true);
  });

  it("respects requested length within bounds", () => {
    assert.equal(generateTemporaryPin(4).length, 4);
    assert.equal(generateTemporaryPin(8).length, 8);
    assert.equal(generateTemporaryPin(2).length, 4);
    assert.equal(generateTemporaryPin(20).length, 8);
  });

  it("produces numeric-only values", () => {
    for (let i = 0; i < 20; i += 1) {
      assert.match(generateTemporaryPin(), /^[0-9]{6}$/);
    }
  });
});
