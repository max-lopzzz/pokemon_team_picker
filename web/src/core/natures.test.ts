import { describe, it, expect } from "vitest";
import { NATURES } from "./natures";

describe("NATURES", () => {
  it("has exactly 25 natures with unique names", () => {
    expect(NATURES).toHaveLength(25);
    const names = new Set(NATURES.map((n) => n.name));
    expect(names.size).toBe(25);
  });

  it("has correct plus/minus stats for known natures", () => {
    const adamant = NATURES.find((n) => n.name === "Adamant");
    expect(adamant).toEqual({ name: "Adamant", plus: "atk", minus: "spa" });

    const hardy = NATURES.find((n) => n.name === "Hardy");
    expect(hardy).toEqual({ name: "Hardy", plus: null, minus: null });

    const timid = NATURES.find((n) => n.name === "Timid");
    expect(timid).toEqual({ name: "Timid", plus: "spe", minus: "atk" });
  });
});
