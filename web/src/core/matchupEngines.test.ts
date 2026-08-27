import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateNormalizedMatchup } from "./matchupEngines";
import { evaluateMatchup } from "./matchup";
import { evaluateGen1Matchup } from "./gen1Matchup";
import { evaluateGen23Matchup } from "./gen23Matchup";
import { evaluateGen45Matchup } from "./gen45Matchup";
import type { StatBlock } from "./types";

vi.mock("./matchup", () => ({ evaluateMatchup: vi.fn() }));
vi.mock("./gen1Matchup", () => ({ evaluateGen1Matchup: vi.fn() }));
vi.mock("./gen23Matchup", () => ({ evaluateGen23Matchup: vi.fn() }));
vi.mock("./gen45Matchup", () => ({ evaluateGen45Matchup: vi.fn() }));

const mockedEvaluateMatchup = vi.mocked(evaluateMatchup);
const mockedEvaluateGen1Matchup = vi.mocked(evaluateGen1Matchup);
const mockedEvaluateGen23Matchup = vi.mocked(evaluateGen23Matchup);
const mockedEvaluateGen45Matchup = vi.mocked(evaluateGen45Matchup);

const ivs: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const evs: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const attacker = { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" };
const defender = { species: "Onix", level: 20 };

describe("evaluateNormalizedMatchup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("generation 1: calls evaluateGen1Matchup, omitting nature from the attacker object", async () => {
    mockedEvaluateGen1Matchup.mockResolvedValue({
      normal: { damageRange: { min: 10, max: 12 }, hitsToKO: { min: 2, max: 3 } },
      criticalHit: { chance: 0.1, damageRange: { min: 20, max: 24 }, hitsToKO: { min: 1, max: 1 } },
      moveOrder: "attacker",
    });

    const result = await evaluateNormalizedMatchup(1, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateGen1Matchup).toHaveBeenCalledWith({
      attacker: { species: "Pikachu", level: 50, ivs, evs },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20 },
    });
    expect(result).toEqual({ hitsToKO: { min: 2, max: 3 }, movesFirst: "attacker" });
  });

  it("generation 2: calls evaluateGen23Matchup with generation 2", async () => {
    mockedEvaluateGen23Matchup.mockResolvedValue({
      normal: { damageRange: { min: 5, max: 6 }, hitsToKO: { min: 4, max: 5 } },
      criticalHit: { chance: 17 / 256, damageRange: { min: 10, max: 12 }, hitsToKO: { min: 2, max: 2 } },
      moveOrder: "defender",
    });

    const result = await evaluateNormalizedMatchup(2, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateGen23Matchup).toHaveBeenCalledWith({
      generation: 2,
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20 },
    });
    expect(result).toEqual({ hitsToKO: { min: 4, max: 5 }, movesFirst: "defender" });
  });

  it("generation 3: calls evaluateGen23Matchup with generation 3", async () => {
    mockedEvaluateGen23Matchup.mockResolvedValue({
      normal: { damageRange: { min: 5, max: 6 }, hitsToKO: { min: 4, max: 5 } },
      criticalHit: { chance: 1 / 16, damageRange: { min: 10, max: 12 }, hitsToKO: { min: 2, max: 2 } },
      moveOrder: "tie",
    });

    const result = await evaluateNormalizedMatchup(3, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateGen23Matchup).toHaveBeenCalledWith({
      generation: 3,
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20 },
    });
    expect(result).toEqual({ hitsToKO: { min: 4, max: 5 }, movesFirst: "tie" });
  });

  it("generation 4: calls evaluateGen45Matchup with generation 4", async () => {
    mockedEvaluateGen45Matchup.mockResolvedValue({
      normal: { damageRange: { min: 8, max: 9 }, hitsToKO: { min: 3, max: 3 } },
      criticalHit: { chance: 1 / 16, damageRange: { min: 16, max: 18 }, hitsToKO: { min: 2, max: 2 } },
      moveOrder: "attacker",
    });

    const result = await evaluateNormalizedMatchup(4, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateGen45Matchup).toHaveBeenCalledWith({
      generation: 4,
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20 },
    });
    expect(result).toEqual({ hitsToKO: { min: 3, max: 3 }, movesFirst: "attacker" });
  });

  it("generation 5: calls evaluateGen45Matchup with generation 5", async () => {
    mockedEvaluateGen45Matchup.mockResolvedValue({
      normal: { damageRange: { min: 8, max: 9 }, hitsToKO: { min: 3, max: 3 } },
      criticalHit: { chance: 1 / 16, damageRange: { min: 16, max: 18 }, hitsToKO: { min: 2, max: 2 } },
      moveOrder: "defender",
    });

    const result = await evaluateNormalizedMatchup(5, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateGen45Matchup).toHaveBeenCalledWith({
      generation: 5,
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20 },
    });
    expect(result).toEqual({ hitsToKO: { min: 3, max: 3 }, movesFirst: "defender" });
  });

  it("generation 6 and above: calls evaluateMatchup, passing dynamaxState through", async () => {
    mockedEvaluateMatchup.mockResolvedValue({
      damageRange: { min: 15, max: 18 },
      hitsToKO: { min: 1, max: 1 },
      moveOrder: "attacker",
    });

    const result = await evaluateNormalizedMatchup(9, attacker, "Thunderbolt", {
      ...defender,
      dynamaxState: "dynamax",
    });

    expect(mockedEvaluateMatchup).toHaveBeenCalledWith({
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20, dynamaxState: "dynamax" },
    });
    expect(result).toEqual({ hitsToKO: { min: 1, max: 1 }, movesFirst: "attacker" });
  });

  it("defaults dynamaxState to null when not provided, for a Gen 6-9 call", async () => {
    mockedEvaluateMatchup.mockResolvedValue({
      damageRange: { min: 15, max: 18 },
      hitsToKO: { min: 1, max: 1 },
      moveOrder: "attacker",
    });

    await evaluateNormalizedMatchup(8, attacker, "Thunderbolt", defender);

    expect(mockedEvaluateMatchup).toHaveBeenCalledWith({
      attacker: { species: "Pikachu", level: 50, ivs, evs, nature: "Hardy" },
      attackerMove: "Thunderbolt",
      defender: { species: "Onix", level: 20, dynamaxState: null },
    });
  });

  it("propagates null from the underlying engine (generation 1)", async () => {
    mockedEvaluateGen1Matchup.mockResolvedValue(null);
    const result = await evaluateNormalizedMatchup(1, attacker, "Thunderbolt", defender);
    expect(result).toBeNull();
  });

  it("propagates null from the underlying engine (generation 6-9)", async () => {
    mockedEvaluateMatchup.mockResolvedValue(null);
    const result = await evaluateNormalizedMatchup(6, attacker, "Thunderbolt", defender);
    expect(result).toBeNull();
  });
});
