export interface StageLogger {
  write(entry: { incidentId: string; stage: string; outcome: string; durationMs: number }): void
}

export const consoleStageLogger: StageLogger = {
  write(entry) {
    process.stdout.write(`${JSON.stringify(entry)}\n`)
  },
}

export async function loggedStage<T>(input: {
  logger: StageLogger
  incidentId: string
  stage: string
  run: () => Promise<T>
  outcome?: (value: T) => string
}): Promise<T> {
  const started = performance.now()
  try {
    const value = await input.run()
    input.logger.write({
      incidentId: input.incidentId,
      stage: input.stage,
      outcome: input.outcome?.(value) ?? 'OK',
      durationMs: Math.round(performance.now() - started),
    })
    return value
  } catch (error) {
    input.logger.write({
      incidentId: input.incidentId,
      stage: input.stage,
      outcome: error instanceof Error ? error.message : 'UNKNOWN_ERROR',
      durationMs: Math.round(performance.now() - started),
    })
    throw error
  }
}
