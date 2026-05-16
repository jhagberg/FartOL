// Authored for fartol. Not ported from upstream.
//
// Thin re-export of Phase 0's card-number → card-type inference helper. Lives
// here so apps/edge consumers (bridge + cardReadPayload) don't reach into
// `@fartol/sportident`'s SiCard subtree directly — single import surface keeps
// the boundary clean.
//
// Phase 0 exports the function as `inferCardType` (from
// `packages/sportident/src/SiCard/cardTypeFromNumber.ts`). The plan 06 spec
// names the binding `cardTypeFromNumber` because that's also the source
// filename and the more conventional name. We rename on re-export so apps/edge
// reads as the spec writes — the Phase 0 surface still exports both names.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-06-PLAN.md task 1
//   ("cardType.ts — reused from packages/sportident/src/SiCard/
//    cardTypeFromNumber.ts (re-export only)")
// - .planning/phases/00-hardware-proof/00-REVIEW.md §CR-002 (single source
//   of truth for card-number → card-type mapping)

export { inferCardType as cardTypeFromNumber } from '@fartol/sportident';
