import { describe, expect, it } from 'vitest';
import { ARENA_COLLIDERS } from '../shared/arenaCollision';
import { MatchRoom } from './match-room';
import type { MessagePeer, PlayerSnapshot, ServerMessage, ShotData, Vec3, WeaponId } from './protocol';

const BODY_CENTER_Y=.98;
const BODY_RADIUS=.44;
const HEAD_CENTER_Y=1.64;
const CLEAR_COMBAT_SPAWNS = [
  { x: 40, y: 0, z: 30 },
  { x: 40, y: 0, z: 20 },
] as const;

class TestPeer implements MessagePeer {
  readonly messages: ServerMessage[] = [];
  send(message: ServerMessage): void {
    this.messages.push(message);
  }
}

function player(room: MatchRoom, id: string): PlayerSnapshot {
  const found = room.getSnapshot().players.find((entry) => entry.id === id);
  if (!found) throw new Error(`Player ${id} was not found`);
  return found;
}

function join(room: MatchRoom, peer: TestPeer, name: string): string {
  const result = room.join(peer, name);
  if (!result.ok) throw new Error(result.message);
  return result.player.id;
}

function aimShot(shotId: string, attacker: PlayerSnapshot, target: PlayerSnapshot, weapon: ShotData['weapon'] = 'rifle'): ShotData {
  const origin = { x: attacker.transform.position.x, y: attacker.transform.position.y + 1.55, z: attacker.transform.position.z };
  const center = { x: target.transform.position.x, y: target.transform.position.y + BODY_CENTER_Y, z: target.transform.position.z };
  const difference = { x: center.x - origin.x, y: center.y - origin.y, z: center.z - origin.z };
  const magnitude = Math.hypot(difference.x, difference.y, difference.z);
  return {
    shotId,
    origin,
    direction: { x: difference.x / magnitude, y: difference.y / magnitude, z: difference.z / magnitude },
    weapon,
  };
}

function fireAndHit(room: MatchRoom, attackerId: string, targetId: string, shotId: string, now: number): void {
  const attacker = player(room, attackerId);
  const target = player(room, targetId);
  const shot = aimShot(shotId, attacker, target);
  room.handleMessage(attackerId, { type: 'shoot', shot }, now);
  room.handleMessage(attackerId, {
    type: 'hit',
    hit: { shotId, targetId },
  }, now + 1);
}

function equip(room: MatchRoom, playerId: string, weapon: WeaponId, now: number, sequence = 1): void {
  const current = player(room, playerId).transform;
  room.handleMessage(playerId, {
    type: 'transform',
    sequence,
    clientTime: now,
    transform: { ...current, weapon },
  }, now);
}

function fireExplosive(
  room: MatchRoom,
  playerId: string,
  shotId: string,
  weapon: 'launcher' | 'rpg',
  direction: Vec3,
  now: number,
): void {
  const shooter = player(room, playerId);
  room.handleMessage(playerId, {
    type: 'shoot',
    shot: {
      shotId,
      origin: {
        x: shooter.transform.position.x,
        y: shooter.transform.position.y + 1.55,
        z: shooter.transform.position.z,
      },
      direction,
      weapon,
    },
  }, now);
}

function events(peer: TestPeer, type: string): ServerMessage[] {
  return peer.messages.filter((message) => message.type === 'event' && message.event.type === type);
}

function welcome(peer: TestPeer): Extract<ServerMessage, { type: 'welcome' }> {
  const message = [...peer.messages].reverse().find((entry) => entry.type === 'welcome');
  if (!message || message.type !== 'welcome') throw new Error('Welcome message was not sent');
  return message;
}

function latestError(peer: TestPeer): Extract<ServerMessage, { type: 'error' }> {
  const message = [...peer.messages].reverse().find((entry) => entry.type === 'error');
  if (!message || message.type !== 'error') throw new Error('Error message was not sent');
  return message;
}

function loadouts(peer: TestPeer): Array<Extract<ServerMessage, { type: 'loadout' }>> {
  return peer.messages.filter((message): message is Extract<ServerMessage, { type: 'loadout' }> =>
    message.type === 'loadout');
}

function latestLoadout(peer: TestPeer): Extract<ServerMessage, { type: 'loadout' }> {
  const message = loadouts(peer).at(-1);
  if (!message) throw new Error('Loadout message was not sent');
  return message;
}

describe('MatchRoom', () => {
  it('admits eight players in default Barrack and Woodland rooms and rejects a ninth', () => {
    for (const options of [{}, { map: 'barrack' as const }, { map: 'woodlands' as const }]) {
      const room = new MatchRoom('legacy-capacity', options);
      expect(room.maxPlayers).toBe(8);
      for (let index = 0; index < 8; index++) join(room, new TestPeer(), `Player ${index + 1}`);
      expect(room.size).toBe(8);
      expect(room.join(new TestPeer(), 'Ninth')).toMatchObject({ ok: false, code: 'room_full' });
      expect(room.size).toBe(8);
    }
  });

  it('retains sixteen-player Winter rooms and respects explicit capacity overrides', () => {
    for (const options of [
      { collisionProfile: 'winter' as const },
      { map: 'woodlands' as const, maxPlayers: 16 },
      { collisionProfile: 'winter' as const, maxPlayers: 2 },
    ]) {
      const expected = options.maxPlayers ?? 16;
      const room = new MatchRoom('configured-capacity', options);
      expect(room.maxPlayers).toBe(expected);
      for (let index = 0; index < expected; index++) join(room, new TestPeer(), `Player ${index + 1}`);
      expect(room.join(new TestPeer(), 'Excess')).toMatchObject({ ok: false, code: 'room_full' });
      expect(room.size).toBe(expected);
    }
  });

  it('assigns authoritative identities and publishes snapshots without sharing mutable state', () => {
    let nextId = 1;
    const room = new MatchRoom('alpha', { collisionProfile: 'winter', idFactory: () => `p${nextId++}`, now: () => 10_000 });
    const alice = new TestPeer();
    const bob = new TestPeer();
    expect(join(room, alice, '  Alice   One ')).toBe('p1');
    expect(join(room, bob, 'Bob')).toBe('p2');
    expect(alice.messages.slice(0, 2).map(({ type }) => type)).toEqual(['welcome', 'loadout']);
    expect(latestLoadout(alice)).toMatchObject({ playerId: 'p1', equipped: 'rifle', reload: null });
    expect(latestLoadout(bob)).toMatchObject({ playerId: 'p2', equipped: 'rifle', reload: null });

    const snapshot = room.tick(10_100);
    expect(snapshot.players.map(({ id, name, health, frags, deaths }) => ({ id, name, health, frags, deaths }))).toEqual([
      { id: 'p1', name: 'Alice One', health: 100, frags: 0, deaths: 0 },
      { id: 'p2', name: 'Bob', health: 100, frags: 0, deaths: 0 },
    ]);
    snapshot.players[0].transform.position.x = 999;
    expect(player(room, 'p1').transform.position.x).not.toBe(999);
    expect(alice.messages.some((message) => message.type === 'snapshot')).toBe(true);
  });

  it('accepts plausible ordered transforms and rejects teleporting or stale transforms', () => {
    const peer = new TestPeer();
    const room = new MatchRoom('movement', { collisionProfile: 'winter', idFactory: () => 'p1', now: () => 0 });
    const id = join(room, peer, 'Runner');
    const start = player(room, id).transform;
    room.handleMessage(id, { type: 'transform', sequence: 1, clientTime: 10, transform: { ...start, position: { ...start.position, x: start.position.x + 1 } } }, 100);
    expect(player(room, id).transform.position.x).toBe(start.position.x + 1);

    room.handleMessage(id, { type: 'transform', sequence: 2, clientTime: 20, transform: { ...start, position: { ...start.position, x: 50 } } }, 110);
    expect(player(room, id).transform.position.x).toBe(start.position.x + 1);
    expect(peer.messages.at(-1)).toMatchObject({ type: 'error', code: 'movement_rejected' });

    room.handleMessage(id, { type: 'transform', sequence: 1, clientTime: 30, transform: { ...start, position: { ...start.position, x: start.position.x + 2 } } }, 200);
    expect(player(room, id).transform.position.x).toBe(start.position.x + 1);
  });

  it('uses authoritative damage and rate limits shots', () => {
    let nextId = 1;
    const room = new MatchRoom('combat', { collisionProfile: 'winter', idFactory: () => `p${nextId++}`, now: () => 0, spawnPoints: CLEAR_COMBAT_SPAWNS });
    const attackerPeer = new TestPeer();
    const targetPeer = new TestPeer();
    const attackerId = join(room, attackerPeer, 'Attacker');
    const targetId = join(room, targetPeer, 'Target');

    fireAndHit(room, attackerId, targetId, 'one', 1_001);
    expect(player(room, targetId).health).toBe(66);

    const attacker = player(room, attackerId);
    const target = player(room, targetId);
    const tooFast = aimShot('two', attacker, target);
    room.handleMessage(attackerId, { type: 'shoot', shot: tooFast }, 1_050);
    expect(latestError(attackerPeer)).toMatchObject({ type: 'error', code: 'fire_rate' });
    room.handleMessage(attackerId, { type: 'hit', hit: { shotId: 'two', targetId } }, 1_051);
    expect(player(room, targetId).health).toBe(66);
  });

  it('does not relay undeclared client fields in shot events', () => {
    const peer = new TestPeer();
    const room = new MatchRoom('shot-envelope', { collisionProfile: 'winter', idFactory: () => 'p1', now: () => 0 });
    const id = join(room, peer, 'Shooter');
    const shooter = player(room, id);
    const shot: ShotData & { injected: string } = {
      shotId: 'clean-shot',
      origin: {
        x: shooter.transform.position.x,
        y: shooter.transform.position.y + 1.55,
        z: shooter.transform.position.z,
      },
      direction: { x: 0, y: 0, z: -1 },
      weapon: 'rifle',
      injected: 'do-not-broadcast',
    };

    room.handleMessage(id, { type: 'shoot', shot }, 1);
    const event = peer.messages.find((message) => message.type === 'event' && message.event.type === 'shot');
    expect(event).toMatchObject({ type: 'event', event: { type: 'shot', data: { playerId: id } } });
    if (event?.type !== 'event' || event.event.type !== 'shot') throw new Error('Shot event was not broadcast');
    expect(event.event.data.shot).toEqual({
      shotId: 'clean-shot',
      origin: shot.origin,
      direction: shot.direction,
      weapon: 'rifle',
    });
  });

  it('validates the presentation-aligned head volume and applies authoritative head damage',()=>{
    let nextId=1;const room=new MatchRoom('headshot', { collisionProfile: 'winter',idFactory:()=>`p${nextId++}`,now:()=>0,spawnPoints:CLEAR_COMBAT_SPAWNS});
    const attackerPeer=new TestPeer();const attackerId=join(room,attackerPeer,'Attacker');const targetId=join(room,new TestPeer(),'Target');
    const attacker=player(room,attackerId);const target=player(room,targetId);const origin={x:attacker.transform.position.x,y:attacker.transform.position.y+1.55,z:attacker.transform.position.z};
    const center={x:target.transform.position.x,y:target.transform.position.y+HEAD_CENTER_Y,z:target.transform.position.z};const delta={x:center.x-origin.x,y:center.y-origin.y,z:center.z-origin.z};const magnitude=Math.hypot(delta.x,delta.y,delta.z);
    const shot:ShotData={shotId:'head',origin,direction:{x:delta.x/magnitude,y:delta.y/magnitude,z:delta.z/magnitude},weapon:'rifle'};
    room.handleMessage(attackerId,{type:'shoot',shot},1_001);room.handleMessage(attackerId,{type:'hit',hit:{shotId:'head',targetId}},1_002);
    expect(player(room,targetId).health).toBe(25);expect(attackerPeer.messages.at(-1)).toMatchObject({type:'event',event:{type:'damaged',data:{source:{kind:'hitscan',zone:'head'},damage:75}}});
  });

  it('rejects forged hits that do not intersect the claimed target', () => {
    let nextId = 1;
    const room = new MatchRoom('validation', { collisionProfile: 'winter', idFactory: () => `p${nextId++}`, now: () => 0 });
    const attackerId = join(room, new TestPeer(), 'Attacker');
    const targetId = join(room, new TestPeer(), 'Target');
    const attacker = player(room, attackerId);
    const shot: ShotData = {
      shotId: 'miss',
      origin: { x: attacker.transform.position.x, y: attacker.transform.position.y + 1.55, z: attacker.transform.position.z },
      direction: { x: 0, y: 1, z: 0 }, weapon: 'rifle',
    };
    room.handleMessage(attackerId, { type: 'shoot', shot }, 1_001);
    room.handleMessage(attackerId, { type: 'hit', hit: { shotId: 'miss', targetId } }, 1_002);
    expect(player(room, targetId).health).toBe(100);
  });

  it('validates a lateral-moving target at its recent rendered position', () => {
    let nextId = 1;
    const room = new MatchRoom('lateral-rewind', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [
        { x: 0, y: 0, z: 40 },
        { x: 0, y: 0, z: 30 },
      ],
    });
    const attackerId = join(room, new TestPeer(), 'Attacker');
    const targetId = join(room, new TestPeer(), 'Target');
    const start = player(room, targetId).transform;
    const moveTarget = (sequence: number, x: number, now: number): void => {
      room.handleMessage(targetId, {
        type: 'transform',
        sequence,
        clientTime: now,
        transform: {
          ...start,
          position: { ...start.position, x },
          velocity: { x: 14, y: 0, z: 0 },
        },
      }, now);
    };

    moveTarget(1, 0, 1_000);
    moveTarget(2, 1.4, 1_100);
    const renderedTarget = player(room, targetId);
    moveTarget(3, 2.8, 1_200);
    const authoritativeTarget = player(room, targetId);
    expect(authoritativeTarget.transform.position.x).toBe(2.8);
    expect(authoritativeTarget.transform.position.x - renderedTarget.transform.position.x).toBeGreaterThan(BODY_RADIUS * 2);

    const shot = aimShot('rewound-shot', player(room, attackerId), renderedTarget);
    room.handleMessage(attackerId, { type: 'shoot', shot }, 1_201);
    room.handleMessage(attackerId, {
      type: 'hit',
      hit: {
        shotId: shot.shotId,
        targetId,
      },
    }, 1_202);

    expect(player(room, targetId).health).toBe(66);
  });

  it('bounds target rewind instead of accepting arbitrarily old positions', () => {
    let nextId = 1;
    const room = new MatchRoom('bounded-rewind', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [
        { x: 0, y: 0, z: 40 },
        { x: 0, y: 0, z: 30 },
      ],
    });
    const attackerId = join(room, new TestPeer(), 'Attacker');
    const targetId = join(room, new TestPeer(), 'Target');
    const start = player(room, targetId).transform;
    const moveTarget = (sequence: number, x: number, now: number): void => {
      room.handleMessage(targetId, {
        type: 'transform',
        sequence,
        clientTime: now,
        transform: {
          ...start,
          position: { ...start.position, x },
          velocity: { x: 14, y: 0, z: 0 },
        },
      }, now);
    };

    moveTarget(1, 0, 1_000);
    moveTarget(2, 1.4, 1_100);
    const staleTarget = player(room, targetId);
    moveTarget(3, 2.8, 1_200);
    moveTarget(4, 5.6, 1_500);

    const shot = aimShot('too-old-shot', player(room, attackerId), staleTarget);
    room.handleMessage(attackerId, { type: 'shoot', shot }, 1_501);
    room.handleMessage(attackerId, {
      type: 'hit',
      hit: {
        shotId: shot.shotId,
        targetId,
      },
    }, 1_502);

    expect(player(room, targetId).health).toBe(100);
  });

  it('rejects hit claims for a target behind a nearer player', () => {
    let nextId = 1;
    const room = new MatchRoom('player-occlusion', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: 10 },
        { x: 0, y: 0, z: 20 },
      ],
    });
    const attackerId = join(room, new TestPeer(), 'Attacker');
    const farTargetId = join(room, new TestPeer(), 'Far Target');
    const nearTargetId = join(room, new TestPeer(), 'Near Target');
    const attacker = player(room, attackerId);
    const farTarget = player(room, farTargetId);
    const shot = aimShot('occluded-shot', attacker, farTarget);

    room.handleMessage(attackerId, { type: 'shoot', shot }, 1_001);
    room.handleMessage(attackerId, {
      type: 'hit',
      hit: {
        shotId: shot.shotId,
        targetId: farTargetId,
      },
    }, 1_002);

    expect(player(room, farTargetId).health).toBe(100);
    expect(player(room, nearTargetId).health).toBe(100);
  });

  it('does not let a shot fired during spawn protection damage after protection expires', () => {
    let nextId = 1;
    const room = new MatchRoom('spawn-protection', { collisionProfile: 'winter', idFactory: () => `p${nextId++}`, now: () => 0 });
    const attackerId = join(room, new TestPeer(), 'Attacker');
    const targetId = join(room, new TestPeer(), 'Target');
    const attacker = player(room, attackerId);
    const target = player(room, targetId);
    const shot = aimShot('protected-shot', attacker, target);

    room.handleMessage(attackerId, { type: 'shoot', shot }, 999);
    room.handleMessage(attackerId, {
      type: 'hit',
      hit: {
        shotId: shot.shotId,
        targetId,
      },
    }, 1_001);

    expect(player(room, targetId).health).toBe(100);
  });

  it('ends spawn protection when a protected player fires an accepted shot', () => {
    let nextId = 1;
    const room = new MatchRoom('protection-break', { collisionProfile: 'winter', idFactory: () => `p${nextId++}`, now: () => 0, spawnPoints: CLEAR_COMBAT_SPAWNS });
    const firstPeer = new TestPeer();
    const firstId = join(room, firstPeer, 'First');
    const protectedPeer = new TestPeer();
    const protectedJoin = room.join(protectedPeer, 'Protected', 500);
    if (!protectedJoin.ok) throw new Error(protectedJoin.message);
    const protectedId = protectedJoin.player.id;

    fireAndHit(room, protectedId, firstId, 'outgoing-shot', 1_001);
    expect(player(room, firstId).health).toBe(66);

    fireAndHit(room, firstId, protectedId, 'return-shot', 1_101);
    expect(player(room, protectedId).health).toBe(66);
  });

  it('kills, attributes frags and deaths, then respawns at full health', () => {
    let nextId = 1;
    const room = new MatchRoom('respawn', { collisionProfile: 'winter', idFactory: () => `p${nextId++}`, now: () => 0, spawnPoints: CLEAR_COMBAT_SPAWNS });
    const attackerId = join(room, new TestPeer(), 'Attacker');
    const targetPeer = new TestPeer();
    const targetId = join(room, targetPeer, 'Target');

    fireAndHit(room, attackerId, targetId, 'one', 1_001);
    fireAndHit(room, attackerId, targetId, 'two', 1_101);
    fireAndHit(room, attackerId, targetId, 'three', 1_201);
    expect(player(room, attackerId).frags).toBe(1);
    expect(player(room, targetId)).toMatchObject({ health: 0, deaths: 1, alive: false, respawnAt: 2_502 });

    room.tick(2_501);
    expect(player(room, targetId).alive).toBe(false);
    room.tick(2_502);
    expect(player(room, targetId)).toMatchObject({ health: 100, deaths: 1, alive: true, respawnAt: null });
    expect(targetPeer.messages.some((message) => message.type === 'event' && message.event.type === 'respawn')).toBe(true);
  });

  it('announces and freezes a match winner at twelve frags', () => {
    let nextId = 1;
    const room = new MatchRoom('winner', { collisionProfile: 'winter', fragLimit: 12, idFactory: () => `p${nextId++}`, now: () => 0, spawnPoints: CLEAR_COMBAT_SPAWNS });
    const attackerPeer = new TestPeer();
    const targetPeer = new TestPeer();
    const attackerId = join(room, attackerPeer, 'Winner');
    const targetId = join(room, targetPeer, 'Target');

    let now = 1_001;
    for (let frag = 0; frag < 12; frag++) {
      if (frag === 10) {
        room.handleMessage(attackerId, { type: 'reload', weapon: 'rifle' }, now);
        now += 1_750;
      }
      for (let bullet = 0; bullet < 3; bullet++) {
        fireAndHit(room, attackerId, targetId, `${frag}-${bullet}`, now);
        now += 100;
      }
      if (frag < 11) {
        room.tick(now + 1_300);
        now += 2_301;
      }
    }

    expect(room.getSnapshot(now)).toMatchObject({ state: 'finished', winnerId: attackerId });
    expect(player(room, attackerId).frags).toBe(12);
    expect(attackerPeer.messages.filter((message) => message.type === 'event' && message.event.type === 'winner')).toHaveLength(1);
    room.tick(now + 10_000);
    expect(player(room, targetId).alive).toBe(false);
  });

  it('rejects late joins after the match has finished', () => {
    let nextId = 1;
    const room = new MatchRoom('finished', { collisionProfile: 'winter', fragLimit: 1, idFactory: () => `p${nextId++}`, now: () => 0, spawnPoints: CLEAR_COMBAT_SPAWNS });
    const attackerId = join(room, new TestPeer(), 'Winner');
    const targetId = join(room, new TestPeer(), 'Target');
    fireAndHit(room, attackerId, targetId, 'winning-shot-1', 1_001);
    fireAndHit(room, attackerId, targetId, 'winning-shot-2', 1_101);
    fireAndHit(room, attackerId, targetId, 'winning-shot-3', 1_201);

    const latePeer = new TestPeer();
    expect(room.join(latePeer, 'Late Player', 2_000)).toEqual({
      ok: false,
      code: 'match_finished',
      message: 'This match has already finished.',
    });
    expect(latePeer.messages).toHaveLength(0);
    expect(room.size).toBe(2);
  });

  it('spawns server-owned RPGs, advances them at the configured speed, and clones snapshots', () => {
    const peer = new TestPeer();
    const room = new MatchRoom('rpg-motion', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 40, y: 0, z: 30 }],
    });
    const id = join(room, peer, 'Rocketeer');
    equip(room, id, 'rpg', 1_000);
    fireExplosive(room, id, 'rpg-one', 'rpg', { x: 0, y: 0, z: -1 }, 1_001);

    const spawned = events(peer, 'projectile_spawned');
    expect(spawned).toHaveLength(1);
    expect(room.getSnapshot(1_001).projectiles[0]).toMatchObject({
      shotId: 'rpg-one',
      attackerId: id,
      weapon: 'rpg',
      position: { x: 40, y: 1.55, z: 28.8 },
      velocity: { x: 0, y: 0, z: -31 },
      expiresAt: 4_501,
    });

    const mutable = room.getSnapshot(1_001);
    mutable.projectiles[0].position.z = 999;
    expect(room.getSnapshot(1_001).projectiles[0].position.z).toBeCloseTo(28.8);
    room.tick(1_051);
    expect(room.getSnapshot(1_051).projectiles[0].position.z).toBeCloseTo(27.25);
    if (spawned[0]?.type !== 'event' || spawned[0].event.type !== 'projectile_spawned') throw new Error('Missing spawn event');
    expect(spawned[0].event.data.projectile.position.z).toBeCloseTo(28.8);
  });

  it('does not register explosive shots as client-claimable hitscan shots', () => {
    let nextId = 1;
    const peer = new TestPeer();
    const room = new MatchRoom('explosive-hit-claim', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [
        { x: 0, y: 0, z: 40 },
        { x: 10, y: 0, z: 40 },
      ],
    });
    const shooter = join(room, peer, 'Shooter');
    const target = join(room, new TestPeer(), 'Target');
    equip(room, shooter, 'rpg', 1_000);
    fireExplosive(room, shooter, 'not-hitscan', 'rpg', { x: 0, y: 1, z: 0 }, 1_001);
    room.handleMessage(shooter, { type: 'hit', hit: { shotId: 'not-hitscan', targetId: target } }, 1_002);
    expect(player(room, target).health).toBe(100);
    expect(events(peer, 'shot')).toHaveLength(0);
    expect(events(peer, 'projectile_spawned')).toHaveLength(1);
  });

  it('simulates launcher gravity in bounded steps and detonates exactly once at its fuse', () => {
    const peer = new TestPeer();
    const room = new MatchRoom('launcher-fuse', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 0, y: 0, z: 40 }],
    });
    const id = join(room, peer, 'Grenadier');
    equip(room, id, 'launcher', 1_000);
    fireExplosive(room, id, 'launcher-one', 'launcher', { x: 0, y: 1, z: 0 }, 1_001);

    room.tick(1_101);
    const moving = room.getSnapshot(1_101).projectiles[0];
    expect(moving.position.y).toBeCloseTo(4.476425, 5);
    expect(moving.velocity.y).toBeCloseTo(17.019, 5);

    room.tick(3_801);
    expect(room.getSnapshot(3_801).projectiles).toHaveLength(0);
    expect(events(peer, 'explosion')).toHaveLength(1);
    const explosion = events(peer, 'explosion')[0];
    expect(explosion).toMatchObject({
      type: 'event',
      event: { type: 'explosion', serverTime: 3_801, data: { shotId: 'launcher-one', radius: 4.3 } },
    });
    room.tick(10_000);
    expect(events(peer, 'explosion')).toHaveLength(1);
  });

  it('sweeps RPGs into arena walls and the ground instead of tunnelling', () => {
    const wallPeer = new TestPeer();
    const wallRoom = new MatchRoom('wall-impact', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 0, y: 0, z: 0 }],
    });
    const wallShooter = join(wallRoom, wallPeer, 'Wall Shooter');
    equip(wallRoom, wallShooter, 'rpg', 1_000);
    fireExplosive(wallRoom, wallShooter, 'wall-rpg', 'rpg', { x: 0, y: 0, z: -1 }, 1_001);
    wallRoom.tick(1_301);
    const wallExplosion = events(wallPeer, 'explosion')[0];
    if (wallExplosion?.type !== 'event' || wallExplosion.event.type !== 'explosion') throw new Error('Missing wall explosion');
    expect(wallExplosion.event.data.position.z).toBeCloseTo(-7.675, 5);
    expect(wallRoom.getSnapshot(1_301).projectiles).toHaveLength(0);

    const groundPeer = new TestPeer();
    const groundRoom = new MatchRoom('ground-impact', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 40, y: 0, z: 30 }],
    });
    const groundShooter = join(groundRoom, groundPeer, 'Ground Shooter');
    equip(groundRoom, groundShooter, 'rpg', 1_000);
    fireExplosive(groundRoom, groundShooter, 'ground-rpg', 'rpg', { x: 0, y: -1, z: 0 }, 1_001);
    groundRoom.tick(1_051);
    const groundExplosion = events(groundPeer, 'explosion')[0];
    if (groundExplosion?.type !== 'event' || groundExplosion.event.type !== 'explosion') throw new Error('Missing ground explosion');
    expect(groundExplosion.event.data.position.y).toBeCloseTo(0, 8);
  });

  it('damages open splash targets, but arena cover blocks the same blast', () => {
    let nextId = 1;
    const openRoom = new MatchRoom('open-splash', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [
        { x: 40, y: 0, z: 30 },
        { x: 40, y: 0, z: 20 },
        { x: 42, y: 0, z: 20 },
      ],
    });
    const shooter = join(openRoom, new TestPeer(), 'Shooter');
    const direct = join(openRoom, new TestPeer(), 'Direct');
    const splash = join(openRoom, new TestPeer(), 'Splash');
    equip(openRoom, shooter, 'rpg', 1_000);
    const direction = aimShot('unused', player(openRoom, shooter), player(openRoom, direct), 'rpg').direction;
    fireExplosive(openRoom, shooter, 'open-rpg', 'rpg', direction, 1_001);
    openRoom.tick(1_501);
    expect(player(openRoom, direct).health).toBe(0);
    expect(player(openRoom, splash).health).toBe(0);

    nextId = 1;
    const coverRoom = new MatchRoom('covered-splash', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -10 },
      ],
    });
    const coverShooter = join(coverRoom, new TestPeer(), 'Shooter');
    const covered = join(coverRoom, new TestPeer(), 'Covered');
    equip(coverRoom, coverShooter, 'rpg', 1_000);
    fireExplosive(coverRoom, coverShooter, 'covered-rpg', 'rpg', { x: 0, y: 0, z: -1 }, 1_001);
    coverRoom.tick(1_501);
    expect(player(coverRoom, covered).health).toBe(100);
  });

  it('lets protected players stop a projectile without taking blast damage', () => {
    let nextId = 1;
    const room = new MatchRoom('protected-projectile', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: CLEAR_COMBAT_SPAWNS,
    });
    const shooter = join(room, new TestPeer(), 'Shooter');
    const protectedPeer = new TestPeer();
    const protectedJoin = room.join(protectedPeer, 'Protected', 500);
    if (!protectedJoin.ok) throw new Error(protectedJoin.message);
    const target = protectedJoin.player.id;
    equip(room, shooter, 'rpg', 1_000);
    const direction = aimShot('unused', player(room, shooter), player(room, target), 'rpg').direction;
    fireExplosive(room, shooter, 'protected-rpg', 'rpg', direction, 1_001);
    room.tick(1_401);
    expect(events(protectedPeer, 'explosion')).toHaveLength(1);
    expect(player(room, target).health).toBe(100);
  });

  it('applies reduced self-damage and records suicide deaths without awarding a frag', () => {
    const peer = new TestPeer();
    const room = new MatchRoom('self-damage', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 40, y: 0, z: 30 }],
    });
    const id = join(room, peer, 'Self');
    equip(room, id, 'rpg', 1_000);
    const shots = [1_001, 4_001, 7_001];
    for (const [index, now] of shots.entries()) {
      fireExplosive(room, id, `self-${now}`, 'rpg', { x: 0, y: -1, z: 0 }, now);
      room.tick(now + 50);
      if (index < shots.length - 1) room.handleMessage(id, { type: 'reload', weapon: 'rpg' }, now + 51);
    }
    expect(player(room, id)).toMatchObject({ health: 0, alive: false, deaths: 1, frags: 0 });
    expect(events(peer, 'killed').at(-1)).toMatchObject({
      type: 'event',
      event: { type: 'killed', data: { killerId: id, victimId: id, killerFrags: 0, source: { kind: 'explosion' } } },
    });
  });

  it('retains projectile shot IDs beyond detonation to reject replay', () => {
    const peer = new TestPeer();
    const room = new MatchRoom('projectile-replay', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 0, y: 0, z: 40 }],
    });
    const id = join(room, peer, 'Replay');
    equip(room, id, 'rpg', 1_000);
    fireExplosive(room, id, 'replayed-id', 'rpg', { x: 0, y: 1, z: 0 }, 1_001);
    room.tick(4_501);
    room.handleMessage(id, { type: 'reload', weapon: 'rpg' }, 4_502);
    fireExplosive(room, id, 'replayed-id', 'rpg', { x: 0, y: 1, z: 0 }, 5_000);
    expect(latestError(peer)).toMatchObject({ type: 'error', code: 'duplicate_shot' });
    expect(events(peer, 'projectile_spawned')).toHaveLength(1);
    fireExplosive(room, id, 'replayed-id', 'rpg', { x: 0, y: 1, z: 0 }, 7_302);
    expect(events(peer, 'projectile_spawned')).toHaveLength(2);
  });

  it('retains consumed hitscan shot IDs so a hit cannot be replayed', () => {
    let nextId = 1;
    const peer = new TestPeer();
    const room = new MatchRoom('hitscan-replay', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: CLEAR_COMBAT_SPAWNS,
    });
    const shooter = join(room, peer, 'Shooter');
    const target = join(room, new TestPeer(), 'Target');
    fireAndHit(room, shooter, target, 'consumed-id', 1_001);
    expect(player(room, target).health).toBe(66);

    const replay = aimShot('consumed-id', player(room, shooter), player(room, target));
    room.handleMessage(shooter, { type: 'shoot', shot: replay }, 1_201);
    expect(latestError(peer)).toMatchObject({ type: 'error', code: 'duplicate_shot' });
    room.handleMessage(shooter, { type: 'hit', hit: { shotId: 'consumed-id', targetId: target } }, 1_202);
    expect(player(room, target).health).toBe(66);
    expect(events(peer, 'shot')).toHaveLength(1);
  });

  it('rejects hitscan claims through arena cover', () => {
    let nextId = 1;
    const peer = new TestPeer();
    const room = new MatchRoom('hitscan-wall', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [
        { x: 0, y: 0, z: 0 },
        { x: 0, y: 0, z: -10 },
      ],
    });
    const shooter = join(room, peer, 'Shooter');
    const target = join(room, new TestPeer(), 'Target');
    const shot = aimShot('wall-shot', player(room, shooter), player(room, target));
    room.handleMessage(shooter, { type: 'shoot', shot }, 1_001);
    room.handleMessage(shooter, { type: 'hit', hit: { shotId: shot.shotId, targetId: target } }, 1_002);
    expect(player(room, target).health).toBe(100);
    expect(events(peer, 'damaged')).toHaveLength(0);
  });

  it('applies every blast kill before announcing a single winner', () => {
    let nextId = 1;
    const peer = new TestPeer();
    const room = new MatchRoom('blast-winner', { collisionProfile: 'winter',
      fragLimit: 1,
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [
        { x: 40, y: 0, z: 30 },
        { x: 40, y: 0, z: 20 },
        { x: 42, y: 0, z: 20 },
      ],
    });
    const shooter = join(room, peer, 'Winner');
    const first = join(room, new TestPeer(), 'First');
    const second = join(room, new TestPeer(), 'Second');
    equip(room, shooter, 'rpg', 1_000);
    const direction = aimShot('unused', player(room, shooter), player(room, first), 'rpg').direction;
    fireExplosive(room, shooter, 'winning-rpg', 'rpg', direction, 1_001);
    room.tick(1_501);

    expect(player(room, first).alive).toBe(false);
    expect(player(room, second).alive).toBe(false);
    expect(player(room, shooter).frags).toBe(2);
    expect(room.getSnapshot(1_501)).toMatchObject({ state: 'finished', winnerId: shooter });
    expect(events(peer, 'winner')).toHaveLength(1);
  });

  it('removes a disconnected owner projectile without detonating it', () => {
    const peer = new TestPeer();
    const room = new MatchRoom('projectile-disconnect', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 0, y: 0, z: 40 }],
    });
    const id = join(room, peer, 'Leaver');
    equip(room, id, 'rpg', 1_000);
    fireExplosive(room, id, 'leaving-rpg', 'rpg', { x: 0, y: 1, z: 0 }, 1_001);
    expect(room.getSnapshot(1_001).projectiles).toHaveLength(1);
    expect(room.leave(id, 1_002)).toBe(true);
    expect(room.getSnapshot(1_002).projectiles).toHaveLength(0);
    expect(events(peer, 'explosion')).toHaveLength(0);
  });

  it('provides sixteen distinct default arena spawn positions for a full room', () => {
    let nextId = 1;
    const room = new MatchRoom('full-spawns', { collisionProfile: 'winter', idFactory: () => `p${nextId++}`, now: () => 0 });
    for (let index = 0; index < 16; index++) join(room, new TestPeer(), `Player ${index + 1}`);
    const positions = room.getSnapshot(0).players.map(({ transform }) =>
      `${transform.position.x},${transform.position.y},${transform.position.z}`);
    expect(new Set(positions).size).toBe(16);
    for (const { transform } of room.getSnapshot(0).players) {
      const bodyY = transform.position.y + BODY_CENTER_Y;
      expect(ARENA_COLLIDERS.some((collider) =>
        transform.position.x > collider.min[0] && transform.position.x < collider.max[0]
        && bodyY > collider.min[1] && bodyY < collider.max[1]
        && transform.position.z > collider.min[2] && transform.position.z < collider.max[2])).toBe(false);
    }
  });

  it('broadcasts disconnects and removes players', () => {
    let nextId = 1;
    const room = new MatchRoom('disconnect', { collisionProfile: 'winter', idFactory: () => `p${nextId++}` });
    const alice = new TestPeer();
    const bob = new TestPeer();
    const aliceId = join(room, alice, 'Alice');
    const bobId = join(room, bob, 'Bob');
    expect(room.leave(aliceId, 100)).toBe(true);
    expect(room.has(aliceId)).toBe(false);
    expect(room.size).toBe(1);
    expect(bob.messages.at(-1)).toMatchObject({ type: 'event', event: { type: 'leave', data: { playerId: aliceId } } });
    expect(room.leave(bobId, 101)).toBe(true);
    expect(room.size).toBe(0);
  });

  it('rejects hitscan and explosive origins claimed through nearby arena cover', () => {
    let nextId = 1;
    const hitscanPeer = new TestPeer();
    const hitscanRoom = new MatchRoom('origin-wall-hitscan', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [{ x: 0, y: 0, z: -5.8 }, { x: 0, y: 0, z: -10 }],
    });
    const shooter = join(hitscanRoom, hitscanPeer, 'Shooter');
    const target = join(hitscanRoom, new TestPeer(), 'Target');
    const forgedShot: ShotData = {
      shotId: 'forged-wall-origin',
      origin: { x: 0, y: 1.55, z: -8.4 },
      direction: { x: 0, y: -0.3356643357, z: -0.9419814926 },
      weapon: 'rifle',
    };
    hitscanRoom.handleMessage(shooter, { type: 'shoot', shot: forgedShot }, 1_001);
    expect(hitscanPeer.messages.slice(-2)).toMatchObject([
      { type: 'error', code: 'invalid_origin' },
      { type: 'loadout', playerId: shooter, weapons: { rifle: { ammo: 30, reserve: 150 } } },
    ]);
    hitscanRoom.handleMessage(shooter, { type: 'hit', hit: { shotId: forgedShot.shotId, targetId: target } }, 1_002);
    expect(player(hitscanRoom, target).health).toBe(100);
    expect(latestError(hitscanPeer)).toMatchObject({ type: 'error', code: 'invalid_origin' });
    expect(events(hitscanPeer, 'shot')).toHaveLength(0);

    nextId = 1;
    const explosivePeer = new TestPeer();
    const explosiveRoom = new MatchRoom('origin-wall-explosive', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [{ x: 0, y: 0, z: -5.8 }],
    });
    const rocketeer = join(explosiveRoom, explosivePeer, 'Rocketeer');
    equip(explosiveRoom, rocketeer, 'rpg', 1_000);
    explosiveRoom.handleMessage(rocketeer, {
      type: 'shoot',
      shot: {
        shotId: 'forged-wall-rpg',
        origin: { x: 0, y: 1.55, z: -8.4 },
        direction: { x: 0, y: 0, z: -1 },
        weapon: 'rpg',
      },
    }, 1_001);
    expect(explosiveRoom.getSnapshot(1_001).projectiles).toHaveLength(0);
    expect(events(explosivePeer, 'projectile_spawned')).toHaveLength(0);
    expect(latestError(explosivePeer)).toMatchObject({ type: 'error', code: 'invalid_origin' });
    expect(explosivePeer.messages.slice(-2)).toMatchObject([
      { type: 'error', code: 'invalid_origin' },
      {
        type: 'loadout', playerId: rocketeer, equipped: 'rpg', reload: null,
        weapons: { rpg: { ammo: 1, reserve: 5 } },
      },
    ]);
  });

  it('rejects occupying or crossing static arena colliders while allowing authored steps', () => {
    const barrierPeer = new TestPeer();
    const barrierRoom = new MatchRoom('movement-wall', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 0, y: 0, z: -5.8 }],
    });
    const barrierPlayer = join(barrierRoom, barrierPeer, 'Barrier Tester');
    const start = player(barrierRoom, barrierPlayer).transform;
    barrierRoom.handleMessage(barrierPlayer, {
      type: 'transform', sequence: 1, clientTime: 100,
      transform: { ...start, position: { x: 0, y: 0, z: -8 } },
    }, 100);
    expect(player(barrierRoom, barrierPlayer).transform.position.z).toBe(-5.8);
    expect(barrierPeer.messages.at(-1)).toMatchObject({ type: 'error', code: 'collision_rejected' });

    barrierRoom.handleMessage(barrierPlayer, {
      type: 'transform', sequence: 2, clientTime: 200,
      transform: { ...start, position: { x: 0, y: 0, z: -8.8 } },
    }, 200);
    expect(player(barrierRoom, barrierPlayer).transform.position.z).toBe(-5.8);
    expect(barrierPeer.messages.at(-1)).toMatchObject({ type: 'error', code: 'collision_rejected' });

    const stepPeer = new TestPeer();
    const stepRoom = new MatchRoom('movement-step', { collisionProfile: 'winter',
      idFactory: () => 'stepper',
      now: () => 0,
      spawnPoints: [{ x: -8.6, y: 0, z: -25.1 }],
    });
    const stepper = join(stepRoom, stepPeer, 'Stepper');
    const stepStart = player(stepRoom, stepper).transform;
    stepRoom.handleMessage(stepper, {
      type: 'transform', sequence: 1, clientTime: 100,
      transform: {
        ...stepStart,
        position: { x: -8.6, y: 0.355, z: -24.3 },
        velocity: { x: 0, y: 0, z: 7.2 },
      },
    }, 100);
    expect(player(stepRoom, stepper).transform.position).toEqual({ x: -8.6, y: 0.355, z: -24.3 });
    expect(stepPeer.messages.filter((message) => message.type === 'error')).toHaveLength(0);
  });

  it('uses a bounded movement budget that cannot be multiplied by same-time packets', () => {
    const floodPeer = new TestPeer();
    const floodRoom = new MatchRoom('movement-flood', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 40, y: 0, z: 30 }],
    });
    const flooder = join(floodRoom, floodPeer, 'Flooder');
    const floodStart = player(floodRoom, flooder).transform;
    for (let sequence = 1; sequence <= 20; sequence++) {
      floodRoom.handleMessage(flooder, {
        type: 'transform', sequence, clientTime: 1_000,
        transform: { ...floodStart, position: { x: 40 + sequence * 2, y: 0, z: 30 } },
      }, 1_000);
    }
    expect(player(floodRoom, flooder).transform.position.x).toBe(42);
    expect(floodPeer.messages.some((message) => message.type === 'error' && message.code === 'movement_rejected')).toBe(true);

    const normalPeer = new TestPeer();
    const normalRoom = new MatchRoom('movement-normal', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 30, y: 0, z: 30 }],
    });
    const runner = join(normalRoom, normalPeer, 'Runner');
    const normalStart = player(normalRoom, runner).transform;
    for (let sequence = 1; sequence <= 18; sequence++) {
      normalRoom.handleMessage(runner, {
        type: 'transform', sequence, clientTime: sequence * 56,
        transform: {
          ...normalStart,
          position: { x: 30 + sequence * 0.4, y: 0, z: 30 },
          velocity: { x: 7.2, y: 0, z: 0 },
        },
      }, sequence * 56);
    }
    expect(player(normalRoom, runner).transform.position.x).toBeCloseTo(37.2, 8);
    expect(normalPeer.messages.filter((message) => message.type === 'error')).toHaveLength(0);
  });

  it('rejects forged vertical climbing and perimeter escape while allowing a normal jump', () => {
    const escapePeer = new TestPeer();
    const escapeRoom = new MatchRoom('movement-perimeter', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 0, y: 0, z: -56 }],
    });
    const escapee = join(escapeRoom, escapePeer, 'Escapee');
    const start = player(escapeRoom, escapee).transform;
    escapeRoom.handleMessage(escapee, {
      type: 'transform', sequence: 1, clientTime: 1_000,
      transform: {
        ...start,
        position: { ...start.position, y: 1 },
        velocity: { x: 0, y: 5, z: 0 },
        grounded: false,
      },
    }, 1_000);
    expect(player(escapeRoom, escapee).transform.position.y).toBe(1);

    escapeRoom.handleMessage(escapee, {
      type: 'transform', sequence: 2, clientTime: 1_100,
      transform: {
        ...start,
        position: { ...start.position, y: 2 },
        velocity: { x: 0, y: 4, z: 0 },
        grounded: false,
      },
    }, 1_100);
    expect(player(escapeRoom, escapee).transform.position.y).toBe(1);
    expect(latestError(escapePeer)).toMatchObject({ code: 'collision_rejected' });

    escapeRoom.handleMessage(escapee, {
      type: 'transform', sequence: 3, clientTime: 1_200,
      transform: { ...start, position: { ...start.position, y: 4 }, grounded: true },
    }, 1_200);
    expect(player(escapeRoom, escapee).transform.position.y).toBe(1);

    escapeRoom.handleMessage(escapee, {
      type: 'transform', sequence: 4, clientTime: 1_300,
      transform: {
        ...start,
        position: { x: 0, y: 1, z: -57.4 },
        velocity: { x: 0, y: 0, z: -7.2 },
        grounded: false,
      },
    }, 1_300);
    expect(player(escapeRoom, escapee).transform.position.z).toBe(-56);
    expect(latestError(escapePeer)).toMatchObject({ code: 'collision_rejected' });

    const jumpPeer = new TestPeer();
    const jumpRoom = new MatchRoom('movement-jump', { collisionProfile: 'winter',
      idFactory: () => 'jumper',
      now: () => 0,
      spawnPoints: [{ x: 40, y: 0, z: 30 }],
    });
    const jumper = join(jumpRoom, jumpPeer, 'Jumper');
    const jumpStart = player(jumpRoom, jumper).transform;
    const jumpSamples = [
      { y: .25, velocityY: 5.1, grounded: false },
      { y: 1.1, velocityY: 0, grounded: false },
      { y: .6, velocityY: -3.5, grounded: false },
      { y: 0, velocityY: 0, grounded: true },
    ] as const;
    for (const [index, sample] of jumpSamples.entries()) {
      jumpRoom.handleMessage(jumper, {
        type: 'transform', sequence: index + 1, clientTime: 2_000 + index * 100,
        transform: {
          ...jumpStart,
          position: { ...jumpStart.position, y: sample.y },
          velocity: { x: 0, y: sample.velocityY, z: 0 },
          grounded: sample.grounded,
        },
      }, 2_000 + index * 100);
    }
    expect(player(jumpRoom, jumper).transform.position.y).toBe(0);
    expect(jumpPeer.messages.filter((message) => message.type === 'error')).toHaveLength(0);

    const landingPeer = new TestPeer();
    const landingRoom = new MatchRoom('movement-cover-landing', { collisionProfile: 'winter',
      idFactory: () => 'lander',
      now: () => 0,
      spawnPoints: [{ x: -2, y: 0, z: 22.8 }],
    });
    const lander = join(landingRoom, landingPeer, 'Lander');
    const landingStart = player(landingRoom, lander).transform;
    const landingSamples = [
      { x: -2, y: .4, z: 23.1, velocityY: 4, grounded: false },
      { x: -2, y: .9, z: 23.1, velocityY: 2, grounded: false },
      { x: -2, y: 1, z: 23.8, velocityY: 0, grounded: false },
      { x: -2, y: .9, z: 24, velocityY: -2, grounded: false },
      { x: -2, y: .6283100509643555, z: 24, velocityY: 0, grounded: true },
    ] as const;
    for (const [index, sample] of landingSamples.entries()) {
      landingRoom.handleMessage(lander, {
        type: 'transform', sequence: index + 1, clientTime: 3_000 + index * 100,
        transform: {
          ...landingStart,
          position: { x: sample.x, y: sample.y, z: sample.z },
          velocity: { x: 0, y: sample.velocityY, z: 4 },
          grounded: sample.grounded,
        },
      }, 3_000 + index * 100);
    }
    expect(player(landingRoom, lander).transform.position).toEqual({
      x: -2, y: .6283100509643555, z: 24,
    });
    expect(landingPeer.messages.filter((message) => message.type === 'error')).toHaveLength(0);

    const barrierPeer = new TestPeer();
    const barrierRoom = new MatchRoom('movement-fake-ground', { collisionProfile: 'winter',
      idFactory: () => 'barrier-player',
      now: () => 0,
      spawnPoints: [{ x: 0, y: 0, z: 10 }],
    });
    const barrierPlayer = join(barrierRoom, barrierPeer, 'Barrier Player');
    const barrierStart = player(barrierRoom, barrierPlayer).transform;
    barrierRoom.handleMessage(barrierPlayer, {
      type: 'transform', sequence: 1, clientTime: 4_000,
      transform: { ...barrierStart, position: { ...barrierStart.position, y: .15 } },
    }, 4_000);
    expect(player(barrierRoom, barrierPlayer).transform.position.y).toBe(0);
    expect(latestError(barrierPeer)).toMatchObject({ code: 'collision_rejected' });
    barrierRoom.handleMessage(barrierPlayer, {
      type: 'transform', sequence: 2, clientTime: 4_100,
      transform: {
        ...barrierStart,
        position: { ...barrierStart.position, y: 1.6 },
        velocity: { x: 0, y: 5, z: 0 },
        grounded: false,
      },
    }, 4_100);
    expect(player(barrierRoom, barrierPlayer).transform.position.y).toBe(0);
    barrierRoom.handleMessage(barrierPlayer, {
      type: 'transform', sequence: 3, clientTime: 4_200,
      transform: {
        ...barrierStart,
        position: { x: 0, y: 1.2, z: 10 },
        velocity: { x: 0, y: 1, z: 0 },
        grounded: false,
      },
    }, 4_200);
    barrierRoom.handleMessage(barrierPlayer, {
      type: 'transform', sequence: 4, clientTime: 4_500,
      transform: {
        ...barrierStart,
        position: { x: 0, y: 1.2, z: 13 },
        velocity: { x: 0, y: 0, z: 7.2 },
        grounded: false,
      },
    }, 4_500);
    expect(player(barrierRoom, barrierPlayer).transform.position).toEqual({ x: 0, y: 1.2, z: 10 });
    expect(barrierPeer.messages.filter((message) => message.type === 'error')).toHaveLength(3);
  });

  it('bounds the airborne path and rejects descent-to-rise or resume resets', () => {
    const pathPeer = new TestPeer();
    const pathRoom = new MatchRoom('movement-airborne-envelope', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 30, y: 0, z: 30 }],
    });
    const pathPlayer = join(pathRoom, pathPeer, 'Airborne');
    const pathStart = player(pathRoom, pathPlayer).transform;
    for (const [index, x] of [31, 33, 35, 37].entries()) {
      pathRoom.handleMessage(pathPlayer, {
        type: 'transform', sequence: index + 1, clientTime: 1_000 + index * 200,
        transform: {
          ...pathStart,
          position: { x, y: .5, z: 30 },
          velocity: { x: 7.2, y: index === 0 ? 4 : 0, z: 0 },
          grounded: false,
        },
      }, 1_000 + index * 200);
    }
    expect(player(pathRoom, pathPlayer).transform.position.x).toBe(37);
    pathRoom.handleMessage(pathPlayer, {
      type: 'transform', sequence: 5, clientTime: 1_800,
      transform: {
        ...pathStart,
        position: { x: 39, y: .5, z: 30 },
        velocity: { x: 7.2, y: 0, z: 0 },
        grounded: false,
      },
    }, 1_800);
    expect(player(pathRoom, pathPlayer).transform.position.x).toBe(37);
    expect(latestError(pathPeer)).toMatchObject({ code: 'collision_rejected' });

    pathRoom.handleMessage(pathPlayer, {
      type: 'transform', sequence: 6, clientTime: 2_000,
      transform: {
        ...pathStart,
        position: { x: 37, y: .3, z: 30 },
        velocity: { x: 0, y: -2, z: 0 },
        grounded: false,
      },
    }, 2_000);
    pathRoom.handleMessage(pathPlayer, {
      type: 'transform', sequence: 7, clientTime: 2_100,
      transform: {
        ...pathStart,
        position: { x: 37, y: .5, z: 30 },
        velocity: { x: 0, y: 2, z: 0 },
        grounded: false,
      },
    }, 2_100);
    expect(player(pathRoom, pathPlayer).transform.position.y).toBe(.3);
    expect(latestError(pathPeer)).toMatchObject({ code: 'collision_rejected' });

    const resumePeer = new TestPeer();
    const resumeRoom = new MatchRoom('resume-airborne-envelope', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 40, y: 0, z: 30 }],
    });
    const resumePlayer = join(resumeRoom, resumePeer, 'Resumer');
    const resumeStart = player(resumeRoom, resumePlayer).transform;
    resumeRoom.handleMessage(resumePlayer, {
      type: 'transform', sequence: 1, clientTime: 1_000,
      transform: {
        ...resumeStart,
        position: { ...resumeStart.position, y: 1.2 },
        velocity: { x: 0, y: 1, z: 0 },
        grounded: false,
      },
    }, 1_000, resumePeer);
    const replacementPeer = new TestPeer();
    expect(resumeRoom.join(replacementPeer, 'Resumer', 1_000, welcome(resumePeer).resumeToken).ok).toBe(true);
    resumeRoom.handleMessage(resumePlayer, {
      type: 'transform', sequence: 2, clientTime: 1_001,
      transform: {
        ...resumeStart,
        position: { ...resumeStart.position, y: 1.26 },
        velocity: { x: 0, y: 1, z: 0 },
        grounded: false,
      },
    }, 1_000, replacementPeer);
    expect(player(resumeRoom, resumePlayer).transform.position.y).toBe(1.2);
    expect(latestError(replacementPeer)).toMatchObject({ code: 'collision_rejected' });
  });

  it('preserves movement budget and transform sequence across repeated active resumes', () => {
    const originalPeer = new TestPeer();
    const room = new MatchRoom('resume-movement-budget', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 40, y: 0, z: 30 }],
    });
    const id = join(room, originalPeer, 'Runner');
    const start = player(room, id).transform;
    room.handleMessage(id, {
      type: 'transform', sequence: 1, clientTime: 1_000,
      transform: { ...start, position: { ...start.position, x: 42 } },
    }, 1_000, originalPeer);
    expect(player(room, id).transform.position.x).toBe(42);

    const firstReplacement = new TestPeer();
    expect(room.join(firstReplacement, 'Runner', 1_000, welcome(originalPeer).resumeToken).ok).toBe(true);
    const secondReplacement = new TestPeer();
    expect(room.join(secondReplacement, 'Runner', 1_000, welcome(firstReplacement).resumeToken).ok).toBe(true);

    const current = player(room, id).transform;
    room.handleMessage(id, {
      type: 'transform', sequence: 2, clientTime: 1_000,
      transform: { ...current, position: { ...current.position, x: 44 } },
    }, 1_000, secondReplacement);
    expect(player(room, id).transform.position.x).toBe(42);
    expect(latestError(secondReplacement)).toMatchObject({ code: 'movement_rejected' });

    room.handleMessage(id, {
      type: 'transform', sequence: 1, clientTime: 1_001,
      transform: { ...current, position: { ...current.position, x: 43 } },
    }, 1_000, secondReplacement);
    expect(player(room, id).transform.position.x).toBe(42);
    room.handleMessage(id, {
      type: 'transform', sequence: 2, clientTime: 1_002,
      transform: { ...current, position: { ...current.position, x: 43 } },
    }, 1_000, secondReplacement);
    expect(player(room, id).transform.position.x).toBe(43);
  });

  it('does not refresh spawn protection during an active resume takeover', () => {
    let nextId = 1;
    const attackerPeer = new TestPeer();
    const protectedPeer = new TestPeer();
    const room = new MatchRoom('resume-protection', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: CLEAR_COMBAT_SPAWNS,
    });
    const attacker = join(room, attackerPeer, 'Attacker');
    const target = join(room, protectedPeer, 'Target');
    const replacementPeer = new TestPeer();
    expect(room.join(replacementPeer, 'Target', 900, welcome(protectedPeer).resumeToken).ok).toBe(true);

    fireAndHit(room, attacker, target, 'post-resume-hit', 1_001);
    expect(player(room, target).health).toBe(66);
  });

  it('owns magazine state and enforces the full RPG reload duration', () => {
    const peer = new TestPeer();
    const room = new MatchRoom('authoritative-ammo', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 40, y: 0, z: 30 }],
    });
    const id = join(room, peer, 'Rocketeer');
    const firstLoadout = latestLoadout(peer);
    firstLoadout.weapons.rpg.ammo = 999;
    equip(room, id, 'rpg', 1_000);
    expect(latestLoadout(peer)).toMatchObject({ equipped: 'rpg', weapons: { rpg: { ammo: 1, reserve: 5 } } });
    const loadoutCount = loadouts(peer).length;
    const unchanged = player(room, id).transform;
    room.handleMessage(id, {
      type: 'transform', sequence: 2, clientTime: 1_000,
      transform: unchanged,
    }, 1_000);
    expect(loadouts(peer)).toHaveLength(loadoutCount);

    room.handleMessage(id, { type: 'reload', weapon: 'rpg' }, 1_000);
    expect(peer.messages.slice(-2)).toMatchObject([
      { type: 'error', code: 'magazine_full' },
      { type: 'loadout', weapons: { rpg: { ammo: 1, reserve: 5 } }, reload: null },
    ]);
    fireExplosive(room, id, 'rpg-first', 'rpg', { x: 0, y: 1, z: 0 }, 1_001);
    expect(latestLoadout(peer)).toMatchObject({ weapons: { rpg: { ammo: 0, reserve: 5 } }, reload: null });
    fireExplosive(room, id, 'rpg-empty', 'rpg', { x: 0, y: 1, z: 0 }, 2_101);
    expect(events(peer, 'projectile_spawned')).toHaveLength(1);
    expect(latestError(peer)).toMatchObject({ type: 'error', code: 'empty_magazine' });
    expect(peer.messages.slice(-2)).toMatchObject([
      { type: 'error', code: 'empty_magazine' },
      { type: 'loadout', weapons: { rpg: { ammo: 0, reserve: 5 } }, reload: null },
    ]);

    room.handleMessage(id, { type: 'reload', weapon: 'rpg' }, 2_102);
    expect(latestLoadout(peer)).toMatchObject({
      weapons: { rpg: { ammo: 0, reserve: 5 } },
      reload: { weapon: 'rpg', completesAt: 4_902 },
    });
    fireExplosive(room, id, 'rpg-too-early', 'rpg', { x: 0, y: 1, z: 0 }, 4_901);
    expect(latestError(peer)).toMatchObject({ type: 'error', code: 'reload_in_progress' });
    expect(peer.messages.slice(-2)).toMatchObject([
      { type: 'error', code: 'reload_in_progress' },
      { type: 'loadout', reload: { weapon: 'rpg', completesAt: 4_902 } },
    ]);
    room.tick(4_902);
    expect(latestLoadout(peer)).toMatchObject({
      weapons: { rpg: { ammo: 1, reserve: 4 } },
      reload: null,
    });
    fireExplosive(room, id, 'rpg-after-reload', 'rpg', { x: 0, y: 1, z: 0 }, 4_903);
    expect(latestLoadout(peer)).toMatchObject({ weapons: { rpg: { ammo: 0, reserve: 4 } }, reload: null });
    expect(events(peer, 'projectile_spawned')).toHaveLength(2);
  });

  it('cancels a victim reload on death and never leaks private loadouts', () => {
    let nextId = 1;
    const attackerPeer = new TestPeer();
    const victimPeer = new TestPeer();
    const room = new MatchRoom('loadout-kill-cancel', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: CLEAR_COMBAT_SPAWNS,
    });
    const attacker = join(room, attackerPeer, 'Attacker');
    const victim = join(room, victimPeer, 'Victim');

    fireAndHit(room, victim, attacker, 'victim-spends-round', 1_001);
    room.handleMessage(victim, { type: 'reload', weapon: 'rifle' }, 1_002);
    expect(latestLoadout(victimPeer)).toMatchObject({
      playerId: victim,
      weapons: { rifle: { ammo: 29, reserve: 150 } },
      reload: { weapon: 'rifle', completesAt: 2_752 },
    });

    fireAndHit(room, attacker, victim, 'kill-reloading-1', 1_101);
    fireAndHit(room, attacker, victim, 'kill-reloading-2', 1_201);
    fireAndHit(room, attacker, victim, 'kill-reloading-3', 1_301);
    expect(player(room, victim).alive).toBe(false);
    expect(latestLoadout(victimPeer)).toMatchObject({
      playerId: victim,
      weapons: { rifle: { ammo: 29, reserve: 150 } },
      reload: null,
    });
    expect(loadouts(attackerPeer).every((message) => message.playerId === attacker)).toBe(true);
    expect(loadouts(victimPeer).every((message) => message.playerId === victim)).toBe(true);
  });

  it('resets authoritative ammunition on respawn', () => {
    let nextId = 1;
    const attackerPeer = new TestPeer();
    const targetPeer = new TestPeer();
    const room = new MatchRoom('respawn-ammo', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: CLEAR_COMBAT_SPAWNS,
    });
    const attacker = join(room, attackerPeer, 'Attacker');
    const target = join(room, targetPeer, 'Target');
    equip(room, target, 'rpg', 1_000);
    fireExplosive(room, target, 'spent-before-death', 'rpg', { x: 0, y: 1, z: 0 }, 1_001);
    fireAndHit(room, attacker, target, 'kill-1', 1_101);
    fireAndHit(room, attacker, target, 'kill-2', 1_201);
    fireAndHit(room, attacker, target, 'kill-3', 1_301);
    room.tick(2_602);
    expect(player(room, target).alive).toBe(true);
    expect(latestLoadout(targetPeer)).toMatchObject({
      playerId: target,
      equipped: 'rifle',
      weapons: { rifle: { ammo: 30, reserve: 150 }, rpg: { ammo: 1, reserve: 5 } },
      reload: null,
    });
    equip(room, target, 'rpg', 2_603);
    fireExplosive(room, target, 'fresh-after-respawn', 'rpg', { x: 0, y: 1, z: 0 }, 2_604);
    expect(events(targetPeer, 'projectile_spawned').some((message) =>
      message.type === 'event' && message.event.type === 'projectile_spawned'
      && message.event.data.projectile.shotId === 'fresh-after-respawn')).toBe(true);
  });

  it('does not respawn an earlier victim after a projectile finishes the match', () => {
    let nextId = 1;
    const peer = new TestPeer();
    const room = new MatchRoom('finish-no-respawn', { collisionProfile: 'winter',
      fragLimit: 2,
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [{ x: 40, y: 0, z: 30 }, { x: 40, y: 0, z: 20 }, { x: 42, y: 0, z: 20 }],
    });
    const shooter = join(room, peer, 'Winner');
    const first = join(room, new TestPeer(), 'First');
    const second = join(room, new TestPeer(), 'Second');
    fireAndHit(room, shooter, first, 'first-1', 1_001);
    fireAndHit(room, shooter, first, 'first-2', 1_101);
    fireAndHit(room, shooter, first, 'first-3', 1_201);
    expect(player(room, first).respawnAt).toBe(2_502);
    equip(room, shooter, 'rpg', 2_300);
    const direction = aimShot('unused', player(room, shooter), player(room, second), 'rpg').direction;
    fireExplosive(room, shooter, 'winning-projectile', 'rpg', direction, 2_301);
    room.tick(2_601);
    expect(room.getSnapshot(2_601)).toMatchObject({ state: 'finished', winnerId: shooter });
    expect(player(room, first)).toMatchObject({ alive: false, health: 0, respawnAt: 2_502 });
    expect(events(peer, 'respawn')).toHaveLength(0);
  });

  it('suspends reservations, resumes preserved state, and rotates bearer tokens', () => {
    let nextId = 1;
    const firstPeer = new TestPeer();
    const observerPeer = new TestPeer();
    const room = new MatchRoom('resume-state', { collisionProfile: 'winter',
      maxPlayers: 2,
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: CLEAR_COMBAT_SPAWNS,
    });
    const firstId = join(room, firstPeer, 'First');
    const observerId = join(room, observerPeer, 'Observer');
    const originalToken = welcome(firstPeer).resumeToken;
    expect(originalToken).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    fireAndHit(room, firstId, observerId, 'resume-kill-1', 1_001);
    fireAndHit(room, firstId, observerId, 'resume-kill-2', 1_101);
    fireAndHit(room, firstId, observerId, 'resume-kill-3', 1_201);
    const preserved = player(room, firstId);

    expect(room.suspend(firstId, 1_300, firstPeer)).toBe(true);
    expect(room.size).toBe(2);
    expect(room.getSnapshot(1_300).players.map(({ id }) => id)).toEqual([observerId]);
    expect(observerPeer.messages.at(-1)).toMatchObject({ type: 'event', event: { type: 'leave', data: { playerId: firstId } } });

    const resumedPeer = new TestPeer();
    const resumed = room.join(resumedPeer, 'Ignored Replacement Name', 1_400, originalToken);
    expect(resumed.ok).toBe(true);
    if (!resumed.ok) throw new Error(resumed.message);
    expect(resumed.player).toMatchObject({
      id: firstId,
      name: preserved.name,
      health: preserved.health,
      frags: preserved.frags,
      deaths: preserved.deaths,
      transform: preserved.transform,
    });
    expect(resumedPeer.messages.slice(0, 2).map(({ type }) => type)).toEqual(['welcome', 'loadout']);
    expect(latestLoadout(resumedPeer)).toMatchObject({
      playerId: firstId,
      equipped: 'rifle',
      weapons: { rifle: { ammo: 27, reserve: 150 } },
      reload: null,
    });
    expect(loadouts(observerPeer).every((message) => message.playerId === observerId)).toBe(true);
    const rotatedToken = welcome(resumedPeer).resumeToken;
    expect(rotatedToken).not.toBe(originalToken);
    expect(room.join(new TestPeer(), 'Old Token', 1_401, originalToken)).toEqual({
      ok: false,
      code: 'resume_expired',
      message: 'Your reconnect session has expired. Join the room again.',
    });

    expect(room.suspend(firstId, 1_500, resumedPeer)).toBe(true);
    const secondResumePeer = new TestPeer();
    const secondResume = room.join(secondResumePeer, 'First', 1_600, rotatedToken);
    expect(secondResume.ok).toBe(true);
    expect(welcome(secondResumePeer).resumeToken).not.toBe(rotatedToken);
  });

  it('lets an active resume replace its peer and rejects stale peer actions', () => {
    const originalPeer = new TestPeer();
    const room = new MatchRoom('resume-replace', { collisionProfile: 'winter',
      idFactory: () => 'p1',
      now: () => 0,
      spawnPoints: [{ x: 40, y: 0, z: 30 }],
    });
    const id = join(room, originalPeer, 'Original');
    const token = welcome(originalPeer).resumeToken;
    const replacementPeer = new TestPeer();
    expect(room.join(replacementPeer, 'Replacement', 100, token).ok).toBe(true);
    expect(room.size).toBe(1);
    expect(events(replacementPeer, 'join')).toHaveLength(0);

    const current = player(room, id).transform;
    room.handleMessage(id, {
      type: 'transform', sequence: 1, clientTime: 200,
      transform: { ...current, position: { ...current.position, x: current.position.x + 1 } },
    }, 200, originalPeer);
    expect(player(room, id).transform.position.x).toBe(current.position.x);
    expect(room.suspend(id, 201, originalPeer)).toBe(false);
    expect(room.leave(id, 202, originalPeer)).toBe(false);
    expect(room.has(id)).toBe(true);

    room.handleMessage(id, {
      type: 'transform', sequence: 1, clientTime: 203,
      transform: { ...current, position: { ...current.position, x: current.position.x + 1 } },
    }, 203, replacementPeer);
    expect(player(room, id).transform.position.x).toBe(current.position.x + 1);
  });

  it('expires suspended reservations after thirty seconds with specific token failures', () => {
    const peer = new TestPeer();
    const room = new MatchRoom('resume-expiry', { collisionProfile: 'winter', idFactory: () => 'p1', now: () => 0 });
    const id = join(room, peer, 'Reserved');
    const token = welcome(peer).resumeToken;
    expect(room.suspend(id, 1_000, peer)).toBe(true);
    room.tick(30_999);
    expect(room.size).toBe(1);
    expect(room.getSnapshot(30_999).players).toHaveLength(0);
    room.tick(31_000);
    expect(room.size).toBe(0);
    expect(room.join(new TestPeer(), 'Reserved', 31_001, token)).toEqual({
      ok: false,
      code: 'resume_expired',
      message: 'Your reconnect session has expired. Join the room again.',
    });
    expect(room.join(new TestPeer(), 'Reserved', 31_001, '')).toMatchObject({
      ok: false,
      code: 'invalid_resume_token',
    });
  });

  it('removes suspended owners projectiles and excludes suspended targets from combat', () => {
    let nextId = 1;
    const shooterPeer = new TestPeer();
    const targetPeer = new TestPeer();
    const room = new MatchRoom('resume-combat-exclusion', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: CLEAR_COMBAT_SPAWNS,
    });
    const shooter = join(room, shooterPeer, 'Shooter');
    const target = join(room, targetPeer, 'Target');
    equip(room, shooter, 'rpg', 1_000);
    fireExplosive(room, shooter, 'suspended-owner-rpg', 'rpg', { x: 0, y: 1, z: 0 }, 1_001);
    expect(room.getSnapshot(1_001).projectiles).toHaveLength(1);
    expect(room.suspend(shooter, 1_002, shooterPeer)).toBe(true);
    expect(room.getSnapshot(1_002).projectiles).toHaveLength(0);

    const targetToken = welcome(targetPeer).resumeToken;
    expect(room.suspend(target, 1_003, targetPeer)).toBe(true);
    const resumedShooterPeer = new TestPeer();
    const shooterToken = welcome(shooterPeer).resumeToken;
    expect(room.join(resumedShooterPeer, 'Shooter', 1_100, shooterToken).ok).toBe(true);
    equip(room, shooter, 'rifle', 1_101, 2);
    const hiddenTarget = player(room, shooter);
    room.handleMessage(shooter, {
      type: 'shoot',
      shot: {
        shotId: 'no-suspended-target',
        origin: { x: hiddenTarget.transform.position.x, y: hiddenTarget.transform.position.y + 1.55, z: hiddenTarget.transform.position.z },
        direction: { x: 0, y: 0, z: -1 },
        weapon: 'rifle',
      },
    }, 1_102);
    room.handleMessage(shooter, { type: 'hit', hit: { shotId: 'no-suspended-target', targetId: target } }, 1_103);

    const resumedTargetPeer = new TestPeer();
    const resumedTarget = room.join(resumedTargetPeer, 'Target', 1_200, targetToken);
    expect(resumedTarget.ok).toBe(true);
    if (!resumedTarget.ok) throw new Error(resumedTarget.message);
    expect(resumedTarget.player.health).toBe(100);
  });

  it('ignores suspended reservations when choosing a spawn threat', () => {
    let nextId = 1;
    const firstPeer = new TestPeer();
    const room = new MatchRoom('resume-spawn-threat', { collisionProfile: 'winter',
      idFactory: () => `p${nextId++}`,
      now: () => 0,
      spawnPoints: [
        { x: 0, y: 0, z: 40 },
        { x: 10, y: 0, z: 40 },
        { x: 20, y: 0, z: 40 },
      ],
    });
    const first = join(room, firstPeer, 'First');
    expect(room.suspend(first, 100, firstPeer)).toBe(true);
    const second = join(room, new TestPeer(), 'Second');
    expect(player(room, second).transform.position).toEqual({ x: 10, y: 0, z: 40 });
  });
});
