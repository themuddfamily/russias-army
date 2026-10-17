# Multiplayer match server

The server runs authoritative 12-frag free-for-all rooms over JSON WebSockets. It owns player IDs, movement bounds, health, frags, deaths, respawn timing, spawn protection, ammunition, reload timing, weapon damage, fire cadence, projectiles, explosions, and match winners. Client hit messages are target-selection claims for hitscan shots only: a hit is applied only when it references a recent registered shot whose server-validated ray intersects the claimed target. Projectile impacts, blast origins, occlusion, falloff, and damage are calculated entirely by the server.

Unexpected disconnects retain a private session for 30 seconds. A reconnect can reclaim it with the most recently issued opaque resume token; every successful resume rotates that token and closes a superseded transport. WebSocket ping/pong heartbeats remove half-open connections so they cannot reserve a room forever.

## Run

After the root project installs `ws`, `@types/ws`, `@types/node`, and a TypeScript runner:

```bash
PORT=8081 npx tsx server/index.ts
```

Match timers and transport timestamps share an epoch clock driven by monotonic elapsed time, so host wall-clock corrections do not rewind simulation.

The port defaults to `8081`. WebSocket connections use `/` and `GET /health` returns readiness plus room/player counts. `GET /rooms` returns `{rooms:[{room,map,players,connectedPlayers,capacity,state}]}` with CORS and no-store headers. `players` includes temporarily reserved reconnect slots, so capacity remains accurate during reconnects. New rooms default to `barrack`; `woodlands` can be selected in the join. An existing room cannot change maps.

## Test

```bash
npx vitest run --config server/vitest.config.ts
npx tsc -p server/tsconfig.json
```

## JSON protocol (version 4)

Client messages:

- `join`: `{type, protocol: 4, room, name, map?, resumeToken?}`
- `leave`: `{type}`
- `transform`: `{type, sequence, clientTime, transform}`
- `shoot`: `{type, shot: {shotId, origin, direction, weapon, rg6Jump?}}`; optional RG6 intent is `{forward: boolean, jump: boolean}`
- `hit`: `{type, hit: {shotId, targetId}}` (hitscan only)
- `reload`: `{type, weapon}`
- `ping`: `{type, clientTime}`
- `chat`: `{type, text}` (1–240 printable characters; four messages per five seconds per player)
- `collect`: `{type, itemId}` (server validates life state, item availability, range and line of sight)

Server messages:

- `welcome`: protocol version 4, assigned `clientId`, rotated `resumeToken`, room settings, time, and the authoritative local player
- `snapshot`: monotonic tick, server time, match state/winner, all authoritative players, active projectiles, immutable map ID, pickups and weapon drops; each player includes armor
- `event`: `join`, `leave`, hitscan `shot`, `projectile_spawned`, `explosion`, `rg6_boost`, `damaged`, `killed`, `respawn`, `winner`, `chat`, or `collected`
- `loadout`: private authoritative equipped weapon, all six magazine/reserve counts, and any active reload deadline
- `pong`: echoed client time plus server time
- `error`: stable error code plus human-readable message

Vectors are `{x, y, z}`. A player transform contains `position`, `velocity`, `yaw`, `pitch`, `grounded`, and `weapon`. Damage and kill events contain a discriminated `source`: hitscan sources include the server-derived zone and impact position, while explosion sources include the projectile ID and authoritative blast position. See `../shared/protocol.ts` for the complete discriminated TypeScript unions.

Pickups restore 40 health, 50 armor or reserve ammunition and respawn after 18 seconds. Weapon drops last 30 seconds and grant one magazine worth of reserve ammunition while equipping that weapon. Armor absorbs up to 55% of incoming damage. These are copy gameplay rules, not verified historical balance values. Map-specific collision, terrain and ramp queries use shared manifests for authoritative movement and combat.

In Woodlands and Barrack, an RG6 shot aimed straight down while moving forward and holding Space can grant a jump boost when its actual blast occurs nearby below the living shooter. `rg6_boost` carries `{playerId, projectileId, velocityY}`; the owning client applies it once, and the server bounds the resulting flight while retaining terrain, wall and ceiling collision. Successive qualifying blasts can renew ascent. Self-damage and ammunition consumption remain active. RPG and archival Winter do not use this behavior. Eligibility, impulse strength and tolerances are authored approximations of the documented maneuver, not measured historical balance values.

Protocol versions are intentionally not mixed within a room. Versions 1–3 fail fast with `protocol_mismatch`: version 1 treated explosives as client hit claims, version 2 used a different arena collision contract, and version 3 lacks RG6 intent and boost events. Deploy the browser and match server atomically, or drain the old server before switching the endpoint.
