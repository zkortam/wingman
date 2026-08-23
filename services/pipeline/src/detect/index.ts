import type { Signal, SignalKind } from "@outcome/schema";

import type { ObservedSession } from "../domain.js";
import { PIPELINE_POLICY } from "../policy.js";
import { adjustForBaseline } from "./baseline.js";
import { requireConjunction, type SignalCandidate } from "./conjunction.js";
import { retryRequestConfidence } from "./lexicon.js";
import { restatedConstraintConfidence } from "./restated.js";

export type Baselines = Readonly<Record<SignalKind, number>>;

export function detectSignals(input: {
  session: ObservedSession;
  baselines: Baselines;
  matchingRestart: boolean;
}): Signal[] {
  const userTurns = input.session.turns.filter(
    (turn): turn is typeof turn & { textRedacted: string } =>
      turn.role === "user" && turn.textRedacted !== null,
  );
  const finalTurn = userTurns.at(-1);
  if (finalTurn === undefined) return [];
  const earlierTexts = userTurns
    .slice(0, -1)
    .map(({ textRedacted }) => textRedacted);
  const raw: Array<
    [SignalKind, number, Record<string, string | number | boolean>]
  > = [
    [
      "RETRY_REQUEST",
      retryRequestConfidence(finalTurn.textRedacted),
      { finalText: finalTurn.textRedacted },
    ],
    [
      "RESTATED_CONSTRAINT",
      restatedConstraintConfidence({
        finalText: finalTurn.textRedacted,
        earlierUserTexts: earlierTexts,
        rules: input.session.userRules ?? [],
      }),
      {
        comparedSources:
          earlierTexts.length + (input.session.userRules?.length ?? 0),
      },
    ],
    [
      "ABANDON_RESTART",
      input.matchingRestart ? 1 : 0,
      { priorGenerationCancelled: input.matchingRestart },
    ],
  ];
  const candidates: SignalCandidate[] = raw.map(
    ([kind, rawConfidence, evidence]) => ({
      kind,
      rawConfidence,
      baseline: input.baselines[kind],
      confidence: adjustForBaseline(rawConfidence, input.baselines[kind]),
      evidence,
    }),
  );
  return requireConjunction(
    candidates,
    PIPELINE_POLICY.signalMinimumConfidence,
  ).map((candidate) => ({
    sessionId: input.session.id,
    turnIdx: finalTurn.idx,
    kind: candidate.kind,
    confidence: candidate.confidence,
    baseline: candidate.baseline,
    evidence: { rawConfidence: candidate.rawConfidence, ...candidate.evidence },
  }));
}
