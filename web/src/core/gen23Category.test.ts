import { describe, it, expect } from "vitest";
import { getGen23Category } from "./gen23Category";

describe("getGen23Category", () => {
  it("classifies all 8 special-by-type types", () => {
    expect(getGen23Category("fire")).toBe("special");
    expect(getGen23Category("water")).toBe("special");
    expect(getGen23Category("grass")).toBe("special");
    expect(getGen23Category("electric")).toBe("special");
    expect(getGen23Category("ice")).toBe("special");
    expect(getGen23Category("psychic")).toBe("special");
    expect(getGen23Category("dragon")).toBe("special");
    expect(getGen23Category("dark")).toBe("special");
  });

  it("classifies all 9 physical-by-type types", () => {
    expect(getGen23Category("normal")).toBe("physical");
    expect(getGen23Category("fighting")).toBe("physical");
    expect(getGen23Category("flying")).toBe("physical");
    expect(getGen23Category("ground")).toBe("physical");
    expect(getGen23Category("rock")).toBe("physical");
    expect(getGen23Category("bug")).toBe("physical");
    expect(getGen23Category("ghost")).toBe("physical");
    expect(getGen23Category("poison")).toBe("physical");
    expect(getGen23Category("steel")).toBe("physical");
  });
});
