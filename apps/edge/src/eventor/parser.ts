// Authored for fartol. Not ported from upstream.
//
// Streaming XML parser for the Eventor löpardatabasen feeds (Plan 02-01
// task 2). Two public surfaces:
//
//   - streamCompetitorsXml(path, onRecord)
//       Walks the 86 MB cachedcompetitors.xml as a SAX event stream
//       (saxes 6) and flushes one EventorCompetitor record per closing
//       </Competitor> tag. Memory stays O(1) per record regardless of
//       input size — the bench laptop can ingest 252 919 competitors
//       without DOM materialisation.
//
//   - parseClubsXmlSync(path)
//       Reads the 1.3 MB clubs.xml as a string and returns the full
//       EventorClub[] array. fast-xml-parser's DOM mode is fine at this
//       size (RESEARCH §Pattern 1 endorses the split — streaming for
//       competitors, DOM for clubs).
//
// T-FILE-IMPORT mitigation (the security gate this file provides):
//   - Pre-flight DOCTYPE / ENTITY regex on the first 512 bytes — throws
//     before any parser construction. Mirrors xml/parse.ts:115-124.
//   - saxes does not implement DOCTYPE/ENTITY expansion (per its spec),
//     so even without the pre-flight the billion-laughs vector is
//     closed; the pre-flight is belt+suspenders.
//   - The clubs parser inherits xml/parse.ts's processEntities:false
//     XMLParser config and runs the same pre-flight on the source string.
//
// UTF-8 streaming nuance (RESEARCH §Pitfall 6 mitigation):
//   - createReadStream is opened WITHOUT { encoding: 'utf8' } so that
//     multi-byte chars (Östberg / Pär) do not get fragmented across
//     chunk boundaries. saxes accepts Buffers and decodes internally;
//     passing 'utf8' to the stream forces per-chunk string decode which
//     truncates multi-byte sequences split on the buffer edge.
//
// Locked by:
// - .planning/phases/02-4-klubbs-mvp/02-01-PLAN.md task 2
// - .planning/phases/02-4-klubbs-mvp/02-RESEARCH.md §Pattern 1 — saxes
//   streaming template + the synthetic fixture body.
// - .planning/phases/02-4-klubbs-mvp/02-RESEARCH.md §Pitfall 6 — UTF-8
//   streaming nuance.
// - .planning/research/eventor-api-smoke.md §"Sample competitor element"
//   — wire shape, orphan-no-Organisation rule, multi-ControlCard rule.

import { createReadStream, readFileSync, openSync, readSync, closeSync } from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { SaxesParser } from 'saxes';
import { XMLParser } from 'fast-xml-parser';

export interface EventorCompetitor {
  person_id: number;
  family_name: string;
  given_name: string;
  birth_year: number | null;
  /** 'M' | 'F' | null — Eventor's only documented values. */
  sex: string | null;
  /** FK to eventor_clubs.club_id; null for orphan competitors (no Organisation). */
  club_id: number | null;
  /** SportIdent card number; null for runners without one. */
  si_card: number | null;
  /** Emit card number (Norwegian / legacy system); null is the common case. */
  emit_card: number | null;
  /** Eventor's modifyTime parsed to epoch ms. */
  modify_date_ms: number;
}

export interface EventorClub {
  club_id: number;
  name: string;
  short_name: string | null;
  media_name: string | null;
  parent_id: number | null;
  modify_date_ms: number;
}

// ---------------------------------------------------------------------------
// T-FILE-IMPORT pre-flight (shared between both surfaces).
// ---------------------------------------------------------------------------

function readHead(path: string, byteCount: number): string {
  const fd = openSync(path, 'r');
  try {
    const buf = Buffer.alloc(byteCount);
    const bytesRead = readSync(fd, buf, 0, byteCount, 0);
    return buf.slice(0, bytesRead).toString('utf8');
  } finally {
    closeSync(fd);
  }
}

function rejectDoctypeOrEntity(head: string): void {
  if (/<!DOCTYPE/i.test(head)) throw new Error('DOCTYPE not allowed');
  if (/<!ENTITY/i.test(head)) throw new Error('ENTITY declarations not allowed');
}

// ---------------------------------------------------------------------------
// streamCompetitorsXml — SAX streaming.
//
// State machine: maintain at most one in-flight Partial<EventorCompetitor>
// (current). Keep a pathStack so element matching is path-aware (e.g.
// Competitor/Person/Id vs Competitor/Organisation/Id — both are `<Id>`).
// On </Competitor> emit if person_id resolved; reset current to null.
// ---------------------------------------------------------------------------

export async function streamCompetitorsXml(
  path: string,
  onRecord: (rec: EventorCompetitor) => void
): Promise<void> {
  // T-FILE-IMPORT — fail closed BEFORE constructing the parser.
  const head = readHead(path, 512);
  rejectDoctypeOrEntity(head);

  const parser = new SaxesParser({ xmlns: false });

  let current: Partial<EventorCompetitor> | null = null;
  const pathStack: string[] = [];
  let textBuf = '';
  let activePunchingSystem: string | null = null;

  let parserError: Error | null = null;
  parser.on('error', (err) => {
    parserError = err instanceof Error ? err : new Error(String(err));
  });

  parser.on('opentag', (tag) => {
    pathStack.push(tag.name);
    textBuf = '';
    if (tag.name === 'Competitor') {
      current = {
        person_id: 0,
        family_name: '',
        given_name: '',
        birth_year: null,
        sex: null,
        club_id: null,
        si_card: null,
        emit_card: null,
        modify_date_ms: 0,
      };
      const mt = tag.attributes['modifyTime'];
      if (typeof mt === 'string') {
        current.modify_date_ms = Date.parse(mt) || 0;
      }
    }
    if (tag.name === 'Person' && current) {
      const sex = tag.attributes['sex'];
      if (sex === 'M' || sex === 'F') current.sex = sex;
    }
    if (tag.name === 'ControlCard') {
      const ps = tag.attributes['punchingSystem'];
      activePunchingSystem = typeof ps === 'string' ? ps : null;
    }
  });

  parser.on('text', (text) => {
    textBuf += text;
  });

  parser.on('closetag', (tag) => {
    const here = pathStack.join('/');
    if (current) {
      // Path-aware text assignment — guard against duplicate <Id> elements
      // at different paths (Person/Id vs Organisation/Id).
      if (here.endsWith('Competitor/Person/Id')) {
        const n = Number(textBuf.trim());
        if (Number.isFinite(n) && n > 0) current.person_id = n;
      } else if (here.endsWith('Person/Name/Family')) {
        current.family_name = textBuf.trim();
      } else if (here.endsWith('Person/Name/Given')) {
        current.given_name = textBuf.trim();
      } else if (here.endsWith('Person/BirthDate')) {
        const m = textBuf.trim().match(/^(\d{4})/);
        current.birth_year = m ? Number(m[1]) : null;
      } else if (here.endsWith('Competitor/Organisation/Id')) {
        const n = Number(textBuf.trim());
        current.club_id = Number.isFinite(n) && n > 0 ? n : null;
      } else if (here.endsWith('Competitor/ControlCard')) {
        const n = Number(textBuf.trim());
        if (Number.isFinite(n) && n > 0) {
          if (activePunchingSystem === 'SI') current.si_card = n;
          else if (activePunchingSystem === 'Emit') current.emit_card = n;
        }
        activePunchingSystem = null;
      }
    }
    if (tag.name === 'Competitor') {
      if (current && current.person_id && current.person_id > 0) {
        onRecord(current as EventorCompetitor);
      }
      current = null;
    }
    pathStack.pop();
    // Reset textBuf after each closetag so leading whitespace between
    // sibling elements isn't accumulated.
    textBuf = '';
  });

  // Use StringDecoder for stateful UTF-8 decoding across stream chunks.
  // saxes v6 only accepts strings (verified in its .d.ts) so we MUST
  // convert buffers ourselves. Buffer.toString('utf8') has no streaming
  // state, so a chunk boundary that lands inside a multi-byte codepoint
  // yields U+FFFD at the seam — every "Östberg" / "Pär" / "André" in the
  // 252919-row Swedish runner DB has ~64KB/N probability of corruption.
  // StringDecoder buffers partial multi-byte sequences across writes,
  // which is exactly its purpose (Phase 2.0 code-review F-001 BLOCKER).
  const decoder = new StringDecoder('utf8');
  const stream = createReadStream(path);
  for await (const chunk of stream) {
    parser.write(decoder.write(chunk as Buffer));
    if (parserError) throw parserError;
  }
  const tail = decoder.end();
  if (tail.length > 0) parser.write(tail);
  parser.close();
  if (parserError) throw parserError;
}

// ---------------------------------------------------------------------------
// parseClubsXmlSync — DOM parse for the smaller clubs.xml (1.3 MB).
// ---------------------------------------------------------------------------

const clubsParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  processEntities: false,
  allowBooleanAttributes: true,
  parseAttributeValue: true,
  trimValues: true,
});

interface OrgRawNode {
  Id?: unknown;
  Name?: unknown;
  ShortName?: unknown;
  MediaName?: unknown;
  ParentOrganisationId?: unknown;
  '@_modifyTime'?: unknown;
}

function nodeText(x: unknown): string | null {
  if (x === null || x === undefined) return null;
  if (typeof x === 'string') return x.trim().length > 0 ? x.trim() : null;
  if (typeof x === 'number' || typeof x === 'boolean') return String(x);
  // fast-xml-parser may wrap text-with-attrs as { '#text': '...' }.
  if (typeof x === 'object') {
    const obj = x as Record<string, unknown>;
    const t = obj['#text'];
    return nodeText(t);
  }
  return null;
}

function nodeInt(x: unknown): number | null {
  const s = nodeText(x);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

export function parseClubsXmlSync(path: string): EventorClub[] {
  const source = readFileSync(path, 'utf8');
  // T-FILE-IMPORT — same pre-flight as the streaming surface.
  rejectDoctypeOrEntity(source);
  const parsed = clubsParser.parse(source) as Record<string, unknown>;
  // Root may be OrganisationList (most common) or ClubList (older feeds).
  // We accept either; key resolution picks the first matching root child.
  const rootKey = Object.keys(parsed).find((k) => !k.startsWith('?') && !k.startsWith('@_'));
  if (!rootKey) return [];
  const root = parsed[rootKey] as Record<string, unknown> | undefined;
  if (!root) return [];

  // Eventor lists organisations under <Organisation> elements; older
  // ClubList wraps them as <Club>. Accept both.
  const candidates: unknown[] = [];
  for (const key of ['Organisation', 'Club']) {
    const val = root[key];
    if (Array.isArray(val)) candidates.push(...val);
    else if (val !== undefined && val !== null) candidates.push(val);
  }

  const out: EventorClub[] = [];
  for (const raw of candidates) {
    if (!raw || typeof raw !== 'object') continue;
    const node = raw as OrgRawNode;
    const clubId = nodeInt(node.Id);
    if (clubId === null || clubId <= 0) continue;
    const name = nodeText(node.Name);
    if (name === null) continue;
    const modifyTimeRaw = nodeText(node['@_modifyTime']);
    const modifyMs = modifyTimeRaw ? Date.parse(modifyTimeRaw) || 0 : 0;
    out.push({
      club_id: clubId,
      name,
      short_name: nodeText(node.ShortName),
      media_name: nodeText(node.MediaName),
      parent_id: nodeInt(node.ParentOrganisationId),
      modify_date_ms: modifyMs,
    });
  }
  return out;
}
