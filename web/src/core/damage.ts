import { getTypeEffectiveness } from "./typeChart";
import type { StatBlock, MoveData } from "./types";

export interface DamageRange {
  min: number;
  max: number;
}

export function calculateDamageRange(
  attackerLevel: number,
  attackerStats: StatBlock,
  defenderStats: StatBlock,
  move: MoveData,
  attackerTypes: string[],
  defenderTypes: string[]
): DamageRange | null {
  if (move.category === "status" || move.power === null) {
    return null;
  }

  const atk = move.category === "physical" ? attackerStats.atk : attackerStats.spa;
  const def = move.category === "physical" ? defenderStats.def : defenderStats.spd;

  const base =
    Math.floor(
      Math.floor(Math.floor((2 * attackerLevel) / 5 + 2) * move.power * (atk / def)) / 50
    ) + 2;

  const stab = attackerTypes.includes(move.type) ? 1.5 : 1;

  const typeEffectiveness = defenderTypes.reduce(
    (product, defType) => product * getTypeEffectiveness(move.type, defType),
    1
  );

  const min = Math.floor(base * stab * typeEffectiveness * 0.85);
  const max = Math.floor(base * stab * typeEffectiveness * 1.0);

  // Games since Gen 5 clamp any non-immune hit to at least 1 damage, even
  // when rounding at low levels/power would otherwise compute to 0. A true
  // type immunity (typeEffectiveness === 0) must stay {min: 0, max: 0} so
  // hitsToKO can still resolve to Infinity for genuinely impossible KOs.
  const clampedMin = typeEffectiveness > 0 ? Math.max(1, min) : min;
  const clampedMax = typeEffectiveness > 0 ? Math.max(1, max) : max;

  return { min: clampedMin, max: clampedMax };
}
