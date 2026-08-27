import { getHistoricalTypes } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import {
  calculateGen1Stats,
  ivsToDvs,
  evsToStatExp,
  PERFECT_DV,
  ZERO_STAT_EXP,
} from "./gen1Stats";
import { calculateStats } from "./stats";
import { calculateGen23DamageRange } from "./gen23Damage";
import { getGen23CritChance } from "./gen23Crit";
import { NATURES } from "./natures";
import type { StatBlock, MoveData } from "./types";

/** `ivs`/`evs` use the MODERN 0-31/0-252 scale. On the Gen 2 branch they
 * are reinterpreted as Gen 1-style DVs/Stat Experience (same approximation
 * `gen1Matchup.ts` uses); on the Gen 3 branch they are used directly,
 * since Gen 3 natively uses this system. `nature` is a nature NAME
 * (looked up via `NATURES.find()`, matching `MatchupAttacker`'s existing
 * convention in `matchup.ts`), ignored entirely on the Gen 2 branch (Gen 2
 * has no natures). */
export interface Gen23MatchupAttacker {
  species: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
  nature: string;
}

/** The defender is always evaluated with the era-appropriate "worst case"
 * convention: Gen 2 uses perfect DVs (15) / zero Stat Experience; Gen 3
 * uses perfect IVs (31) / zero EVs / a neutral nature — fixed conventions
 * for a trainer Pokémon with no roster data, not derived from any input
 * on this type. */
export interface Gen23MatchupDefender {
  species: string;
  level: number;
}

export interface Gen23MatchupInput {
  generation: 2 | 3;
  attacker: Gen23MatchupAttacker;
  attackerMove: string;
  defender: Gen23MatchupDefender;
}

/** `hitsToKO.min`/`.max` can be `Infinity` (e.g. a type-immune matchup)
 * despite the plain `number` type — see gen1Matchup.ts's identical
 * caveat; callers serializing this should be aware `Infinity` serializes
 * to `null` via `JSON.stringify`. */
export interface Gen23MatchupOutcome {
  damageRange: { min: number; max: number };
  hitsToKO: { min: number; max: number };
}

export interface Gen23MatchupResult {
  normal: Gen23MatchupOutcome;
  /** `chance` is a probability in [0, 1], not a percentage. */
  criticalHit: { chance: number } & Gen23MatchupOutcome;
  moveOrder: "attacker" | "defender" | "tie";
}

const PERFECT_IVS: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ZERO_EVS: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function outcomeFor(
  attackerLevel: number,
  attackerStats: StatBlock,
  defenderStats: StatBlock,
  move: MoveData,
  attackerTypes: string[],
  defenderTypes: string[],
  critical: boolean
): Gen23MatchupOutcome | null {
  const damageRange = calculateGen23DamageRange(
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

/** Returns `null` if `generation` is not 2 or 3 (a runtime-only guard, since
 * the `2 | 3` type only protects callers that respect TypeScript), any
 * species/move lookup fails, the move is a status move, a species has no
 * historically-valid typing for the target generation (see
 * `getHistoricalTypes`), or — on the Gen 3 branch only — the attacker's
 * nature name doesn't match any known nature. */
export async function evaluateGen23Matchup(
  input: Gen23MatchupInput
): Promise<Gen23MatchupResult | null> {
  const { generation, attacker, attackerMove, defender } = input;

  if (generation !== 2 && generation !== 3) {
    return null;
  }

  const [attackerTypes, defenderTypes, attackerBase, defenderBase, move] = await Promise.all([
    getHistoricalTypes(attacker.species, generation),
    getHistoricalTypes(defender.species, generation),
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

  let attackerStats: StatBlock;
  let defenderStats: StatBlock;

  if (generation === 2) {
    attackerStats = calculateGen1Stats(
      attackerBase,
      ivsToDvs(attacker.ivs),
      evsToStatExp(attacker.evs),
      attacker.level
    );
    defenderStats = calculateGen1Stats(defenderBase, PERFECT_DV, ZERO_STAT_EXP, defender.level);
  } else {
    const attackerNature = NATURES.find((n) => n.name === attacker.nature);
    if (!attackerNature) return null;
    const neutralNature = NATURES.find((n) => n.name === "Hardy")!;

    attackerStats = calculateStats(
      attackerBase,
      attacker.ivs,
      attacker.evs,
      attackerNature,
      attacker.level
    );
    defenderStats = calculateStats(defenderBase, PERFECT_IVS, ZERO_EVS, neutralNature, defender.level);
  }

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

  const critChance = getGen23CritChance(generation, move.highCritRate);

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
