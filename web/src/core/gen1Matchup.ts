import { getGen1Types } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import { calculateGen1Stats, ivsToDvs, evsToStatExp, PERFECT_DV, ZERO_STAT_EXP } from "./gen1Stats";
import { calculateGen1DamageRange } from "./gen1Damage";
import { getGen1CritChance } from "./gen1Crit";
import type { StatBlock, MoveData } from "./types";

/** `ivs`/`evs` use the MODERN 0-31 / 0-252 scale, matching the rest of this
 * app's UI. Internally they are reinterpreted as Gen 1 DVs (0-15) and Stat
 * Experience (0-65535) — a caller passing authentic Gen 1 DVs directly
 * would get them silently halved. */
export interface Gen1MatchupAttacker {
  species: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
}

/** The defender is always evaluated with perfect DVs (15) and zero Stat
 * Experience — a fixed convention for worst-case defense, not derived from
 * any input on this type. */
export interface Gen1MatchupDefender {
  species: string;
  level: number;
}

export interface Gen1MatchupInput {
  attacker: Gen1MatchupAttacker;
  attackerMove: string;
  defender: Gen1MatchupDefender;
}

/** `hitsToKO.min`/`.max` can be `Infinity` (e.g. a type-immune matchup, or
 * a damage range that is genuinely `{min:0,max:0}` under Gen 1's no-floor
 * rule) despite the plain `number` type. Callers serializing this (e.g.
 * `JSON.stringify`, a Server Action boundary) should be aware `Infinity`
 * serializes to `null`. */
export interface Gen1MatchupOutcome {
  damageRange: { min: number; max: number };
  hitsToKO: { min: number; max: number };
}

export interface Gen1MatchupResult {
  normal: Gen1MatchupOutcome;
  /** `chance` is a probability in [0, 1], not a percentage. */
  criticalHit: { chance: number } & Gen1MatchupOutcome;
  moveOrder: "attacker" | "defender" | "tie";
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

/** Returns `null` if any species/move lookup fails, the move is a status
 * move, or a species has no historically-valid Gen 1 typing (see
 * `getGen1Types`). */
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
