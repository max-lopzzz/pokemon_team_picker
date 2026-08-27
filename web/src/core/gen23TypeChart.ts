import { TYPE_CHART } from "./typeChart";

const GEN23_TYPES = [
  "normal",
  "fire",
  "water",
  "electric",
  "grass",
  "ice",
  "fighting",
  "poison",
  "ground",
  "flying",
  "psychic",
  "bug",
  "rock",
  "ghost",
  "dragon",
  "dark",
  "steel",
] as const;

// Documented historical deviation from the modern (Gen 6+) chart,
// independently verified against a live source during this phase's
// research (see the Phase 3c spec): Steel resisted Ghost- and Dark-type
// moves in Gen 2-5, becoming neutral (1x) from Gen 6 onward. No other
// cell differs — Fairy simply doesn't exist yet (17 types, not 18).
// Keyed by ATTACKING type first (Ghost/Dark are the attackers here),
// matching TYPE_CHART's own convention.
const GEN23_OVERRIDES: Record<string, Record<string, number>> = {
  ghost: { steel: 0.5 },
  dark: { steel: 0.5 },
};

function buildGen23TypeChart(): Record<string, Record<string, number>> {
  const chart: Record<string, Record<string, number>> = {};
  for (const attackingType of GEN23_TYPES) {
    const row: Record<string, number> = {};
    for (const defendingType of GEN23_TYPES) {
      row[defendingType] =
        GEN23_OVERRIDES[attackingType]?.[defendingType] ??
        TYPE_CHART[attackingType][defendingType];
    }
    chart[attackingType] = row;
  }
  return chart;
}

export const GEN23_TYPE_CHART: Record<string, Record<string, number>> = buildGen23TypeChart();

export function getGen23TypeEffectiveness(
  attackingType: string,
  defendingType: string
): number {
  return GEN23_TYPE_CHART[attackingType]?.[defendingType] ?? 1;
}
