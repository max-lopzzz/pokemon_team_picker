import { describe, it, expect } from "vitest";
import { GEN1_TYPE_CHART, getGen1TypeEffectiveness } from "./gen1TypeChart";

describe("GEN1_TYPE_CHART", () => {
  it("has exactly the 15 Gen 1 types, no Dark/Steel/Fairy", () => {
    const types = Object.keys(GEN1_TYPE_CHART);
    expect(types).toHaveLength(15);
    expect(types).not.toContain("dark");
    expect(types).not.toContain("steel");
    expect(types).not.toContain("fairy");
    for (const attackingType of types) {
      expect(Object.keys(GEN1_TYPE_CHART[attackingType])).toHaveLength(15);
    }
  });

  it("applies the 5 documented Gen 1 historical deviations", () => {
    expect(getGen1TypeEffectiveness("ghost", "psychic")).toBe(0);
    expect(getGen1TypeEffectiveness("ghost", "ghost")).toBe(0);
    expect(getGen1TypeEffectiveness("bug", "poison")).toBe(2);
    expect(getGen1TypeEffectiveness("poison", "bug")).toBe(2);
    expect(getGen1TypeEffectiveness("ice", "poison")).toBe(1);
  });

  it("matches the modern chart for unchanged matchups", () => {
    expect(getGen1TypeEffectiveness("fire", "water")).toBe(0.5);
    expect(getGen1TypeEffectiveness("water", "fire")).toBe(2);
    expect(getGen1TypeEffectiveness("electric", "ground")).toBe(0);
    expect(getGen1TypeEffectiveness("normal", "ghost")).toBe(0);
    expect(getGen1TypeEffectiveness("fighting", "ghost")).toBe(0);
  });

  it("falls back to neutral for an unknown type pairing", () => {
    expect(getGen1TypeEffectiveness("nottype", "fire")).toBe(1);
  });
});
