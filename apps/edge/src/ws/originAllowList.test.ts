// Authored for fartol. Not ported from upstream.
//
// Unit coverage for the isOriginAllowed predicate that gates the WS
// `verifyClient` upgrade hook. Pulled out as a unit test (no Fastify
// boot) so the predicate-level behavior is checked even when the
// integration suite (ws/index.test.ts) can't bind to 127.0.0.1 in
// sandboxes that EPERM on listen.
//
// Regression: code-review F-001 (codex) BLOCKER — without --allow-lan
// the MeOS parallel laptop's browser sends Origin: http://<lan-ip>:3000
// which the loopback-only Set rejects, leaving the page mounted but
// the live WS disconnected.

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

import { isOriginAllowed } from './index.ts';

describe('isOriginAllowed', () => {
  test('absent Origin header passes (CLI / same-origin tools)', () => {
    assert.equal(isOriginAllowed(undefined, false), true);
    assert.equal(isOriginAllowed(undefined, true), true);
  });

  test('loopback origins pass regardless of allowLan', () => {
    const loopback = [
      'http://localhost:5173',
      'http://127.0.0.1:5173',
      'http://[::1]:5173',
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://[::1]:3000',
      'http://localhost:4173',
      'http://127.0.0.1:4173',
    ];
    for (const o of loopback) {
      assert.equal(isOriginAllowed(o, false), true, `${o} (allowLan=false)`);
      assert.equal(isOriginAllowed(o, true), true, `${o} (allowLan=true)`);
    }
  });

  test('foreign origins blocked regardless of allowLan', () => {
    const evil = [
      'http://evil.com',
      'https://evil.com',
      'http://attacker.example.com:8080',
      'http://8.8.8.8',
      'http://[2001:db8::1]:3000',
    ];
    for (const o of evil) {
      assert.equal(isOriginAllowed(o, false), false, `${o} (allowLan=false)`);
      assert.equal(isOriginAllowed(o, true), false, `${o} (allowLan=true)`);
    }
  });

  test('LAN origins blocked when allowLan=false (F-001 BLOCKER pre-fix state)', () => {
    const lan = [
      'http://192.168.1.20:3000',
      'http://10.0.0.5:3000',
      'http://172.16.5.10:3000',
      'http://fartol-laptop.local:3000',
      'http://[fe80::1%25eth0]:3000',
    ];
    for (const o of lan) {
      assert.equal(isOriginAllowed(o, false), false, `${o} must be 403 when allowLan=false`);
    }
  });

  test('LAN origins pass when allowLan=true (F-001 BLOCKER fix)', () => {
    const lan = [
      // RFC1918 192.168/16
      'http://192.168.1.20:3000',
      'http://192.168.50.255:3000',
      // RFC1918 10/8
      'http://10.0.0.5:3000',
      'http://10.255.255.255:3000',
      // RFC1918 172.16/12 (172.16.0.0 - 172.31.255.255)
      'http://172.16.0.1:3000',
      'http://172.31.255.254:3000',
      // mDNS
      'http://fartol-laptop.local:3000',
      'http://stortuna-edge.local',
    ];
    for (const o of lan) {
      assert.equal(isOriginAllowed(o, true), true, `${o} must pass when allowLan=true`);
    }
  });

  test('172.32.x.x is NOT in RFC1918 — blocked even with allowLan', () => {
    // Defensive: the 172.16/12 range is exactly 172.16 through 172.31.
    // 172.32 onwards is public Internet. The regex must NOT match it.
    assert.equal(
      isOriginAllowed('http://172.32.0.1:3000', true),
      false,
      '172.32.0.1 is public, must be blocked even with allowLan'
    );
    assert.equal(
      isOriginAllowed('http://172.15.0.1:3000', true),
      false,
      '172.15.0.1 is below the RFC1918 range, must be blocked'
    );
  });
});
