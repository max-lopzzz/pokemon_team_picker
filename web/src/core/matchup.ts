import { getSpeciesInfo } from "./pokeapi";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import { calculateStats } from "./stats";
import { calculateDamageRange } from "./damage";
import { applyDynamaxHp } from "./dynamax";
import { NATURES } from "./natures";
import type { StatBlock } from "./types";

export interface MatchupAttacker {
  species: string;
  level: number;
  nature: string;
  ivs: StatBlock;
  evs: StatBlock;
}

export interface MatchupDefender {
  species: string;
  level: number;
  dynamaxState: string | null;
}

export interface MatchupInput {
  attacker: MatchupAttacker;
  attackerMove: string;
  defender: MatchupDefender;
}

export interface MatchupResult {
  damageRange: { min: number; max: number };
  hitsToKO: { min: number; max: number };
  moveOrder: "attacker" | "defender" | "tie";
}

const PERFECT_IVS: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ZERO_EVS: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

export async function evaluateMatchup(
  input: MatchupInput
): Promise<MatchupResult | null> {
  const { attacker, attackerMove, defender } = input;

  const [attackerInfo, defenderInfo, attackerBase, defenderBase, move] = await Promise.all([
    getSpeciesInfo(attacker.species),
    getSpeciesInfo(defender.species),
    getBaseStats(attacker.species),
    getBaseStats(defender.species),
    getMoveData(attackerMove),
  ]);

  if (!attackerInfo || !defenderInfo || !attackerBase || !defenderBase || !move) {
    return null;
  }

  if (move.category === "status" || move.power === null) {
    return null;
  }

  const attackerNature = NATURES.find((n) => n.name === attacker.nature);
  if (!attackerNature) return null;

  const neutralNature = NATURES.find((n) => n.name === "Hardy")!;

  const attackerStats = calculateStats(
    attackerBase,
    attacker.ivs,
    attacker.evs,
    attackerNature,
    attacker.level
  );
  const defenderStatsRaw = calculateStats(
    defenderBase,
    PERFECT_IVS,
    ZERO_EVS,
    neutralNature,
    defender.level
  );
  const defenderStats: StatBlock = {
    ...defenderStatsRaw,
    hp: applyDynamaxHp(defenderStatsRaw.hp, defender.dynamaxState),
  };

  const damageRange = calculateDamageRange(
    attacker.level,
    attackerStats,
    defenderStats,
    move,
    attackerInfo.types,
    defenderInfo.types
  );

  if (!damageRange) return null;

  const hitsToKO = {
    min: Math.ceil(defenderStats.hp / damageRange.max),
    max: Math.ceil(defenderStats.hp / damageRange.min),
  };

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

  return { damageRange, hitsToKO, moveOrder };
}
