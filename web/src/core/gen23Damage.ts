import { getGen23TypeEffectiveness } from "./gen23TypeChart";
import { getGen23Category } from "./gen23Category";
import type { StatBlock, MoveData } from "./types";

export interface DamageRange {
  min: number;
  max: number;
}

export function calculateGen23DamageRange(
  attackerLevel: number,
  attackerStats: StatBlock,
  defenderStats: StatBlock,
  move: MoveData,
  attackerTypes: string[],
  defenderTypes: string[],
  critical: boolean
): DamageRange | null {
  if (move.category === "status" || move.power === null) {
    return null;
  }

  const category = getGen23Category(move.type);
  const atk = category === "physical" ? attackerStats.atk : attackerStats.spa;
  const def = category === "physical" ? defenderStats.def : defenderStats.spd;

  const base =
    Math.floor(
      Math.floor(Math.floor((2 * attackerLevel) / 5 + 2) * move.power * (atk / def)) / 50
    ) + 2;

  const stab = attackerTypes.includes(move.type) ? 1.5 : 1;

  const typeEffectiveness = defenderTypes.reduce(
    (product, defType) => product * getGen23TypeEffectiveness(move.type, defType),
    1
  );

  const criticalMultiplier = critical ? 2 : 1;

  const min = Math.floor(base * stab * typeEffectiveness * criticalMultiplier * 0.85);
  const max = Math.floor(base * stab * typeEffectiveness * criticalMultiplier * 1.0);

  // A non-immune hit is guaranteed at least 1 HP of damage (unlike Gen 1,
  // which has no floor). A true type immunity must stay {min: 0, max: 0}
  // so hitsToKO can still resolve to Infinity for genuinely impossible KOs.
  const clampedMin = typeEffectiveness > 0 ? Math.max(1, min) : min;
  const clampedMax = typeEffectiveness > 0 ? Math.max(1, max) : max;

  return { min: clampedMin, max: clampedMax };
}
