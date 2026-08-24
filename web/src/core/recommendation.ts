import type { NormalizedMatchup } from "./matchupEngines";
import type { RosterPokemon, EncounterPokemon } from "./types";

export interface MatchupScore {
  score: number; // higher is better
  move: string;
  myHitsToKO: { min: number; max: number };
  theirHitsToKoTaken: { min: number; max: number };
  movesFirst: "attacker" | "defender" | "tie";
}

// Stands in for Infinity — both so subtraction never produces NaN, and so
// this value survives the Server Action boundary as a real (very large)
// number instead of silently becoming null (JSON.stringify(Infinity) is
// "null" — see gen1Matchup.ts's own JSDoc on this exact hazard).
const HITS_TO_KO_SENTINEL = 1000;

function clampRange(range: { min: number; max: number }): { min: number; max: number } {
  const clamp = (n: number) => (n === Infinity ? HITS_TO_KO_SENTINEL : n);
  return { min: clamp(range.min), max: clamp(range.max) };
}

function averageHits(range: { min: number; max: number }): number {
  return (range.min + range.max) / 2; // call only on an already-clamped range
}

function matchupScore(
  myHitsToKO: number,
  theirHitsToKoTaken: number,
  movesFirst: "attacker" | "defender" | "tie"
): number {
  const speedBonus = movesFirst === "attacker" ? 0.5 : movesFirst === "tie" ? 0 : -0.5;
  return (theirHitsToKoTaken - myHitsToKO) + speedBonus;
}

/** Scores one (roster Pokémon, opposing Pokémon) pairing. `theirHitsToKoTaken`
 * is fixed for the pairing (whichever of their moves needs the fewest
 * hits to KO me); each of my candidate moves is then scored against that
 * fixed value, and the best-scoring one wins. Returns `null` if either
 * side has no usable moves (every one failed lookup, or was a status
 * move) — this pairing has no usable score, not a score of 0. */
export function scoreMatchup(
  myMatchups: { move: string; result: NormalizedMatchup }[],
  theirMatchups: NormalizedMatchup[]
): MatchupScore | null {
  if (myMatchups.length === 0 || theirMatchups.length === 0) return null;

  const theirClampedRanges = theirMatchups.map((m) => clampRange(m.hitsToKO));
  const theirHitsToKoTaken = theirClampedRanges.reduce((worst, r) =>
    averageHits(r) < averageHits(worst) ? r : worst
  );
  const theirAvg = averageHits(theirHitsToKoTaken);

  let best: MatchupScore | null = null;
  for (const { move, result } of myMatchups) {
    const myHitsToKO = clampRange(result.hitsToKO);
    const score = matchupScore(averageHits(myHitsToKO), theirAvg, result.movesFirst);
    if (!best || score > best.score) {
      best = { score, move, myHitsToKO, theirHitsToKoTaken, movesFirst: result.movesFirst };
    }
  }
  return best;
}

export interface TeamAssignment {
  opponent: { species: string; position: number };
  rosterPokemonId: number;
  species: string;
  move: string;
  summary: MatchupScore;
}

export interface AssembledTeam {
  assignments: TeamAssignment[];
  uncoveredOpponents: { species: string; position: number; reason: string }[];
}

/** Bottleneck-first greedy team assembly: repeatedly finds the opponent
 * whose best-available score (across not-yet-used roster Pokémon) is
 * LOWEST, and assigns that opponent's best-available roster Pokémon to
 * it — this reserves scarce answers for the opponents that need them
 * most, instead of a fixed-order pass letting an early opponent claim a
 * roster Pokémon that only it could otherwise beat. */
export function assembleTeam(
  scoreMatrix: (MatchupScore | null)[][], // [rosterIndex][opponentIndex]
  roster: RosterPokemon[],
  opponents: EncounterPokemon[]
): AssembledTeam {
  const assignments: TeamAssignment[] = [];
  const uncoveredOpponents: { species: string; position: number; reason: string }[] = [];

  // Pre-filter: an opponent nobody in the roster can score at all is
  // uncovered immediately, before the assignment loop even starts.
  const scoreableOpponentIndices: number[] = [];
  opponents.forEach((opponent, opponentIndex) => {
    const hasAnyScore = scoreMatrix.some((row) => row[opponentIndex] !== null);
    if (hasAnyScore) {
      scoreableOpponentIndices.push(opponentIndex);
    } else {
      uncoveredOpponents.push({
        species: opponent.species,
        position: opponent.position,
        reason: "no roster Pokémon scored a usable matchup",
      });
    }
  });

  const usedRosterIndices = new Set<number>();
  const remainingOpponentIndices = new Set(scoreableOpponentIndices);

  while (remainingOpponentIndices.size > 0) {
    let bottleneckOpponentIndex = -1;
    let bottleneckScore = Infinity;
    let bottleneckRosterIndex = -1;

    for (const opponentIndex of remainingOpponentIndices) {
      let bestScoreForThisOpponent = -Infinity;
      let bestRosterIndexForThisOpponent = -1;

      for (let rosterIndex = 0; rosterIndex < roster.length; rosterIndex++) {
        if (usedRosterIndices.has(rosterIndex)) continue;
        const cell = scoreMatrix[rosterIndex][opponentIndex];
        if (cell !== null && cell.score > bestScoreForThisOpponent) {
          bestScoreForThisOpponent = cell.score;
          bestRosterIndexForThisOpponent = rosterIndex;
        }
      }

      if (bestRosterIndexForThisOpponent === -1) {
        // Every roster Pokémon that could once score this opponent is
        // now used up by other assignments.
        uncoveredOpponents.push({
          species: opponents[opponentIndex].species,
          position: opponents[opponentIndex].position,
          reason: "roster too small to cover every opponent",
        });
        remainingOpponentIndices.delete(opponentIndex);
        continue;
      }

      if (bestScoreForThisOpponent < bottleneckScore) {
        bottleneckScore = bestScoreForThisOpponent;
        bottleneckOpponentIndex = opponentIndex;
        bottleneckRosterIndex = bestRosterIndexForThisOpponent;
      }
    }

    if (bottleneckOpponentIndex === -1) break; // everything remaining just got marked uncovered this pass

    const opponent = opponents[bottleneckOpponentIndex];
    const rosterPokemon = roster[bottleneckRosterIndex];
    const cell = scoreMatrix[bottleneckRosterIndex][bottleneckOpponentIndex]!;

    assignments.push({
      opponent: { species: opponent.species, position: opponent.position },
      rosterPokemonId: rosterPokemon.id,
      species: rosterPokemon.species,
      move: cell.move,
      summary: cell,
    });

    usedRosterIndices.add(bottleneckRosterIndex);
    remainingOpponentIndices.delete(bottleneckOpponentIndex);
  }

  return { assignments, uncoveredOpponents };
}
