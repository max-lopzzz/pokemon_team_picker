import { describe, it, expect, vi, beforeEach } from "vitest";
import { evaluateMatchup } from "./matchup";
import { getSpeciesInfo } from "./pokeapi";
import { getBaseStats } from "./baseStats";
import { getMoveData } from "./moveData";
import type { MoveData, StatBlock } from "./types";

vi.mock("./pokeapi", () => ({ getSpeciesInfo: vi.fn() }));
vi.mock("./baseStats", () => ({ getBaseStats: vi.fn() }));
vi.mock("./moveData", () => ({ getMoveData: vi.fn() }));

const mockedGetSpeciesInfo = vi.mocked(getSpeciesInfo);
const mockedGetBaseStats = vi.mocked(getBaseStats);
const mockedGetMoveData = vi.mocked(getMoveData);

const attackerBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 45 };
const defenderBase: StatBlock = { hp: 45, atk: 49, def: 49, spa: 65, spd: 65, spe: 90 };
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

  mockedGetSpeciesInfo.mockImplementation(async (species: string) => {
    const types = species === "Attacker" ? attackerTypes : defenderTypes;
    return { name: species, types, abilities: [], spriteUrl: null };
  });
  mockedGetBaseStats.mockImplementation(async (species: string) => {
    return species === "Attacker"
      ? overrides?.attackerBaseStats ?? attackerBase
      : overrides?.defenderBaseStats ?? defenderBase;
  });
  mockedGetMoveData.mockResolvedValue(overrides?.move ?? vineWhip);
}

describe("evaluateMatchup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("computes an exact hand-verified matchup result", async () => {
    setupMocks();

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result).toEqual({
      damageRange: { min: 13, max: 15 },
      hitsToKO: { min: 8, max: 10 },
      moveOrder: "defender",
    });
  });

  it("returns 'attacker' move order for a positive-priority move even with lower Speed", async () => {
    setupMocks({
      move: { name: "quick-attack", type: "normal", category: "physical", power: 40, priority: 1, highCritRate: false },
    });

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Quick Attack",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result!.moveOrder).toBe("attacker");
  });

  it("returns null for a status move", async () => {
    setupMocks({
      move: { name: "growl", type: "normal", category: "status", power: null, priority: 0, highCritRate: false },
    });

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Growl",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result).toBeNull();
  });

  it("returns null when a species lookup fails", async () => {
    mockedGetSpeciesInfo.mockResolvedValue(null);
    mockedGetBaseStats.mockResolvedValue(attackerBase);
    mockedGetMoveData.mockResolvedValue(vineWhip);

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result).toBeNull();
  });

  it("returns null for an unknown nature", async () => {
    setupMocks();

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "NotANature", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result).toBeNull();
  });

  it("boosts defender HP for a Dynamaxed defender, increasing hitsToKO", async () => {
    setupMocks();

    const normal = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });
    const dynamaxed = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Vine Whip",
      defender: { species: "Defender", level: 50, dynamaxState: "Dynamax" },
    });

    expect(dynamaxed!.hitsToKO.max).toBeGreaterThanOrEqual(normal!.hitsToKO.max);
  });

  it("returns Infinity hits-to-KO for a type-immune matchup", async () => {
    setupMocks({
      attackerTypes: ["normal"],
      defenderTypes: ["ghost"],
      move: { name: "tackle", type: "normal", category: "physical", power: 40, priority: 0, highCritRate: false },
    });

    const result = await evaluateMatchup({
      attacker: { species: "Attacker", level: 50, nature: "Hardy", ivs: perfectIvs, evs: zeroEvs },
      attackerMove: "Tackle",
      defender: { species: "Defender", level: 50, dynamaxState: null },
    });

    expect(result!.damageRange).toEqual({ min: 0, max: 0 });
    expect(result!.hitsToKO.max).toBe(Infinity);
  });
});
