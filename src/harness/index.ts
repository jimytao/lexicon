/**
 * Learner-evidence harness — the one place that decides what the AI is told about
 * the learner, and what the app accepts back from it.
 *
 * Two kinds of tag, both assigned by code and never by the AI:
 *   - provenance (provenance.ts): who wrote a text — learner / external material / AI;
 *   - lane (lanes.ts): IN (reading) vs OUT (the learner's own production).
 *
 * Every module here is pure (no storage, no stores, no network):
 *   - profileContext.ts — weak spots injected into everyday prompts, filtered by lane;
 *   - insightGate.ts    — the weak-spot bubble's schema and the code check on it;
 *   - diagnostic.ts     — batched profile distillation, split and re-stamped by lane.
 * Storage, queueing and flush timing stay in services/profile.ts.
 */
export { PROVENANCE_LEGEND, buildStudyContext, containsSpan, normalizeForMatch, tagText, type TextSource } from './provenance'
export { LANES, LANE_TITLE, isLane, partitionByLane, querySource } from './lanes'
export { buildLaneProfileContext, laneProfile, type ProfileContextVariant } from './profileContext'
export { buildProfileInsightField, gateProfileInsight, learningReferences, type InsightCheckContext, type InsightKind } from './insightGate'
export {
  activeLanes,
  selectDiagnosticSnapshot,
  applyDiagnosticResult,
  buildDiagnosticPrompts,
  type ApplyDiagnosticArgs,
  type DiagnosticEvent,
  type DiagnosticPrompts,
} from './diagnostic'
