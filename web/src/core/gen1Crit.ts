export function getGen1CritChance(baseSpeed: number, highCritRate: boolean): number {
  const baseThreshold = Math.floor(baseSpeed / 2);
  const threshold = highCritRate ? Math.min(baseThreshold * 8, 255) : baseThreshold;
  return threshold / 256;
}
