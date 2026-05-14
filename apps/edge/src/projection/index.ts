// Authored for fartol. Not ported from upstream.
//
// Public barrel for the projection layer. Plan 08 (WS results channel),
// plan 11 (web client wire types), and plan 16 (IOF XML export) all
// consume the reducer through this surface.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-07-PLAN.md task 2

export * from './types.ts';
export { reduce } from './reduce.ts';
export type { ReduceInput, CourseWithControlCodes } from './reduce.ts';
export { detectStatus } from './dnfMp.ts';
export type { DetectInput, StatusResult } from './dnfMp.ts';
export { matchCardToCompetitor } from './matching.ts';
export { halfDayClockToMs, diffMs } from './halfDayClockMath.ts';
