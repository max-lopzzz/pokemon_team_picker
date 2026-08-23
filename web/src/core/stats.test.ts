import { describe, it, expect } from "vitest";
import { calculateStats } from "./stats";
import { NATURES } from "./natures";

const bulbasaurBase = { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 };
const perfectIvs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const zeroEvs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const hardy = NATURES.find((n) => n.name === "Hardy")!;

describe("calculateStats", () => {
  it("computes level 50 stats with perfect IVs, no EVs, and a neutral nature", () => {
    const result = calculateStats(bulbasaurBase, perfectIvs, zeroEvs, hardy, 50);
    expect(result).toEqual({ hp: 120, atk: 69, def: 69, spa: 85, spd: 85, spe: 65 });
  });

  it("applies EVs and a boosted/hindered nature correctly at level 100", () => {
    const modest = NATURES.find((n) => n.name === "Modest")!;
    const evs = { hp: 0, atk: 0, def: 0, spa: 252, spd: 0, spe: 0 };
    const result = calculateStats(bulbasaurBase, perfectIvs, evs, modest, 100);
    expect(result.hp).toBe(231);
    expect(result.atk).toBe(120); // hindered by Modest (-Atk)
    expect(result.spa).toBe(251); // boosted by Modest (+SpA)
  });
});
