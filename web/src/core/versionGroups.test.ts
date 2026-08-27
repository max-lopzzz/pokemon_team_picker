import { describe, it, expect } from "vitest";
import { listGenerations, listGames } from "./queries";
import { GAME_TO_VERSION_GROUP } from "./versionGroups";

describe("GAME_TO_VERSION_GROUP", () => {
  it("has an entry for every game in the real gym_leaders.db", () => {
    const generations = listGenerations();
    const allGames = generations.flatMap((gen) =>
      listGames(gen.number).map((g) => g.name)
    );
    expect(allGames.length).toBeGreaterThan(0);
    for (const game of allGames) {
      expect(GAME_TO_VERSION_GROUP[game]).toBeDefined();
    }
  });

  it("maps known games to their correct PokeAPI version group", () => {
    expect(GAME_TO_VERSION_GROUP["Red"]).toBe("red-blue");
    expect(GAME_TO_VERSION_GROUP["Green"]).toBe("red-blue");
    expect(GAME_TO_VERSION_GROUP["Scarlet"]).toBe("scarlet-violet");
    expect(GAME_TO_VERSION_GROUP["Sword"]).toBe("sword-shield");
    expect(GAME_TO_VERSION_GROUP["Brilliant Diamond"]).toBe(
      "brilliant-diamond-shining-pearl"
    );
  });
});
