import { describe, it, expect } from "vitest";
import { calculateGen45DamageRange } from "./gen45Damage";
import type { MoveData } from "./types";

const attackerStats = { hp: 150, atk: 100, def: 80, spa: 70, spd: 80, spe: 90 };
const defenderStats = { hp: 150, atk: 80, def: 100, spa: 80, spd: 100, spe: 70 };

describe("calculateGen45DamageRange", () => {
  it("computes a STAB, type-neutral physical move, non-crit", () => {
    const move: MoveData = {
      name: "tackle",
      type: "normal",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["fighting"], false);
    expect(result).toEqual({ min: 47, max: 55 });
  });

  it("applies the critical multiplier as a post-hoc x2 on the base term, NOT by changing the level term (unlike Gen 1)", () => {
    const move: MoveData = {
      name: "tackle",
      type: "normal",
      category: "physical",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["fighting"], true);
    expect(result).toEqual({ min: 94, max: 111 });
  });

  it("uses the special attack/defense stats for a special-category move, non-STAB, super-effective", () => {
    const move: MoveData = {
      name: "ember",
      type: "fire",
      category: "special",
      power: 80,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(50, attackerStats, defenderStats, move, ["water"], ["grass"], false);
    expect(result).toEqual({ min: 44, max: 52 });
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
    const result = calculateGen45DamageRange(50, attackerStats, defenderStats, move, ["normal"], ["normal"], false);
    expect(result).toBeNull();
  });

  it("returns a genuine {min:0,max:0} for a true type immunity, NOT floored to 1", () => {
    const move: MoveData = {
      name: "tackle",
      type: "normal",
      category: "physical",
      power: 40,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(50, attackerStats, defenderStats, move, ["water"], ["ghost"], false);
    expect(result).toEqual({ min: 0, max: 0 });
  });

  it("applies a 1-HP minimum-damage floor for a non-immune hit that would otherwise round to 0 (unlike Gen 1, which has no floor)", () => {
    const lowStatsAttacker = { hp: 20, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };
    const lowStatsDefender = { hp: 20, atk: 1, def: 1, spa: 255, spd: 255, spe: 1 };
    const move: MoveData = {
      name: "bubble",
      type: "water",
      category: "special",
      power: 1,
      priority: 0,
      highCritRate: false,
    };
    const result = calculateGen45DamageRange(1, lowStatsAttacker, lowStatsDefender, move, ["normal"], ["grass"], false);
    expect(result).toEqual({ min: 1, max: 1 });
  });
});
