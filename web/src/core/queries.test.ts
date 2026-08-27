import { describe, it, expect } from "vitest";
import {
  listGenerations,
  listGames,
  listGyms,
  listEncounters,
  getEncounterTeam,
  getGameGeneration,
} from "./queries";

describe("listGenerations", () => {
  it("returns all 9 generations ordered by number", () => {
    const generations = listGenerations();
    expect(generations).toHaveLength(9);
    expect(generations[0].number).toBe(1);
    expect(generations[8].number).toBe(9);
  });
});

describe("listGames", () => {
  it("returns the generation 1 games", () => {
    const games = listGames(1);
    expect(games.map((g) => g.name).sort()).toEqual([
      "Blue",
      "Green",
      "Red",
      "Yellow",
    ]);
  });
});

describe("listGyms", () => {
  it("returns the gyms in Red, including Pewter Gym", () => {
    const gyms = listGyms("Red");
    expect(gyms.map((g) => g.name)).toContain("Pewter Gym");
    expect(gyms.map((g) => g.name)).toContain("Pokemon League");
  });
});

describe("listEncounters", () => {
  it("returns a single, variant-less encounter for Pewter Gym", () => {
    const encounters = listEncounters("Red", "Pewter Gym");
    expect(encounters).toHaveLength(1);
    expect(encounters[0].leaderName).toBe("Brock");
    expect(encounters[0].variant).toBeNull();
  });

  it("returns one encounter per starter for Blue at the Pokemon League", () => {
    const encounters = listEncounters("Red", "Pokemon League");
    const blue = encounters.filter((e) => e.leaderName === "Blue");
    expect(blue.map((e) => e.variant).sort()).toEqual([
      "starter: Bulbasaur",
      "starter: Charmander",
      "starter: Squirtle",
    ]);
  });
});

describe("getEncounterTeam", () => {
  it("returns Brock's Red team with species, level, and moves", () => {
    const [encounter] = listEncounters("Red", "Pewter Gym");
    const team = getEncounterTeam(encounter.id);

    expect(team).not.toBeNull();
    expect(team!.pokemon.map((p) => p.species)).toEqual(["Geodude", "Onix"]);

    expect(team!.pokemon[0].level).toBe(12);
    expect(team!.pokemon[0].moves).toEqual(["Tackle", "Defense Curl"]);

    expect(team!.pokemon[1].level).toBe(14);
    expect(team!.pokemon[1].moves).toEqual(["Tackle", "Screech", "Bide"]);
  });

  it("returns null for an unknown encounter id", () => {
    expect(getEncounterTeam(999999)).toBeNull();
  });
});

describe("getGameGeneration", () => {
  it("returns the generation number for a known game", () => {
    expect(getGameGeneration("Red")).toBe(1);
  });

  it("returns null for an unknown game name", () => {
    expect(getGameGeneration("NotAGame")).toBeNull();
  });
});
