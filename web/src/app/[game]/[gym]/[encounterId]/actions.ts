"use server";

import { getGameGeneration, getEncounterTeam } from "@/core/queries";
import { listRoster } from "@/core/rosterQueries";
import { evaluateNormalizedMatchup } from "@/core/matchupEngines";
import { scoreMatchup, assembleTeam, type MatchupScore, type AssembledTeam } from "@/core/recommendation";
import type { RosterPokemon, EncounterPokemon } from "@/core/types";

export interface TeamRecommendation extends AssembledTeam {
  excludedRosterPokemon: { id: number; species: string; reason: string }[];
}

const PERFECT_IVS = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const ZERO_EVS = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
const NEUTRAL_NATURE = "Hardy";

export async function getTeamRecommendationAction(
  gameName: string,
  encounterId: number
): Promise<TeamRecommendation | null> {
  const generation = getGameGeneration(gameName);
  if (generation === null) return null;

  const team = getEncounterTeam(encounterId);
  if (!team) return null;

  const fullRoster = listRoster(gameName);

  const excludedRosterPokemon: { id: number; species: string; reason: string }[] = [];
  const usableRoster: RosterPokemon[] = [];
  for (const p of fullRoster) {
    if (p.moves.length === 0) {
      excludedRosterPokemon.push({ id: p.id, species: p.species, reason: "no moves selected" });
    } else {
      usableRoster.push(p);
    }
  }

  const preUncoveredOpponents: { species: string; position: number; reason: string }[] = [];
  const scoreableOpponents: EncounterPokemon[] = [];
  for (const p of team.pokemon) {
    if (p.level === null) {
      preUncoveredOpponents.push({
        species: p.species,
        position: p.position,
        reason: "no level data for this opponent",
      });
    } else {
      scoreableOpponents.push(p);
    }
  }

  if (usableRoster.length === 0) {
    return {
      assignments: [],
      uncoveredOpponents: [
        ...preUncoveredOpponents,
        ...scoreableOpponents.map((p) => ({
          species: p.species,
          position: p.position,
          reason: "no roster Pokémon available",
        })),
      ],
      excludedRosterPokemon,
    };
  }

  const scoreMatrix: (MatchupScore | null)[][] = [];

  for (const rosterPokemon of usableRoster) {
    const row: (MatchupScore | null)[] = [];

    for (const opponent of scoreableOpponents) {
      const opponentLevel = opponent.level!; // non-null: filtered above

      const theirResults = await Promise.all(
        opponent.moves.map((move) =>
          evaluateNormalizedMatchup(
            generation,
            {
              species: opponent.species,
              level: opponentLevel,
              ivs: PERFECT_IVS,
              evs: ZERO_EVS,
              nature: NEUTRAL_NATURE,
            },
            move,
            { species: rosterPokemon.species, level: rosterPokemon.level }
          )
        )
      );
      const theirMatchups = theirResults.filter((r) => r !== null);

      const myResults = await Promise.all(
        rosterPokemon.moves.map(async (move) => {
          const result = await evaluateNormalizedMatchup(
            generation,
            {
              species: rosterPokemon.species,
              level: rosterPokemon.level,
              ivs: rosterPokemon.ivs,
              evs: rosterPokemon.evs,
              nature: rosterPokemon.nature,
            },
            move,
            { species: opponent.species, level: opponentLevel, dynamaxState: opponent.dynamax }
          );
          return result ? { move, result } : null;
        })
      );
      const myMatchups = myResults.filter(
        (r): r is { move: string; result: NonNullable<(typeof myResults)[number]>["result"] } =>
          r !== null
      );

      row.push(scoreMatchup(myMatchups, theirMatchups));
    }

    scoreMatrix.push(row);
  }

  const assembled = assembleTeam(scoreMatrix, usableRoster, scoreableOpponents);

  return {
    assignments: [...assembled.assignments].sort((a, b) => a.opponent.position - b.opponent.position),
    uncoveredOpponents: [...preUncoveredOpponents, ...assembled.uncoveredOpponents].sort(
      (a, b) => a.position - b.position
    ),
    excludedRosterPokemon,
  };
}
