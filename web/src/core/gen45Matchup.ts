import { getHistoricalTypes } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import { calculateStats } from "./stats";
import { calculateGen45DamageRange } from "./gen45Damage";
import { getGen23CritChance } from "./gen23Crit";
import { NATURES } from "./natures";
import type { StatBlock, MoveData } from "./types";

/** `ivs`/`evs` use the standard 0-31/0-252 scale and are used directly —
 * Gen 4-5 natively uses the modern IV/EV/nature system, no reinterpretation
 * needed. `nature` is a nature NAME (looked up via `NATURES.find()`,
 * matching `MatchupAttacker`'s existing convention in `matchup.ts`) and is
 * genuinely applied — unlike Gen 2's branch in `gen23Matchup.ts`. */
export interface Gen45MatchupAttacker {
  species: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
  nature: string;
}

/** The defender is always evaluated with perfect IVs (31), zero EVs, and a
 * neutral ("Hardy") nature — a fixed convention for a trainer Pokémon with
 * no roster data, not derived from any input on this type. */
export interface Gen45MatchupDefender {
  species: string;
  level: number;
}

/** `generation` affects ONLY the historical-typing lookup
 * (`getHistoricalTypes`) — stats, crit chance, and damage are identical
 * for Gen 4 and Gen 5, since these two eras don't mechanically differ for
 * any formula this module implements. */
export interface Gen45MatchupInput {
  generation: 4 | 5;
  attacker: Gen45MatchupAttacker;
  attackerMove: string;
  defender: Gen45MatchupDefender;
}

/** `hitsToKO.min`/`.max` can be `Infinity` (e.g. a type-immune matchup)
 * despite the plain `number` type — callers serializing this (e.g.
 * `JSON.stringify`, a Server Action boundary) should be aware `Infinity`
 * serializes to `null`. */
export interface Gen45MatchupOutcome {
  damageRange: { min: number; max: number };
  hitsToKO: { min: number; max: number };
}

export interface Gen45MatchupResult {
  normal: Gen45MatchupOutcome;
  /** `chance` is a probability in [0, 1], not a percentage. */
  criticalHit: { chance: number } & Gen45MatchupOutcome;
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
): Gen45MatchupOutcome | null {
  const damageRange = calculateGen45DamageRange(
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

/** Returns `null` if any species/move lookup fails, the move is a status
 * move, a species has no historically-valid typing for the target
 * generation (see `getHistoricalTypes`), or the attacker's nature name
 * doesn't match any known nature. */
export async function evaluateGen45Matchup(
  input: Gen45MatchupInput
): Promise<Gen45MatchupResult | null> {
  const { generation, attacker, attackerMove, defender } = input;

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
  const defenderStats = calculateStats(defenderBase, PERFECT_IVS, ZERO_EVS, neutralNature, defender.level);

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
