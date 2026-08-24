import { describe, it, expect } from "vitest";
import { getGen23CritChance } from "./gen23Crit";

describe("getGen23CritChance", () => {
  it("Gen 2, non-high-crit-rate move: stage 0 = 17/256", () => {
    expect(getGen23CritChance(2, false)).toBeCloseTo(17 / 256);
  });

  it("Gen 3, non-high-crit-rate move: stage 0 = 1/16", () => {
    expect(getGen23CritChance(3, false)).toBeCloseTo(1 / 16);
  });

  it("Gen 2, high-crit-rate move: +2 stages from 0 = stage 2 = 1/4", () => {
    expect(getGen23CritChance(2, true)).toBeCloseTo(1 / 4);
  });

  it("Gen 3, high-crit-rate move: +1 stage from 0 = stage 1 = 1/8", () => {
    expect(getGen23CritChance(3, true)).toBeCloseTo(1 / 8);
  });

  it("the same highCritRate move has a different chance in Gen 2 vs Gen 3, proving the stage-increment (not just the base table) differs", () => {
    const gen2Chance = getGen23CritChance(2, true);
    const gen3Chance = getGen23CritChance(3, true);
    expect(gen2Chance).not.toBe(gen3Chance);
    expect(gen2Chance).toBeCloseTo(0.25);
    expect(gen3Chance).toBeCloseTo(0.125);
  });

  it("Gen 3, Gen 4, and Gen 5 all return identical values (they share one table), for both highCritRate states", () => {
    expect(getGen23CritChance(3, false)).toBe(getGen23CritChance(4, false));
    expect(getGen23CritChance(4, false)).toBe(getGen23CritChance(5, false));
    expect(getGen23CritChance(3, true)).toBe(getGen23CritChance(4, true));
    expect(getGen23CritChance(4, true)).toBe(getGen23CritChance(5, true));
  });

  it("Gen 4 and Gen 5 values match the known Gen 3 constants exactly", () => {
    expect(getGen23CritChance(4, false)).toBeCloseTo(1 / 16);
    expect(getGen23CritChance(5, false)).toBeCloseTo(1 / 16);
    expect(getGen23CritChance(4, true)).toBeCloseTo(1 / 8);
    expect(getGen23CritChance(5, true)).toBeCloseTo(1 / 8);
  });
});
