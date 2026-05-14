// Authored for fartol. Not ported from upstream.
//
// Public API surface for @fartol/shared-types — the shared TS contract
// between apps/edge/ (Fastify bridge) and apps/web/ (SvelteKit PWA).
// Pure-TS package, no build step; consumers rely on root tsconfig's
// `allowImportingTsExtensions` (CONTEXT D-08).
//
// Named exports only, no default — matches packages/sportident/src/index.ts.
// Sectioned barrels make grep-by-section easy in downstream PRs.

// --- NDJSON events ---------------------------------------------------------
export type {
  NdjsonEvent,
  NdjsonBase,
  CardType,
  HalfDayClock,
  NdjsonPunch,
  ConnectionChangedEvent,
  CardInsertedEvent,
  CardReadEvent,
  CardRemovedEvent,
  FrameErrorEvent,
} from './events.ts';
export { EVENT_SCHEMA_VERSION } from './events.ts';

// --- REST DTOs -------------------------------------------------------------
export type { CompetitionDTO, CompetitorDTO, HealthDTO } from './dtos.ts';

// --- DB DTO interfaces -----------------------------------------------------
// Plain DTO interfaces describing the REST/WS wire shape for plan 02's
// schema tables. Drizzle row types live in apps/edge/src/db/types.ts (C-H5).
export type { EventDTO, ClassDTO, ControlDTO, CourseDTO, CourseControlDTO, ClubDTO } from './db.ts';

// --- WebSocket envelopes ---------------------------------------------------
export type { ChannelName, WsEnvelope, WsHelloMessage, WsSubscribeMessage } from './ws.ts';
export { readoutChannel, resultsChannel } from './ws.ts';
