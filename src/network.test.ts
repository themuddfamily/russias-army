import {OriginalRemoteView} from '../shared/originalRemoteView';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RG6_JUMP_MAX_SPEED } from '../shared/rg6Jump';
import {originalProjectileDirection} from '../shared/originalProjectileOrientation';
import {
  NETWORK_PROTOCOL_VERSION,
  NetworkClient,
  type ClientMessage,
  type LoadoutMessage,
  type NetworkClientOptions,
  type NetworkGameEvent,
  type NetworkWeaponId,
  type ServerMessage,
  type WelcomeMessage,
  type WebSocketLike,
} from './network';

type SocketEvent = 'open' | 'message' | 'error' | 'close';

class FakeWebSocket implements WebSocketLike {
  readyState = 0;
  bufferedAmount = 0;
  readonly sent: string[] = [];
  readonly closes: Array<{ code?: number; reason?: string }> = [];
  private readonly listeners = new Map<SocketEvent, Array<(event: any) => void>>();

  send(data: string): void {
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    this.closes.push({ code, reason });
    this.readyState = 3;
  }

  addEventListener(type: 'open', listener: (event: unknown) => void): void;
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void;
  addEventListener(type: 'error', listener: (event: unknown) => void): void;
  addEventListener(type: 'close', listener: (event: { code?: number; reason?: string; wasClean?: boolean }) => void): void;
  addEventListener(type: SocketEvent, listener: (event: any) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  open(): void {
    this.readyState = 1;
    this.emit('open', {});
  }

  receive(message: unknown): void {
    this.emit('message', { data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  disconnect(code = 1006, reason = 'connection lost'): void {
    this.readyState = 3;
    this.emit('close', { code, reason, wasClean: false });
  }

  messages(): ClientMessage[] {
    return this.sent.map((data) => JSON.parse(data) as ClientMessage);
  }

  private emit(type: SocketEvent, event: unknown): void {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

const welcome: WelcomeMessage = {
  type: 'welcome',
  protocol: NETWORK_PROTOCOL_VERSION,
  clientId: 'client-1',
  resumeToken: 'resume-token-1',
  room: 'test-room',
  tickRate: 20,
  serverTime: 1_000,
  fragLimit: 10,
  player: {
    id: 'client-1',
    name: 'Tester',
    health: 100,
    maxHealth: 100,
    frags: 0,
    deaths: 0,
    alive: true,
    respawnAt: null,
    transform: {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      yaw: 0,
      pitch: 0,
      grounded: true,
      weapon: 'rifle',
    },
  },
};

const projectile = {
  projectileId: 'projectile-1',
  shotId: 'shot-1',
  attackerId: 'client-1',
  weapon: 'rpg' as const,
  position: { x: 1, y: 2, z: 3 },
  velocity: { x: 0, y: 0, z: -31 },
  expiresAt: 4_500,
};

const loadout: LoadoutMessage = {
  type: 'loadout',
  serverTime: 1_010,
  playerId: 'client-1',
  equipped: 'rifle',
  weapons: {
    pistol: { ammo: 8, reserve: 64 },
    shotgun: { ammo: 8, reserve: 40 },
    rifle: { ammo: 29, reserve: 150 },
    sniper: { ammo: 10, reserve: 40 },
    launcher: { ammo: 6, reserve: 18 },
    rpg: { ammo: 1, reserve: 5 },
  },
  reload: { weapon: 'rifle', completesAt: 2_760 },
};

async function connectedClient(
  options: Partial<NetworkClientOptions> = {},
  serverWelcome: WelcomeMessage = welcome,
): Promise<{ client: NetworkClient; socket: FakeWebSocket }> {
  const socket = new FakeWebSocket();
  const client = new NetworkClient({
    reconnect: false,
    websocketFactory: () => socket,
    now: () => 1_000,
    ...options,
  });
  const joined = client.join('test-room', 'Tester');
  socket.open();
  expect(socket.messages()[0]).toEqual({
    type: 'join',
    protocol: NETWORK_PROTOCOL_VERSION,
    room: 'test-room',
    name: 'Tester',
    ...(options.sourceRemoteView?{sourceRemoteView:true}:{}),
  });
  socket.receive(serverWelcome);
  await joined;
  return { client, socket };
}

const shotInput = {
  origin: { x: 0, y: 1, z: 0 },
  direction: { x: 0, y: 0, z: -1 },
  weapon: 'rifle' as const,
};

afterEach(() => {
  vi.useRealTimers();
});

describe('NetworkClient protocol v10', () => {
  it('requires protocol v10 in the welcome message', async () => {
    const errors: string[] = [];
    const socket = new FakeWebSocket();
    const client = new NetworkClient({
      reconnect: false,
      websocketFactory: () => socket,
      onError: (error) => errors.push(error.code),
    });
    const joined = client.join('test-room', 'Tester');
    socket.open();
    socket.receive({ ...welcome, protocol: 3 });

    await expect(joined).rejects.toThrow(`protocol ${NETWORK_PROTOCOL_VERSION}`);
    expect(client.state).toBe('error');
    expect(errors).toContain('protocol_mismatch');
  });

  it.each([
    {
      name: 'a client id different from the welcome player',
      message: { ...welcome, clientId: 'different-client' },
    },
    {
      name: 'a room different from the requested room',
      message: { ...welcome, room: 'different-room' },
    },
    {
      name: 'a missing resume token',
      message: { ...welcome, resumeToken: undefined },
    },
    {
      name: 'an empty resume token',
      message: { ...welcome, resumeToken: '' },
    },
    {
      name: 'an oversized resume token',
      message: { ...welcome, resumeToken: 'r'.repeat(129) },
    },
    {
      name: 'a non-string resume token',
      message: { ...welcome, resumeToken: 42 },
    },
  ])('rejects a welcome containing $name', async ({ message }) => {
    const errors: string[] = [];
    const socket = new FakeWebSocket();
    const client = new NetworkClient({
      reconnect: false,
      websocketFactory: () => socket,
      onError: (error) => errors.push(error.code),
    });
    const joined = client.join('test-room', 'Tester');
    socket.open();
    socket.receive(message);

    await expect(joined).rejects.toThrow();
    expect(client.state).toBe('error');
    expect(errors).toContain('invalid_welcome');
  });

  it('accepts authoritative projectile, explosion, and discriminated damage events', async () => {
    const events: string[] = [];
    const { client, socket } = await connectedClient({ onEvent: (event) => events.push(event.type) });
    try {
      const messages: ServerMessage[] = [
        { type: 'event', event: { type: 'projectile_spawned', serverTime: 1_010, data: { projectile } } },
        {
          type: 'event',
          event: {
            type: 'explosion',
            serverTime: 1_100,
            data: {
              projectileId: projectile.projectileId,
              shotId: projectile.shotId,
              attackerId: projectile.attackerId,
              weapon: projectile.weapon,
              position: projectile.position,
              radius: 5.5,
            },
          },
        },
        {
          type: 'event',
          event: {
            type: 'damaged',
            serverTime: 1_100,
            data: {
              attackerId: 'client-1',
              targetId: 'client-2',
              damage: 75,
              health: 25,
              source: {
                kind: 'explosion',
                shotId: projectile.shotId,
                projectileId: projectile.projectileId,
                weapon: projectile.weapon,
                position: projectile.position,
              },
            },
          },
        },
        {
          type: 'event',
          event: {
            type: 'damaged',
            serverTime: 1_120,
            data: {
              attackerId: 'client-1',
              targetId: 'client-2',
              damage: 34,
              health: 0,
              source: {
                kind: 'hitscan',
                shotId: 'shot-2',
                weapon: 'rifle',
                zone: 'head',
                position: { x: 0, y: 1.64, z: -10 },
              },
            },
          },
        },
        {
          type: 'event',
          event: {
            type: 'killed',
            serverTime: 1_120,
            data: {
              killerId: 'client-1',
              victimId: 'client-2',
              killerFrags: 1,
              victimDeaths: 1,
              source: {
                kind: 'hitscan',
                shotId: 'shot-2',
                weapon: 'rifle',
                zone: 'head',
                position: { x: 0, y: 1.64, z: -10 },
              },
            },
          },
        },
      ];
      for (const message of messages) socket.receive(message);
      expect(events).toEqual(['projectile_spawned', 'explosion', 'damaged', 'damaged', 'killed']);
    } finally {
      client.dispose();
    }
  });

  it('validates trusted source ray reports before snapshot adoption',async()=>{
    const adopted:number[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onSnapshot:snapshot=>adopted.push(snapshot.tick),onError:error=>errors.push(error.code)});
    try{
      let tick=0;
      for(const sourceShots of [undefined,0,1,128,-1,.5,129,null,'1',Infinity,NaN]){
        tick++;socket.receive({type:'snapshot',snapshot:{room:'test-room',tick,serverTime:1050,fragLimit:10,state:'playing',winnerId:null,
          players:[{...welcome.player,sourceShots}],projectiles:[]}});
      }
      expect(adopted).toEqual([1,2,3,4]);expect(errors).toEqual(Array(7).fill('invalid_snapshot'));
    }finally{client.dispose();}
  });

  it('validates every projectile snapshot field and weapon partition', async () => {
    const snapshots: number[] = [];
    const errors: string[] = [];
    const { client, socket } = await connectedClient({
      onSnapshot: (snapshot) => snapshots.push(snapshot.tick),
      onError: (error) => errors.push(error.code),
    });
    try {
      socket.receive({
        type: 'snapshot',
        snapshot: {
          room: 'test-room', tick: 1, serverTime: 1_050, fragLimit: 10,
          state: 'playing', winnerId: null, players: [welcome.player], projectiles: [projectile],
        },
      });
      socket.receive({
        type: 'snapshot',
        snapshot: {
          room: 'test-room', tick: 2, serverTime: 1_100, fragLimit: 10,
          state: 'playing', winnerId: null, players: [welcome.player],
          projectiles: [{ ...projectile, weapon: 'rifle' }],
        },
      });
      socket.receive({
        type: 'snapshot',
        snapshot: {
          room: 'test-room', tick: 3, serverTime: 1_150, fragLimit: 10,
          state: 'playing', winnerId: null, players: [welcome.player],
        },
      });
      expect(snapshots).toEqual([1]);
      expect(errors).toEqual(['invalid_snapshot', 'invalid_snapshot']);
    } finally {
      client.dispose();
    }
  });

  it('ignores an otherwise valid snapshot for a different room', async () => {
    const snapshots: string[] = [];
    const errors: string[] = [];
    const { client, socket } = await connectedClient({
      onSnapshot: (snapshot) => snapshots.push(snapshot.room),
      onError: (error) => errors.push(error.code),
    });
    try {
      socket.receive({
        type: 'snapshot',
        snapshot: {
          room: 'different-room', tick: 1, serverTime: 1_050, fragLimit: 10,
          state: 'playing', winnerId: null, players: [welcome.player], projectiles: [],
        },
      });
      expect(snapshots).toEqual([]);
      expect(client.latestSnapshot).toBeUndefined();
      expect(errors).toContain('invalid_snapshot');
    } finally {
      client.dispose();
    }
  });

  it('delivers an optional finite projectile launch sound position without replacing its body position', async () => {
    const events: NetworkGameEvent[] = [];
    const {client,socket}=await connectedClient({onEvent:event=>events.push(event)});
    const launchSoundPosition={x:7,y:8,z:9};
    try {
      socket.receive({type:'event',event:{type:'projectile_spawned',serverTime:1_010,data:{projectile,launchSoundPosition}}});
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({type:'projectile_spawned',data:{projectile:{position:projectile.position},launchSoundPosition}});
    } finally { client.dispose(); }
  });

  it.each([
    { name: 'unbounded projectile id', event: { type: 'projectile_spawned', serverTime: 1_010, data: { projectile: { ...projectile, projectileId: 'p'.repeat(129) } } } },
    { name: 'non-finite projectile vector', event: { type: 'projectile_spawned', serverTime: 1_010, data: { projectile: { ...projectile, position: { x: Infinity, y: 0, z: 0 } } } } },
    { name: 'non-finite projectile launch sound position', event: { type: 'projectile_spawned', serverTime: 1_010, data: { projectile, launchSoundPosition: { x: Infinity, y: 0, z: 0 } } } },
    { name: 'incomplete projectile launch sound position', event: { type: 'projectile_spawned', serverTime: 1_010, data: { projectile, launchSoundPosition: { x: 0, y: 0 } } } },
    { name: 'null projectile launch sound position', event: { type: 'projectile_spawned', serverTime: 1_010, data: { projectile, launchSoundPosition: null } } },
    { name: 'hitscan projectile weapon', event: { type: 'projectile_spawned', serverTime: 1_010, data: { projectile: { ...projectile, weapon: 'rifle' } } } },
    { name: 'explosive hitscan event', event: { type: 'shot', serverTime: 1_010, data: { playerId: 'client-1', shot: { shotId: 's', origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: -1 }, weapon: 'rpg' } } } },
    { name: 'oversized blast radius', event: { type: 'explosion', serverTime: 1_010, data: { projectileId: 'p', shotId: 's', attackerId: 'a', weapon: 'rpg', position: { x: 0, y: 0, z: 0 }, radius: 33 } } },
  ])('rejects malformed event payloads: $name', async ({ event }) => {
    const events: string[] = [];
    const errors: string[] = [];
    const { client, socket } = await connectedClient({
      onEvent: (message) => events.push(message.type),
      onError: (error) => errors.push(error.code),
    });
    try {
      socket.receive({ type: 'event', event });
      expect(events).toEqual([]);
      expect(errors).toContain('invalid_event');
    } finally {
      client.dispose();
    }
  });
});

describe('NetworkClient immutable explosive launch callsigns', () => {
  const blast = { ...projectile, remainingCallbacks: 16 };
  const explosionData = {
    projectileId: projectile.projectileId, shotId: projectile.shotId,
    attackerId: projectile.attackerId, weapon: projectile.weapon,
    position: projectile.position, radius: 5.5,
  };
  const source = {
    kind: 'explosion' as const, projectileId: projectile.projectileId,
    shotId: projectile.shotId, weapon: projectile.weapon, position: projectile.position,
  };
  function namedMessages(attackerName: unknown): unknown[] {
    const namedSource = { ...source, attackerName };
    const snapshot = {
      room: 'test-room', tick: 1, serverTime: 1_050, fragLimit: 10,
      state: 'playing', winnerId: null, players: [], projectiles: [],
    };
    return [
      { type: 'snapshot', snapshot: { ...snapshot, projectiles: [{ ...projectile, attackerName }] } },
      { type: 'snapshot', snapshot: { ...snapshot, blasts: [{ ...blast, attackerName }] } },
      { type: 'event', event: { type: 'projectile_spawned', serverTime: 1_010, data: { projectile: { ...projectile, attackerName } } } },
      { type: 'event', event: { type: 'explosion', serverTime: 1_100, data: { ...explosionData, attackerName } } },
      { type: 'event', event: { type: 'damaged', serverTime: 1_100, data: {
        attackerId: projectile.attackerId, targetId: 'client-2', damage: 75, health: 25, source: namedSource,
      } } },
      { type: 'event', event: { type: 'killed', serverTime: 1_100, data: {
        killerId: projectile.attackerId, victimId: 'client-2', killerFrags: 0, victimDeaths: 1, source: namedSource,
      } } },
    ];
  }

  it.each(['Departed Launcher', ' Name ', 'x'.repeat(20), undefined])(
    'forwards launch name without changing it, even with no owner in the snapshot: %j', async (name) => {
      const snapshots: unknown[] = [], events: unknown[] = [], errors: string[] = [];
      const { client, socket } = await connectedClient({
        onSnapshot: snapshot => snapshots.push(snapshot),
        onEvent: event => events.push(event), onError: error => errors.push(error.code),
      });
      try {
        const messages = namedMessages(name) as Array<any>;
        for (const message of messages) socket.receive(message);
        // Compare the received JSON, including all retained source names and omitted legacy fields.
        expect(snapshots).toEqual(messages.slice(0, 2).map(message => JSON.parse(JSON.stringify(message.snapshot))));
        expect(events).toEqual(messages.slice(2).map(message => JSON.parse(JSON.stringify(message.event))));
        expect(errors).toEqual([]);
      } finally { client.dispose(); }
    },
  );

  it.each(['', 'x'.repeat(21), 42, null, {}, 'bad\nname', 'bad\u0000name', 'bad\u007fname'])(
    'rejects malformed names on projectile/blast snapshots and every explosive event source: %j', async (name) => {
      const snapshots: unknown[] = [], events: unknown[] = [], errors: string[] = [];
      const { client, socket } = await connectedClient({
        onSnapshot: snapshot => snapshots.push(snapshot), onEvent: event => events.push(event),
        onError: error => errors.push(error.code),
      });
      try {
        for (const message of namedMessages(name)) socket.receive(message);
        expect(snapshots).toEqual([]);
        expect(events).toEqual([]);
        expect(errors).toEqual(['invalid_snapshot', 'invalid_snapshot', 'invalid_event', 'invalid_event', 'invalid_event', 'invalid_event']);
      } finally { client.dispose(); }
    },
  );
});

describe('NetworkClient source death score recipients', () => {
  const killed = {
    type: 'killed' as const, serverTime: 1_100, data: {
      killerId: 'departed-owner', victimId: 'client-2', killerFrags: 0, victimDeaths: 1,
      source: { kind: 'explosion' as const, projectileId: projectile.projectileId,
        shotId: projectile.shotId, weapon: projectile.weapon, position: projectile.position,
        attackerName: 'Launcher' },
    },
  };
  const recipient = { playerId: 'current-same-name', frags: 1, score: 30 };
  it.each([undefined, [], [recipient], Array.from({ length: 64 }, (_, i) => ({ ...recipient, playerId: `player-${i}` }))])(
    'forwards authoritative source recipient scores: %j', async (sourceScoreRecipients) => {
      const events: unknown[] = [], errors: string[] = [];
      const { client, socket } = await connectedClient({ onEvent: event => events.push(event), onError: error => errors.push(error.code) });
      try {
        const event = { ...killed, data: { ...killed.data, sourceScoreRecipients } };
        socket.receive({ type: 'event', event });
        expect(events).toEqual([JSON.parse(JSON.stringify(event))]);
        expect(errors).toEqual([]);
      } finally { client.dispose(); }
    },
  );
  it.each([
    null, {}, [recipient, recipient], [null], [{ ...recipient, playerId: '' }],
    [{ ...recipient, playerId: 'x'.repeat(129) }], [{ ...recipient, frags: -1 }],
    [{ ...recipient, frags: 0.5 }], [{ ...recipient, score: -1 }],
    [{ ...recipient, score: Number.MAX_SAFE_INTEGER + 1 }], [{ ...recipient, score: '30' }],
    [{ ...recipient, injected: true }], Array.from({ length: 65 }, (_, i) => ({ ...recipient, playerId: `player-${i}` })),
  ])('rejects malformed source recipient scores: %j', async (sourceScoreRecipients) => {
    const events: unknown[] = [], errors: string[] = [];
    const { client, socket } = await connectedClient({ onEvent: event => events.push(event), onError: error => errors.push(error.code) });
    try {
      socket.receive({ type: 'event', event: { ...killed, data: { ...killed.data, sourceScoreRecipients } } });
      expect(events).toEqual([]);
      expect(errors).toEqual(['invalid_event']);
    } finally { client.dispose(); }
  });
});

describe('NetworkClient combat claim identifiers', () => {
  it('does not send client-supplied explosive owner names or source score recipients', async () => {
    const { client, socket } = await connectedClient();
    try {
      const claim = { ...shotInput, weapon: 'launcher' as const, shotId: 'server-name-only',
        attackerName: 'Forged Launcher', sourceScoreRecipients: [{ playerId: 'client-1', frags: 999, score: 999 }] };
      expect(client.shoot(claim)).toBe('server-name-only');
      expect(socket.messages().filter(message => message.type === 'shoot')).toEqual([
        { type: 'shoot', shot: { ...shotInput, weapon: 'launcher', shotId: 'server-name-only' } },
      ]);
    } finally { client.dispose(); }
  });

  it('sends a cloned boolean RG6 input intent and strips unrelated fields', async () => {
    const { client, socket } = await connectedClient();
    try {
      const rg6Jump = { forward: true, jump: true, velocityY: 999 };
      expect(client.shoot({ ...shotInput, weapon: 'launcher', shotId: 'rg6', rg6Jump })).toBe('rg6');
      rg6Jump.forward = false;
      const shots = socket.messages().filter((message) => message.type === 'shoot');
      expect(shots).toEqual([{ type: 'shoot', shot: {
        ...shotInput, weapon: 'launcher', shotId: 'rg6', rg6Jump: { forward: true, jump: true },
      } }]);
      expect(client.shoot({ ...shotInput, shotId: 'rifle-intent', rg6Jump: { forward: false, jump: true } })).toBe('rifle-intent');
    } finally {
      client.dispose();
    }
  });

  it.each([null, true, {}, { forward: 1, jump: true }, { forward: true, jump: 'true' }, { forward: true }])(
    'rejects malformed RG6 intent without sending: %j', async (rg6Jump) => {
      const { client, socket } = await connectedClient();
      try {
        const sentBefore = socket.sent.length;
        expect(client.shoot({ ...shotInput, rg6Jump: rg6Jump as any })).toBeUndefined();
        expect(socket.sent).toHaveLength(sentBefore);
      } finally {
        client.dispose();
      }
    },
  );

  it('delivers only bounded authoritative RG6 boosts', async () => {
    const events: unknown[] = [];
    const errors: string[] = [];
    const { client, socket } = await connectedClient({
      onEvent: (event) => events.push(event),
      onError: (error) => errors.push(error.code),
    });
    try {
      const data = { playerId: 'client-1', projectileId: 'rg6-1', velocityY: RG6_JUMP_MAX_SPEED };
      const event = { type: 'rg6_boost', serverTime: 1_100, data };
      socket.receive({ type: 'event', event });
      expect(events).toEqual([event]);
      for (const invalid of [
        { ...data, velocityY: 0 }, { ...data, velocityY: -1 },
        { ...data, velocityY: RG6_JUMP_MAX_SPEED + .01 }, { ...data, velocityY: Infinity },
        { ...data, velocityY: '8' }, { ...data, playerId: '' },
        { ...data, playerId: 'p'.repeat(129) }, { ...data, projectileId: 'p'.repeat(129) },
      ]) socket.receive({ type: 'event', event: { ...event, data: invalid } });
      expect(events).toEqual([event]);
      expect(errors).toHaveLength(8);
      expect(errors.every((error) => error === 'invalid_event')).toBe(true);
    } finally {
      client.dispose();
    }
  });

  it('keeps generated shot IDs bounded and unique for a maximum-length client ID', async () => {
    const longClientId = 'c'.repeat(128);
    const longIdWelcome: WelcomeMessage = {
      ...welcome,
      clientId: longClientId,
      resumeToken: 'r'.repeat(128),
      player: { ...welcome.player, id: longClientId },
    };
    const { client, socket } = await connectedClient({}, longIdWelcome);
    try {
      const first = client.shoot(shotInput);
      const second = client.shoot(shotInput);
      expect(first).toBeDefined();
      expect(second).toBeDefined();
      expect(first).not.toBe(second);
      expect(first?.length).toBeLessThanOrEqual(64);
      expect(second?.length).toBeLessThanOrEqual(64);

      const shots = socket.messages().filter((message) => message.type === 'shoot');
      expect(shots.map((message) => message.shot.shotId)).toEqual([first, second]);
    } finally {
      client.dispose();
    }
  });

  it('sends minimal shots with custom IDs at the 1-64 character boundaries', async () => {
    const { client, socket } = await connectedClient();
    try {
      expect(client.shoot({ ...shotInput, shotId: 's' })).toBe('s');
      expect(client.shoot({ ...shotInput, shotId: 's'.repeat(64) })).toBe('s'.repeat(64));

      const shots = socket.messages().filter((message) => message.type === 'shoot');
      expect(shots).toHaveLength(2);
      expect(shots[0]).toEqual({ type: 'shoot', shot: { shotId: 's', ...shotInput } });
      expect(shots.map((message) => message.shot.shotId)).toEqual(['s', 's'.repeat(64)]);
    } finally {
      client.dispose();
    }
  });

  it('rejects custom shot IDs outside 1-64 characters without sending', async () => {
    const { client, socket } = await connectedClient();
    try {
      const sentBefore = socket.sent.length;
      expect(client.shoot({ ...shotInput, shotId: '' })).toBeUndefined();
      expect(client.shoot({ ...shotInput, shotId: 's'.repeat(65) })).toBeUndefined();
      expect(socket.sent).toHaveLength(sentBefore);
    } finally {
      client.dispose();
    }
  });

  it('sends minimal hit IDs at the 1-64 and 1-128 character boundaries', async () => {
    const { client, socket } = await connectedClient();
    try {
      expect(client.hit({ shotId: 's', targetId: 't' })).toBe(true);
      expect(client.hit({ shotId: 's'.repeat(64), targetId: 't'.repeat(128) })).toBe(true);

      const hits = socket.messages().filter((message) => message.type === 'hit');
      expect(hits).toEqual([
        { type: 'hit', hit: { shotId: 's', targetId: 't' } },
        { type: 'hit', hit: { shotId: 's'.repeat(64), targetId: 't'.repeat(128) } },
      ]);
    } finally {
      client.dispose();
    }
  });

  it.each([
    { shotId: '', targetId: 't' },
    { shotId: 's'.repeat(65), targetId: 't' },
    { shotId: 's', targetId: '' },
    { shotId: 's', targetId: 't'.repeat(129) },
  ])('rejects out-of-range hit IDs without sending: $shotId / $targetId', async ({ shotId, targetId }) => {
    const { client, socket } = await connectedClient();
    try {
      const sentBefore = socket.sent.length;
      expect(client.hit({ shotId, targetId })).toBe(false);
      expect(socket.sent).toHaveLength(sentBefore);
    } finally {
      client.dispose();
    }
  });
});

describe('NetworkClient reconnect credentials', () => {
  it('clears an old token before reconnecting an explicit new join', async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const client = new NetworkClient({
      reconnect: { enabled: true, maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, jitter: 0 },
      websocketFactory: () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      },
    });
    const initialJoin = client.join('test-room', 'Tester');
    sockets[0].open();
    sockets[0].receive(welcome);
    await initialJoin;

    try {
      const replacementJoin = client.join('other-room', 'Tester');
      expect(sockets[0].messages().filter((message) => message.type === 'leave')).toEqual([{ type: 'leave' }]);
      sockets[1].open();
      expect(sockets[1].messages()[0]).toEqual({
        type: 'join', protocol: NETWORK_PROTOCOL_VERSION, room: 'other-room', name: 'Tester',
      });
      sockets[1].disconnect();
      await vi.advanceTimersByTimeAsync(1);

      sockets[2].open();
      expect(sockets[2].messages()[0]).toEqual({
        type: 'join', protocol: NETWORK_PROTOCOL_VERSION, room: 'other-room', name: 'Tester',
      });
      sockets[2].receive({ ...welcome, room: 'other-room', resumeToken: 'other-room-token' });
      await replacementJoin;
    } finally {
      client.dispose();
    }
  });
});

describe('NetworkClient authoritative reload requests', () => {
  it('sends every valid weapon and rejects invalid runtime values', async () => {
    const { client, socket } = await connectedClient();
    const weapons: NetworkWeaponId[] = ['pistol', 'shotgun', 'rifle', 'sniper', 'launcher', 'rpg'];
    try {
      for (const weapon of weapons) expect(client.reload(weapon)).toBe(true);
      const sentBeforeInvalid = socket.sent.length;
      expect(client.reload('grenade' as NetworkWeaponId)).toBe(false);
      expect(socket.sent).toHaveLength(sentBeforeInvalid);
      expect(socket.messages().filter((message) => message.type === 'reload')).toEqual(
        weapons.map((weapon) => ({ type: 'reload', weapon })),
      );
    } finally {
      client.dispose();
    }
  });

  it('does not send reload requests before joining', () => {
    const socket = new FakeWebSocket();
    const client = new NetworkClient({ reconnect: false, websocketFactory: () => socket });
    expect(client.reload('rifle')).toBe(false);
    expect(socket.sent).toEqual([]);
  });
});

describe('NetworkClient authoritative loadouts', () => {
  it('preserves optional source transform acknowledgment boundaries and typing gates',async()=>{
    const delivered:LoadoutMessage[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onLoadout:message=>delivered.push(message),onError:error=>errors.push(error.code)});
    try{
      const source:LoadoutMessage={...loadout,reload:null,sourceCounter:{waitgun:-60,poldwaitgun:0,ready:false}};
      const valid=[loadout,source,
        {...source,sourceTransformSequence:-1,sourceTyping:true},
        {...source,sourceTransformSequence:0,sourceTyping:false},
        {...source,sourceTransformSequence:Number.MAX_SAFE_INTEGER,sourceTyping:false},
        {...source,sourceTransformSequence:7},{...source,sourceTyping:true}];
      for(const message of valid)socket.receive(message);
      expect(delivered).toEqual(valid);expect(errors).toEqual([]);
    }finally{client.dispose();}
  });

  it('rejects malformed or detached source input acknowledgment metadata',async()=>{
    const delivered:LoadoutMessage[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onLoadout:message=>delivered.push(message),onError:error=>errors.push(error.code)});
    try{
      const source={...loadout,reload:null,sourceCounter:{waitgun:-60,poldwaitgun:0,ready:false}};
      const invalid=[...[-2,.5,Number.MAX_SAFE_INTEGER+1,null,'7',{},[]].map(sourceTransformSequence=>({...source,sourceTransformSequence})),
        ...[null,0,1,'false',{},[]].map(sourceTyping=>({...source,sourceTyping})),
        {...loadout,sourceTransformSequence:1},{...loadout,sourceTyping:false},
        {...source,sourceCounter:null,sourceTransformSequence:1,sourceTyping:false}];
      for(const message of invalid)socket.receive(message);
      expect(delivered).toEqual([]);expect(errors).toEqual(invalid.map(()=> 'invalid_loadout'));
    }finally{client.dispose();}
  });

  it('exposes the dispatched transform sequence without treating queued input as acknowledgment',async()=>{
    const {client,socket}=await connectedClient();
    try{
      expect(client.lastSentTransformSequence).toBe(0);
      expect(client.setTransform({...welcome.player.transform,typing:true})).toBe(true);
      expect(client.lastSentTransformSequence).toBe(0);
      expect(client.flushTransform()).toBe(true);
      const first=socket.messages().filter(message=>message.type==='transform').at(-1)!;
      expect(first).toMatchObject({sequence:1,transform:{typing:true}});
      expect(client.lastSentTransformSequence).toBe(first.sequence);
      expect(client.setTransform({...welcome.player.transform,typing:false})).toBe(true);
      expect(client.lastSentTransformSequence).toBe(1);
      expect(client.flushTransform()).toBe(true);
      const close=socket.messages().filter(message=>message.type==='transform').at(-1)!;
      expect(close).toMatchObject({sequence:2,transform:{typing:false}});
      expect(client.lastSentTransformSequence).toBe(close.sequence);
      client.leave();expect(client.flushTransform()).toBe(false);expect(client.lastSentTransformSequence).toBe(2);
    }finally{client.dispose();}
  });

  it('delivers signed original actor counters unchanged and rejects malformed snapshots',async()=>{
    const delivered:LoadoutMessage[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onLoadout:m=>delivered.push(m),onError:e=>errors.push(e.code)});
    const valid:LoadoutMessage={...loadout,reload:null,sourceCounter:{waitgun:-14,poldwaitgun:31,ready:true}};
    try{
      socket.receive(valid);expect(delivered).toEqual([valid]);
      const invalid=[null,{},[],{waitgun:.5,poldwaitgun:0,ready:true},{waitgun:0,poldwaitgun:Number.MAX_SAFE_INTEGER+1,ready:false},{waitgun:0,poldwaitgun:0,ready:'yes'},{waitgun:0,poldwaitgun:0,ready:false,extra:1}];
      for(const sourceCounter of invalid)socket.receive({...loadout,sourceCounter});
      expect(delivered).toEqual([valid]);expect(errors).toEqual(invalid.map(()=> 'invalid_loadout'));
    }finally{client.dispose();}
  });

  it('propagates source VOID and armed selections while preserving omitted-flag compatibility',async()=>{
    const delivered:LoadoutMessage[]=[],subscribed:LoadoutMessage[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onLoadout:m=>delivered.push(m),onError:e=>errors.push(e.code)});
    const unsubscribe=client.subscribeLoadout(m=>subscribed.push(m));
    const emptyWeapons=Object.fromEntries(Object.keys(loadout.weapons).map(weapon=>[weapon,{ammo:0,reserve:0}])) as LoadoutMessage['weapons'];
    const sourceVoid:LoadoutMessage={...loadout,serverTime:1200,weapons:emptyWeapons,reload:null,unarmed:true};
    const restored:LoadoutMessage={...loadout,serverTime:1300,unarmed:false};
    try{
      socket.receive(loadout);socket.receive(sourceVoid);socket.receive(restored);
      expect(delivered).toEqual([loadout,sourceVoid,restored]);expect(subscribed).toEqual(delivered);
      expect(delivered.map(m=>m.unarmed)).toEqual([undefined,true,false]);
      expect(delivered[1].equipped).toBe(loadout.equipped);expect(delivered[1].reload).toBeNull();
      expect(errors).toEqual([]);
    }finally{unsubscribe();client.dispose();}
  });

  it('rejects nonboolean source selection flags and VOID with an active reload before callback delivery',async()=>{
    const delivered:LoadoutMessage[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onLoadout:m=>delivered.push(m),onError:e=>errors.push(e.code)});
    try{
      const invalid=[...['true',0,1,null,{},[]].map(unarmed=>({...loadout,reload:null,unarmed})),{...loadout,unarmed:true}];
      for(const message of invalid)socket.receive(message);
      expect(delivered).toEqual([]);expect(errors).toEqual(invalid.map(()=> 'invalid_loadout'));
      // A rejected source extension does not prevent the next legacy payload.
      socket.receive(loadout);expect(delivered).toEqual([loadout]);
    }finally{client.dispose();}
  });

  it('delivers a valid local loadout through options and subscriptions and refreshes liveness', async () => {
    vi.useFakeTimers();
    const optionLoadouts: LoadoutMessage[] = [];
    const subscribedLoadouts: LoadoutMessage[] = [];
    const { client, socket } = await connectedClient({
      serverSilenceTimeoutMs: 100,
      onLoadout: (message) => optionLoadouts.push(message),
    });
    const unsubscribe = client.subscribeLoadout((message) => subscribedLoadouts.push(message));
    try {
      await vi.advanceTimersByTimeAsync(60);
      socket.receive(loadout);

      expect(optionLoadouts).toEqual([loadout]);
      expect(subscribedLoadouts).toEqual([loadout]);
      await vi.advanceTimersByTimeAsync(99);
      expect(client.state).toBe('connected');

      unsubscribe();
      const settled = { ...loadout, serverTime: 1_200, reload: null,unarmed:true };
      socket.receive(settled);
      expect(optionLoadouts).toEqual([loadout, settled]);
      expect(subscribedLoadouts).toEqual([loadout]);
    } finally {
      client.dispose();
    }
  });

  it('rejects malformed counts, weapon maps, and reload state', async () => {
    const delivered: LoadoutMessage[] = [];
    const errors: string[] = [];
    const { rpg: omittedRpg, ...missingRpg } = loadout.weapons;
    void omittedRpg;
    const invalidMessages: unknown[] = [
      { ...loadout, serverTime: -1 },
      { ...loadout, playerId: '' },
      { ...loadout, equipped: 'grenade' },
      { ...loadout, unarmed: 'yes' },
      { ...loadout, unarmed: true },
      { ...loadout, weapons: [] },
      { ...loadout, weapons: { ...loadout.weapons, rifle: { ammo: -1, reserve: 150 } } },
      { ...loadout, weapons: { ...loadout.weapons, rifle: { ammo: 29.5, reserve: 150 } } },
      { ...loadout, weapons: { ...loadout.weapons, rifle: { ammo: 29, reserve: Number.MAX_SAFE_INTEGER + 1 } } },
      { ...loadout, weapons: missingRpg },
      { ...loadout, weapons: { ...loadout.weapons, grenade: { ammo: 1, reserve: 2 } } },
      { ...loadout, weapons: { ...loadout.weapons, rifle: { ammo: 29, reserve: 150, spare: 1 } } },
      { ...loadout, reload: { weapon: 'shotgun', completesAt: 2_760 } },
      { ...loadout, reload: { weapon: 'rifle', completesAt: 1_009 } },
      { ...loadout, reload: { weapon: 'rifle', completesAt: 1_010 } },
      { ...loadout, reload: { weapon: 'rifle', completesAt: 'soon' } },
      { ...loadout, reload: { weapon: 'rifle', completesAt: 2_760, startedAt: 1_010 } },
    ];
    const { client, socket } = await connectedClient({
      onLoadout: (message) => delivered.push(message),
      onError: (error) => errors.push(error.code),
    });
    try {
      for (const message of invalidMessages) socket.receive(message);
      expect(delivered).toEqual([]);
      expect(errors).toEqual(invalidMessages.map(() => 'invalid_loadout'));
    } finally {
      client.dispose();
    }
  });

  it('ignores another player\'s valid loadout without refreshing the silence watchdog', async () => {
    vi.useFakeTimers();
    const delivered: LoadoutMessage[] = [];
    const errors: string[] = [];
    const { client, socket } = await connectedClient({
      serverSilenceTimeoutMs: 100,
      onLoadout: (message) => delivered.push(message),
      onError: (error) => errors.push(error.code),
    });
    try {
      await vi.advanceTimersByTimeAsync(60);
      socket.receive({ ...loadout, playerId: 'client-2' });
      expect(delivered).toEqual([]);
      expect(errors).toContain('invalid_loadout');

      await vi.advanceTimersByTimeAsync(39);
      expect(client.state).toBe('connected');
      await vi.advanceTimersByTimeAsync(1);
      expect(socket.closes).toContainEqual({ code: 4003, reason: 'server silence timeout' });
      expect(client.state).toBe('error');
    } finally {
      client.dispose();
    }
  });

  it('continues delivering private loadouts after an automatic reconnect', async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const delivered: LoadoutMessage[] = [];
    const client = new NetworkClient({
      reconnect: { enabled: true, maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, jitter: 0 },
      websocketFactory: () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      },
      onLoadout: (message) => delivered.push(message),
    });
    const joined = client.join('test-room', 'Tester');
    sockets[0].open();
    sockets[0].receive(welcome);
    await joined;

    try {
      sockets[0].disconnect();
      await vi.advanceTimersByTimeAsync(1);
      sockets[1].open();
      expect(sockets[1].messages()[0]).toMatchObject({
        type: 'join', resumeToken: welcome.resumeToken,
      });
      sockets[1].receive({ ...welcome, resumeToken: 'rotated-resume-token' });
      sockets[1].receive({ ...loadout, serverTime: 1_200 });

      expect(client.state).toBe('connected');
      expect(delivered).toEqual([{ ...loadout, serverTime: 1_200 }]);
    } finally {
      client.dispose();
    }
  });
});

describe('NetworkClient clock synchronization', () => {
  it('keeps RTT and estimated server time stable through wall-clock corrections', async () => {
    let monotonic = 500;
    const wallClock = vi.spyOn(Date, 'now').mockReturnValue(2_000);
    const elapsedClock = vi.spyOn(performance, 'now').mockImplementation(() => monotonic);
    const { client, socket } = await connectedClient({ now: undefined });
    try {
      expect(client.estimatedServerTimeMs).toBeUndefined();
      const ping = socket.messages().find((message) => message.type === 'ping');
      expect(ping).toEqual({ type: 'ping', clientTime: 2_000 });
      monotonic = 540;
      wallClock.mockReturnValue(1_100);
      socket.receive({ type: 'pong', clientTime: 2_000, serverTime: 1_030 });
      expect(client.latencyMs).toBe(40);
      expect(client.estimatedServerTimeMs).toBe(1_050);
      monotonic = 640;
      expect(client.estimatedServerTimeMs).toBe(1_150);
      wallClock.mockReturnValue(3_300);
      monotonic = 740;
      expect(client.estimatedServerTimeMs).toBe(1_250);
      client.leave();
      expect(client.estimatedServerTimeMs).toBeUndefined();
    } finally {
      client.dispose();
      wallClock.mockRestore();
      elapsedClock.mockRestore();
    }
  });

  it('sends one ping immediately after welcome and keeps one recurring timer', async () => {
    vi.useFakeTimers();
    const { client, socket } = await connectedClient({ pingIntervalMs: 1_000 });
    const pings = (): ClientMessage[] => socket.messages().filter((message) => message.type === 'ping');
    try {
      expect(pings()).toEqual([{ type: 'ping', clientTime: 1_000 }]);

      await vi.advanceTimersByTimeAsync(999);
      expect(pings()).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(1);
      expect(pings()).toEqual([
        { type: 'ping', clientTime: 1_000 },
        { type: 'ping', clientTime: 1_000 },
      ]);
    } finally {
      client.dispose();
    }
  });
});

describe('NetworkClient server-silence watchdog', () => {
  it('refreshes only when a valid server message arrives', async () => {
    vi.useFakeTimers();
    const errors: string[] = [];
    const { client, socket } = await connectedClient({
      serverSilenceTimeoutMs: 100,
      onError: (error) => errors.push(error.code),
    });
    try {
      await vi.advanceTimersByTimeAsync(60);
      socket.receive({ type: 'pong', clientTime: 1_000, serverTime: 1_030 });
      await vi.advanceTimersByTimeAsync(60);
      expect(client.state).toBe('connected');

      socket.receive({ type: 'event', event: { type: 'explosion' } });
      expect(errors).toContain('invalid_event');
      await vi.advanceTimersByTimeAsync(39);
      expect(client.state).toBe('connected');
      await vi.advanceTimersByTimeAsync(1);

      expect(socket.closes).toContainEqual({ code: 4003, reason: 'server silence timeout' });
      expect(errors).toContain('server_timeout');
      expect(client.state).toBe('error');
    } finally {
      client.dispose();
    }
  });

  it('detaches a silent socket and enters the normal reconnect flow', async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const states: Array<[string, string]> = [];
    const client = new NetworkClient({
      serverSilenceTimeoutMs: 100,
      reconnect: { enabled: true, maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, jitter: 0 },
      websocketFactory: () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      },
      onStateChange: (state, previous) => states.push([state, previous]),
    });
    const joined = client.join('test-room', 'Tester');
    sockets[0].open();
    sockets[0].receive(welcome);
    await joined;

    try {
      await vi.advanceTimersByTimeAsync(100);
      expect(sockets[0].closes).toContainEqual({ code: 4003, reason: 'server silence timeout' });
      expect(states.some(([state]) => state === 'reconnecting')).toBe(true);
      await vi.advanceTimersByTimeAsync(1);
      expect(sockets).toHaveLength(2);

      sockets[1].open();
      expect(sockets[1].messages()[0]).toEqual({
        type: 'join',
        protocol: NETWORK_PROTOCOL_VERSION,
        room: 'test-room',
        name: 'Tester',
        resumeToken: 'resume-token-1',
      });
      sockets[1].receive(welcome);
      expect(client.state).toBe('connected');
      expect(states).toContainEqual(['connected', 'reconnecting']);
    } finally {
      client.dispose();
    }
  });

  it('preserves a specific resume failure as a fatal reconnect error', async () => {
    vi.useFakeTimers();
    const sockets: FakeWebSocket[] = [];
    const errors: Array<{ code: string; message: string; fatal: boolean }> = [];
    const client = new NetworkClient({
      serverSilenceTimeoutMs: 100,
      reconnect: { enabled: true, maxAttempts: 1, initialDelayMs: 0, maxDelayMs: 0, jitter: 0 },
      websocketFactory: () => {
        const socket = new FakeWebSocket();
        sockets.push(socket);
        return socket;
      },
      onError: ({ code, message, fatal }) => errors.push({ code, message, fatal }),
    });
    const joined = client.join('test-room', 'Tester');
    sockets[0].open();
    sockets[0].receive(welcome);
    await joined;

    try {
      await vi.advanceTimersByTimeAsync(101);
      sockets[1].open();
      expect(sockets[1].messages()[0]).toMatchObject({
        type: 'join',
        resumeToken: welcome.resumeToken,
      });
      sockets[1].receive({
        type: 'error',
        code: 'resume_expired',
        message: 'Your reconnect session has expired. Join the room again.',
      });

      expect(client.state).toBe('error');
      expect(errors).toContainEqual({
        code: 'resume_expired',
        message: 'Your reconnect session has expired. Join the room again.',
        fatal: true,
      });
    } finally {
      client.dispose();
    }
  });
});

describe('legacy map, chat and collection transport', () => {
  for(const map of ['barrack','woodlands'] as const)it(`preserves ${map} source talk prefix and trailing spaces through transport`,async()=>{
    const socket=new FakeWebSocket(),client=new NetworkClient({reconnect:false,websocketFactory:()=>socket});
    const joined=client.join('test-room','Tester',map);socket.open();socket.receive({...welcome,map});await joined;
    for(const text of ['>> ','>> hello  ','>>hello']){
      expect(client.chat(text)).toBe(true);expect(socket.messages().at(-1)).toEqual({type:'chat',text});
    }
    expect(client.chat('   ')).toBe(false);expect(client.chat('>> line\nnew')).toBe(false);client.dispose();
  });
  it('sends the chosen map and rejects a welcome for a different map', async () => {
    const socket = new FakeWebSocket();
    const client = new NetworkClient({ reconnect: false, websocketFactory: () => socket });
    const joined = client.join('test-room','Tester','woodlands');
    socket.open();
    expect(socket.messages()[0]).toMatchObject({type:'join',map:'woodlands'});
    socket.receive({...welcome,map:'barrack'});
    await expect(joined).rejects.toThrow('different room');
    client.dispose();
  });
  it('sends bounded chat and collection requests and validates new incoming events', async () => {
    const events: unknown[]=[];
    const {client,socket}=await connectedClient({onEvent:e=>events.push(e)});
    expect(client.chat(' hello ')).toBe(true);
    expect(socket.messages().at(-1)).toEqual({type:'chat',text:'hello'});
    expect(client.chat('x'.repeat(241))).toBe(false);
    expect(client.chat('hello\nworld')).toBe(false);
    expect(client.collect('barrack-pickup-2')).toBe(true);
    expect(socket.messages().at(-1)).toEqual({type:'collect',itemId:'barrack-pickup-2'});
    expect(client.collect('')).toBe(false);
    socket.receive({type:'event',event:{type:'chat',serverTime:1000,data:{playerId:'p2',name:'Other',text:'hello'}}});
    socket.receive({type:'event',event:{type:'chat',serverTime:1000,data:{playerId:'p2',name:'Other',text:'x'.repeat(241)}}});
    socket.receive({type:'event',event:{type:'collected',serverTime:1000,data:{playerId:'p2',itemId:'drop-1',kind:'weapon',weapon:'sniper'}}});
    socket.receive({type:'event',event:{type:'collected',serverTime:1000,data:{playerId:'p2',itemId:'drop-1',kind:'weapon'}}});
    expect(events).toHaveLength(2);
    client.dispose();
  });
  it('discovers rooms using HTTP derived from the configured WebSocket URL', async () => {
    const rooms=[{room:'forest',map:'woodlands',players:2,capacity:16,state:'playing'}];
    const fetchMock=vi.fn().mockResolvedValue({ok:true,json:async()=>({rooms})});
    vi.stubGlobal('fetch',fetchMock);
    try {
      const client=new NetworkClient({url:'wss://example.test:443/?token=ignored'});
      expect(await client.listRooms()).toEqual(rooms);
      expect(String(fetchMock.mock.calls[0][0])).toBe('https://example.test/rooms');
      fetchMock.mockResolvedValueOnce({ok:true,json:async()=>({rooms:[{...rooms[0],map:'unknown'}]})});
      await expect(client.listRooms()).rejects.toThrow('Invalid room directory');
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('legacy authoritative snapshot validation',()=>{
  it('flushes typing before a following reload and drains queued movement without replay on the interval',async()=>{
    vi.useFakeTimers();const {client,socket}=await connectedClient({sendRateHz:20});
    try{
      const sample={position:{x:1,y:0,z:0},velocity:{x:0,y:0,z:0},grounded:true};
      client.setTransform({...welcome.player.transform,...sample,typing:true},[sample]);expect(client.flushTransform()).toBe(true);
      client.setTransform({...welcome.player.transform,...sample,typing:false});expect(client.flushTransform()).toBe(true);expect(client.reload('rifle')).toBe(true);
      const sent=socket.messages().filter(m=>m.type==='transform'||m.type==='reload');
      expect(sent).toMatchObject([{type:'transform',sequence:1,transform:{typing:true},path:[sample]},{type:'transform',sequence:2,transform:{typing:false}},{type:'reload',weapon:'rifle'}]);
      await vi.advanceTimersByTimeAsync(50);const later=socket.messages().filter(m=>m.type==='transform').at(-1)!;
      expect(later).toMatchObject({sequence:3,transform:{typing:false}});expect(later).not.toHaveProperty('path');
      client.leave();expect(client.flushTransform()).toBe(false);
    }finally{client.dispose();}
  });

  it('preserves optional typing through queued transforms and validates authoritative player typing',async()=>{
    vi.useFakeTimers();const received:boolean[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({sendRateHz:20,onSnapshot:s=>received.push(Boolean(s.players[0].transform.typing)),onError:e=>errors.push(e.code)});
    const base={room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,players:[welcome.player],projectiles:[]};
    try{
      const transform={...welcome.player.transform,typing:true};expect(client.setTransform(transform)).toBe(true);transform.typing=false;
      await vi.advanceTimersByTimeAsync(50);expect(socket.messages().filter(m=>m.type==='transform').at(-1)).toMatchObject({transform:{typing:true}});
      expect(client.setTransform({...welcome.player.transform,typing:false})).toBe(true);await vi.advanceTimersByTimeAsync(50);
      expect(socket.messages().filter(m=>m.type==='transform').at(-1)).toMatchObject({transform:{typing:false}});
      for(const typing of [undefined,true,false])socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,transform:{...welcome.player.transform,...(typing===undefined?{}:{typing})}}]}});
      expect(received).toEqual([false,true,false]);
      for(const typing of ['yes',0,null,{}]){
        expect(client.setTransform({...welcome.player.transform,typing} as any)).toBe(false);
        socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,transform:{...welcome.player.transform,typing}}]}});
      }
      expect(errors).toEqual(Array.from({length:4},()=>['invalid_transform','invalid_snapshot']).flat());expect(received).toEqual([false,true,false]);
    }finally{client.dispose();}
  });

  it('copies held source input and rejects incomplete or malformed intent in both directions',async()=>{
    vi.useFakeTimers();const errors:string[]=[],snapshots:unknown[]=[];
    const {client,socket}=await connectedClient({sendRateHz:20,onError:e=>errors.push(e.code),onSnapshot:s=>snapshots.push(s)});
    const sourceInput={forward:true,backward:false,left:false,right:false,jump:true};
    const base={room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,players:[welcome.player],projectiles:[]};
    try{
      expect(client.setTransform({...welcome.player.transform,sourceInput})).toBe(true);
      sourceInput.forward=false;await vi.advanceTimersByTimeAsync(50);
      expect(socket.messages().filter(m=>m.type==='transform').at(-1)).toMatchObject({transform:{sourceInput:{forward:true,jump:true}}});
      socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,transform:{...welcome.player.transform,sourceInput}}]}});
      expect(snapshots).toHaveLength(1);
      for(const input of [null,{}, {...sourceInput,jump:1},{...sourceInput,extra:true}]){
        expect(client.setTransform({...welcome.player.transform,sourceInput:input} as any)).toBe(false);
        socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,transform:{...welcome.player.transform,sourceInput:input}}]}});
      }
      expect(errors).toEqual(Array.from({length:4},()=>['invalid_transform','invalid_snapshot']).flat());
      expect(snapshots).toHaveLength(1);
    }finally{client.dispose();}
  });

  it('accepts a completed source physics epoch and rejects invalid or future epochs',async()=>{
    const snapshots:unknown[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onError:e=>errors.push(e.code)});
    const base={room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,players:[welcome.player],projectiles:[]};
    try{
      for(const sourcePhysicsTime of [undefined,0,966.6666667,1000])socket.receive({type:'snapshot',snapshot:{...base,...(sourcePhysicsTime===undefined?{}:{sourcePhysicsTime})}});
      for(const sourcePhysicsTime of [null,'1000',-1,1001,Infinity])socket.receive({type:'snapshot',snapshot:{...base,sourcePhysicsTime}});
      expect(snapshots).toHaveLength(4);expect(errors).toEqual(Array(5).fill('invalid_snapshot'));
    }finally{client.dispose();}
  });

  it('transports bounded optional movement modes and rejects malformed modes',async()=>{
    vi.useFakeTimers();const snapshots:unknown[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({sendRateHz:20,onSnapshot:s=>snapshots.push(s),onError:e=>errors.push(e.code)});
    const base={room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,players:[welcome.player],projectiles:[]};
    try{
      for(const movementMode of [undefined,'source','modern-walk','modern-sprint','modern-aim'] as const){
        const transform={...welcome.player.transform,...(movementMode===undefined?{}:{movementMode})};
        expect(client.setTransform(transform)).toBe(true);await vi.advanceTimersByTimeAsync(50);
        expect(socket.messages().filter(m=>m.type==='transform').at(-1)?.transform.movementMode).toBe(movementMode);
        socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,transform}]}});
      }
      for(const movementMode of [null,'sprint',1,{},['source']]){
        expect(client.setTransform({...welcome.player.transform,movementMode} as any)).toBe(false);
        socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,transform:{...welcome.player.transform,movementMode}}]}});
      }
      expect(snapshots).toHaveLength(5);expect(errors).toEqual(Array.from({length:5},()=>['invalid_transform','invalid_snapshot']).flat());
    }finally{client.dispose();}
  });

  it('retains exact source shot acknowledgement IDs and rejects malformed acknowledgements',async()=>{
    const delivered:any[]=[],errors:string[]=[];const {client,socket}=await connectedClient({onLoadout:l=>delivered.push(l),onError:e=>errors.push(e.code)});
    try{
      const message=loadout;socket.receive({...message,ackShotId:'shot-one'});expect(delivered.at(-1).ackShotId).toBe('shot-one');
      for(const ackShotId of ['',null,4,'x'.repeat(65)])socket.receive({...message,ackShotId});expect(errors).toEqual(Array(4).fill('invalid_loadout'));
    }finally{client.dispose();}
  });

  it('transports bounded automatic RPG reload epochs without requiring an active reload',async()=>{
    const delivered:any[]=[],errors:string[]=[];const {client,socket}=await connectedClient({onLoadout:l=>delivered.push(l),onError:e=>errors.push(e.code)});
    try{
      const message={...loadout,serverTime:1000,reload:null};
      for(const sourceAutoReloadTime of [undefined,0,500,1000,1000+2e-13])socket.receive({...message,sourceAutoReloadTime});
      expect(delivered.map(l=>l.sourceAutoReloadTime)).toEqual([undefined,0,500,1000,1000+2e-13]);
      for(const sourceAutoReloadTime of [-1,null,'500',{},Infinity,NaN,1001])socket.receive({...message,sourceAutoReloadTime});
      expect(errors).toEqual(Array(7).fill('invalid_loadout'));
    }finally{client.dispose();}
  });

  it('retains the gun callback epoch separately from packet receipt',async()=>{
    const delivered:any[]=[],errors:string[]=[];const {client,socket}=await connectedClient({onLoadout:l=>delivered.push(l),onError:e=>errors.push(e.code)});
    try{
      const message={...loadout,serverTime:1000,sourceCounter:{waitgun:10,poldwaitgun:30,ready:false}};
      for(const sourceCounterTime of [undefined,0,966.6666667,1000,1000+2e-13])socket.receive({...message,sourceCounterTime});
      expect(delivered.map(l=>l.sourceCounterTime)).toEqual([undefined,0,966.6666667,1000,1000+2e-13]);
      for(const sourceCounterTime of [-1,null,'500',{},Infinity,1001])socket.receive({...message,sourceCounterTime});
      socket.receive({...message,sourceCounter:undefined,sourceCounterTime:500});
      expect(errors).toEqual(Array(7).fill('invalid_loadout'));
    }finally{client.dispose();}
  });

  it('transports finite nonnegative source skeletal phases and rejects malformed values',async()=>{
    const snapshots:any[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onError:e=>errors.push(e.code)});
    const base={room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,players:[welcome.player],projectiles:[]};
    try{
      for(const sourceMotionTime of [0,500,1000,2000,2408,undefined])socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,sourceMotionTime}]}});
      expect(snapshots.map(s=>s.players[0].sourceMotionTime)).toEqual([0,500,1000,2000,2408,undefined]);
      for(const sourceMotionTime of [-1,null,'500',{},Infinity])socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,sourceMotionTime}]}});
      expect(snapshots).toHaveLength(6);expect(errors).toEqual(Array(5).fill('invalid_snapshot'));
    }finally{client.dispose();}
  });

  it('preserves signed and uncapped source health with an explicit valid phase',async()=>{
    const snapshots:any[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onError:e=>errors.push(e.code)});
    const base={room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,players:[welcome.player],projectiles:[]};
    try{
      for(const [health,flick] of [[-4,2],[0,-2],[120,2],[4,-2]])socket.receive({type:'snapshot',snapshot:{...base,sourceHealthTime:966.6666667,players:[{...welcome.player,health,sourceHealth:{canonical:health,flick}}]}});
      expect(snapshots.map(s=>s.players[0].health)).toEqual([-4,0,120,4]);
      for(const sourceHealth of [null,{canonical:-4,flick:0},{canonical:0,flick:2},{canonical:-4,flick:2,extra:true},{canonical:Infinity,flick:2}])socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,health:-4,sourceHealth}]}});
      socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,health:-4}]}});
      socket.receive({type:'snapshot',snapshot:{...base,sourceHealthTime:1001}});
      expect(errors).toEqual(Array(7).fill('invalid_snapshot'));expect(snapshots).toHaveLength(4);
    }finally{client.dispose();}
  });

  it('accepts signed source damage with explicit death outcome and rejects corrupt phase metadata',async()=>{
    const events:any[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onEvent:e=>events.push(e),onError:e=>errors.push(e.code)});
    const source={kind:'explosion',projectileId:'projectile-1',shotId:'shot-1',weapon:'launcher',position:{x:0,y:0,z:0}};
    const base={type:'damaged',serverTime:1000,data:{attackerId:'attacker',targetId:'client-1',damage:5,health:-4,source,sourceHealth:{canonical:-4,flick:2},sourceHealthTime:966.6666667,lethal:false}};
    try{
      socket.receive({type:'event',event:base});
      socket.receive({type:'event',event:{...base,data:{...base.data,health:3,sourceHealth:{canonical:3,flick:-2},lethal:true}}});
      expect(events.map(e=>[e.data.health,e.data.lethal])).toEqual([[-4,false],[3,true]]);
      for(const change of [{sourceHealth:null},{sourceHealth:{canonical:-4,flick:1}},{sourceHealth:{canonical:-3,flick:2}},{sourceHealthTime:1001},{lethal:undefined},{lethal:'no'},{lethal:true}])socket.receive({type:'event',event:{...base,data:{...base.data,...change}}});
      socket.receive({type:'event',event:{...base,data:{...base.data,sourceHealth:undefined,lethal:undefined}}});
      expect(events).toHaveLength(2);expect(errors).toEqual(Array(8).fill('invalid_event'));
    }finally{client.dispose();}
  });

  it('accepts absent compatibility armor or bounded armor and rejects corrupt item and armor states',async()=>{
    const snapshots:unknown[]=[],errors:string[]=[];
    const {client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onError:e=>errors.push(e.code)},{...welcome,map:'barrack'});
    const base={room:'test-room',map:'barrack',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,players:[welcome.player],projectiles:[],pickups:[],drops:[]};
    socket.receive({type:'snapshot',snapshot:base});
    socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,armor:31.3}]}});
    for(const armor of [-1,101,Infinity,'50',null])socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,armor}]}});
    socket.receive({type:'snapshot',snapshot:{...base,map:'woodlands'}});
    socket.receive({type:'snapshot',snapshot:{...base,drops:[{id:'drop',weapon:'laser',position:{x:0,y:0,z:0},expiresAt:1000}]}});
    socket.receive({type:'snapshot',snapshot:{...base,pickups:[{id:'pickup',type:'armor',position:{x:0,y:0,z:0},active:'yes',respawnAt:null}]}});
    expect(snapshots).toHaveLength(2);expect(errors).toHaveLength(8);
    client.dispose();
  });
});

describe('NetworkClient queued movement paths',()=>{
  const sample=(index:number)=>({position:{x:index*.01,y:index*.02,z:0},velocity:{x:1,y:2,z:0},grounded:index===0});
  it('resumes a fresh authoritative origin when a stalled sender exceeds the pending path budget',async()=>{
    vi.useFakeTimers();const sockets:FakeWebSocket[]=[];
    const client=new NetworkClient({reconnect:{enabled:true,maxAttempts:1,initialDelayMs:0,maxDelayMs:0,jitter:0},websocketFactory:()=>{const socket=new FakeWebSocket();sockets.push(socket);return socket;}});
    const joined=client.join('test-room','Tester');sockets[0].open();sockets[0].receive(welcome);await joined;
    try{
      const send=vi.spyOn(sockets[0],'send').mockImplementation(()=>{throw new Error('stalled stream');});
      const samples=Array.from({length:4096},(_,i)=>sample(i));
      expect(client.setTransform({...welcome.player.transform,...samples.at(-1)!},samples)).toBe(true);
      expect(client.flushTransform()).toBe(false);expect(client.state).toBe('connected');
      expect(client.setTransform({...welcome.player.transform,...sample(4096)},[sample(4096)])).toBe(false);
      expect(client.state).toBe('reconnecting');expect(sockets[0].closes).toHaveLength(1);
      expect(sockets[0].messages().filter(message=>message.type==='transform')).toEqual([]);send.mockRestore();
      await vi.advanceTimersByTimeAsync(1);sockets[1].open();
      expect(sockets[1].messages()[0]).toMatchObject({type:'join',resumeToken:welcome.resumeToken});
      sockets[1].receive(welcome);expect(client.flushTransform()).toBe(true);
      expect(sockets[1].messages().filter(message=>message.type==='transform')).toEqual([
        expect.objectContaining({transform:welcome.player.transform}),
      ]);
      expect(sockets[1].messages().at(-1)).not.toHaveProperty('path');
    }finally{client.dispose();}
  });
  it('resets an overloaded socket instead of appending movement to its browser send buffer',async()=>{
    vi.useFakeTimers();const sockets:FakeWebSocket[]=[];
    const client=new NetworkClient({reconnect:{enabled:true,maxAttempts:1,initialDelayMs:0,maxDelayMs:0,jitter:0},websocketFactory:()=>{const socket=new FakeWebSocket();sockets.push(socket);return socket;}});
    const joined=client.join('test-room','Tester');sockets[0].open();sockets[0].receive(welcome);await joined;
    try{
      client.setTransform({...welcome.player.transform,...sample(1)},[sample(1)]);
      sockets[0].bufferedAmount=1024*1024+1;
      expect(client.flushTransform()).toBe(false);expect(client.state).toBe('reconnecting');
      expect(sockets[0].closes).toHaveLength(1);expect(sockets[0].messages().filter(message=>message.type==='transform')).toEqual([]);
      await vi.advanceTimersByTimeAsync(1);sockets[1].open();
      expect(sockets[1].messages()[0]).toMatchObject({type:'join',resumeToken:welcome.resumeToken});
      sockets[1].receive(welcome);expect(client.flushTransform()).toBe(true);
      expect(sockets[1].messages().at(-1)).toMatchObject({type:'transform',transform:welcome.player.transform});
      expect(sockets[1].messages().at(-1)).not.toHaveProperty('path');
    }finally{client.dispose();}
  });
  it('retries the complete ordered path after a transient send failure below the socket budget',async()=>{
    vi.useFakeTimers();const {client,socket}=await connectedClient();
    try{
      socket.bufferedAmount=1024*1024-1;
      const samples=Array.from({length:300},(_,i)=>sample(i));
      client.setTransform({...welcome.player.transform,...samples.at(-1)!},samples);
      const send=vi.spyOn(socket,'send').mockImplementationOnce(()=>{throw new Error('temporary send failure');});
      expect(client.flushTransform()).toBe(false);expect(client.state).toBe('connected');expect(socket.closes).toEqual([]);
      send.mockRestore();expect(client.flushTransform()).toBe(true);
      const sent=socket.messages().filter(message=>message.type==='transform');
      expect(sent.map(message=>message.path?.length)).toEqual([128,128,44]);
      expect(sent.flatMap(message=>message.path??[])).toEqual(samples);
      for(const message of sent)expect(message.transform.position).toEqual(message.path!.at(-1)!.position);
      expect(socket.closes).toEqual([]);
    }finally{client.dispose();}
  });
  it('retains cloned samples across publications until the actual timer sends',async()=>{
    vi.useFakeTimers();const {client,socket}=await connectedClient();
    try{
      const first=sample(1),second=sample(2);client.setTransform({...welcome.player.transform,...first},[first]);
      client.setTransform({...welcome.player.transform,...second,weapon:'launcher'},[second]);first.position.x=999;
      expect(socket.messages().filter(m=>m.type==='transform')).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(60);
      const sent=socket.messages().filter(m=>m.type==='transform');expect(sent).toHaveLength(1);
      expect(sent[0].path).toEqual([sample(1),sample(2)]);expect(sent[0].transform).toEqual({...welcome.player.transform,...sample(2),weapon:'launcher'});
      await vi.advanceTimersByTimeAsync(60);expect(socket.messages().filter(m=>m.type==='transform')[1].path).toBeUndefined();
    }finally{client.dispose();}
  });
  it('retains the latest endpoint when a publication changes state after its samples',async()=>{
    vi.useFakeTimers();const {client,socket}=await connectedClient();
    try{
      client.setTransform({...welcome.player.transform,...sample(1)},[sample(1)]);
      client.setTransform({...welcome.player.transform,...sample(2)});
      await vi.advanceTimersByTimeAsync(60);const sent=socket.messages().filter(m=>m.type==='transform');
      expect(sent[0].path).toEqual([sample(1),sample(2)]);expect(sent[0].transform.position).toEqual(sample(2).position);
    }finally{client.dispose();}
  });
  it('sends every sample in bounded ordered chunks with matching endpoints',async()=>{
    vi.useFakeTimers();const {client,socket}=await connectedClient();
    try{
      const samples=Array.from({length:300},(_,i)=>sample(i));client.setTransform({...welcome.player.transform,...sample(299),yaw:1,pitch:.5,weapon:'launcher'},samples);
      await vi.advanceTimersByTimeAsync(60);const sent=socket.messages().filter(m=>m.type==='transform');
      expect(sent.map(m=>m.path?.length)).toEqual([128,128,44]);expect(sent.flatMap(m=>m.path??[])).toEqual(samples);
      for(const message of sent){expect(message.transform).toEqual({...welcome.player.transform,...message.path!.at(-1),yaw:1,pitch:.5,weapon:'launcher'});expect(JSON.stringify(message).length).toBeLessThan(65536);}
      expect(sent.map(m=>m.sequence)).toEqual([1,2,3]);
    }finally{client.dispose();}
  });
  it('clears pending history on explicit authoritative reset and disconnect',async()=>{
    vi.useFakeTimers();const {client,socket}=await connectedClient();
    try{
      client.setTransform({...welcome.player.transform,...sample(1)},[sample(1)]);client.resetTransformPath();
      await vi.advanceTimersByTimeAsync(60);expect(socket.messages().filter(m=>m.type==='transform')[0].path).toBeUndefined();
      client.setTransform({...welcome.player.transform,...sample(2)},[sample(2)]);socket.disconnect();
      await vi.advanceTimersByTimeAsync(60);expect(socket.messages().filter(m=>m.type==='transform')).toHaveLength(1);
      socket.open();socket.receive(welcome);await vi.advanceTimersByTimeAsync(60);
      expect(socket.messages().filter(m=>m.type==='transform').at(-1)?.path).toBeUndefined();
    }finally{client.dispose();}
  });
  it('does not replay queued samples after a real automatic reconnect',async()=>{
    vi.useFakeTimers();const sockets:FakeWebSocket[]=[];
    const client=new NetworkClient({reconnect:{enabled:true,maxAttempts:1,initialDelayMs:0,maxDelayMs:0,jitter:0},websocketFactory:()=>{const socket=new FakeWebSocket();sockets.push(socket);return socket;}});
    const joined=client.join('test-room','Tester');sockets[0].open();sockets[0].receive(welcome);await joined;
    try{
      client.setTransform({...welcome.player.transform,...sample(1)},[sample(1)]);sockets[0].disconnect();
      // Even caller updates during reconnection cannot survive the fresh authoritative welcome.
      client.setTransform({...welcome.player.transform,...sample(2)},[sample(2)]);
      await vi.advanceTimersByTimeAsync(1);sockets[1].open();sockets[1].receive(welcome);
      await vi.advanceTimersByTimeAsync(60);const sent=sockets[1].messages().filter(m=>m.type==='transform');
      expect(sent).toHaveLength(1);expect(sent[0].path).toBeUndefined();expect(sent[0].transform).toEqual(welcome.player.transform);
    }finally{client.dispose();}
  });
  it('keeps a failed send queued and rejects malformed samples atomically',async()=>{
    vi.useFakeTimers();const {client,socket}=await connectedClient();
    try{
      const send=vi.spyOn(socket,'send').mockImplementationOnce(()=>{throw new Error('temporary send failure');});
      client.setTransform({...welcome.player.transform,...sample(1)},[sample(1)]);
      expect(client.setTransform({...welcome.player.transform,...sample(2)},[{...sample(2),grounded:'yes'} as any])).toBe(false);
      await vi.advanceTimersByTimeAsync(60);expect(socket.messages().filter(m=>m.type==='transform')).toHaveLength(0);
      send.mockRestore();await vi.advanceTimersByTimeAsync(60);expect(socket.messages().filter(m=>m.type==='transform')[0].path).toEqual([sample(1)]);
    }finally{client.dispose();}
  });
});

describe('authoritative original door messages',()=>{
 it('receives preserved names including tabs and finite room state',async()=>{
  const snapshots:unknown[]=[],events:unknown[]=[],{client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onEvent:e=>events.push(e)});
  try{
   const doors=[{name:'door open 29\t',openedAt:1100},{name:'door open 28',openedAt:null}];
   socket.receive({type:'snapshot',snapshot:{room:'test-room',map:'barrack',tick:1,serverTime:1200,fragLimit:12,state:'playing',winnerId:null,players:[],projectiles:[],doors}});
   socket.receive({type:'event',event:{type:'door_open',serverTime:1200,data:{name:'door open 29\t',openedAt:1100}}});
   expect(snapshots).toHaveLength(1);expect(events).toHaveLength(1);
   expect((snapshots[0] as {doors:unknown}).doors).toEqual(doors);
  }finally{client.dispose();}
 });
 it('rejects malformed, duplicate, oversized and future door state',async()=>{
  const snapshots:unknown[]=[],events:unknown[]=[],errors:string[]=[],{client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onEvent:e=>events.push(e),onError:e=>errors.push(e.code)});
  try{
   for(const doors of [[{name:'door',openedAt:'now'}],[{name:'door',openedAt:-1}],[{name:'door',openedAt:1300}],[{name:'door',openedAt:null},{name:'door',openedAt:null}],Array.from({length:14},(_,i)=>({name:'door'+i,openedAt:null}))]){
    socket.receive({type:'snapshot',snapshot:{room:'test-room',tick:1,serverTime:1200,fragLimit:12,state:'playing',winnerId:null,players:[],projectiles:[],doors}});
   }
   for(const data of [{name:'door',openedAt:'now'},{name:'',openedAt:1100},{name:'door',openedAt:1300},{name:'door',openedAt:-1}])socket.receive({type:'event',event:{type:'door_open',serverTime:1200,data}});
   expect(snapshots).toEqual([]);expect(events).toEqual([]);expect(errors).toHaveLength(9);
  }finally{client.dispose();}
 });
});

describe('original score and persistent drop protocol',()=>{
 it('accepts independent point scores and nullable drop lifetime with a static yaw',async()=>{
  const snapshots:unknown[]=[],events:unknown[]=[],{client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onEvent:e=>events.push(e)});
  try{
   socket.receive({type:'snapshot',snapshot:{room:'test-room',tick:1,serverTime:1200,fragLimit:12,state:'playing',winnerId:null,players:[{...welcome.player,score:35}],projectiles:[],drops:[{id:'drop',weapon:'launcher',position:{x:0,y:1.13,z:0},expiresAt:null,yaw:Math.PI}]}});
   socket.receive({type:'event',event:{type:'collected',serverTime:1200,data:{playerId:'client-1',itemId:'drop',kind:'weapon',weapon:'launcher',score:35}}});
   expect(snapshots).toHaveLength(1);expect(events).toHaveLength(1);
  }finally{client.dispose();}
 });
 it('rejects invalid point scores, expiry and drop orientation',async()=>{
  const snapshots:unknown[]=[],events:unknown[]=[],{client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onEvent:e=>events.push(e)});
  try{
   const base={room:'test-room',tick:1,serverTime:1200,fragLimit:12,state:'playing',winnerId:null,players:[],projectiles:[]};
   for(const score of [-1,1.5,'35'])socket.receive({type:'snapshot',snapshot:{...base,players:[{...welcome.player,score}]}});
   for(const drop of [{expiresAt:'never'},{expiresAt:null,yaw:'spin'}])socket.receive({type:'snapshot',snapshot:{...base,drops:[{id:'drop',weapon:'launcher',position:{x:0,y:1,z:0},...drop}]}});
   for(const score of [-1,1.5,'35'])socket.receive({type:'event',event:{type:'collected',serverTime:1200,data:{playerId:'client-1',itemId:'drop',kind:'weapon',weapon:'launcher',score}}});
   expect(snapshots).toEqual([]);expect(events).toEqual([]);
  }finally{client.dispose();}
 });
});

describe('source projectile and persistent blast transport',()=>{
 it('delivers source callback state, persistent blasts and full contact velocity',async()=>{
  const snapshots:any[]=[],events:any[]=[],errors:string[]=[],{client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onEvent:e=>events.push(e),onError:e=>errors.push(e.code)});
  try{
   const source={...projectile,remainingCallbacks:199,direction:{x:0,y:0,z:-1}};
   const blast={projectileId:'blast',shotId:'shot',attackerId:'client-1',weapon:'launcher',position:{x:0,y:0,z:0},remainingCallbacks:12,expiresAt:1600};
   socket.receive({type:'snapshot',snapshot:{room:'test-room',tick:1,serverTime:1200,fragLimit:12,state:'playing',winnerId:null,players:[],projectiles:[source],blasts:[blast]}});
   const event={type:'projectile_contact',serverTime:1200,data:{playerId:'client-1',projectileId:'projectile-1',velocity:{x:2,y:-3,z:4}}};
   socket.receive({type:'event',event});
   expect(snapshots[0].projectiles[0]).toEqual(source);expect(snapshots[0].blasts).toEqual([blast]);expect(events).toEqual([event]);expect(errors).toEqual([]);
  }finally{client.dispose();}
 });
 it('rejects invalid callback state, blast duplication and malformed contact vectors',async()=>{
  const snapshots:unknown[]=[],events:unknown[]=[],errors:string[]=[],{client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onEvent:e=>events.push(e),onError:e=>errors.push(e.code)});
  try{
   const base={room:'test-room',tick:1,serverTime:1200,fragLimit:12,state:'playing',winnerId:null,players:[],projectiles:[]};
   for(const extra of [{remainingCallbacks:0},{remainingCallbacks:201},{remainingCallbacks:1.5},{direction:{x:0,y:0,z:-2}}])socket.receive({type:'snapshot',snapshot:{...base,projectiles:[{...projectile,...extra}]}});
   const blast={projectileId:'blast',shotId:'shot',attackerId:'client-1',weapon:'launcher',position:{x:0,y:0,z:0},remainingCallbacks:12,expiresAt:1600};
   for(const blasts of [[{...blast,remainingCallbacks:17}],[{...blast,remainingCallbacks:0}],[blast,blast]])socket.receive({type:'snapshot',snapshot:{...base,blasts}});
   for(const velocity of [{x:1,y:'2',z:3},{x:1,y:2},{x:1,y:Infinity,z:3}])socket.receive({type:'event',event:{type:'projectile_contact',serverTime:1200,data:{playerId:'client-1',projectileId:'p',velocity}}});
   expect(snapshots).toEqual([]);expect(events).toEqual([]);expect(errors).toHaveLength(10);
  }finally{client.dispose();}
 });
});

describe('negotiated source remote view receipts',()=>{
  const negotiated={...welcome,sourceRemoteView:{epoch:900,generation:2}};
  const snapshot={room:'test-room',tick:999,serverTime:1000,fragLimit:12,state:'playing' as const,winnerId:null,players:[welcome.player],projectiles:[]};
  it('resets before connected and advances before handlers, then drains successful transforms and shots',async()=>{
    vi.useFakeTimers();let callbacks=0;const order:string[]=[];
    const {client,socket}=await connectedClient({sourceRemoteView:true,onSourceRemoteViewReset:state=>{expect(state).toEqual(negotiated.sourceRemoteView);order.push('reset');},onStateChange:state=>{if(state==='connected')order.push('connected');},beforeSourceRemoteViewReceipt:()=>{order.push('advance');return ++callbacks;},getSourceRemoteViewCallbacks:()=>callbacks,onSnapshot:()=>order.push('snapshot'),onEvent:()=>order.push('event')},negotiated);
    expect(order).toEqual(['reset','connected']);
    socket.receive({type:'snapshot',sourceViewSentAt:1000,sourceViewTick:0,snapshot});
    socket.receive({type:'event',sourceViewSentAt:1000,sourceViewTick:1,event:{type:'shot',serverTime:1000,data:{playerId:'client-2',shot:{shotId:'remote',...shotInput}}}});
    expect(order).toEqual(['reset','connected','advance','snapshot','advance','event']);
    client.setTransform(welcome.player.transform);expect(client.flushTransform()).toBe(true);
    expect(socket.messages().at(-1)).toMatchObject({type:'transform',sourceRemoteView:{generation:2,callbacks:2,receipts:[{tick:0,callbacks:1},{tick:1,callbacks:2}]}});
    expect(client.pendingSourceRemoteViewReceipts).toBe(0);
    callbacks=3;client.shoot(shotInput);
    expect(socket.messages().at(-1)).toMatchObject({type:'shoot',sourceRemoteView:{generation:2,callbacks:3,receipts:[]}});
    expect(callbacks).toBe(3);client.dispose();
  });
  it.each([undefined,-1,NaN,899])('resynchronizes a missing or invalid private dispatch timestamp %s before applying its snapshot',async sentAt=>{
    vi.useFakeTimers();const events:unknown[]=[];const {client,socket}=await connectedClient({sourceRemoteView:true,onSnapshot:value=>events.push(value)},negotiated);
    socket.receive({type:'snapshot',sourceViewTick:0,sourceViewSentAt:sentAt,snapshot});
    expect(events).toHaveLength(0);expect(client.pendingSourceRemoteViewReceipts).toBe(0);expect(socket.readyState).toBe(3);client.dispose();
  });
  it('rejects backwards dispatch time even when the next private tick is correct',async()=>{
    vi.useFakeTimers();const events:unknown[]=[];const {client,socket}=await connectedClient({sourceRemoteView:true,onSnapshot:value=>events.push(value)},negotiated);
    socket.receive({type:'snapshot',sourceViewTick:0,sourceViewSentAt:1100,snapshot});socket.receive({type:'snapshot',sourceViewTick:1,sourceViewSentAt:1050,snapshot});
    expect(events).toHaveLength(1);expect(socket.readyState).toBe(3);client.dispose();
  });
  it('retains receipts and movement paths when sending throws',async()=>{
    vi.useFakeTimers();const {client,socket}=await connectedClient({sourceRemoteView:true,beforeSourceRemoteViewReceipt:()=>4,getSourceRemoteViewCallbacks:()=>4},negotiated);
    socket.receive({type:'snapshot',sourceViewSentAt:1000,sourceViewTick:0,snapshot});
    const send=socket.send.bind(socket);socket.send=()=>{throw new Error('offline');};
    client.setTransform(welcome.player.transform,[{position:{x:1,y:0,z:0},velocity:{x:0,y:0,z:0},grounded:true}]);
    expect(client.flushTransform()).toBe(false);expect(client.shoot(shotInput)).toBeUndefined();expect(client.pendingSourceRemoteViewReceipts).toBe(1);
    socket.send=send;expect(client.flushTransform()).toBe(true);
    expect(socket.messages().find(message=>message.type==='transform')).toMatchObject({sourceRemoteView:{receipts:[{tick:0,callbacks:4}]}});
    expect(client.pendingSourceRemoteViewReceipts).toBe(0);client.dispose();
  });
  it.each([undefined,1,-1,0.5])('rejects missing or nonsequential first tick %s',async tick=>{
    vi.useFakeTimers();const events:unknown[]=[];const {client,socket}=await connectedClient({sourceRemoteView:true,onSnapshot:value=>events.push(value)},negotiated);
    socket.receive({type:'snapshot',sourceViewSentAt:1000,sourceViewTick:tick,snapshot});
    expect(events).toHaveLength(0);
    if(tick===undefined||tick===1)expect(client.state).toBe('error');
    client.dispose();
  });
  it('rejects a duplicate phase event tick before applying it',async()=>{
    vi.useFakeTimers();let events=0;const {client,socket}=await connectedClient({sourceRemoteView:true,onEvent:()=>events++},negotiated);
    const event={type:'shot',serverTime:1000,data:{playerId:'client-2',shot:{shotId:'remote',...shotInput}}};
    socket.receive({type:'event',sourceViewSentAt:1000,sourceViewTick:0,event});socket.receive({type:'event',sourceViewSentAt:1000,sourceViewTick:0,event});
    expect(events).toBe(1);expect(client.state).toBe('error');client.dispose();
  });
  it('rejects missing negotiation and malformed welcome view state',async()=>{
    vi.useFakeTimers();for(const sourceRemoteView of [undefined,{epoch:1001,generation:0},{epoch:900,generation:0.1},{epoch:-1,generation:0}]){
      const socket=new FakeWebSocket(),client=new NetworkClient({sourceRemoteView:true,reconnect:false,websocketFactory:()=>socket});const join=client.join('test-room','Tester');socket.open();socket.receive({...welcome,sourceRemoteView});await expect(join).rejects.toThrow();expect(client.state).toBe('error');client.dispose();
    }
  });
});

describe('source remote view lifecycle and realtime publication',()=>{
  const negotiated={...welcome,sourceRemoteView:{epoch:900,generation:2}};
  const snapshot={room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing' as const,winnerId:null,players:[welcome.player],projectiles:[]};
  it('keeps receipt state through movement reset and drains only once across timer path chunks',async()=>{
    vi.useFakeTimers();let getterCalls=0;const {client,socket}=await connectedClient({sourceRemoteView:true,beforeSourceRemoteViewReceipt:()=>5,getSourceRemoteViewCallbacks:()=>{getterCalls++;return 5;}},negotiated);
    socket.receive({type:'snapshot',sourceViewSentAt:1000,sourceViewTick:0,snapshot});client.resetTransformPath();expect(client.pendingSourceRemoteViewReceipts).toBe(1);
    const samples=Array.from({length:300},(_,i)=>({position:{x:i,y:0,z:0},velocity:{x:0,y:0,z:0},grounded:true}));client.setTransform({...welcome.player.transform,position:{x:299,y:0,z:0}},samples);
    await vi.advanceTimersByTimeAsync(60);
    const transforms=socket.messages().filter(message=>message.type==='transform');expect(transforms.map(message=>message.path?.length)).toEqual([128,128,44]);
    expect(transforms.map(message=>message.sourceRemoteView?.receipts)).toEqual([[{tick:0,callbacks:5}],[],[]]);expect(getterCalls).toBe(3);client.dispose();
  });
  it('clears queued receipts on reconnect and synchronously resets the new generation before incoming state',async()=>{
    vi.useFakeTimers();const sockets:FakeWebSocket[]=[],resets:number[]=[];let callbacks=6;
    const client=new NetworkClient({sourceRemoteView:true,now:()=>1000,reconnect:{initialDelayMs:100,maxDelayMs:100,jitter:0},websocketFactory:()=>{const socket=new FakeWebSocket();sockets.push(socket);return socket;},onSourceRemoteViewReset:state=>{callbacks=0;resets.push(state.generation);},beforeSourceRemoteViewReceipt:()=>++callbacks,getSourceRemoteViewCallbacks:()=>callbacks});
    const join=client.join('test-room','Tester');sockets[0].open();sockets[0].receive(negotiated);await join;
    sockets[0].receive({type:'snapshot',sourceViewSentAt:1000,sourceViewTick:0,snapshot});expect(client.pendingSourceRemoteViewReceipts).toBe(1);
    sockets[0].disconnect();expect(client.pendingSourceRemoteViewReceipts).toBe(0);expect(client.sourceRemoteViewState).toBeUndefined();
    await vi.advanceTimersByTimeAsync(100);sockets[1].open();expect(sockets[1].messages()[0]).toMatchObject({sourceRemoteView:true,resumeToken:'resume-token-1'});
    sockets[1].receive({...negotiated,sourceRemoteView:{epoch:1000,generation:3}});sockets[1].receive({type:'snapshot',sourceViewSentAt:1000,sourceViewTick:0,snapshot});client.flushTransform();
    expect(resets).toEqual([2,3]);expect(sockets[1].messages().find(message=>message.type==='transform')).toMatchObject({sourceRemoteView:{generation:3,callbacks:1,receipts:[{tick:0,callbacks:1}]}});client.dispose();
  });
});

describe('source remote view bounded resynchronization',()=>{
  const snapshot={room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing' as const,winnerId:null,players:[welcome.player],projectiles:[]};
  it.each(['invalid_source_view','source_view_resync_required','missing_tick','overflow'])('resumes the same life after %s without sending leave or stale receipts',async failure=>{
    vi.useFakeTimers();const sockets:FakeWebSocket[]=[],errors:Array<{code:string;fatal:boolean}>=[],resets:number[]=[];let callbacks=0;
    const client=new NetworkClient({sourceRemoteView:true,now:()=>1000,reconnect:{initialDelayMs:100,maxDelayMs:100,jitter:0},websocketFactory:()=>{const socket=new FakeWebSocket();sockets.push(socket);return socket;},onError:error=>errors.push(error),onSourceRemoteViewReset:state=>{callbacks=0;resets.push(state.generation);},beforeSourceRemoteViewReceipt:()=>++callbacks,getSourceRemoteViewCallbacks:()=>callbacks});
    const joined=client.join('test-room','Tester');sockets[0].open();sockets[0].receive({...welcome,sourceRemoteView:{epoch:900,generation:2}});await joined;
    sockets[0].receive({type:'snapshot',sourceViewSentAt:1000,sourceViewTick:0,snapshot});
    if(failure==='missing_tick')sockets[0].receive({type:'snapshot',snapshot});
    else if(failure==='overflow')for(let tick=1;tick<=64;tick++)sockets[0].receive({type:'snapshot',sourceViewSentAt:1000,sourceViewTick:tick,snapshot});
    else sockets[0].receive({type:'error',code:failure,message:'rebuild private view'});
    expect(client.state).toBe('reconnecting');expect(client.sourceRemoteViewState).toBeUndefined();expect(client.pendingSourceRemoteViewReceipts).toBe(0);
    expect(sockets[0].closes.at(-1)).toEqual({code:4004,reason:'source view resync'});expect(sockets[0].messages().some(message=>message.type==='leave')).toBe(false);
    expect(errors.find(error=>error.code===(failure==='source_view_resync_required'?failure:'invalid_source_view'))?.fatal).toBe(false);
    await vi.advanceTimersByTimeAsync(100);sockets[1].open();expect(sockets[1].messages()[0]).toMatchObject({resumeToken:welcome.resumeToken,sourceRemoteView:true});
    sockets[1].receive({...welcome,sourceRemoteView:{epoch:1000,generation:3}});sockets[1].receive({type:'snapshot',sourceViewSentAt:1000,sourceViewTick:0,snapshot});client.flushTransform();
    expect(client.clientId).toBe(welcome.clientId);expect(resets).toEqual([2,3]);expect(sockets[1].messages().find(message=>message.type==='transform')).toMatchObject({sourceRemoteView:{generation:3,callbacks:1,receipts:[{tick:0,callbacks:1}]}});client.dispose();
  });
});

describe('source remote killed phase receipts',()=>{
  const negotiated={...welcome,sourceRemoteView:{epoch:900,generation:2}};
  const event={type:'killed',serverTime:1000,data:{killerId:'client-1',victimId:'client-2',killerFrags:1,victimDeaths:1,source:{kind:'hitscan',shotId:'kill-shot',weapon:'rifle',zone:'body',position:{x:1,y:1,z:1}}}};
  it('records and advances death before handlers and carries its receipt on the next shot',async()=>{
    vi.useFakeTimers();let callbacks=0;const order:string[]=[];
    const {client,socket}=await connectedClient({sourceRemoteView:true,beforeSourceRemoteViewReceipt:()=>{order.push('advance');return ++callbacks;},getSourceRemoteViewCallbacks:()=>callbacks,onEvent:value=>order.push(value.type)},negotiated);
    socket.receive({type:'event',sourceViewSentAt:1000,sourceViewTick:0,event});expect(order).toEqual(['advance','killed']);
    client.shoot(shotInput);expect(socket.messages().at(-1)).toMatchObject({type:'shoot',sourceRemoteView:{generation:2,callbacks:1,receipts:[{tick:0,callbacks:1}]}});client.dispose();
  });
  it('rejects an untagged death event before changing the rendered actor',async()=>{
    vi.useFakeTimers();let applied=0;const {client,socket}=await connectedClient({sourceRemoteView:true,onEvent:()=>applied++},negotiated);
    socket.receive({type:'event',event});expect(applied).toBe(0);expect(socket.closes.at(-1)).toEqual({code:4004,reason:'source view resync'});expect(client.sourceRemoteViewState).toBeUndefined();client.dispose();
  });
});

describe('source RPG launch orientation transport',()=>{
 const negotiated={...welcome,sourceRemoteView:{epoch:900,generation:2}},rotation={x:0,y:0,z:0},direction={x:0,y:0,z:-1};
 it('requires launch orientation on negotiated RPG shots, validates aim and clones the source angles',async()=>{
  vi.useFakeTimers();const {client,socket}=await connectedClient({sourceRemoteView:true},negotiated);const input={...shotInput,weapon:'rpg' as const,direction};
  expect(client.shoot(input)).toBeUndefined();expect(client.shoot({...input,sourceRotation:{x:0,y:1,z:0}})).toBeUndefined();expect(client.shoot({...input,sourceRotation:{x:10,y:0,z:0}})).toBeUndefined();
  const angles={...rotation};expect(client.shoot({...input,sourceRotation:angles})).toBeTruthy();angles.x=10;expect(socket.messages().at(-1)).toMatchObject({type:'shoot',shot:{sourceRotation:rotation}});client.dispose();
 });
 it('retains an explicitly provided launch orientation on authoritative snapshots',async()=>{
  vi.useFakeTimers();const values:unknown[]=[];const {client,socket}=await connectedClient({sourceRemoteView:true,onSnapshot:value=>values.push(value)},negotiated);const p={...projectile,direction,sourceRotation:rotation};
  socket.receive({type:'snapshot',sourceViewTick:0,sourceViewSentAt:1000,snapshot:{room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,players:[welcome.player],projectiles:[p]}});expect(values).toHaveLength(1);expect(values[0]).toMatchObject({projectiles:[{sourceRotation:rotation}]});client.dispose();
 });
 it('resynchronizes before applying a negotiated RPG missing launch orientation',async()=>{
  vi.useFakeTimers();let count=0;const {client,socket}=await connectedClient({sourceRemoteView:true,onEvent:()=>count++},negotiated);socket.receive({type:'event',sourceViewTick:0,sourceViewSentAt:1000,event:{type:'projectile_spawned',serverTime:1000,data:{projectile}}});expect(count).toBe(0);expect(socket.closes.at(-1)).toEqual({code:4004,reason:'source view resync'});client.dispose();
 });
 it('rejects malformed or inconsistent authoritative launch orientation before handlers',async()=>{
  vi.useFakeTimers();const values:unknown[]=[];const {client,socket}=await connectedClient({onEvent:value=>values.push(value)});
  for(const sourceRotation of [null,{x:0,y:1,z:0},{x:10,y:0,z:0},{x:0,y:0,z:0}])socket.receive({type:'event',event:{type:'projectile_spawned',serverTime:1000,data:{projectile:{...projectile,sourceRotation,...(sourceRotation?.x===0&&sourceRotation?.y===0?{}:{direction})}}}});
  expect(values).toHaveLength(0);client.dispose();
 });
});

it('carries an overshoot launch pitch through a negotiated shot and restored projectile unchanged',async()=>{
 vi.useFakeTimers();const sourceRotation={x:113,y:0,z:-2377},direction=originalProjectileDirection(sourceRotation),snapshots:unknown[]=[];
 const {client,socket}=await connectedClient({sourceRemoteView:true,onSnapshot:value=>snapshots.push(value)},{...welcome,sourceRemoteView:{epoch:900,generation:2}});
 expect(client.shoot({...shotInput,weapon:'rpg',direction,sourceRotation})).toBeTruthy();expect(socket.messages().at(-1)).toMatchObject({shot:{sourceRotation}});
 socket.receive({type:'snapshot',sourceViewTick:0,sourceViewSentAt:1000,snapshot:{room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing',winnerId:null,players:[welcome.player],projectiles:[{...projectile,direction,sourceRotation}]}});
 expect(snapshots[0]).toMatchObject({projectiles:[{sourceRotation}]});client.dispose();
});

describe('source Escape transport and literal Cowardice cause',()=>{
  async function sourceClient(map:'barrack'|'woodlands',options:Partial<NetworkClientOptions>={}){
    const socket=new FakeWebSocket();
    const client=new NetworkClient({reconnect:false,now:()=>1000,websocketFactory:()=>socket,...options});
    const joined=client.join('test-room','Tester',map);socket.open();
    socket.receive({...welcome,map,...(options.sourceRemoteView?{sourceRemoteView:{epoch:900,generation:2}}:{})});
    await joined;return {client,socket};
  }
  it.each(['barrack','woodlands'] as const)('flushes %s typing before a fieldless Escape intent',async map=>{
    vi.useFakeTimers();const {client,socket}=await sourceClient(map);
    try{
      client.setTransform({...welcome.player.transform,typing:true});
      expect(client.sourceEscape()).toBe(true);
      expect(socket.messages().slice(-2)).toMatchObject([{type:'transform',transform:{typing:true}},{type:'source_escape'}]);
      expect(socket.messages().at(-1)).toEqual({type:'source_escape'});
      client.leave();expect(client.sourceEscape()).toBe(false);
    }finally{client.dispose();}
  });
  it('does not request source Escape for the authored map',async()=>{
    const {client,socket}=await connectedClient();
    try{expect(client.sourceEscape()).toBe(false);expect(socket.messages().some(m=>m.type==='source_escape')).toBe(false);}finally{client.dispose();}
  });
  it('flushes death receipts before Escape and tags the following intent with the same callback phase',async()=>{
    vi.useFakeTimers();const {client,socket}=await sourceClient('barrack',{sourceRemoteView:true,beforeSourceRemoteViewReceipt:()=>4,getSourceRemoteViewCallbacks:()=>4});
    try{
      socket.receive({type:'event',sourceViewSentAt:1000,sourceViewTick:0,event:{type:'killed',serverTime:1000,data:{killerId:'client-1',victimId:'client-2',killerFrags:0,victimDeaths:1,source:{kind:'cowardice',direct:true,attackerId:null}}}});
      expect(client.sourceEscape()).toBe(true);
      expect(socket.messages().at(-2)).toMatchObject({type:'transform',sourceRemoteView:{generation:2,callbacks:4,receipts:[{tick:0,callbacks:4}]}});
      expect(socket.messages().at(-1)).toEqual({type:'source_escape',sourceRemoteView:{generation:2,callbacks:4,receipts:[]}});
      expect(client.pendingSourceRemoteViewReceipts).toBe(0);
    }finally{client.dispose();}
  });
  it('never sends Escape if its preceding typing transform cannot be sent',async()=>{
    const {client,socket}=await sourceClient('woodlands');
    try{
      client.setTransform({...welcome.player.transform,typing:true});socket.send=()=>{throw new Error('offline');};
      expect(client.sourceEscape()).toBe(false);expect(socket.messages().some(m=>m.type==='source_escape')).toBe(false);
    }finally{client.dispose();}
  });
  it('accepts direct and hurt Cowardice events without a synthetic weapon impact',async()=>{
    const events:unknown[]=[];const {client,socket}=await sourceClient('barrack',{onEvent:event=>events.push(event)});
    try{
      for(const direct of [true,false])for(const attackerId of [null,'named-cowardice'])socket.receive({type:'event',event:{type:'killed',serverTime:1000,data:{killerId:attackerId??'client-1',victimId:'client-1',killerFrags:0,victimDeaths:1,source:{kind:'cowardice',direct,attackerId}}}});
      socket.receive({type:'event',event:{type:'damaged',serverTime:1000,data:{attackerId:'client-1',targetId:'client-1',damage:1000,health:500,source:{kind:'cowardice',direct:false,attackerId:null},sourceHealth:{canonical:500,flick:2},sourceHealthTime:1000,lethal:false}}});
      expect(events).toHaveLength(5);
      socket.receive({type:'event',event:{type:'damaged',serverTime:1000,data:{attackerId:'client-1',targetId:'client-1',damage:1000,health:500,source:{kind:'cowardice',direct:true,attackerId:null}}}});
      expect(events).toHaveLength(5);
    }finally{client.dispose();}
  });
  it.each([{kind:'cowardice'}, {kind:'cowardice',direct:'yes',attackerId:null},{kind:'cowardice',direct:true,attackerId:''},{kind:'cowardice',direct:true,attackerId:null,weapon:'rifle'},{kind:'cowardice',direct:true,attackerId:null,position:{x:0,y:0,z:0}}])('rejects malformed or weapon-forged Cowardice cause %j',async source=>{
    const events:unknown[]=[];const {client,socket}=await sourceClient('woodlands',{onEvent:event=>events.push(event)});
    try{socket.receive({type:'event',event:{type:'killed',serverTime:1000,data:{killerId:'client-1',victimId:'client-1',killerFrags:0,victimDeaths:1,source}}});expect(events).toHaveLength(0);}finally{client.dispose();}
  });
});

describe('optional evolving source angular transport',()=>{
 const angular={orientation:{x:0,y:Math.SQRT1_2,z:0,w:Math.SQRT1_2},angularVelocity:{x:10,y:-20,z:30}};
 const base={room:'test-room',tick:1,serverTime:1200,fragLimit:12,state:'playing',winnerId:null,players:[],projectiles:[]};
 it('accepts paired evolving orientation on projectiles/events/barrels and keeps omitted legacy fields compatible',async()=>{
  const snapshots:any[]=[],events:any[]=[],errors:string[]=[];
  const {client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onEvent:e=>events.push(e),onError:e=>errors.push(e.code)});
  try{
   socket.receive({type:'snapshot',snapshot:{...base,projectiles:[{...projectile,...angular}],barrels:[{id:'barrel',position:{x:0,y:0,z:0},velocity:{x:1,y:2,z:3},...angular}]}});
   socket.receive({type:'event',event:{type:'projectile_spawned',serverTime:1200,data:{projectile:{...projectile,...angular}}}});
   socket.receive({type:'snapshot',snapshot:{...base,projectiles:[projectile],barrels:[{id:'barrel',position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0}}]}});
   expect(snapshots).toHaveLength(2);expect(events).toHaveLength(1);expect(snapshots[0].barrels[0]).toMatchObject(angular);expect(events[0].data.projectile).toMatchObject(angular);expect(errors).toEqual([]);
  }finally{client.dispose();}
 });
 it('rejects missing pair members, nonfinite vectors, and non-unit/malformed quaternions in snapshots and events',async()=>{
  const snapshots:unknown[]=[],events:unknown[]=[],errors:string[]=[];
  const {client,socket}=await connectedClient({onSnapshot:s=>snapshots.push(s),onEvent:e=>events.push(e),onError:e=>errors.push(e.code)});
  const invalid=[{orientation:angular.orientation},{angularVelocity:angular.angularVelocity},{...angular,orientation:null},{...angular,orientation:{x:0,y:0,z:0,w:0}},{...angular,orientation:{x:0,y:0,z:0,w:1.000002}},{...angular,orientation:{x:0,y:0,z:0,w:Infinity}},{...angular,angularVelocity:{x:1,y:NaN,z:3}},{...angular,angularVelocity:{x:1,y:2}},{...angular,orientation:{x:0,y:0,z:'0',w:1}}];
  try{
   for(const extra of invalid){
    socket.receive({type:'snapshot',snapshot:{...base,projectiles:[{...projectile,...extra}]}});
    socket.receive({type:'snapshot',snapshot:{...base,barrels:[{id:'barrel',position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},...extra}]}});
    socket.receive({type:'event',event:{type:'projectile_spawned',serverTime:1200,data:{projectile:{...projectile,...extra}}}});
   }
   expect(snapshots).toEqual([]);expect(events).toEqual([]);expect(errors).toHaveLength(invalid.length*3);
  }finally{client.dispose();}
 });
 it('does not alias angular data between raw packets, adopted snapshots and event callbacks',async()=>{
  const snapshots:any[]=[],events:any[]=[];const {client}=await connectedClient({onSnapshot:s=>snapshots.push(s),onEvent:e=>events.push(e)});
  const packet={type:'snapshot',snapshot:{...base,projectiles:[{...projectile,orientation:{...angular.orientation},angularVelocity:{...angular.angularVelocity}}],barrels:[{id:'barrel',position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},orientation:{...angular.orientation},angularVelocity:{...angular.angularVelocity}}]}};
  const event={type:'event',event:{type:'projectile_spawned',serverTime:1200,data:{projectile:{...projectile,orientation:{...angular.orientation},angularVelocity:{...angular.angularVelocity}}}}};
  try{
   (client as unknown as {handleMessage(data:unknown):void}).handleMessage(packet);
   (client as unknown as {handleMessage(data:unknown):void}).handleMessage(event);
   packet.snapshot.projectiles[0].orientation.w=0;packet.snapshot.barrels[0].angularVelocity.x=99;event.event.data.projectile.angularVelocity.x=99;
   expect(client.latestSnapshot!.projectiles[0].orientation!.w).toBe(Math.SQRT1_2);expect(client.latestSnapshot!.barrels![0].angularVelocity!.x).toBe(10);expect(events[0].data.projectile.angularVelocity.x).toBe(10);
   snapshots[0].projectiles[0].angularVelocity.x=50;expect(client.latestSnapshot!.projectiles[0].angularVelocity!.x).toBe(10);
  }finally{client.dispose();}
 });
});


describe('source receipts during a starved transform timer',()=>{
 const negotiated={...welcome,serverTime:1000,sourceRemoteView:{epoch:1000,generation:2}};
 const snapshot={room:'test-room',tick:1,serverTime:1000,fragLimit:12,state:'playing' as const,winnerId:null,players:[welcome.player],projectiles:[]};
 it('flushes real ordered receipts before snapshot handlers without relaxing the authority age or clock guards',async()=>{
  vi.useFakeTimers();let clock=1000;const mirror=new OriginalRemoteView(1000),results:unknown[]=[],order:string[]=[];
  const {client,socket}=await connectedClient({sourceRemoteView:true,now:()=>clock,beforeSourceRemoteViewReceipt:()=>Math.floor((clock-1000)*30/1000),getSourceRemoteViewCallbacks:()=>Math.floor((clock-1000)*30/1000),onSnapshot:()=>order.push('apply')},negotiated);
  const originalSend=socket.send.bind(socket);vi.spyOn(socket,'send').mockImplementation(data=>{originalSend(data);const packet=JSON.parse(data);if(packet.type==='transform'){order.push('send');results.push(mirror.accept(packet.sourceRemoteView,clock));}});
  try{
   // Advance the actual clock without running any queued timeout callbacks.
   for(let tick=0;tick<8;tick++){
    clock=1100+tick*300;expect(mirror.recordSent({tick,sentAt:clock,targets:[]})).toEqual({ok:true});
    socket.receive({type:'snapshot',sourceViewTick:tick,sourceViewSentAt:clock,snapshot:{...snapshot,tick,serverTime:clock}});
   }
   expect(results).toHaveLength(7);expect(results.every(result=>(result as {ok:boolean}).ok)).toBe(true);
   expect(order.slice(0,5)).toEqual(['apply','send','apply','send','apply']);
   const packets=socket.messages().filter(message=>message.type==='transform');
   expect(packets[0]).toMatchObject({sourceRemoteView:{generation:2,callbacks:12,receipts:[{tick:0,callbacks:3},{tick:1,callbacks:12}]}});
   expect(packets.flatMap(message=>message.type==='transform'?message.sourceRemoteView!.receipts.map(r=>r.tick):[])).toEqual([0,1,2,3,4,5,6,7]);
   expect(client.pendingSourceRemoteViewReceipts).toBe(0);
  }finally{client.dispose();}
 });
 it('retains receipts when no local transform exists and sends them only with a real later transform',async()=>{
  vi.useFakeTimers();let clock=1000;const {client,socket}=await connectedClient({sourceRemoteView:true,now:()=>clock,beforeSourceRemoteViewReceipt:()=>9,getSourceRemoteViewCallbacks:()=>9},negotiated);
  try{
   Reflect.set(client,'latestTransform',undefined);clock=1300;
   socket.receive({type:'snapshot',sourceViewTick:0,sourceViewSentAt:1300,snapshot:{...snapshot,serverTime:1300}});
   expect(socket.messages().filter(message=>message.type==='transform')).toEqual([]);expect(client.pendingSourceRemoteViewReceipts).toBe(1);
   client.setTransform(welcome.player.transform);expect(client.flushTransform()).toBe(true);
   expect(socket.messages().at(-1)).toMatchObject({type:'transform',sourceRemoteView:{generation:2,callbacks:9,receipts:[{tick:0,callbacks:9}]}});
  }finally{client.dispose();}
 });
 it('keeps a failed urgent send queued for the next receipt instead of losing its trace',async()=>{
  vi.useFakeTimers();let clock=1000;const errors:string[]=[],{client,socket}=await connectedClient({sourceRemoteView:true,now:()=>clock,beforeSourceRemoteViewReceipt:()=>Math.floor((clock-1000)*30/1000),getSourceRemoteViewCallbacks:()=>Math.floor((clock-1000)*30/1000),onError:error=>errors.push(error.code)},negotiated);
  const originalSend=socket.send.bind(socket);vi.spyOn(socket,'send').mockImplementationOnce(()=>{throw Error('socket temporarily unavailable');}).mockImplementation(originalSend);
  try{
   clock=1300;socket.receive({type:'snapshot',sourceViewTick:0,sourceViewSentAt:1300,snapshot:{...snapshot,serverTime:1300}});
   expect(client.pendingSourceRemoteViewReceipts).toBe(1);expect(errors).toEqual(['send_failed']);
   clock=1600;socket.receive({type:'snapshot',sourceViewTick:1,sourceViewSentAt:1600,snapshot:{...snapshot,serverTime:1600}});
   expect(socket.messages().at(-1)).toMatchObject({type:'transform',sourceRemoteView:{generation:2,callbacks:18,receipts:[{tick:0,callbacks:9},{tick:1,callbacks:18}]}});
   expect(client.pendingSourceRemoteViewReceipts).toBe(0);
  }finally{client.dispose();}
 });
});
