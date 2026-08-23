import { describe, it, expect } from "vitest";
import { calculateDamageRange } from "./damage";
import type { MoveData } from "./types";

const attackerStats = { hp: 150, atk: 100, def: 80, spa: 70, spd: 80, spe: 90 };
const defenderStats = { hp: 150, atk: 80, def: 100, spa: 80, spd: 100, spe: 70 };

describe("calculateDamageRange", () => {
  it("computes a STAB, type-neutral physical move", () => {
    const move: MoveData = {
      name: "ember",
      type: "fire",
      category: "physical",
      power: 80,
      priority: 0,
    };
    const result = calculateDamageRange(50, attackerStats, defenderStats, move, ["fire"], ["normal"]);
    expect(result).toEqual({ min: 47, max: 55 });
  });

  it("computes a non-STAB, super-effective physical move", () => {
    const move: MoveData = {
      name: "surf",
      type: "water",
      category: "physical",
      power: 80,
      priority: 0,
    };
    const result = calculateDamageRange(50, attackerStats, defenderStats, move, ["grass"], ["fire"]);
    expect(result).toEqual({ min: 62, max: 74 });
  });

  it("uses the special attack/defense stats for a special move", () => {
    const move: MoveData = {
      name: "flamethrower",
      type: "fire",
      category: "special",
      power: 90,
      priority: 0,
    };
    const result = calculateDamageRange(50, attackerStats, defenderStats, move, ["fire"], ["normal"]);
    expect(result).toEqual({ min: 36, max: 43 });
  });

  it("returns null for a status move", () => {
    const move: MoveData = {
      name: "growl",
      type: "normal",
      category: "status",
      power: null,
      priority: 0,
    };
    const result = calculateDamageRange(50, attackerStats, defenderStats, move, ["normal"], ["normal"]);
    expect(result).toBeNull();
  });

  it("returns a zero range for a type-immune matchup", () => {
    const move: MoveData = {
      name: "tackle",
      type: "normal",
      category: "physical",
      power: 40,
      priority: 0,
    };
    const result = calculateDamageRange(50, attackerStats, defenderStats, move, ["normal"], ["ghost"]);
    expect(result).toEqual({ min: 0, max: 0 });
  });

  it("floors a low-level, low-power, doubly-resisted hit up to a minimum of 1 damage", () => {
    // Hand-verified: level 5, atk 10, def 20, power 10, no STAB, 0.25x
    // effectiveness (fire vs water/dragon: 0.5 * 0.5).
    //   floor(2*5/5 + 2) = 4
    //   floor(4 * 10 * (10/20)) = floor(20) = 20
    //   floor(20 / 50) = 0; base = 0 + 2 = 2
    //   max (unclamped) = floor(2 * 1 * 0.25 * 1.0) = floor(0.5) = 0
    //   min (unclamped) = floor(2 * 1 * 0.25 * 0.85) = floor(0.425) = 0
    // Both round to 0 pre-clamp; since effectiveness > 0 (not immune),
    // both should be clamped up to 1.
    const lowLevelAttacker = { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };
    const lowLevelDefender = { hp: 20, atk: 10, def: 20, spa: 10, spd: 10, spe: 10 };
    const move: MoveData = {
      name: "ember",
      type: "fire",
      category: "physical",
      power: 10,
      priority: 0,
    };
    const result = calculateDamageRange(
      5,
      lowLevelAttacker,
      lowLevelDefender,
      move,
      ["normal"],
      ["water", "dragon"]
    );
    expect(result).toEqual({ min: 1, max: 1 });
  });
});
