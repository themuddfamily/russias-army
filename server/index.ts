import { WebSocket, WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { MatchRoom } from './match-room';
import { matchServerNow } from './clock';
import {
  PROTOCOL_VERSION,
  RESUME_TOKEN_MAX_LENGTH,
  type MessagePeer,
  type ServerMessage,
  parseClientMessage,
} from './protocol';

const DEFAULT_PORT = 8081;
const sourceViewDiagnostics=process.env.SOURCE_VIEW_DIAGNOSTICS==='1'
  ?(entry:Record<string,unknown>)=>console.log('[source-view-diagnostic] '+JSON.stringify({...entry,loggedServerTime:matchServerNow()})):undefined;
const DEFAULT_TICK_RATE = 20;
const DEFAULT_HEARTBEAT_INTERVAL_MS = 15_000;
const SHUTDOWN_GRACE_MS = 1_000;
const SESSION_REPLACED_CLOSE_CODE = 4004;
const ROOM_PATTERN = /^[a-zA-Z0-9_-]{1,32}$/;

function validResumeToken(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= RESUME_TOKEN_MAX_LENGTH;
}

interface ConnectionState {
  playerId: string | null;
  room: MatchRoom | null;
}

export interface RunningMatchServer {
  port: number;
  close(): Promise<void>;
}

export interface MatchServerOptions {
  /** How long a socket may go without answering a WebSocket ping. */
  heartbeatIntervalMs?: number;
}

function configuredPort(): number {
  const value = process.env.PORT;
  if (value === undefined || value.trim() === '') return DEFAULT_PORT;
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65_535 ? port : DEFAULT_PORT;
}

function validatePort(port: number): void {
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new RangeError('Match server port must be an integer between 0 and 65535.');
  }
}

function heartbeatInterval(options: MatchServerOptions): number {
  const value = options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS;
  if (!Number.isInteger(value) || value < 10 || value > 2_147_483_647) {
    throw new RangeError('Heartbeat interval must be an integer between 10 and 2147483647 milliseconds.');
  }
  return value;
}

export function startMatchServer(port = configuredPort(), options: MatchServerOptions = {}): RunningMatchServer {
  validatePort(port);
  const heartbeatIntervalMs = heartbeatInterval(options);
  const rooms = new Map<string, MatchRoom>();
  const sockets = new Set<WebSocket>();
  const socketsAwaitingPong = new Set<WebSocket>();
  const activePlayerSockets = new Map<MatchRoom, Map<string, WebSocket>>();
  let shuttingDown = false;
  let closePromise: Promise<void> | undefined;
  const httpServer = createServer((request, response) => {
    if (request.method === 'GET' && request.url === '/rooms') {
      response.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' });
      response.end(JSON.stringify({ rooms: [...rooms.values()].map(room => ({room: room.id, map: room.map, players: room.size, connectedPlayers: room.connectedSize, capacity: room.maxPlayers, state: room.finished ? 'finished' : 'playing'})) }));
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      let players = 0;
      for (const room of rooms.values()) players += room.size;
      response.writeHead(shuttingDown ? 503 : 200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
      response.end(JSON.stringify({ ok: !shuttingDown, rooms: rooms.size, players }));
      return;
    }
    response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ error: 'not_found' }));
  });
  const server = new WebSocketServer({ server: httpServer, path: '/', maxPayload: 65_536, perMessageDeflate: false });

  const send = (socket: WebSocket, message: ServerMessage): void => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  };

  const claimPlayerSocket = (room: MatchRoom, playerId: string, socket: WebSocket): WebSocket | undefined => {
    let roomSockets = activePlayerSockets.get(room);
    if (!roomSockets) {
      roomSockets = new Map();
      activePlayerSockets.set(room, roomSockets);
    }
    const replacedSocket = roomSockets.get(playerId);
    roomSockets.set(playerId, socket);
    return replacedSocket;
  };

  const releasePlayerSocket = (room: MatchRoom, playerId: string, socket: WebSocket): void => {
    const roomSockets = activePlayerSockets.get(room);
    if (!roomSockets || roomSockets.get(playerId) !== socket) return;
    roomSockets.delete(playerId);
    if (roomSockets.size === 0) activePlayerSockets.delete(room);
  };

  server.on('connection', (socket) => {
    sockets.add(socket);
    const state: ConnectionState = { playerId: null, room: null };
    const peer: MessagePeer = { send: (message) => {
      // A private source-view receipt must refer to an actual WebSocket send.
      // The ordinary connection helper silently skips closed sockets.
      if('sourceViewTick' in message&&socket.readyState!==WebSocket.OPEN)throw Error('Source view transport is closed');
      send(socket,message);
    } };

    socket.on('message', (payload) => {
      const message = parseClientMessage(payload.toString());
      if (!message) {
        send(socket, { type: 'error', code: 'invalid_message', message: 'Message must be valid protocol JSON.' });
        return;
      }

      if (message.type === 'join') {
        if (state.playerId) {
          send(socket, { type: 'error', code: 'already_joined', message: 'Leave the current room before joining another one.' });
          return;
        }
        if (message.protocol !== PROTOCOL_VERSION) {
          send(socket, { type: 'error', code: 'protocol_mismatch', message: `Server requires protocol ${PROTOCOL_VERSION}.` });
          return;
        }
        if (typeof message.room !== 'string' || !ROOM_PATTERN.test(message.room)) {
          send(socket, { type: 'error', code: 'invalid_room', message: 'Room names may contain 1-32 letters, numbers, underscores, or hyphens.' });
          return;
        }
        if (message.resumeToken !== undefined && !validResumeToken(message.resumeToken)) {
          send(socket, {
            type: 'error',
            code: 'invalid_resume_token',
            message: `Resume tokens must contain 1-${RESUME_TOKEN_MAX_LENGTH} characters.`,
          });
          return;
        }
        if (message.map !== undefined && message.map !== 'barrack' && message.map !== 'woodlands') {
          send(socket, { type: 'error', code: 'invalid_map', message: 'Choose Barrack or Woodlands.' });
          return;
        }
        const existingRoom = rooms.get(message.room);
        if (existingRoom && message.map !== undefined && existingRoom.map !== message.map) {
          send(socket, { type: 'error', code: 'map_mismatch', message: 'This room uses a different map.' });
          return;
        }
        const room = existingRoom ?? new MatchRoom(message.room, { tickRate: DEFAULT_TICK_RATE, map: message.map ?? 'barrack',sourceViewDiagnostics });
        rooms.set(message.room, room);
        const outcome = room.join(peer, message.name, matchServerNow(), message.resumeToken, message.sourceRemoteView === true);
        if (!outcome.ok) {
          send(socket, { type: 'error', code: outcome.code, message: outcome.message });
          if (room.size === 0) rooms.delete(message.room);
          return;
        }
        state.playerId = outcome.player.id;
        state.room = room;
        const replacedSocket = claimPlayerSocket(room, outcome.player.id, socket);
        if (replacedSocket && replacedSocket !== socket) {
          replacedSocket.close(SESSION_REPLACED_CLOSE_CODE, 'Session replaced');
        }
        return;
      }

      if (message.type === 'ping' && !state.playerId) {
        if (Number.isFinite(message.clientTime)) send(socket, { type: 'pong', clientTime: message.clientTime, serverTime: matchServerNow() });
        return;
      }
      if (!state.playerId || !state.room) {
        send(socket, { type: 'error', code: 'join_required', message: 'Join a room before sending gameplay messages.' });
        return;
      }

      const previousRoom = state.room;
      if (message.type === 'leave') {
        previousRoom.leave(state.playerId, matchServerNow(), peer);
        releasePlayerSocket(previousRoom, state.playerId, socket);
        state.playerId = null;
        state.room = null;
        if (previousRoom.size === 0) rooms.delete(previousRoom.id);
        return;
      }
      previousRoom.handleMessage(state.playerId, message, matchServerNow(), peer);
    });

    socket.on('close', () => {
      sockets.delete(socket);
      socketsAwaitingPong.delete(socket);
      if (!state.playerId || !state.room) return;
      const room = state.room;
      releasePlayerSocket(room, state.playerId, socket);
      room.suspend(state.playerId, matchServerNow(), peer);
      if (room.size === 0) rooms.delete(room.id);
      state.playerId = null;
      state.room = null;
    });

    socket.on('error', () => {
      // close follows and performs authoritative room cleanup.
    });

    socket.on('pong', () => {
      socketsAwaitingPong.delete(socket);
    });
  });

  const interval = setInterval(() => {
    const now = matchServerNow();
    for (const [roomId, room] of rooms) {
      room.tick(now);
      if (room.size === 0) rooms.delete(roomId);
    }
  }, 1_000 / DEFAULT_TICK_RATE);

  const heartbeat = setInterval(() => {
    for (const socket of sockets) {
      if (socketsAwaitingPong.has(socket)) {
        socketsAwaitingPong.delete(socket);
        socket.terminate();
        continue;
      }
      if (socket.readyState !== WebSocket.OPEN) continue;
      socketsAwaitingPong.add(socket);
      try {
        socket.ping();
      } catch {
        socketsAwaitingPong.delete(socket);
        socket.terminate();
      }
    }
  }, heartbeatIntervalMs);

  httpServer.on('listening', () => {
    const address = httpServer.address();
    const actualPort = typeof address === 'object' && address ? address.port : port;
    console.log(`[match-server] listening on ws://0.0.0.0:${actualPort}`);
  });
  httpServer.listen(port);

  return {
    get port() {
      const address = httpServer.address();
      return typeof address === 'object' && address ? address.port : port;
    },
    close: () => {
      if (closePromise) return closePromise;
      shuttingDown = true;
      clearInterval(interval);
      clearInterval(heartbeat);
      socketsAwaitingPong.clear();
      closePromise = (async () => {
        for (const socket of sockets) socket.close(1001, 'Server shutting down');
        const forceCloseTimer = setTimeout(() => {
          for (const socket of sockets) socket.terminate();
        }, SHUTDOWN_GRACE_MS);
        forceCloseTimer.unref();
        try {
          await Promise.all([
            new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
            new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve())),
          ]);
        } finally {
          clearTimeout(forceCloseTimer);
        }
      })();
      return closePromise;
    },
  };
}

const invokedPath = process.argv[1] ? new URL(process.argv[1], 'file:').href : '';
if (import.meta.url === invokedPath) startMatchServer();
