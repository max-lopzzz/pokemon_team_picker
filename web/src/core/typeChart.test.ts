import { describe, it, expect } from "vitest";
import { TYPE_CHART, getTypeEffectiveness } from "./typeChart";

describe("TYPE_CHART", () => {
  it("has all 18 types as both attacking and defending keys, all lowercase", () => {
    const types = Object.keys(TYPE_CHART);
    expect(types).toHaveLength(18);
    for (const t of types) {
      expect(t).toBe(t.toLowerCase());
    }
    for (const attackingType of types) {
      expect(Object.keys(TYPE_CHART[attackingType])).toHaveLength(18);
    }
  });

  it("matches known type-effectiveness values", () => {
    expect(getTypeEffectiveness("fire", "water")).toBe(0.5);
    expect(getTypeEffectiveness("water", "fire")).toBe(2);
    expect(getTypeEffectiveness("electric", "ground")).toBe(0);
    expect(getTypeEffectiveness("ghost", "normal")).toBe(0);
    expect(getTypeEffectiveness("dragon", "fairy")).toBe(0);
    expect(getTypeEffectiveness("steel", "steel")).toBe(0.5);
    expect(getTypeEffectiveness("fighting", "fairy")).toBe(0.5);
    expect(getTypeEffectiveness("grass", "fire")).toBe(0.5);
  });

  it("confirms the modern (Gen 6+) chart: Steel is neutral against Ghost and Dark", () => {
    expect(getTypeEffectiveness("ghost", "steel")).toBe(1);
    expect(getTypeEffectiveness("dark", "steel")).toBe(1);
  });

  it("falls back to neutral for an unknown type pairing", () => {
    expect(getTypeEffectiveness("nottype", "fire")).toBe(1);
  });
});
