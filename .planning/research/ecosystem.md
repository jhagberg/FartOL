# RESEARCH

Condensed research notes for the project. This is the **single source of truth**
about prior art, the SportIdent ecosystem, and what we have learned by reading
existing implementations. Update this file when new facts are discovered;
do not duplicate it elsewhere.

---

## 1. Why this project exists

The dominant Swedish orienteering software stack (MeOS, OLA, SportSoftware OE)
was designed in a pre-cloud era. It assumes a single Windows machine on a LAN
acting as "master", with other clients in the same room. This works, but it
fails in three modern scenarios:

- **Cross-platform operation.** Volunteers run Linux, macOS, ChromeOS, iPads.
  Forcing Windows is friction at every event.
- **Real-time collaboration.** Multiple secretaries cannot edit the same
  competition state simultaneously. The "master" pattern serializes everyone.
- **Resilient field operation.** Network partitions are normal in the forest.
  A central master is a single point of failure.

A modern alternative built around event sourcing, offline-first replication,
and web-based UI can address all three. The technology to do this is mature
in 2026 — what is missing is someone willing to build it for orienteering.

---

## 2. Existing systems — what is worth knowing

### MeOS (Melin Software, Sweden)

- C++, Windows-only, **AGPL-3.0** (not GPL-3.0 — this matters: a derived
  network-accessible service must publish source).
- Source: <https://github.com/melinsoftware/meos>
- Defines the functional baseline. The three-click workflow (create event,
  attach SI reader, read cards) is the UX bar to clear.
- Supports relays, patrol, rogaining, Eventor sync, SIRAP, MeOS TCP input
  protocol, online result protocol.
- **Verdict:** clean-room reimplementation. Do not fork — AGPL on a web service
  is a heavier license obligation than we want.

### OLA (Swedish Orienteering Federation)

- Java, requires MySQL, used at major SOFT events.
- User feedback (Eventor forum, 2024): UI is slow, MySQL setup is painful.

### SportSoftware OE12/OS12 (Krämer, Germany)

- Commercial, Windows, international standard outside Scandinavia.
- 40-page PDF manuals. Not relevant as a reference implementation.

### QuickEvent (Quick-Box, Czech Republic)

- Qt-based, PostgreSQL, **GPL-2.0**. Production quality. Reference for clean
  C++/Qt orienteering data models. Source: <https://github.com/Quick-Event/quickbox>

### SI-Droid Event (Joja, Sweden)

- Android-only, closed source. Already proves that mobile + USB OTG + thermal
  printer is a valid field setup. Our edge-bridge approach generalizes this.

### SPORTident Orienteering App

- Official Android app. Reads via BSM7/8 over OTG, auto-assigns to course,
  QR receipts, IOF XML export. OCAD-first for course import.
- We compete with this app in the mobile/training-event space, not just
  with MeOS in the secretariat space.

### Open source projects worth studying

- **SportOrg / pysport** — comprehensive Python system for orienteering.
- **ooresults** — browser-based, **AGPL-3.0**, reads SportIdent. Closest
  ideological neighbor. Worth studying carefully — possible collaboration
  or shared protocol library.
- **NGZ** — already implements a happy/sad finish screen for youth events.
  Do not reinvent this; either adopt or build with awareness of it.
- **OResults** — documented radio-control and speaker flows.
- **ROC** (olresultat.se) — Pi + 4G de-facto standard for radio controls
  in Sweden. >2 600 devices deployed, >3 M punches uploaded. Spoken by
  MeOS, OLA, OE12. Our system must speak ROC protocol.

### Standards we must support

- **IOF XML 3.0** — start lists, results, courses. XSD at
  <https://github.com/international-orienteering-federation/datastandard-v3>.
- **IOF XML 2.0.3** — legacy, still common.
- **SIRAP** — plain-text TCP for radio controls.
- **ROC protocol** — plain-text, Swedish de-facto.
- **MeOS TCP input/online protocol** — for compatibility during migration.

---

## 3. SportIdent ecosystem — facts

### Cards

| Card            | Memory                | Cycle                       | Battery                            | Status              |
| --------------- | --------------------- | --------------------------- | ---------------------------------- | ------------------- |
| SI5             | 30+6 punches          | 330 ms                      | passive                            | EOL, 12h clock      |
| SI6 / SI6\*     | 64 / 192              | 130 ms                      | passive                            | EOL                 |
| SI8             | 30                    | 115 ms                      | passive                            | active              |
| SI9             | 50                    | 115 ms                      | passive                            | most common         |
| SI10            | 128                   | 60 ms                       | passive                            | EOL, residual stock |
| SI11            | 128                   | 60 ms                       | built-in non-replaceable           | EOL                 |
| **SIAC (Air+)** | 128 + CLR/CHK/STA/FIN | 60 ms direct / 50 ms beacon | Li coin (3–4 yr, factory-replaced) | active              |
| pCard           | 20                    | 115 ms                      | passive                            | single-use          |

### Stations

- BSF7/BSF8/BSF9 — same hardware, configured per mode via SYS_VAL `0x71`:
  `CLEAR=0x07, CHECK=0x0A, START=0x03, CONTROL=0x02, FINISH=0x04, READOUT=0x05`.
- BSM7/BSM8-USB — readout station, USB. Uses **Silicon Labs CP2102** chip
  (VID `0x10C4`, PID `0x800A`). Linux kernel driver `cp210x.c` supports it.
- BS11-BS / BS11-BL / BS11-LA — contactless beacon stations for Air+. Ranges:
  **up to 1.8 m / 3 m / 6–9 m loop width** (LA is a loop, not a radial range).
- SRR USB dongle — receives 2.4 GHz SRR radio from BSF8-SRR and SIAC.
  CP2102 chip, extended protocol.
- SI-Master / TimeMaster — for clock sync across stations.
- SI-GSM, LTE-Modem — direct cellular upload to SPORTident Center.

### IP ratings (corrected)

- BSF8/BSF9, BS11 variants: **IP64** — rain-tolerant.
- SI-Card 8/9/10: **IP67** — fully sealed.
- BSM8-USB: **IP20** — indoor/sheltered only. **Critical:** readout
  must be planned under shelter even when forest stations run in rain.

### Internal time resolution

- BSF8/9 internal clock: **1/256 s ≈ 3.9 ms**.
- Drift: typically **under 1 s/week** per SPORTident own measurements.

### Protocol — the practical truth

- **Official SDK exists but is request-only.** SPORTident publishes
  `Center REST API` openly at
  <https://docs.sportident.com/developers/center-rest-api>, and offers
  `Communication Library` and `PC Programmer's Guide` **on request** —
  worth emailing them early.
- Open-source community uses reverse-engineered protocol. Best references:
  - `per-magnusson/sportident-python` (GPL, Axotron blog) — best-documented.
  - `gaudenz/sireader` — early Python reference.
  - `allestuetsmerweh/sportident.js` (MIT, TypeScript, WebSerial built-in).
  - `sdenier/GecoSI` (Java) — mature handshake handling.
  - MeOS `SportIdent.cpp` — production-grade C++ reference.

### Frame format (extended protocol)

```
[0xFF wakeup] 0x02 (STX) | CMD | LEN | DATA... | CRC16 | 0x03 (ETX)
```

- CRC: CCITT polynomial `0x8005`.
- Baudrate: **38 400** for USB; 4 800 only for legacy RS232.
- Key commands:
  - `0x83` get system value (config read)
  - `0x82` set system value (config write)
  - `0xB1` get SI5 card
  - `0xE1` get SI6 card
  - `0xEF` get SI8/9/10/11/SIAC card
  - `0xD3` autosend punch (control station → host)
  - `0xE5–E8` card insert/remove notifications
  - `0xF6` set time
  - `0xF9` beep
  - `0xA7` SRR ping

### Mode distinction

- **Readout mode:** station has `handshake=1, autosend=0`. Host polls with
  `C_GET_SI*` for the relevant card type.
- **Punch mode:** station has `handshake=0, autosend=1`. Station sends
  unsolicited `0xD3` frames when a card punches.

### SRR (Short Range Radio)

- Band: **2.4 GHz** (license-free, FCC ID `2AIOJ-SRR`). Not 433/868 MHz.
- Range: **6–8 m** typical, depends on placement.
- Two channels (red/blue) — recommend two receivers for frequency diversity.

### SIAC Air+ beacon

- Uses **low-frequency RFID**, same carrier as classical punch, amplified
  by BS11 antennas. Not BLE.
- Modulation is not publicly reverse-engineered. **Get punches via SRR dongle
  or SI-GSM, not by decoding RF.**
- SIAC card number range: `8 000 000 – 8 999 999`.
- Beacon punches write to SIAC only, not to station backup memory.
  Live punch requires SRR or cellular path.

---

## 4. Browser hardware access — what actually works in 2026

| API             | Chrome desktop | Chrome Android        | Safari/Firefox        | iOS |
| --------------- | -------------- | --------------------- | --------------------- | --- |
| WebSerial       | ✅             | ⚠️ (limited, USB OTG) | ❌ no plans           | ❌  |
| WebUSB          | ✅             | ✅                    | ❌                    | ❌  |
| Web Bluetooth   | ✅             | ✅                    | ❌ Firefox, ⚠️ Safari | ❌  |
| Background Sync | ✅             | ✅                    | ❌                    | ❌  |

**Consequence:** browser-only hardware access is a demo strategy, not a
production strategy. iOS is read-only client territory. Hardware-talking
nodes need an edge process — Node.js on Pi/laptop, or Android app — and
the browser becomes a UI shell that connects to that edge process via
HTTP/WebSocket on the local network.

Chrome 138 added WebSerial-over-Bluetooth-RFCOMM on Android, which improves
the mobile story slightly, but the edge-bridge model remains the right
architectural choice.

---

## 5. Networking in the forest

| Tech                       | Range in dense forest | Bandwidth            | Typical cost       |
| -------------------------- | --------------------- | -------------------- | ------------------ |
| SPORTident SRR 2.4 GHz     | 6–8 m                 | punches only         | ~2 500 SEK/station |
| ROC (Pi + 4G + SI-master)  | mobile coverage       | ~kB/punch            | 1 500–2 500 SEK    |
| SportidentTinymesh 169 MHz | 1.5 km/hop            | punches only         | ~1 500 SEK         |
| jSh.Radio 869 MHz          | km mesh               | punches only         | ~2 000 SEK         |
| Meshtastic LoRa EU868      | 0.4–2.5 km            | 10–250 B/s           | 300–900 SEK        |
| WiFi mesh (UniFi U6)       | 30–80 m               | 50–500 Mbit/s        | 1 500–4 000 SEK/AP |
| 4G/5G router (Teltonika)   | operator coverage     | 50 Mbit/s – 1 Gbit/s | 2 500–7 000 SEK    |
| Starlink Mini              | anywhere              | 150 Mbit/s           | 3 000 SEK + 480/mo |

**ROC is the Swedish de-facto standard** for radio controls. >2 600 units,
3 M+ punches. Start here for radio-control integration.

**Arena backbone recommendation:** dual-SIM 4G/5G router (Telia + Telenor)
with Starlink Mini as failover. Starlink Mini draws ~20 W average; an
EcoFlow Delta 2 (1 024 Wh LiFePO4) runs it for 35–45 h.

**IP requirements:** IP65 minimum outdoors. BSM8-USB (IP20) must be
sheltered. LiFePO4 will not charge below 0 °C but discharges to –20 °C.

---

## 6. Licensing reality

- **MeOS source: AGPL-3.0.** A derived web service triggers source-publication
  obligations to remote users, not just to redistributors. We therefore
  **reimplement** rather than fork.
- **SportIdent protocol:** no official open license, but reverse engineering
  for interoperability is permitted under EU InfoSoc Directive. SPORTident
  has tolerated third-party software (MeOS, SI-Droid, OE12, Quickevent) for
  20 years without legal action. **Isolate SI code in an MIT-licensed
  submodule** so worst-case legal risk is scoped.
- **IOF XML 3.0:** open standard, XSD on GitHub. Libraries exist in Java,
  C#, PHP.
- **GDPR:** card number + name + club = personal data. Need explicit consent,
  30-day deletion after event, opt-in for SMS/email notifications, encrypted
  payment metadata.

---

## 7. Glossary

- **Card / SI / brick** — the timing chip carried by the athlete.
- **Punch** — a single timestamp recorded when a card touches a station.
- **Station / box** — a SportIdent unit (control, start, finish, readout).
- **Course / bana** — the sequence of controls for a class.
- **Class / klass** — group of competitors running the same course.
- **Splits / sträcktider** — leg-by-leg times derived from punches.
- **Readout / utläsning** — reading punches off a card after finish.
- **Definition / kontrollbeskrivning** — the table of control descriptions.
- **DNS / DNF / DSQ / MP** — did not start / finish / disqualified / missing punch.
- **Radio control / radiokontroll** — a control that uploads punches live.
- **IOF** — International Orienteering Federation, standards body.
- **SOFT** — Svenska Orienteringsförbundet, Swedish federation.

---

## 8. References

- MeOS: <https://github.com/melinsoftware/meos> · <https://www.melin.nu/meos/>
- QuickEvent: <https://github.com/Quick-Event/quickbox>
- SportIdent docs: <https://docs.sportident.com/>
- SportIdent Center API: <https://docs.sportident.com/developers/center-rest-api>
- IOF data standard: <https://github.com/international-orienteering-federation/datastandard-v3>
- sportident-python: <https://github.com/per-magnusson/sportident-python>
- sportident.js: <https://github.com/allestuetsmerweh/sportident.js>
- ooresults: search GitHub for `ooresults`
- SportOrg/pysport: search GitHub for `pysport sportorg`
- ROC: <http://roc.olresultat.se>
- ElectricSQL: <https://electric-sql.com>
