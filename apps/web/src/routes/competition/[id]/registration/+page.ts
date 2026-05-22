// Authored for fartola. Not ported from upstream.
//
// /competition/:id/registration data loader. Thin universal load —
// extracts competitionId from the route params and passes it to the
// page; RegistrationView fetches its own competition + classes on
// mount (mirrors the Phase 1 readout/+page.ts pattern of NOT having
// a load function, which we make explicit here for symmetry with
// the future Phase 2.1 cases that may want SSR-prefetched class data).
//
// Note: the load fn returns synchronously — no fetch, no network —
// so SSR + CSR both succeed without a runtime guard. RegistrationView
// owns the fetch of competition+classes (matches Phase 1 ReadoutView).
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-02b-PLAN.md task 4

interface LoadEvent {
  params: { id?: string };
}

export function load(event: LoadEvent): { competitionId: string } {
  return { competitionId: event.params.id ?? '' };
}
