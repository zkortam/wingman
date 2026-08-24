export type VarianceConclusion = 'DEFECT' | 'MODEL_VARIANCE' | 'FALSE_POSITIVE'

export function classifyVariance(passCount: number, sampleCount: number): VarianceConclusion {
  if (!Number.isInteger(passCount) || passCount < 0 || passCount > sampleCount) {
    throw new RangeError('passCount must be within the sample count')
  }
  if (passCount <= 1) return 'DEFECT'
  if (passCount === sampleCount) return 'FALSE_POSITIVE'
  return 'MODEL_VARIANCE'
}
