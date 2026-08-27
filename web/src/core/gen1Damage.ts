import { getGen1TypeEffectiveness } from "./gen1TypeChart";
import type { StatBlock, MoveData } from "./types";

export interface DamageRange {
  min: number;
  max: number;
}

export function calculateGen1DamageRange(
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

  const atk = move.category === "physical" ? attackerStats.atk : attackerStats.spa;
  const def = move.category === "physical" ? defenderStats.def : defenderStats.spd;
  const criticalMultiplier = critical ? 2 : 1;

  const levelTerm = Math.floor((2 * attackerLevel * criticalMultiplier) / 5 + 2);
  const base = Math.floor((levelTerm * move.power * (atk / def)) / 50) + 2;

  const stab = attackerTypes.includes(move.type) ? 1.5 : 1;

  const typeEffectiveness = defenderTypes.reduce(
    (product, defType) => product * getGen1TypeEffectiveness(move.type, defType),
    1
  );

  // No minimum-damage clamp — Gen 1 can genuinely deal 0 damage.
  const min = Math.floor(base * stab * typeEffectiveness * (217 / 255));
  const max = Math.floor(base * stab * typeEffectiveness * 1.0);

  return { min, max };
}
