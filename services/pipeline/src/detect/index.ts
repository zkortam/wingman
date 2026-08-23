import type { Signal, SignalKind } from "@outcome/schema";

import type { ObservedSession } from "../domain.js";
import { PIPELINE_POLICY } from "../policy.js";
import { adjustForBaseline } from "./baseline.js";
import { requireConjunction, type SignalCandidate } from "./conjunction.js";
import { retryRequestConfidence } from "./lexicon.js";
import { preferenceStatedConfidence } from "./preference.js";
import { restatedConstraintConfidence } from "./restated.js";

export type Baselines = Readonly<Record<SignalKind, number>>;

export interface DetectInput {
  session: ObservedSession;
  baselines: Baselines;
  matchingRestart: boolean;
}

/**
 * Signals for the batch path, where two independent cues are required before anything
 * opens. One weak cue is not worth an incident and a verification budget.
 */
export function detectSignals(input: DetectInput): Signal[] {
  const scored = scoreTurn(input);
  if (scored === null) return [];
  return requireConjunction(
    scored.candidates,
    PIPELINE_POLICY.signalMinimumConfidence,
  ).map((candidate) => toSignal(candidate, input.session.id, scored.turnIdx));
}

/**
 * Signals for the live path, where the conjunction rule is deliberately not applied.
 *
 * The batch path needs two lexical cues because a session transcript is all it has. In
 * a live turn there is a stronger second source available: whether the expectation
 * formed from the user's request was actually met. The classifier requires that
 * corroboration itself before it routes anything to FIX, so filtering here as well
 * would demand three pieces of evidence and drop the common cases — a lone "just do
 * it" produces exactly one cue, and requiring a second would mean the personalization
 * lane never fires at all.
 */
export function detectLiveSignals(input: DetectInput): Signal[] {
  const scored = scoreTurn(input);
  if (scored === null) return [];
  return scored.candidates
    .filter(
      ({ confidence }) => confidence > PIPELINE_POLICY.signalMinimumConfidence,
    )
    .map((candidate) => toSignal(candidate, input.session.id, scored.turnIdx));
}

function scoreTurn(
  input: DetectInput,
): { candidates: SignalCandidate[]; turnIdx: number } | null {
  const userTurns = input.session.turns.filter(
    (turn): turn is typeof turn & { textRedacted: string } =>
      turn.role === "user" && turn.textRedacted !== null,
  );
  const finalTurn = userTurns.at(-1);
  if (finalTurn === undefined) return null;
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
    [
      "PREFERENCE_STATED",
      preferenceStatedConfidence(finalTurn.textRedacted),
      { finalText: finalTurn.textRedacted },
    ],
  ];
  return {
    turnIdx: finalTurn.idx,
    candidates: raw.map(([kind, rawConfidence, evidence]) => ({
      kind,
      rawConfidence,
      baseline: input.baselines[kind],
      confidence: adjustForBaseline(rawConfidence, input.baselines[kind]),
      evidence,
    })),
  };
}

function toSignal(
  candidate: SignalCandidate,
  sessionId: string,
  turnIdx: number,
): Signal {
  return {
    sessionId,
    turnIdx,
    kind: candidate.kind,
    confidence: candidate.confidence,
    baseline: candidate.baseline,
    evidence: { rawConfidence: candidate.rawConfidence, ...candidate.evidence },
  };
}
