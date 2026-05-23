// Authored for fartola. Not ported from upstream.
//
// node:test grep gate enforcing the C-H5 boundary: packages/shared-types/
// must contain ZERO upward `apps/` imports and ZERO `drizzle-orm` imports.
// Runs as part of `pnpm --filter @fartola/edge test`, gives a clear failure
// message naming the violating file when something drifts.
//
// Locked by:
// - .planning/phases/01-single-laptop-training-mvp/01-REVIEWS.md §C-H5
// - .planning/phases/01-single-laptop-training-mvp/01-CONTEXT.md D-08
//
// Comments (line + block) are stripped before the regex scan so prose
// mentions like "from '../../../apps/edge'" inside a comment don't
// false-positive. Only real import lines trip the gate.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SHARED_TYPES_SRC = path.resolve(__dirname, '../../../../packages/shared-types/src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...walk(full));
    } else if (full.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

test('C-H5: packages/shared-types contains zero upward apps/ imports + zero drizzle-orm imports', () => {
  const files = walk(SHARED_TYPES_SRC);
  assert.ok(files.length > 0, `walk found 0 files under ${SHARED_TYPES_SRC}`);
  for (const file of files) {
    const body = readFileSync(file, 'utf8');
    // Strip block comments + line comments so prose mentions don't false-positive.
    const code = body
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n')
      .filter((l) => !l.trim().startsWith('//'))
      .join('\n');
    assert.equal(
      /from\s+['"][^'"]*\.\.\/\.\.\/\.\.\/apps\//.test(code),
      false,
      `${file} contains an upward apps/ import (codex C-H5 violation)`
    );
    assert.equal(
      /from\s+['"]drizzle-orm['"]/.test(code),
      false,
      `${file} imports drizzle-orm (codex C-H5: shared-types must be Drizzle-free)`
    );
  }
});
