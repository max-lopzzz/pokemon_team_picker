import { describe, it, expect } from "vitest";
import { calculateGen1Stats } from "./gen1Stats";

const base = { hp: 78, atk: 84, def: 78, spa: 85, spd: 85, spe: 100 };

describe("calculateGen1Stats", () => {
  it("computes stats with max DVs and max Stat Experience (even division)", () => {
    const dvs = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
    const statExp = { hp: 65535, atk: 65535, def: 65535, spa: 65535, spd: 65535, spe: 65535 };

    const result = calculateGen1Stats(base, dvs, statExp, 50);

    expect(result).toEqual({ hp: 185, atk: 136, def: 130, spa: 137, spd: 137, spe: 152 });
  });

  it("computes stats with partial DVs and Stat Experience (exercises real flooring)", () => {
    const dvs = { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };
    const statExp = { hp: 30000, atk: 30000, def: 30000, spa: 30000, spd: 30000, spe: 30000 };

    const result = calculateGen1Stats(base, dvs, statExp, 55);

    expect(result).toEqual({ hp: 185, atk: 132, def: 125, spa: 133, spd: 133, spe: 149 });
  });
});
