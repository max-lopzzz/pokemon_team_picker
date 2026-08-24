import { TYPE_CHART } from "./typeChart";

const GEN1_TYPES = [
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
] as const;

// Documented historical deviations from the modern (Gen 6+) chart. See
// the Phase 3b spec for provenance and the note that this list was
// asserted from general knowledge rather than freshly re-verified,
// since automated research on the source table proved unreliable.
const GEN1_OVERRIDES: Record<string, Record<string, number>> = {
  ghost: { psychic: 0, ghost: 0 },
  bug: { poison: 2 },
  poison: { bug: 2 },
  ice: { poison: 1 },
};

function buildGen1TypeChart(): Record<string, Record<string, number>> {
  const chart: Record<string, Record<string, number>> = {};
  for (const attackingType of GEN1_TYPES) {
    const row: Record<string, number> = {};
    for (const defendingType of GEN1_TYPES) {
      row[defendingType] =
        GEN1_OVERRIDES[attackingType]?.[defendingType] ??
        TYPE_CHART[attackingType][defendingType];
    }
    chart[attackingType] = row;
  }
  return chart;
}

export const GEN1_TYPE_CHART: Record<string, Record<string, number>> = buildGen1TypeChart();

export function getGen1TypeEffectiveness(
  attackingType: string,
  defendingType: string
): number {
  return GEN1_TYPE_CHART[attackingType]?.[defendingType] ?? 1;
}
