import type { StatBlock } from "./types";

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
