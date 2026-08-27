/** Generation-generic critical-hit-chance resolution. Despite the filename,
 * this module is no longer Gen-2/3-only — it was widened to also accept
 * `generation: 4 | 5`, since Gen 4-5 use the same stage/chance tables as
 * Gen 3. */

const GEN2_STAGE_CHANCES = [17 / 256, 1 / 8, 1 / 4, 85 / 256, 1 / 2];
const GEN3_STAGE_CHANCES = [1 / 16, 1 / 8, 1 / 4, 1 / 3, 1 / 2];

export function getGen23CritChance(
  generation: 2 | 3 | 4 | 5,
  highCritRate: boolean
): number {
  const stages = generation === 2 ? GEN2_STAGE_CHANCES : GEN3_STAGE_CHANCES;
  const stageIncrement = generation === 2 ? 2 : 1;
  const stage = highCritRate ? stageIncrement : 0;
  const clampedStage = Math.min(stage, stages.length - 1);
  return stages[clampedStage];
}
