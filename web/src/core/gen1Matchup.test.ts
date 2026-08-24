import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateGen1Matchup } from "./gen1Matchup";
import { getGen1Types } from "./gen1Types";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import type { MoveData, StatBlock } from "./types";

vi.mock("./gen1Types", () => ({ getGen1Types: vi.fn() }));
vi.mock("./baseStats", () => ({ getBaseStats: vi.fn() }));
vi.mock("./moveData", () => ({ getMoveData: vi.fn() }));

const mockedGetGen1Types = vi.mocked(getGen1Types);
const mockedGetBaseStats = vi.mocked(getBaseStats);
const mockedGetMoveData = vi.mocked(getMoveData);

// spd deliberately differs from spa here, to prove toGen1Base's override
// (spd := spa) is what the orchestrator actually applies.
const attackerBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 50, spe: 45 };
const defenderBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 70, spe: 90 };
const perfectIvs: StatBlock = { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 };
const zeroEvs: StatBlock = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

const vineWhip: MoveData = {
  name: "vine-whip",
  type: "grass",
  category: "physical",
  power: 45,
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

  mockedGetGen1Types.mockImplementation(async (species: string) => {
    return species === "Attacker" ? attackerTypes : defenderTypes;
  });
  mockedGetBaseStats.mockImplementation(async (species: string) => {
    return species === "Attacker"
      ? overrides?.attackerBaseStats ?? attackerBase
      : overrides?.defenderBaseStats ?? defenderBase;
  });
  mockedGetMoveData.mockResolvedValue(overrides?.move ?? vineWhip);
}

describe("evaluateGen1Matchup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes an exact hand-verified matchup result, including crit chance and crit damage", async () => {
    setupMocks();

    const result = await evaluateGen1Matchup({
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toEqual({
      normal: {
        damageRange: { min: 13, max: 15 },
        hitsToKO: { min: 8, max: 10 },
      },
      criticalHit: {
        chance: 22 / 256,
        damageRange: { min: 24, max: 29 },
        hitsToKO: { min: 5, max: 5 },
      },
      moveOrder: "defender",
    });
  });

  it("returns null for a status move", async () => {
    setupMocks({
      move: { name: "growl", type: "normal", category: "status", power: null, priority: 0, highCritRate: false },
    });

    const result = await evaluateGen1Matchup({
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Growl",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns null when a types lookup fails", async () => {
    mockedGetGen1Types.mockResolvedValue(null);
    mockedGetBaseStats.mockResolvedValue(attackerBase);
    mockedGetMoveData.mockResolvedValue(vineWhip);

    const result = await evaluateGen1Matchup({
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50 },
    });

    expect(result).toBeNull();
  });

  it("returns 'attacker' move order for a positive-priority move even with lower Speed", async () => {
    setupMocks({
      move: { name: "quick-attack", type: "normal", category: "physical", power: 40, priority: 1, highCritRate: false },
    });

    const result = await evaluateGen1Matchup({
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Quick Attack",
      defender: { species: "Defender", level: 50 },
    });

    expect(result!.moveOrder).toBe("attacker");
  });

  it("returns a zero damage range with no floor for a type-immune matchup, and Infinity hitsToKO", async () => {
    setupMocks({
      attackerTypes: ["normal"],
      defenderTypes: ["ghost"],
      move: { name: "tackle", type: "normal", category: "physical", power: 40, priority: 0, highCritRate: false },
    });

    const result = await evaluateGen1Matchup({
      attacker: { species: "Attacker", level: 50, ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Tackle",
      defender: { species: "Defender", level: 50 },
    });

    expect(result!.normal.damageRange).toEqual({ min: 0, max: 0 });
    expect(result!.normal.hitsToKO.max).toBe(Infinity);
  });
});
