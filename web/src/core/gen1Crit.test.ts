import { describe, it, expect } from "vitest";
import { getGen1CritChance } from "./gen1Crit";

describe("getGen1CritChance", () => {
  it("computes the normal-move threshold as floor(baseSpeed/2)/256", () => {
    expect(getGen1CritChance(100, false)).toBeCloseTo(50 / 256);
    expect(getGen1CritChance(45, false)).toBeCloseTo(22 / 256);
    expect(getGen1CritChance(15, false)).toBeCloseTo(7 / 256);
  });

  it("multiplies the threshold by 8 for high-crit-rate moves, capped at 255/256", () => {
    expect(getGen1CritChance(100, true)).toBeCloseTo(255 / 256); // min(50*8, 255) = 255 (capped)
    expect(getGen1CritChance(15, true)).toBeCloseTo(56 / 256); // min(7*8, 255) = 56 (not capped)
  });
});
