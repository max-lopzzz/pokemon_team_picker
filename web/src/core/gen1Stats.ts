import type { StatBlock } from "./types";

/** Gen 2 also uses this exact formula — Gen 2 kept Gen 1's DV/Stat-Experience
 * stat system unchanged, so `gen23Matchup.ts`'s Gen 2 branch calling this
 * function is intentional, not a copy-paste bug. */
export function calculateGen1Stats(
  base: StatBlock,
  dvs: StatBlock,
  statExp: StatBlock,
  level: number
): StatBlock {
  const statExpTerm = (key: keyof StatBlock): number =>
    Math.floor(Math.ceil(Math.sqrt(statExp[key])) / 4);

  const hp =
    Math.floor((((base.hp + dvs.hp) * 2 + statExpTerm("hp")) * level) / 100) + level + 10;

  const otherStat = (key: "atk" | "def" | "spa" | "spd" | "spe"): number =>
    Math.floor((((base[key] + dvs[key]) * 2 + statExpTerm(key)) * level) / 100) + 5;

  return {
    hp,
    atk: otherStat("atk"),
    def: otherStat("def"),
    spa: otherStat("spa"),
    spd: otherStat("spd"),
    spe: otherStat("spe"),
  };
}

export const PERFECT_DV: StatBlock = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
export const ZERO_STAT_EXP: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export function ivsToDvs(ivs: StatBlock): StatBlock {
  const toDv = (iv: number) => Math.min(15, Math.max(0, Math.round(iv / 2)));
  return {
    hp: toDv(ivs.hp),
    atk: toDv(ivs.atk),
    def: toDv(ivs.def),
    spa: toDv(ivs.spa),
    spd: toDv(ivs.spd),
    spe: toDv(ivs.spe),
  };
}

export function evsToStatExp(evs: StatBlock): StatBlock {
  const toStatExp = (ev: number) =>
    Math.min(65535, Math.max(0, Math.round((ev / 252) * 65535)));
  return {
    hp: toStatExp(evs.hp),
    atk: toStatExp(evs.atk),
    def: toStatExp(evs.def),
    spa: toStatExp(evs.spa),
    spd: toStatExp(evs.spd),
    spe: toStatExp(evs.spe),
  };
}
