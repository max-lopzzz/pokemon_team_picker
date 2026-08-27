import type { StatBlock, Nature } from "./types";

export function calculateStats(
  base: StatBlock,
  ivs: StatBlock,
  evs: StatBlock,
  nature: Nature,
  level: number
): StatBlock {
  const hp =
    Math.floor(((2 * base.hp + ivs.hp + Math.floor(evs.hp / 4)) * level) / 100) +
    level +
    10;

  const otherStat = (key: "atk" | "def" | "spa" | "spd" | "spe"): number => {
    const raw =
      Math.floor(((2 * base[key] + ivs[key] + Math.floor(evs[key] / 4)) * level) / 100) +
      5;
    const multiplier = nature.plus === key ? 1.1 : nature.minus === key ? 0.9 : 1.0;
    return Math.floor(raw * multiplier);
  };

  return {
    hp,
    atk: otherStat("atk"),
    def: otherStat("def"),
    spa: otherStat("spa"),
    spd: otherStat("spd"),
    spe: otherStat("spe"),
  };
}
