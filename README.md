# Krafton Coin Collector

Authoritative multiplayer prototype built for the "Associate Game Developer" assignment. Two clients connect over WebSockets to a Node.js server that owns all game state (player positions, coin spawns, scoring). A Vite + React client renders the arena, captures intent-only inputs, and interpolates remote players so the motion stays smooth even while the server injects ~200 ms latency on every inbound and outbound packet.

## Tech Stack

- **Server**: Node.js, raw `ws` WebSockets, fixed-step simulation (20 Hz).
- **Client**: React 19 + Vite, `<canvas>` rendering with render-thread interpolation and light client prediction for the local pawn.
- **Protocol**: Minimal JSON envelopes (`welcome`, `lobby`, `start`, `state`, `coinSpawn`, `gameOver`, etc.), intent-only `input` messages from clients.

## Features Checklist

- ✅ Two-player lobby with ready flow and authoritative start/stop.
- ✅ Server-controlled spawning, collision, scoring, and win detection (90 s round).
- ✅ 200 ms latency injected on **all** inbound + outbound server packets to satisfy the degraded network requirement.
- ✅ Client interpolation buffer (200 ms) + light prediction for the local pawn to hide jitter.
- ✅ HUD with real-time status, timer, player readiness, and live scores.

## Prerequisites

- Node.js 20+
- npm 10+

## Getting Started

1. **Install dependencies**
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```
2. **Start the authoritative server**
   ```bash
   cd server
   npm run start
   ```
   The server listens on `ws://localhost:8080` (configurable via the `PORT` env var).
3. **Start the React client** (new terminal)
   ```bash
   cd client
   npm run dev
   ```
   Open the printed Vite URL (defaults to http://localhost:5173). Launch **two** browser windows/tabs pointing at the same URL to play a full match.

### Production build

- Server: already plain Node.js script; host however you like.
- Client: `npm --prefix client run build` emits static assets in `client/dist` that can be served by any static host (Vercel, S3, nginx, etc.).

## Gameplay / Controls

- Movement: `WASD` or Arrow keys.
- Coins spawn every 3 seconds. Step over a coin to collect it (server validates the overlap and updates scores).
- Round length: 90 seconds. Highest score at the buzzer wins (ties allowed).

## Networking Details

- Every packet received by the server is processed after a `200 ms` delay, and every outbound packet is also delayed by the same budget. This keeps the entire simulation under the required degraded network conditions without relying on any middleware that auto-syncs state.
- Clients send **intent only** (`input` messages describing pressed keys). No scores or positions are ever client-authored.
- The React client keeps a buffer of authoritative snapshots along with a soft clock-sync. It renders the world 200 ms in the past and linearly interpolates all remote pawns, while nudging the local pawn with prediction so input latency remains low.

## Repository Layout

```
server/                    # Node.js authoritative simulation
  src/index.js             # Main WebSocket server + game loop
client/                    # Vite + React front end
  src/App.jsx              # Networking, interpolation, rendering, HUD
  src/App.css              # Styling
  dist/                    # (created after build)
docs/architecture.md       # Additional design notes
```

## Testing / Validation

- `node --check server/src/index.js` – quick syntax check for the server.
- `npm --prefix client run build` – confirms the client bundles cleanly via Vite.

## Assumptions + Notes

- The server currently supports exactly two concurrent players per match (lobby requirement). Additional connections are ignored in this prototype but can be extended easily.
- Display names are client-configurable but capped at 16 characters server-side.
- Because the server enforces authority and has the final say on collisions/scores, the video demonstration should show: dual clients, movement remaining smooth, and the scoreboard updating immediately after coins are collected.

For deeper architectural commentary, see `docs/architecture.md`.
