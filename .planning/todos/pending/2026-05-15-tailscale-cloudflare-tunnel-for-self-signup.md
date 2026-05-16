---
created: 2026-05-15T00:00:00+02:00
title: Research no-cloud public reachability for laptop (Tailscale Funnel / Cloudflare Tunnel)
area: ops
files:
  - apps/edge/src/server.ts
  - apps/edge/src/bin/fartol.ts
---

## Problem

The FartOL edge is a single-laptop server. To let parents scan a QR
code and self-sign-up their kids (see sibling todo
`2026-05-15-parent-self-signup-qr-flow.md`), the laptop needs to be
reachable from the parents' phones — ideally from outside the venue's
WiFi too, in case they're parked outside or arriving late.

The constraint Jonas explicitly wants honoured: **no cloud server**.
The laptop must stay the source of truth; we don't want to push data
to a hosted backend just to get a URL.

## Solution

Three viable approaches, ordered by likely fit:

1. **Tailscale Funnel** (recommended starting point)
   - Free for personal use, gives a public `https://<machine>.<tailnet>.ts.net`
     URL backed directly by the laptop.
   - HTTPS terminates at Tailscale's edge; laptop sees plain HTTP.
   - One CLI command to enable: `tailscale funnel 5173`.
   - Parents don't need to install anything — it's a regular public URL.
   - Catch: requires the laptop to have outbound internet (4G hotspot
     fine; airplane mode no).
   - **Investigate:** ToS limits (Funnel is gated to a 22-character
     hostname allowlist), session-cookie behavior, latency on a 4G
     uplink from a forest carpark.

2. **Cloudflare Tunnel** (`cloudflared`)
   - Free tier, gives a `*.trycloudflare.com` URL or a custom domain.
   - More flexible (TCP + UDP support) but slightly more setup —
     install the daemon, run `cloudflared tunnel --url http://localhost:5173`.
   - **Investigate:** anonymous quick-tunnels are rate-limited;
     named tunnels need a Cloudflare account.

3. **Local mDNS + LAN-only QR** (lowest-tech fallback)
   - If the laptop runs its own WiFi AP or is on the venue WiFi,
     advertise `fartol.local` via avahi/bonjour and put `https://fartol.local/signup/...`
     in the QR.
   - Parents must be on the same WiFi. No public internet needed.
   - **Catch:** browser HTTPS / cert pain on `.local` without
     installing a CA. Probably means HTTP only, which means service
     workers / PWA features won't work. May be acceptable for a
     simple signup form.

## Acceptance

- Bench-test all three on the same hardware Jonas uses for training.
- Decide which one (or which combination — e.g. mDNS first, Tunnel
  as fallback) becomes the default.
- Document the launch flow: probably a sidebar button "Aktivera
  publik URL" that spawns the tunnel daemon and prints the QR.
- Make sure the chosen path works with consent / GDPR — the public
  URL must not expose any PII. The signup endpoint must be the only
  one reachable, gated by a short-lived token in the URL.

## Open questions

- **Battery / data cost.** A 4G hotspot for a 3-hour training is fine.
  A daily-driver Tailscale Funnel from a phone hotspot — also fine.
- **DNS rebinding / CSRF.** Need to confirm Fastify's host check
  doesn't fight the tunnel.
- **Logging.** All three approaches put a third party (Tailscale,
  Cloudflare, or none) in the request path. Anonymous-aggregate
  logging is fine for FartOL but worth documenting.

## Priority

Blocks the parent-self-signup-via-QR feature (see sibling todo). Should
be researched before that feature is planned in detail, so the
architecture decision (Tunnel vs mDNS vs both) shapes the auth model.
