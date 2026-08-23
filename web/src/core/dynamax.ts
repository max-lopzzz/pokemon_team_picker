const DYNAMAX_STATES = new Set(["Dynamax", "Gigantamax"]);

export function applyDynamaxHp(hp: number, dynamaxState: string | null): number {
  if (dynamaxState && DYNAMAX_STATES.has(dynamaxState)) {
    return Math.floor(hp * 1.5);
  }
  return hp;
}
