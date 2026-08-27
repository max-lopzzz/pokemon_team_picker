import { describe, it, expect } from "vitest";
import { GEN23_TYPE_CHART, getGen23TypeEffectiveness } from "./gen23TypeChart";

describe("GEN23_TYPE_CHART", () => {
  it("has exactly the 17 Gen 2-3 types (Dark/Steel included, no Fairy)", () => {
    const types = Object.keys(GEN23_TYPE_CHART);
    expect(types).toHaveLength(17);
    expect(types).toContain("dark");
    expect(types).toContain("steel");
    expect(types).not.toContain("fairy");
    for (const attackingType of types) {
      expect(Object.keys(GEN23_TYPE_CHART[attackingType])).toHaveLength(17);
    }
  });

  it("applies the documented historical deviation: Ghost and Dark are not-very-effective against Steel", () => {
    expect(getGen23TypeEffectiveness("ghost", "steel")).toBe(0.5);
    expect(getGen23TypeEffectiveness("dark", "steel")).toBe(0.5);
  });

  it("does NOT nerf Steel's own offensive moves against Ghost/Dark (a common keying mistake)", () => {
    expect(getGen23TypeEffectiveness("steel", "ghost")).toBe(1);
    expect(getGen23TypeEffectiveness("steel", "dark")).toBe(1);
  });

  it("matches the modern chart for unchanged matchups, including other Steel matchups", () => {
    expect(getGen23TypeEffectiveness("fire", "water")).toBe(0.5);
    expect(getGen23TypeEffectiveness("water", "fire")).toBe(2);
    expect(getGen23TypeEffectiveness("electric", "ground")).toBe(0);
    expect(getGen23TypeEffectiveness("steel", "ice")).toBe(2);
    expect(getGen23TypeEffectiveness("fighting", "steel")).toBe(2);
  });

  it("falls back to neutral for an unknown type pairing", () => {
    expect(getGen23TypeEffectiveness("nottype", "fire")).toBe(1);
  });
});
