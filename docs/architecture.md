# Coin Collector Architecture (v2)

## Overview
The second iteration keeps a strict server-authoritative model but scales out into multiple simultaneous matches, game modes, and difficulty bands. A React (Vite) client now covers matchmaking, cosmetic upgrades, and richer HUD overlays. Each running game lives inside its own Node.js worker thread to guarantee deterministic simulation even while dozens of games share a single host.

## Networking
- Transport: raw WebSockets (`ws` on the server, `WebSocket` in the browser).
- Envelope: every packet is JSON with a `type` discriminator (`welcome`, `queue`, `matchAssignment`, `state`, `matchEvent`, `input`, etc.).
- Latency budget: the authoritative host enforces ~200 ms artificial lag on both inbound and outbound packets so every client experiences the required degraded network conditions.

## Server Architecture
- **Matchmaking gateway** (main thread): tracks all connected clients, queues them by chosen difficulty + mode, and streams messages over WebSockets.
- **Room workers** (worker_threads): once a queue reaches two pilots, a new worker spins up with its own fixed-step simulation loop (30 Hz). All movement, coin spawning, hazard spawning, scoring, win logic, and interpolation timestamps happen inside the worker. The gateway only relays snapshots and never mutates the game state directly.
- **Difficulties**: `Chill Orbit`, `Star Runner`, and `Solar Storm` presets tweak player speed, coin spawn cadence, hazard frequency, and round duration. Those values are bundled into the worker bootstrap payload so every room can run different rules in parallel.
- **Game modes**:
	- `Countdown`: classic 90 s high-score chase.
	- `Blitz`: first pilot to hit the target coin count (default 12) wins immediately.
	- `Survival`: void hazards spawn alongside coins; touching one deducts points, so positioning matters as much as speed.
- **Scalability**: each worker thread owns its tick timer, letting the host schedule dozens of simultaneous matches without the loops starving each other. When a room finishes or a pilot disconnects, the worker is terminated and garbage collected.

## Client Responsibilities
- Provide matchmaking UX: pilots select a difficulty + mode and queue up. The UI surfaces queue status, estimated wait, and match assignments.
- Capture intent-only inputs and stream them to the server immediately (`input` packets). No position or score authority is ever client-authored.
- Maintain a buffered timeline of authoritative snapshots (200 ms interpolation delay) and render remote pilots smoothly. Local prediction keeps input latency low.
- Visual polish: animated background, scoreboard overlay, countdown banner, hazard indicators, and contextual toasts for match events.
- Render both positive pickups (coins) and negative hazards with distinct hues so players can make tactical decisions quickly.

## Simulation Rules
- Arena: 960×640 world bounds, 32×32 player hit boxes; clamp happens server-side.
- Coins: spawn cadence depends on difficulty; every coin broadcast contains `id`, `x`, `y`, and `value` (some modes award bonus points).
- Hazards: survival-mode workers spawn void orbs that penalize the first pilot that overlaps them.
- Win conditions: timer-based (highest score wins) or target-based (first to threshold). Ties are possible and surfaced as draws.
- Disconnect handling: if a pilot leaves mid-match the worker immediately ends the room and notifies the remaining pilot; they can instantly re-queue for a fresh lobby.
