import { evaluateMatchup } from "./matchup";
import { evaluateGen1Matchup } from "./gen1Matchup";
import { evaluateGen23Matchup } from "./gen23Matchup";
import { evaluateGen45Matchup } from "./gen45Matchup";
import type { StatBlock } from "./types";

export interface NormalizedMatchup {
  hitsToKO: { min: number; max: number };
  movesFirst: "attacker" | "defender" | "tie";
}

export interface MatchupAttackerInput {
  species: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
  nature: string;
}

export interface MatchupDefenderInput {
  species: string;
  level: number;
  dynamaxState?: string | null; // only meaningful for generation 6-9
}

/** Dispatches to the right Phase 3 battle engine for `generation` and
 * flattens its result into one shape. Reads only each engine's `normal`
 * (non-crit) outcome — `matchup.ts` (Gen 6-9) has no crit split anyway,
 * so this keeps the shape identical regardless of era. Returns `null` if
 * the underlying engine call does (any failed lookup, a status move, an
 * unresolvable historical typing). */
export async function evaluateNormalizedMatchup(
  generation: number,
  attacker: MatchupAttackerInput,
  attackerMove: string,
  defender: MatchupDefenderInput
): Promise<NormalizedMatchup | null> {
  if (generation === 1) {
    const result = await evaluateGen1Matchup({
      attacker: {
        species: attacker.species,
        level: attacker.level,
        ivs: attacker.ivs,
        evs: attacker.evs,
      },
      attackerMove,
      defender: { species: defender.species, level: defender.level },
    });
    if (!result) return null;
    return { hitsToKO: result.normal.hitsToKO, movesFirst: result.moveOrder };
  }

  if (generation === 2 || generation === 3) {
    const result = await evaluateGen23Matchup({
      generation,
      attacker: {
        species: attacker.species,
        level: attacker.level,
        ivs: attacker.ivs,
        evs: attacker.evs,
        nature: attacker.nature,
      },
      attackerMove,
      defender: { species: defender.species, level: defender.level },
    });
    if (!result) return null;
    return { hitsToKO: result.normal.hitsToKO, movesFirst: result.moveOrder };
  }

  if (generation === 4 || generation === 5) {
    const result = await evaluateGen45Matchup({
      generation,
      attacker: {
        species: attacker.species,
        level: attacker.level,
        ivs: attacker.ivs,
        evs: attacker.evs,
        nature: attacker.nature,
      },
      attackerMove,
      defender: { species: defender.species, level: defender.level },
    });
    if (!result) return null;
    return { hitsToKO: result.normal.hitsToKO, movesFirst: result.moveOrder };
  }

  // Generation 6-9 (and any other value) uses the modern engine.
  const result = await evaluateMatchup({
    attacker: {
      species: attacker.species,
      level: attacker.level,
      ivs: attacker.ivs,
      evs: attacker.evs,
      nature: attacker.nature,
    },
    attackerMove,
    defender: {
      species: defender.species,
      level: defender.level,
      dynamaxState: defender.dynamaxState ?? null,
    },
  });
  if (!result) return null;
  return { hitsToKO: result.hitsToKO, movesFirst: result.moveOrder };
}
