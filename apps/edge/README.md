# FartOL — Single-Laptop Training MVP

Self-contained Node.js binary that runs a complete orienteering training
event end-to-end on one Linux laptop. Speaks SportIdent BSM7/8-USB,
prints to thermal receipt printers, and exports IOF XML 3.0 ResultList
files.

This is Phase 1 of the FartOL roadmap — the training-grade MVP. Phase 2+
adds multi-secretary sync, federation upload (Eventor), and the children's
finish-screen recruitment tool. See the repo's `.planning/PROJECT.md` for
the long-term vision.

## Install

**Prerequisites:** Node.js 24 LTS, Linux (Debian/Ubuntu/Fedora/Arch all work).
The binary uses `better-sqlite3` (prebuilt native binding) and `serialport`
(also prebuilt) so there's no toolchain requirement.

```bash
npm install -g <path-to-fartol-tarball>.tgz
```

Verify:

```bash
fartol --help
```

## Run

```bash
fartol --port 3000 \
       --db-path ~/.local/share/fartol/fartol.db \
       --backup-dir ~/.local/share/fartol/backups
```

Then open <http://localhost:3000/> in Chrome or Edge. The SvelteKit SPA is
served by the same Fastify process that handles REST + WebSocket; no
separate dev server is needed in production.

## CLI flags

| Flag                  | Default        | Purpose                                                             |
| --------------------- | -------------- | ------------------------------------------------------------------- |
| `--port <int>`        | `3000`         | HTTP server port.                                                   |
| `--bind-host <host>`  | `127.0.0.1`    | Listen host. Use `0.0.0.0` + `--allow-lan` to expose to LAN.        |
| `--db-path <path>`    | `./fartol.db`  | SQLite database file (auto-created with WAL + migrations).          |
| `--backup-dir <path>` | `./backups`    | Daily SQLite snapshot directory (last 7 kept).                      |
| `--retention-days N`  | `30`           | PII scrub age in days (REQ-PRIV-002).                               |
| `--serial-path <p>`   | `/dev/ttyUSB0` | SerialPort device path for the SI reader. Ignored if `--no-bridge`. |
| `--no-bridge`         | (off)          | Skip the SI bridge attach. Useful for UI dev + smoke tests.         |
| `--competition-id ID` | (config table) | Boot with this competition as active.                               |
| `--allow-lan`         | (off)          | Permit non-loopback `--bind-host` values.                           |
| `--help`, `-h`        |                | Show usage.                                                         |

Environment variables:

| Variable              | Effect                                                            |
| --------------------- | ----------------------------------------------------------------- |
| `FARTOL_DEV=1`        | Enables `/api/__dev/*` + `/api/__admin/*` operator endpoints.     |
| `FARTOL_PRINTER`      | `cups` (default), `stdout` (dev), `direct` (ESC/POS via USB).     |
| `FARTOL_CUPS_QUEUE`   | CUPS queue name when `FARTOL_PRINTER=cups` (default Star TSP143). |
| `FARTOL_PRINTER_TYPE` | `star` (default), `epson`, `brother` — direct ESC/POS dialect.    |
| `FARTOL_NODE_ID`      | Override the auto-generated node id.                              |

## Hardware setup

### SPORTident BSM7/8-USB reader

1. Install the bundled udev rule (grants the `dialout` group access to
   the reader without root):

   ```bash
   sudo cp "$(npm prefix -g)/lib/node_modules/@fartol/edge/udev/99-fartol-sportident.rules" \
           /etc/udev/rules.d/
   sudo udevadm control --reload-rules
   ```

2. Add your operator user to the `dialout` group, then log out + back in:

   ```bash
   sudo usermod -aG dialout $USER
   ```

3. Plug in the reader. Verify enumeration:

   ```bash
   ls /dev/ttyUSB*
   ```

   You should see `/dev/ttyUSB0` (or `1`, `2`, ... if multiple readers are
   plugged in). Pass `--serial-path /dev/ttyUSBn` to pick a specific one.

### Thermal printer (Star TSP143 / Epson TM-T20 / Brother PJ-7)

The default printer pipeline is CUPS. Install your printer in the
system's CUPS dialog (`localhost:631` → Add Printer) and the receipt
templates flow through `lp` like any other CUPS device.

For direct ESC/POS over `/dev/usb/lp*` (no CUPS):

1. Add your user to the `lp` group, then log out + back in:

   ```bash
   sudo usermod -aG lp $USER
   ```

2. Plug in the printer. Verify:

   ```bash
   ls /dev/usb/lp*
   ```

3. Launch with `FARTOL_PRINTER=direct fartol ...`.

## Restart-safe deployment via systemd

The tarball ships a user-scope systemd unit example. Install:

```bash
mkdir -p ~/.config/systemd/user
cp "$(npm prefix -g)/lib/node_modules/@fartol/edge/systemd/fartol.service" \
   ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now fartol
systemctl --user status fartol
```

The unit restarts on crash (`Restart=on-failure`, `RestartSec=5s`), so a
SQLite WAL hiccup or a stuck SI bridge doesn't take down the event.
Journal output is available via `journalctl --user -u fartol -f`.

## Backups

`scheduleDailyBackup` runs the SQLite online-backup API (`better-sqlite3`'s
`db.backup()`) at local midnight, writing one snapshot per day to
`--backup-dir`. The last 7 snapshots are retained; older ones are pruned.

Run a one-off backup via the operator endpoint
(`FARTOL_DEV=1` required):

```bash
curl -X POST http://127.0.0.1:3000/api/__admin/run-backup-now
```

## Privacy (REQ-PRIV-001 / REQ-PRIV-002)

Competitor names and clubs are scrubbed 30 days after a competition's
date. The SI card number (hardware ID) and consent audit trail are
preserved so we can still bind a punch to a runner if a complaint comes
in within the 30-day window. After scrubbing, only aggregate stats and
hardware IDs remain.

Run a one-off scrub:

```bash
curl -X POST http://127.0.0.1:3000/api/__admin/run-retention-now
```

**Recommended: encrypt the laptop disk.** The append-only event log
preserves the `card_holder` string (the name the SI card owner
programmed onto the card itself at issuance time) in `card_read`
payloads, even after the 30-day scrub anonymises the competitor row.
This residual exposure is documented in
[ADR-0008](../../.planning/adr/0008-pii-in-append-only-event-log.md).
Full-disk encryption (LUKS on Linux, FileVault on macOS, BitLocker on
Windows) is the correct mitigation for the "laptop lost / stolen /
borrowed" threat model that Phase 1 targets.

## Troubleshooting

| Symptom                                      | Likely cause + fix                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `fartol` not on PATH after install           | Confirm `$(npm prefix -g)/bin` is on PATH; some systems use `~/.npm-global/bin`.                                   |
| `/dev/ttyUSB0` permission denied             | User not in `dialout` group, or udev rule not loaded. Re-run the udev setup + log out/in.                          |
| `Cannot lock port` on bridge startup         | Another process (or a stale `fartol`) is holding the SerialPort. `lsof /dev/ttyUSB0`; kill the holder.             |
| Reader plugged in but `card_inserted` silent | Wrong reader path. Check `journalctl --user -u fartol -f` for `SI bridge open failed` and pass `--serial-path`.    |
| Thermal printer prints garbage               | Wrong CUPS driver. Re-install the printer with the Star/Epson/Brother CUPS driver, or set `FARTOL_PRINTER=direct`. |
| `EACCES /dev/usb/lp0` on direct print        | User not in `lp` group. Re-run the printer setup + log out/in.                                                     |
| Database locked / WAL warning                | Another `fartol` is running against the same DB. Stop the other process first.                                     |

## Source + license

AGPL-3.0-or-later application code. The `@fartol/sportident` package
(bundled into this binary via tsup `noExternal`) is MIT-licensed; the
upstream port from allestuetsmerweh/sportident.js carries its original
attribution headers. See `NOTICE.md` in this directory for the cumulative
third-party attribution.
