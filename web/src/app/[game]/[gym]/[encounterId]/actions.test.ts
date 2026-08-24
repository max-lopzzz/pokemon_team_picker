import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTeamRecommendationAction } from "./actions";
import { getGameGeneration, getEncounterTeam } from "@/core/queries";
import { listRoster } from "@/core/rosterQueries";
import { evaluateNormalizedMatchup } from "@/core/matchupEngines";
import type { RosterPokemon, EncounterTeam } from "@/core/types";

vi.mock("@/core/queries", () => ({
  getGameGeneration: vi.fn(),
  getEncounterTeam: vi.fn(),
}));
vi.mock("@/core/rosterQueries", () => ({ listRoster: vi.fn() }));
vi.mock("@/core/matchupEngines", () => ({ evaluateNormalizedMatchup: vi.fn() }));

const mockedGetGameGeneration = vi.mocked(getGameGeneration);
const mockedGetEncounterTeam = vi.mocked(getEncounterTeam);
const mockedListRoster = vi.mocked(listRoster);
const mockedEvaluateNormalizedMatchup = vi.mocked(evaluateNormalizedMatchup);

const zeroStats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const pikachu: RosterPokemon = {
  id: 5,
  game: "Red",
  species: "Pikachu",
  level: 50,
  nature: "Hardy",
  ability: "Static",
  ivs: zeroStats,
  evs: zeroStats,
  moves: ["Thunderbolt"],
};

const oneOpponentTeam: EncounterTeam = {
  encounter: { id: 1, gameId: 1, gymId: 1, leaderId: 1, leaderName: "Brock", variant: null },
  pokemon: [
    {
      id: 1,
      position: 1,
      species: "Onix",
      level: 20,
      gender: null,
      heldItem: null,
      dynamax: null,
      moves: ["Rock Throw"],
    },
  ],
};

describe("getTeamRecommendationAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the game isn't found", async () => {
    mockedGetGameGeneration.mockReturnValue(null);

    const result = await getTeamRecommendationAction("NotAGame", 1);

    expect(result).toBeNull();
  });

  it("returns null when the encounter isn't found", async () => {
    mockedGetGameGeneration.mockReturnValue(1);
    mockedGetEncounterTeam.mockReturnValue(null);

    const result = await getTeamRecommendationAction("Red", 999);

    expect(result).toBeNull();
  });

  it("computes an exact recommendation for a single roster Pokémon vs a single opponent", async () => {
    mockedGetGameGeneration.mockReturnValue(1);
    mockedGetEncounterTeam.mockReturnValue(oneOpponentTeam);
    mockedListRoster.mockReturnValue([pikachu]);

    mockedEvaluateNormalizedMatchup.mockImplementation(async (_generation, attacker) => {
      if (attacker.species === "Pikachu") {
        // My Thunderbolt vs their Onix.
        return { hitsToKO: { min: 2, max: 3 }, movesFirst: "attacker" };
      }
      // Their Rock Throw vs my Pikachu.
      return { hitsToKO: { min: 5, max: 6 }, movesFirst: "defender" };
    });

    const result = await getTeamRecommendationAction("Red", 1);

    expect(result).not.toBeNull();
    expect(result!.excludedRosterPokemon).toEqual([]);
    expect(result!.uncoveredOpponents).toEqual([]);
    expect(result!.assignments).toEqual([
      {
        opponent: { species: "Onix", position: 1 },
        rosterPokemonId: 5,
        species: "Pikachu",
        move: "Thunderbolt",
        summary: {
          // theirAvg=5.5, myAvg=2.5, speedBonus=0.5 -> score=3.5
          score: 3.5,
          move: "Thunderbolt",
          myHitsToKO: { min: 2, max: 3 },
          theirHitsToKoTaken: { min: 5, max: 6 },
          movesFirst: "attacker",
        },
      },
    ]);
  });

  it("excludes a roster Pokémon with no moves selected, without blocking the rest of the roster", async () => {
    mockedGetGameGeneration.mockReturnValue(1);
    mockedGetEncounterTeam.mockReturnValue(oneOpponentTeam);
    mockedListRoster.mockReturnValue([
      { ...pikachu, id: 6, species: "Magikarp", moves: [] },
      pikachu,
    ]);
    mockedEvaluateNormalizedMatchup.mockImplementation(async (_generation, attacker) =>
      attacker.species === "Pikachu"
        ? { hitsToKO: { min: 2, max: 3 }, movesFirst: "attacker" }
        : { hitsToKO: { min: 5, max: 6 }, movesFirst: "defender" }
    );

    const result = await getTeamRecommendationAction("Red", 1);

    expect(result!.excludedRosterPokemon).toEqual([
      { id: 6, species: "Magikarp", reason: "no moves selected" },
    ]);
    expect(result!.assignments).toHaveLength(1);
    expect(result!.assignments[0].species).toBe("Pikachu");
  });

  it("returns an empty-state recommendation when the roster has no usable Pokémon", async () => {
    mockedGetGameGeneration.mockReturnValue(1);
    mockedGetEncounterTeam.mockReturnValue(oneOpponentTeam);
    mockedListRoster.mockReturnValue([]);

    const result = await getTeamRecommendationAction("Red", 1);

    expect(result!.assignments).toEqual([]);
    expect(result!.uncoveredOpponents).toEqual([
      { species: "Onix", position: 1, reason: "no roster Pokémon available" },
    ]);
    expect(mockedEvaluateNormalizedMatchup).not.toHaveBeenCalled();
  });

  it("excludes an opponent with no level data from scoring entirely", async () => {
    mockedGetGameGeneration.mockReturnValue(1);
    mockedGetEncounterTeam.mockReturnValue({
      ...oneOpponentTeam,
      pokemon: [{ ...oneOpponentTeam.pokemon[0], level: null }],
    });
    mockedListRoster.mockReturnValue([pikachu]);

    const result = await getTeamRecommendationAction("Red", 1);

    expect(result!.assignments).toEqual([]);
    expect(result!.uncoveredOpponents).toEqual([
      { species: "Onix", position: 1, reason: "no level data for this opponent" },
    ]);
    expect(mockedEvaluateNormalizedMatchup).not.toHaveBeenCalled();
  });
});
