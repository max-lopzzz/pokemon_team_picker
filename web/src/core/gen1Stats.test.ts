import { describe, it, expect } from "vitest";
import { calculateGen1Stats, ivsToDvs, evsToStatExp, PERFECT_DV, ZERO_STAT_EXP } from "./gen1Stats";

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

describe("ivsToDvs", () => {
  it("halves and rounds an IV to a DV, rounding .5 up", () => {
    const ivs = { hp: 15, atk: 0, def: 31, spa: 20, spd: 1, spe: 30 };
    expect(ivsToDvs(ivs)).toEqual({ hp: 8, atk: 0, def: 15, spa: 10, spd: 1, spe: 15 });
  });

  it("clamps a perfect IV (31) to the maximum DV (15), not 16", () => {
    const ivs = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
    expect(ivsToDvs(ivs)).toEqual({ hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 });
  });

  it("clamps a zero IV to a zero DV", () => {
    const ivs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    expect(ivsToDvs(ivs)).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  });
});

describe("evsToStatExp", () => {
  it("scales an EV (0-252) up to the Stat Experience range (0-65535)", () => {
    const evs = { hp: 252, atk: 0, def: 126, spa: 63, spd: 189, spe: 1 };
    // 126/252 * 65535 = 32767.5 -> rounds up to 32768
    // 63/252 * 65535 = 16383.75 -> rounds to 16384
    // 189/252 * 65535 = 49151.25 -> rounds to 49151
    // 1/252 * 65535 = 260.0595... -> rounds to 260
    expect(evsToStatExp(evs)).toEqual({
      hp: 65535,
      atk: 0,
      def: 32768,
      spa: 16384,
      spd: 49151,
      spe: 260,
    });
  });

  it("clamps a max EV (252) to exactly 65535, not slightly over from rounding", () => {
    const evs = { hp: 252, atk: 252, def: 252, spa: 252, spd: 252, spe: 252 };
    expect(evsToStatExp(evs)).toEqual({
      hp: 65535, atk: 65535, def: 65535, spa: 65535, spd: 65535, spe: 65535,
    });
  });

  it("clamps a zero EV to zero Stat Experience", () => {
    const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
    expect(evsToStatExp(evs)).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  });
});

describe("PERFECT_DV and ZERO_STAT_EXP", () => {
  it("PERFECT_DV is 15 for every stat", () => {
    expect(PERFECT_DV).toEqual({ hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 });
  });

  it("ZERO_STAT_EXP is 0 for every stat", () => {
    expect(ZERO_STAT_EXP).toEqual({ hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 });
  });
});
