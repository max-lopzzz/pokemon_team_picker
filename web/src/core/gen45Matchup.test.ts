import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateGen45Matchup } from "./gen45Matchup";
import { getHistoricalTypes } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import type { MoveData, StatBlock } from "./types";

vi.mock("./gen1Types", () => ({ getHistoricalTypes: vi.fn() }));
vi.mock("./baseStats", () => ({ getBaseStats: vi.fn() }));
vi.mock("./moveData", () => ({ getMoveData: vi.fn() }));

const mockedGetHistoricalTypes = vi.mocked(getHistoricalTypes);
const mockedGetBaseStats = vi.mocked(getBaseStats);
const mockedGetMoveData = vi.mocked(getMoveData);

const attackerBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 50, spe: 45 };
const defenderBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 70, spe: 90 };
const perfectIvs: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const zeroEvs: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const psybeam: MoveData = {
  name: "psybeam",
  type: "psychic",
  category: "special",
  power: 60,
  priority: 0,
  highCritRate: false,
};

function setupMocks(overrides?: {
  attackerTypes?: string[];
  defenderTypes?: string[];
  attackerBaseStats?: StatBlock;
  defenderBaseStats?: StatBlock;
  move?: MoveData;
}) {
  const attackerTypes = overrides?.attackerTypes ?? ["grass"];
  const defenderTypes = overrides?.defenderTypes ?? ["fire"];

  mockedGetHistoricalTypes.mockImplementation(async (species: string) => {
    return species === "Attacker" ? attackerTypes : defenderTypes;
  });
  mockedGetBaseStats.mockImplementation(async (species: string) => {
    return species === "Attacker"
      ? overrides?.attackerBaseStats ?? attackerBase
      : overrides?.defenderBaseStats ?? defenderBase;
  });
  mockedGetMoveData.mockResolvedValue(overrides?.move ?? psybeam);
}

describe("evaluateGen45Matchup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes an exact hand-verified matchup result, with a genuinely-applied nature and post-hoc crit", async () => {
    setupMocks();

    const result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Modest" },
      attackerMove: "Psybeam",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toEqual({
      normal: {
        damageRange: { min: 24, max: 29 },
        hitsToKO: { min: 5, max: 5 },
      },
      criticalHit: {
        chance: 1 / 16,
        damageRange: { min: 49, max: 58 },
        hitsToKO: { min: 3, max: 3 },
      },
      moveOrder: "defender",
    });
  });

  it("uses the generation field to select the correct historical typing (Gen 4 vs Gen 5 differ for this fixture, proving the field isn't ignored or hardcoded)", async () => {
    const ember: MoveData = {
      name: "ember",
      type: "fire",
      category: "special",
      power: 80,
      priority: 0,
      highCritRate: false,
    };

    mockedGetHistoricalTypes.mockImplementation(async (species: string, generation: number) => {
      if (species === "Attacker") {
        return generation === 4 ? ["fire"] : ["water"];
      }
      return ["normal"];
    });
    mockedGetBaseStats.mockImplementation(async (species: string) =>
      species === "Attacker" ? attackerBase : defenderBase
    );
    mockedGetMoveData.mockResolvedValue(ember);

    const gen4Result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Ember",
      defender: { species: "Defender", level: 50 },
    });

    const gen5Result = await evaluateGen45Matchup({
      generation: 5,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Ember",
      defender: { species: "Defender", level: 50 },
    });

    // Gen 4: attacker is Fire-type, so Ember gets STAB (1.5x). Gen 5: the
    // mock returns Water-type for the same species/generation-4 species
    // lookup, so Ember gets no STAB (1x) — a genuinely different result,
    // not a coincidence, proving `generation` reached the mock.
    expect(gen4Result!.normal.damageRange).toEqual({ min: 44, max: 52 });
    expect(gen5Result!.normal.damageRange).toEqual({ min: 29, max: 35 });
    expect(mockedGetHistoricalTypes).toHaveBeenCalledWith("Attacker", 4);
    expect(mockedGetHistoricalTypes).toHaveBeenCalledWith("Attacker", 5);
  });

  it("returns null for a status move", async () => {
    setupMocks({
      move: { name: "growl", type: "normal", category: "status", power: null, priority: 0, highCritRate: false },
    });

    const result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Growl",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns null when a types lookup fails", async () => {
    mockedGetHistoricalTypes.mockResolvedValue(null);
    mockedGetBaseStats.mockResolvedValue(attackerBase);
    mockedGetMoveData.mockResolvedValue(psybeam);

    const result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Psybeam",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns null when the attacker's nature name doesn't match any known nature", async () => {
    setupMocks();

    const result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "NotARealNature" },
      attackerMove: "Psybeam",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns 'attacker' move order for a positive-priority move even with lower Speed", async () => {
    setupMocks({
      move: { name: "quick-attack", type: "normal", category: "physical", power: 40, priority: 1, highCritRate: false },
    });

    const result = await evaluateGen45Matchup({
      generation: 5,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Quick Attack",
      defender: { species: "Defender", level: 50 },
    });

    expect(result!.moveOrder).toBe("attacker");
  });

  it("returns a zero damage range NOT floored to 1 for a true type immunity, and Infinity hitsToKO", async () => {
    setupMocks({
      attackerTypes: ["normal"],
      defenderTypes: ["ghost"],
      move: { name: "tackle", type: "normal", category: "physical", power: 40, priority: 0, highCritRate: false },
    });

    const result = await evaluateGen45Matchup({
      generation: 4,
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs, nature: "Hardy" },
      attackerMove: "Tackle",
      defender: { species: "Defender", level: 50 },
    });

    expect(result!.normal.damageRange).toEqual({ min: 0, max: 0 });
    expect(result!.normal.hitsToKO.max).toBe(Infinity);
  });
});
