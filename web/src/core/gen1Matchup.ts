import { getGen1Types } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import { calculateGen1Stats } from "./gen1Stats";
import { calculateGen1DamageRange } from "./gen1Damage";
import { getGen1CritChance } from "./gen1Crit";
import type { StatBlock, MoveData } from "./types";

export interface Gen1MatchupAttacker {
  species: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
}

export interface Gen1MatchupDefender {
  species: string;
  level: number;
}

export interface Gen1MatchupInput {
  attacker: Gen1MatchupAttacker;
  attackerMove: string;
  defender: Gen1MatchupDefender;
}

export interface Gen1MatchupOutcome {
  damageRange: { min: number; max: number };
  hitsToKO: { min: number; max: number };
}

export interface Gen1MatchupResult {
  normal: Gen1MatchupOutcome;
  criticalHit: { chance: number } & Gen1MatchupOutcome;
  moveOrder: "attacker" | "defender" | "tie";
}

const PERFECT_DV: StatBlock = { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 };
const ZERO_STAT_EXP: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function ivsToDvs(ivs: StatBlock): StatBlock {
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

function evsToStatExp(evs: StatBlock): StatBlock {
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

/** Gen 1 has a single "Special" stat; represent it by using base Special
 * Attack for both offense and defense (historically accurate — Gen 2's
 * stat split set Special Defense equal to the old Special stat). */
function toGen1Base(base: StatBlock): StatBlock {
  return { ...base, spd: base.spa };
}

function outcomeFor(
  attackerLevel: number,
  attackerStats: StatBlock,
  defenderStats: StatBlock,
  move: MoveData,
  attackerTypes: string[],
  defenderTypes: string[],
  critical: boolean
): Gen1MatchupOutcome | null {
  const damageRange = calculateGen1DamageRange(
    attackerLevel,
    attackerStats,
    defenderStats,
    move,
    attackerTypes,
    defenderTypes,
    critical
  );
  if (!damageRange) return null;

  const hitsToKO = {
    min: damageRange.max > 0 ? Math.ceil(defenderStats.hp / damageRange.max) : Infinity,
    max: damageRange.min > 0 ? Math.ceil(defenderStats.hp / damageRange.min) : Infinity,
  };

  return { damageRange, hitsToKO };
}

export async function evaluateGen1Matchup(
  input: Gen1MatchupInput
): Promise<Gen1MatchupResult | null> {
  const { attacker, attackerMove, defender } = input;

  const [attackerTypes, defenderTypes, attackerBase, defenderBase, move] = await Promise.all([
    getGen1Types(attacker.species),
    getGen1Types(defender.species),
    getBaseStats(attacker.species),
    getBaseStats(defender.species),
    getMoveData(attackerMove),
  ]);

  if (!attackerTypes || !defenderTypes || !attackerBase || !defenderBase || !move) {
    return null;
  }

  if (move.category === "status" || move.power === null) {
    return null;
  }

  const attackerStats = calculateGen1Stats(
    toGen1Base(attackerBase),
    ivsToDvs(attacker.ivs),
    evsToStatExp(attacker.evs),
    attacker.level
  );
  const defenderStats = calculateGen1Stats(
    toGen1Base(defenderBase),
    PERFECT_DV,
    ZERO_STAT_EXP,
    defender.level
  );

  const normal = outcomeFor(
    attacker.level,
    attackerStats,
    defenderStats,
    move,
    attackerTypes,
    defenderTypes,
    false
  );
  const critical = outcomeFor(
    attacker.level,
    attackerStats,
    defenderStats,
    move,
    attackerTypes,
    defenderTypes,
    true
  );

  if (!normal || !critical) return null;

  const critChance = getGen1CritChance(attackerBase.spe, move.highCritRate);

  let moveOrder: "attacker" | "defender" | "tie";
  if (move.priority > 0) {
    moveOrder = "attacker";
  } else if (move.priority < 0) {
    moveOrder = "defender";
  } else if (attackerStats.spe > defenderStats.spe) {
    moveOrder = "attacker";
  } else if (attackerStats.spe < defenderStats.spe) {
    moveOrder = "defender";
  } else {
    moveOrder = "tie";
  }

  return {
    normal,
    criticalHit: { chance: critChance, ...critical },
    moveOrder,
  };
}
