# MeOS protocols — research for fartOLa phase 2

Source: <https://www.melin.nu/meos/sv/codes.php> fetched 2026-05-16. All four
listed downloads were retrieved successfully and extracted to `/tmp/meos-research/`
during research.

## 1. What's in the zip(s)

The page hosts **four** separate downloads (not one zip). Together they
document **four distinct mechanisms** for talking to/from MeOS:

### `mop.zip` — MeOS Online Protocol (MOP)

| File                          | Type          | Purpose                                           |
| ----------------------------- | ------------- | ------------------------------------------------- |
| `MeOS Online Protocol.pdf`    | PDF (5 pages) | Informal spec + examples + setup guide            |
| `mop.xsd`                     | XSD           | Formal schema, version 2.0 (dated **March 2025**) |
| `show.php`                    | PHP           | Reference web UI that renders results             |
| `update.php`                  | PHP           | Reference server endpoint that MeOS POSTs to      |
| `zipupdate.php`               | PHP           | Same as `update.php` but accepts gzipped uploads  |
| `setup.php`                   | PHP           | One-shot MySQL table creator                      |
| `functions.php`, `config.php` | PHP           | Helpers / DB config                               |

### `mip.zip` — MeOS Input Protocol (MIP)

| File                          | Type          | Purpose                                                                                                                          |
| ----------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `MeOS Input Protocol.pdf`     | PDF (4 pages) | Informal spec + examples                                                                                                         |
| `mip.xsd`                     | XSD           | Formal schema, version **3.0** (header says "Date: May 2026, Updated April 2025"; freshly bumped — page lists upload 2026-05-14) |
| `input.php`                   | PHP           | Reference server endpoint that MeOS polls                                                                                        |
| `enterpunch.php`              | PHP           | Reference web form for manual punch entry                                                                                        |
| `functions.php`, `config.php` | PHP           | Helpers / DB config                                                                                                              |

### `sendpunch.zip` — TCP punch injection example

| File             | Type                     | Purpose                                                                                                     |
| ---------------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `SendPunch.java` | Java source (~180 lines) | Shows how to **push** a single punch or a full SI card into MeOS over **raw TCP socket to localhost:10000** |

### `listen_meos.zip` — UDP punch broadcast listener

| File              | Type                     | Purpose                                                                               |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------- |
| `ListenMeOS.java` | Java source (~100 lines) | Shows how to **receive** punch events that MeOS broadcasts over **UDP on port 21338** |

So there are effectively **four protocols**:

1. **MOP** — HTTP+XML push, MeOS → web server (result publishing)
2. **MIP** — HTTP+XML pull, MeOS ← web server (punches/entries in)
3. **SendPunch line protocol** — raw TCP+binary, third party → MeOS
4. **MeOS UDP punch broadcast** — raw UDP+binary, MeOS → listener(s) on LAN

No sample XML files are bundled, but the PDFs each contain 1–2 representative
snippets and the XSDs are fully annotated.

---

## 2. Per-protocol summary

### 2.1 MOP — MeOS Online Protocol (HTTP+XML, MeOS → us)

- **Transport**: HTTP POST, payload = raw XML body (or gzipped XML body if the
  receiver advertises support). HTTP headers carry `competition` (numeric id)
  and `pwd` (plain-text password).
- **Direction**: **Read-only from fartOLa's POV.** MeOS pushes, we receive and
  store. There is no MOP "GET" endpoint in MeOS — it only writes outwards.
- **Message shape**: Two root elements:
  - `<MOPComplete>` — full snapshot; receiver should drop prior state and
    replace it. Sent on initial connect and periodically.
  - `<MOPDiff>` — incremental updates (also used for deletes via `delete="true"`).
    Both contain `<competition>`, `<ctrl>` (radio controls), `<cls>` (classes),
    `<org>` (clubs), `<cmp>` (competitors), `<tm>` (teams).
    All times are **tenths of a second**; start times are tenths after
    competition zerotime.
- **Auth**: Plain-text password in `pwd` HTTP header. Spec explicitly admits
  "unless your web connection is encrypted, this password is sent in plain
  text… it is not a strong protection." No tokens, no OAuth.
- **Sportident integration**: Carries **post-processed split times only**.
  Each `<cmp>` has a `<radio>` element of the form `radio_id,running_time` and
  a `card="..."` attribute. No raw punch records, no leg-by-leg punch dump,
  no DSI-style frames. MeOS has already attributed the punches to a competitor.

Representative payload (from PDF, abridged):

```xml
<MOPDiff xmlns="http://www.melin.nu/mop">
  <cmp id="5490" card="12345">
    <base org="515" cls="1" stat="1" st="370800" rt="71480" bib="100"
          nat="SWE">Jonas Svensson</base>
    <radio>70,27160</radio>
  </cmp>
</MOPDiff>
```

Server replies `<MOPStatus status="OK"/>` or `BADCMP|BADPWD|NOZIP|ERROR`.

### 2.2 MIP — MeOS Input Protocol (HTTP+XML, MeOS ← us)

- **Transport**: HTTP GET issued **by MeOS to our server** as poller. MeOS
  sends `competition`, `lastid`, `pwd` headers; we respond with XML.
- **Direction**: **Write-in from fartOLa's POV.** fartOLa acts as the server;
  MeOS pulls. (MeOS is the HTTP client.)
- **Message shape**: One root `<MIPData lastid="N">` containing zero or more of:
  - `<p code="33" card="12345" time="36070"/>` — free punch (by card or by `sno=` start number)
  - `<card number="...">` — full read-out card with `<start>`, `<finish>`, `<check>`, `<p>` punches
  - `<entry>` — new/updated competitor registration (name, club, classid, card, fee, paid, bib…)
  - `<response type="config|entrystatus|entries"/>` — request MeOS-side data back
    All times **tenths of a second**.
    Hyrbricka flag: `<card hired="true">12345</card>` — explicitly documented as
    triggering a "reminder to return it after the race" in MeOS.
- **Auth**: Optional `pwd` header, same plain-text scheme as MOP.
- **Sportident integration**: **Yes — carries either raw card dumps OR free
  punches.** A `<card>` element with embedded `<p>` records is essentially the
  full SI card dump that MeOS would otherwise read from a serial reader. This
  is the only documented MeOS protocol that lets us inject a complete card
  read-out without spoofing the SI line protocol itself.

Representative payload (from PDF):

```xml
<MIPData xmlns="http://www.melin.nu/mip" lastid="3">
  <p code="33" card="12345" time="36070"/>
  <card number="12346">
    <start time="36000"/>
    <finish time="46000"/>
    <p code="33" time="37000"/>
    <p code="50" time="38010"/>
  </card>
</MIPData>
```

### 2.3 SendPunch line protocol (raw TCP, us → MeOS)

- **Transport**: Plain TCP socket. The example connects to `localhost:10000`;
  MeOS opens this port when the "TCP server" / "online punch" feature is enabled.
- **Direction**: **Write-in.** One-shot push of a punch or full card to MeOS.
- **Message shape**: **Little-endian binary**, no framing beyond the socket close:
  - Punch (15 bytes): `type=0` (1 B) + `codeNumber` (2 B LE) + `SICardNo` (4 B LE) + `codeDay=0` (4 B LE, obsolete) + `codeTime` (4 B LE, tenths after 00:00).
  - Card: `type=64` + same 14-byte header (where `codeNumber` becomes punch count) + repeated 8-byte `(codeNumber, codeTime)` per punch.
    Special control codes: 1=Start, 2=Finish, 3=Check.
- **Auth**: **None.** Trust is "you are on the local machine". The example
  hard-codes `localhost`; pointing it at a remote IP requires MeOS to bind on
  that interface, which the user must enable.
- **Sportident integration**: **Carries raw SI-equivalent punch data.** This
  is the protocol to use if fartOLa has read an SI card and wants to forward it
  to MeOS as if MeOS had its own reader. The shape is purpose-built for it.

Note: code is dated **2014** and labels `codeDay` as "Obsolete, not used
anymore." That's a smell — the wire format is at least 12 years old; current
MeOS still accepts it per the page (the download is still linked) but no spec
PDF exists for this protocol, only the Java sample. Treat the .java as the spec.

### 2.4 MeOS UDP broadcast (raw UDP, MeOS → us)

- **Transport**: UDP datagram, port **21338**. MeOS broadcasts each punch on
  the local network when "online punch broadcast" is enabled.
- **Direction**: **Read-only.** We listen.
- **Message shape**: **Little-endian binary**, 20 bytes per datagram:
  `competitionId` (4 B) + `runnerId` (4 B LE) + `controlId` (4 B LE) +
  `status` (4 B LE, see enum) + `time` (4 B LE, **seconds** — note example
  divides by 3600 for hours, not 36000, so this stream is in **whole seconds**,
  diverging from MOP/MIP's tenths).
- **Auth**: None. LAN-only by virtue of UDP.
- **Sportident integration**: Carries **post-attributed** punches: it's a
  `(runnerId, controlId)` tuple, not a raw card number. Useful for "live arena"
  displays, not for forwarding to another timing system that needs the card.

Also dated 2014 and undocumented except via the Java sample.

---

## 3. Phase-2 fit for fartOLa

### A — Parallel finish capture without runner double-stamping

**Goal:** one physical SI reader serves both fartOLa and MeOS; runners stamp
once at finish.

**Recommended approach: fartOLa owns the SI reader; fartOLa forwards each card
read-out into MeOS via the SendPunch TCP line protocol (§2.3) or, preferably,
via MIP `<card>` (§2.2).**

Sketch (SendPunch TCP — simplest):

1. fartOLa's finish station reads the SI card from the serial port (we already
   do this in phase 1).
2. After our own pipeline accepts the read, we open a TCP connection to
   `meos-host:10000`, serialize a `Card` frame (1-byte type=64 + 14-byte
   header + N×8-byte punches, all little-endian) and close. ~30 lines of
   Node.js using the `net` module.
3. MeOS receives it and attributes to its competitor, exactly as if MeOS had
   its own SI reader hooked up.

Sketch (MIP — more future-proof):

1. fartOLa exposes an HTTP endpoint that MeOS polls (we are the server, MeOS
   the client).
2. We buffer card read-outs and respond with `<MIPData><card number="…">…</card></MIPData>`.
3. MIP also natively models hired cards (`<card hired="true">`), so the
   "please return rental card" alert at finish read-out is handled by MeOS for
   free if the entry was registered with `hired="true"`.

**Feasibility:** yes, both routes are technically clean. **TCP/SendPunch is
the lowest-friction choice for Wednesday** — no HTTP server, no polling loop,
~1 day of work. **MIP is the better Phase 2.1 choice** because it's the
maintained protocol (XSD bumped 2025-04, page upload 2026-05-14) and supports
entries + hired-card flagging.

**Caveat:** MeOS will only count a finish punch as a finish if the cardNo
matches a registered competitor. So fartOLa must either (a) push entries to
MeOS first (also via MIP `<entry>`), or (b) the operator enters the runner
manually in MeOS using the same card number. For 4-klubbs walk-up registration,
(b) is realistic; for full automation, (a) is needed.

### B — One-way push fartOLa → MeOS (results / registrations)

Two channels:

- **Registrations/entries:** MIP `<entry>` (§2.2). Supports name, club,
  classid, card (with `hired="true"`), fee, paid, bib, birthdate. MeOS replies
  with `entrystatus` so we know if the registration was accepted, rejected
  ("class is full"), or updated.
- **Punches/results:** either MIP `<p>` / `<card>` (HTTP) or SendPunch TCP
  (raw binary). For "share the SI reader" use SendPunch; for "feed remote
  punches from a Sportident SRR/AIR or a phone app" use MIP.

Note that **fartOLa cannot push computed results (rankings, status changes)
into MeOS via these protocols**. MIP accepts punches and entry data; it does
not accept "set this runner to status DQ". The closest is MIP's
`<entry localId="103"><status>NS</status></entry>`, which is documented for
DNS only and is really an entry-update path, not a results-update path. If we
need full results parity, **MeOS must remain the source of truth** for status
and fartOLa becomes a presentation/extension layer.

### C — One-way pull MeOS → fartOLa (results comparison)

Use MOP (§2.1). fartOLa stands up an HTTP endpoint and MeOS POSTs
`<MOPComplete>` (full snapshot) and `<MOPDiff>` (incremental) to it
continuously. We get competitors, classes, clubs, radio splits, statuses, and
finish times in tenths of a second. The reference `update.php` is ~70 lines
and trivial to port to Node.js / TypeScript.

**Cost: lowest of the three.** It's a pure HTTP receiver, no SI reader, no
TCP socket, no Windows-only tooling. Could be done in half a day. Useful even
for the Wednesday event as a passive "did fartOLa match MeOS?" debugging tool.

---

## 4. Implementation cost estimate

| Use case                       | Protocol      | Effort             | Windows-only blockers?                                                                           |
| ------------------------------ | ------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| A (shared SI reader)           | SendPunch TCP | ~1 day             | None for fartOLa side; MeOS must run the "TCP punch input" service on Windows, which is built-in |
| A (shared SI reader, polished) | MIP `<card>`  | ~2 days            | None                                                                                             |
| B (push entries)               | MIP `<entry>` | ~1 day on top of A | None                                                                                             |
| B (push punches)               | covered by A  | —                  | —                                                                                                |
| C (pull results)               | MOP receiver  | ~0.5 day           | None                                                                                             |

**Total for full A+B+C via MIP+MOP: ~3.5 days.** Total for "minimum
Wednesday-viable" (A via SendPunch + C via MOP for safety net): **~1.5 days**.

### Versioning / staleness landmines

- **MOP XSD: v2.0, dated March 2025.** Actively maintained. Low risk.
- **MIP XSD: v3.0, "Date: May 2026, Updated April 2025."** Freshly bumped
  (page upload 2026-05-14, two days ago). Currently the most maintained
  protocol. The version bump in the same week we're researching is mildly
  suspect — features may have shifted between MeOS releases.
- **SendPunch.java: 2014.** Marked field (`codeDay`) is "obsolete, not used
  anymore." The protocol is still distributed on the codes page so MeOS still
  accepts it, but there's no formal spec — the Java file IS the spec. Risk:
  MeOS might silently change endianness or add a header field in a future
  release. Mitigation: pin to a known MeOS version on the Wed event.
- **ListenMeOS.java: 2014.** Same caveats. Time unit is whole seconds, not
  tenths — outlier in the MeOS protocol family. Confirm against MeOS source
  (github.com/MeOS-orienteering/MeOS, MIT'd) before trusting timestamps.
- **No security on any of the four protocols.** Plain-text password (MOP/MIP)
  or none (TCP/UDP). Don't expose any of these endpoints outside an event LAN.

If a download had failed: the source for MeOS itself is at
`https://github.com/MeOS-orienteering/MeOS` and the protocols are also
documented in the in-repo `code/` subtree; the Wayback Machine archives
melin.nu reliably (capture for 2025 exists). I confirmed all four downloads
worked, so no fallback needed.

---

## 5. Recommendation

**For the 4-day Wednesday MVP (4-klubbs, ~100 starters):** run fartOLa beside
MeOS using a "MeOS-as-source-of-truth + fartOLa-as-mirror" layout. Concretely:
let MeOS own the SI finish reader as today, and have fartOLa receive a MOP
feed from MeOS over HTTP (~½ day to implement). This means **zero changes to
the existing MeOS workflow on race day** — no shared serial port, no risk of
fartOLa bricking MeOS's punch input. fartOLa acts as a passive results
presentation layer using data MeOS already publishes. If we additionally have
spare time before Wednesday, layer in SendPunch TCP injection so that
fartOLa-owned read-outs (e.g. test stamps, or a backup reader) can be pushed
into MeOS without runners double-stamping. This is the lowest-risk strategy
because the failure mode of MOP-only is "fartOLa shows no results" — runners
and operators are unaffected.

**For Phase 2.1 (post-Wednesday architectural fit):** standardise on MIP
(MeOS Input Protocol) as the integration substrate, with fartOLa acting as the
HTTP server MeOS polls. MIP is the only one of the four protocols that is
actively versioned (v3.0, April 2025 update, page upload 2026-05-14), it
natively handles the hyrbricka use case (`<card hired="true">` triggers
MeOS's built-in "return card" reminder, so fartOLa doesn't need to duplicate
that UI when MeOS is doing the read-out), it supports both raw card dumps
and individual free punches, and it has a built-in entry-registration path
that covers walk-up registration. Pair MIP-in with MOP-out as the read-back
channel so we can reconcile fartOLa's internal state against MeOS's view.
This makes MeOS effectively a backend fartOLa can drive, and avoids the
2014-era SendPunch/UDP binary protocols entirely except as fallback.
