import { describe, it, expect } from "vitest";
import {
  validateLevel,
  validateIVs,
  validateEVs,
  validateNature,
  validateAbility,
  validateMoves,
} from "./rosterValidation";

describe("validateLevel", () => {
  it("accepts levels 1-100", () => {
    expect(validateLevel(1)).toBeNull();
    expect(validateLevel(100)).toBeNull();
    expect(validateLevel(50)).toBeNull();
  });

  it("rejects out-of-range or non-integer levels", () => {
    expect(validateLevel(0)).not.toBeNull();
    expect(validateLevel(101)).not.toBeNull();
    expect(validateLevel(50.5)).not.toBeNull();
  });
});

const validStats = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };

describe("validateIVs", () => {
  it("accepts all-31 IVs with no errors", () => {
    expect(validateIVs(validStats)).toEqual([]);
  });

  it("rejects an IV above 31", () => {
    const errors = validateIVs({ ...validStats, atk: 32 });
    expect(errors).toHaveLength(1);
    expect(errors[0].field).toBe("iv_atk");
  });

  it("rejects a negative IV", () => {
    const errors = validateIVs({ ...validStats, spe: -1 });
    expect(errors.some((e) => e.field === "iv_spe")).toBe(true);
  });
});

describe("validateEVs", () => {
  it("accepts all-zero EVs with no errors", () => {
    expect(
      validateEVs({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 })
    ).toEqual([]);
  });

  it("rejects a single EV above 252", () => {
    const errors = validateEVs({ hp: 0, atk: 253, def: 0, spa: 0, spd: 0, spe: 0 });
    expect(errors.some((e) => e.field === "ev_atk")).toBe(true);
  });

  it("rejects a total EV sum above 510", () => {
    const errors = validateEVs({ hp: 252, atk: 252, def: 6, spa: 1, spd: 0, spe: 0 });
    expect(errors.some((e) => e.field === "evs")).toBe(true);
  });

  it("accepts a total EV sum of exactly 510", () => {
    const errors = validateEVs({ hp: 252, atk: 252, def: 6, spa: 0, spd: 0, spe: 0 });
    expect(errors).toEqual([]);
  });
});

describe("validateNature", () => {
  it("accepts a nature in the valid list", () => {
    expect(validateNature("Adamant", ["Adamant", "Hardy"])).toBeNull();
  });

  it("rejects a nature not in the valid list", () => {
    expect(validateNature("NotANature", ["Adamant", "Hardy"])).not.toBeNull();
  });
});

describe("validateAbility", () => {
  it("accepts an ability in the species' list", () => {
    expect(validateAbility("Sturdy", ["Sturdy", "Sand Veil"])).toBeNull();
  });

  it("rejects an ability not in the species' list", () => {
    expect(validateAbility("Levitate", ["Sturdy", "Sand Veil"])).not.toBeNull();
  });
});

describe("validateMoves", () => {
  it("accepts up to 4 moves all within the learnable pool", () => {
    expect(
      validateMoves(["Tackle", "Defense Curl"], ["Tackle", "Defense Curl", "Rock Throw"])
    ).toEqual([]);
  });

  it("rejects more than 4 moves", () => {
    const errors = validateMoves(["A", "B", "C", "D", "E"], ["A", "B", "C", "D", "E"]);
    expect(
      errors.some((e) => e.field === "moves" && e.message.includes("at most 4"))
    ).toBe(true);
  });

  it("rejects a move not in the learnable pool", () => {
    const errors = validateMoves(["Hyper Beam"], ["Tackle"]);
    expect(errors.some((e) => e.field === "moves")).toBe(true);
  });
});
