import { describe, it, expect } from "vitest";
import { calculateGen1DamageRange } from "./gen1Damage";
import type { MoveData } from "./types";

const attackerStats = { hp: 150, atk: 100, def: 80, spa: 70, spd: 80, spe: 90 };
const defenderStats = { hp: 150, atk: 80, def: 100, spa: 80, spd: 100, spe: 70 };

describe("calculateGen1DamageRange", () => {
  it("computes a STAB, type-neutral physical move, non-crit", () => {
    const move: MoveData = {
      name: "ember",
      type: "fire",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(50, attackerStats, defenderStats, move, ["fire"], ["normal"], false);
    expect(result).toEqual({ min: 47, max: 55 });
  });

  it("computes the same move as a critical hit, using the doubled level term", () => {
    const move: MoveData = {
      name: "ember",
      type: "fire",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(50, attackerStats, defenderStats, move, ["fire"], ["normal"], true);
    expect(result).toEqual({ min: 88, max: 103 });
  });

  it("computes a non-STAB, super-effective physical move, non-crit", () => {
    const move: MoveData = {
      name: "surf",
      type: "water",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(50, attackerStats, defenderStats, move, ["grass"], ["fire"], false);
    expect(result).toEqual({ min: 62, max: 74 });
  });

  it("uses the special attack/defense stats for a special move, non-crit", () => {
    const move: MoveData = {
      name: "flamethrower",
      type: "fire",
      category: "special",
      power: 90,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(50, attackerStats, defenderStats, move, ["fire"], ["normal"], false);
    expect(result).toEqual({ min: 37, max: 43 });
  });

  it("returns null for a status move", () => {
    const move: MoveData = {
      name: "growl",
      type: "normal",
      category: "status",
      power: null,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["normal"], false);
    expect(result).toBeNull();
  });

  it("returns a genuine zero range with NO minimum-damage floor, non-crit", () => {
    // Hand-verified: level 5, atk 10, def 50, power 10, no STAB, 0.25x
    // effectiveness (ice vs water/ice: 0.5 * 0.5).
    //   floor(2*5*1/5 + 2) = 4
    //   floor(4 * 10 * (10/50) / 50) + 2 = floor(0.16) + 2 = 2 (base)
    //   min = floor(2 * 1 * 0.25 * (217/255)) = floor(0.425...) = 0
    //   max = floor(2 * 1 * 0.25 * 1.0) = floor(0.5) = 0
    // Unlike Phase 3a's damage.ts, this is NOT clamped to 1 — Gen 1 has
    // no minimum-damage guarantee.
    const lowLevelAttacker = { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };
    const lowLevelDefender = { hp: 20, atk: 10, def: 50, spa: 10, spd: 10, spe: 10 };
    const move: MoveData = {
      name: "ice-beam",
      type: "ice",
      category: "physical",
      power: 10,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(
      5,
      lowLevelAttacker,
      lowLevelDefender,
      move,
      ["fire"],
      ["water", "ice"],
      false
    );
    expect(result).toEqual({ min: 0, max: 0 });
  });

  it("returns a genuine zero range with no floor even on a critical hit", () => {
    // Same scenario as above, critical=true:
    //   floor(2*5*2/5 + 2) = 6
    //   floor(6 * 10 * (10/50) / 50) + 2 = floor(0.24) + 2 = 2 (base — same as non-crit here)
    //   min/max both floor to 0, same as the non-crit case.
    const lowLevelAttacker = { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };
    const lowLevelDefender = { hp: 20, atk: 10, def: 50, spa: 10, spd: 10, spe: 10 };
    const move: MoveData = {
      name: "ice-beam",
      type: "ice",
      category: "physical",
      power: 10,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen1DamageRange(
      5,
      lowLevelAttacker,
      lowLevelDefender,
      move,
      ["fire"],
      ["water", "ice"],
      true
    );
    expect(result).toEqual({ min: 0, max: 0 });
  });
});
