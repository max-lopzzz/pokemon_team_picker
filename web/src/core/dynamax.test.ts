import { describe, it, expect } from "vitest";
import { applyDynamaxHp } from "./dynamax";

describe("applyDynamaxHp", () => {
  it("increases HP by 50% (floored) when Dynamaxed", () => {
    expect(applyDynamaxHp(100, "Dynamax")).toBe(150);
    expect(applyDynamaxHp(101, "Dynamax")).toBe(151); // floor(151.5)
  });

  it("increases HP by 50% (floored) when Gigantamaxed", () => {
    expect(applyDynamaxHp(100, "Gigantamax")).toBe(150);
  });

  it("leaves HP unchanged for null", () => {
    expect(applyDynamaxHp(100, null)).toBe(100);
  });

  it("leaves HP unchanged for stray non-Dynamax values in the source data", () => {
    expect(applyDynamaxHp(100, "Icy Rock")).toBe(100);
    expect(applyDynamaxHp(100, "Chople Berry")).toBe(100);
  });
});
