// Authored for fartola. Not ported from upstream.
//
// XSD validator for IOF XML 3.0 documents (CourseData + EntryList). Backed
// by xmllint-wasm — a pure-WebAssembly libxml2 build that runs on Node
// without any native postinstall step. We tried libxmljs2-xsd first per
// RESEARCH §"Open Question 1" — both binders work, but xmllint-wasm avoids
// adding another native build dep on top of better-sqlite3 + serialport.
// The choice is documented in the plan-05 SUMMARY.
//
// Behavior contract:
// - Load the bundled IOF.xsd once at module init (resolveSchema()). Cache
//   the bytes so repeat validateXml() calls don't re-read from disk.
// - validateXml(xmlSource) → Promise<{ valid: boolean; errors: XsdError[] }>.
//   Errors carry line + message; column is null for xmllint output that
//   doesn't include it.
// - Schema parse errors surface as a thrown error from module load — that's
//   a deployment bug, not user input, so we don't try to recover.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-05-PLAN.md task 1
// - .planning/phases/01-single-laptop-training-mvp/01-PATTERNS.md §S-3
//   (lazy native-binding require — used here for the WASM module path
//   resolution; the .wasm file lives next to xmllint-wasm's index-node.js
//   and is loaded internally by the library)
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
//   §"Open Question 1" (libxmljs2-xsd vs xmllint-wasm choice — fell back
//   to xmllint-wasm; native build avoided)
// - .planning/phases/01-single-laptop-training-mvp/01-RESEARCH.md
//   §"Pattern 7: IOF XML 3.0 ResultList export with XSD validation"
//   (XSD validation BEFORE the DB write — the binding contract for SC#6)

import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { validateXML, type XMLFileInfo } from 'xmllint-wasm';

export interface XsdError {
  /** 1-based line number in the source document, or null when xmllint did
   * not surface a parseable position. */
  line: number | null;
  /** Always null with xmllint-wasm (the library reports lines only). Kept
   * in the shape so callers can switch to libxmljs2-xsd later without
   * breaking the wire contract. */
  column: number | null;
  /** Human-readable message; xmllint's "element X: Y" format trimmed. */
  message: string;
}

export interface XsdValidationResult {
  valid: boolean;
  errors: XsdError[];
}

// ---------------------------------------------------------------------------
// Schema load — once at module init.
// ---------------------------------------------------------------------------

const HERE = path.dirname(fileURLToPath(import.meta.url));
// PATTERNS S-5: HERE-based path resolution. Under `tsx` the source lives at
// apps/edge/src/xml/validate.ts so IOF.xsd is in the same directory. Under
// the published tarball produced by scripts/build-tarball.sh, validate.ts
// is bundled into dist/bin/fartola.cjs and dist/server.{cjs,mjs}, while the
// XSD lives at dist/xml/IOF.xsd. Plan 18 — probe both layouts so a single
// bundled binary works whether HERE is the source tree, dist/, or dist/bin/.
import { existsSync } from 'node:fs';
function resolveSchemaPath(): string {
  const candidates = [
    path.join(HERE, 'IOF.xsd'), // source tree (apps/edge/src/xml/)
    path.join(HERE, 'xml', 'IOF.xsd'), // dist/  (bundled server)
    path.join(HERE, '..', 'xml', 'IOF.xsd'), // dist/bin/  (bundled bin)
  ];
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  // Fall back to the first candidate so the existing readFileSync produces a
  // clear ENOENT pointing at the source-tree path operators recognise.
  return candidates[0] as string;
}
const SCHEMA_PATH = resolveSchemaPath();
const SCHEMA_BYTES = readFileSync(SCHEMA_PATH, 'utf8');

const SCHEMA_FILE: XMLFileInfo = {
  fileName: 'IOF.xsd',
  contents: SCHEMA_BYTES,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Validate an IOF XML 3.0 document against the bundled IOF.xsd schema.
 * The schema is parsed once at module load and reused on every call, so this
 * function is async only because xmllint-wasm's API is. */
export async function validateXml(xmlSource: string): Promise<XsdValidationResult> {
  const result = await validateXML({
    xml: [{ fileName: 'input.xml', contents: xmlSource }],
    schema: [SCHEMA_FILE],
  });
  if (result.valid) {
    return { valid: true, errors: [] };
  }
  const errors: XsdError[] = result.errors.map((e) => ({
    line: e.loc?.lineNumber ?? null,
    column: null,
    message: e.message ?? e.rawMessage,
  }));
  return { valid: false, errors };
}

/** Internal — exposed only so the test can assert the bundled XSD was read.
 * Not part of the public API. */
export const __schemaInfo = {
  bytes: SCHEMA_BYTES.length,
  path: SCHEMA_PATH,
};
