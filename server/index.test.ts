import { afterEach, describe, expect, it } from 'vitest';
import WebSocket, { type RawData } from 'ws';
import { startMatchServer, type RunningMatchServer } from './index';
import {PROTOCOL_VERSION} from './protocol';

const runningServers = new Set<RunningMatchServer>();

async function listeningPort(server: RunningMatchServer): Promise<number> {
  const deadline = Date.now() + 2_000;
  while (Date.now() < deadline) {
    if (server.port !== 0) return server.port;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('Match server did not start listening in time');
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
    socket.once('error', reject);
  });
}

function rejectedSocketStatus(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    socket.on('error', () => {
      // A failed upgrade may also surface as a client error after the response.
    });
    socket.once('open', () => {
      socket.close();
      reject(new Error(`Unexpectedly opened ${url}`));
    });
    socket.once('unexpected-response', (_request, response) => {
      response.resume();
      resolve(response.statusCode ?? 0);
    });
  });
}

function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return Promise.resolve();
  return new Promise((resolve) => {
    socket.once('close', () => resolve());
    socket.close();
  });
}

function nextSocketClose(socket: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for a WebSocket close'));
    }, 2_000);
    const onClose = (code: number, reason: Buffer): void => {
      cleanup();
      resolve({ code, reason: reason.toString() });
    };
    const onError = (): void => {
      // A transport terminated without a close frame still emits `close`.
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off('close', onClose);
      socket.off('error', onError);
    };
    socket.on('close', onClose);
    socket.on('error', onError);
  });
}

function nextJsonMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Timed out waiting for a WebSocket message')), 2_000);
    socket.once('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    socket.once('message', (payload) => {
      clearTimeout(timeout);
      try {
        resolve(JSON.parse(payload.toString()));
      } catch (error) {
        reject(error);
      }
    });
  });
}

function nextJsonMessageMatching(socket: WebSocket, predicate: (message: unknown) => boolean): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for a matching WebSocket message'));
    }, 2_000);
    const onError = (error: Error): void => {
      cleanup();
      reject(error);
    };
    const onMessage = (payload: RawData): void => {
      try {
        const message: unknown = JSON.parse(payload.toString());
        if (!predicate(message)) return;
        cleanup();
        resolve(message);
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const cleanup = (): void => {
      clearTimeout(timeout);
      socket.off('error', onError);
      socket.off('message', onMessage);
    };
    socket.on('error', onError);
    socket.on('message', onMessage);
  });
}

function hasMessageType(message: unknown, type: string): boolean {
  return typeof message === 'object' && message !== null
    && (message as { type?: unknown }).type === type;
}

async function readHealth(port: number): Promise<{ status: number; body: unknown; cacheControl: string | null }> {
  const response = await fetch(`http://127.0.0.1:${port}/health`);
  return {
    status: response.status,
    body: await response.json(),
    cacheControl: response.headers.get('cache-control'),
  };
}

afterEach(async () => {
  await Promise.all([...runningServers].map((server) => server.close()));
  runningServers.clear();
});

describe('match server transport', () => {
  it('reports live room/player counts from the no-store health endpoint', async () => {
    const server = startMatchServer(0);
    runningServers.add(server);
    const port = await listeningPort(server);
    await expect(readHealth(port)).resolves.toEqual({
      status: 200,
      body: { ok: true, rooms: 0, players: 0 },
      cacheControl: 'no-store',
    });

    const socket = await openSocket(`ws://127.0.0.1:${port}/`);
    const welcomeResponse = nextJsonMessage(socket);
    socket.send(JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, room: 'health-count', name: 'PLAYER' }));
    await welcomeResponse;
    await expect(readHealth(port)).resolves.toMatchObject({ body: { rooms: 1, players: 1 } });

    socket.send(JSON.stringify({ type: 'leave' }));
    await closeSocket(socket);
    await expect(readHealth(port)).resolves.toMatchObject({ body: { rooms: 0, players: 0 } });
  });

  it('accepts WebSockets only on the documented root path', async () => {
    const server = startMatchServer(0);
    runningServers.add(server);
    const port = await listeningPort(server);

    const socket = await openSocket(`ws://127.0.0.1:${port}/`);
    expect(socket.readyState).toBe(WebSocket.OPEN);
    await closeSocket(socket);
    await expect(rejectedSocketStatus(`ws://127.0.0.1:${port}/health`)).resolves.toBe(400);
    await expect(rejectedSocketStatus(`ws://127.0.0.1:${port}/other`)).resolves.toBe(400);
  });

  it.each([1,4,5])('rejects protocol-v%i joins with a protocol_mismatch transport error', async version => {
    const server = startMatchServer(0);
    runningServers.add(server);
    const port = await listeningPort(server);
    const socket = await openSocket(`ws://127.0.0.1:${port}/`);

    const response = nextJsonMessage(socket);
    socket.send(JSON.stringify({ type: 'join', protocol: version, room: 'legacy', name: 'LEGACY' }));
    await expect(response).resolves.toMatchObject({
      type: 'error',
      code: 'protocol_mismatch',
      message: `Server requires protocol ${PROTOCOL_VERSION}.`,
    });
    await closeSocket(socket);
  });

  it('includes the shared protocol in a successful welcome', async () => {
    const server = startMatchServer(0);
    runningServers.add(server);
    const port = await listeningPort(server);
    const socket = await openSocket(`ws://127.0.0.1:${port}/`);

    const response = nextJsonMessage(socket);
    socket.send(JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, room: 'modern', name: 'MODERN' }));
    await expect(response).resolves.toMatchObject({
      type: 'welcome',
      protocol: PROTOCOL_VERSION,
      room: 'modern',
      resumeToken: expect.any(String),
      player: { name: 'MODERN' },
    });
    await closeSocket(socket);
  });

  it('routes reload envelopes to the authoritative room', async () => {
    const server = startMatchServer(0);
    runningServers.add(server);
    const port = await listeningPort(server);
    const socket = await openSocket(`ws://127.0.0.1:${port}/`);
    const welcomeResponse = nextJsonMessage(socket);
    socket.send(JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, room: 'reload-route', name: 'PLAYER' }));
    await welcomeResponse;

    const reloadResponse = nextJsonMessageMatching(socket, (message) => (
      hasMessageType(message, 'loadout') && (message as { reload?: unknown }).reload !== null
    ));
    socket.send(JSON.stringify({ type: 'reload', weapon: 'launcher' }));
    await expect(reloadResponse).resolves.toMatchObject({
      type: 'loadout',
      equipped:'launcher',
      reload:{weapon:'launcher',completesAt:expect.any(Number)},
      weapons:{launcher:{ammo:6,reserve:18}},
    });

    socket.send(JSON.stringify({ type: 'leave' }));
    await closeSocket(socket);
  });

  it.each([
    ['empty', ''],
    ['oversized', 'r'.repeat(129)],
    ['non-string', 42],
  ])('rejects a malformed %s resume token before room creation', async (_name, resumeToken) => {
    const server = startMatchServer(0);
    runningServers.add(server);
    const port = await listeningPort(server);
    const socket = await openSocket(`ws://127.0.0.1:${port}/`);

    const response = nextJsonMessage(socket);
    socket.send(JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, room: 'resume-bounds', name: 'PLAYER', resumeToken }));
    await expect(response).resolves.toMatchObject({
      type: 'error',
      code: 'invalid_resume_token',
      message: 'Resume tokens must contain 1-128 characters.',
    });
    await closeSocket(socket);
  });

  it('preserves the room failure for a well-formed expired resume token', async () => {
    const server = startMatchServer(0);
    runningServers.add(server);
    const port = await listeningPort(server);
    const socket = await openSocket(`ws://127.0.0.1:${port}/`);

    const response = nextJsonMessage(socket);
    socket.send(JSON.stringify({
      type: 'join', protocol: PROTOCOL_VERSION, room: 'expired-resume', name: 'PLAYER', resumeToken: 'r'.repeat(128),
    }));
    await expect(response).resolves.toMatchObject({
      type: 'error',
      code: 'resume_expired',
      message: 'Your reconnect session has expired. Join the room again.',
    });
    await closeSocket(socket);
  });

  it('resumes the same identity, closes the replaced transport, and keeps the new owner active', async () => {
    const server = startMatchServer(0);
    runningServers.add(server);
    const port = await listeningPort(server);
    const firstSocket = await openSocket(`ws://127.0.0.1:${port}/`);
    const firstResponse = nextJsonMessage(firstSocket);
    firstSocket.send(JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, room: 'resume-close', name: 'PLAYER' }));
    const firstWelcome = await firstResponse as { type: string; clientId: string; resumeToken: string };
    expect(firstWelcome).toMatchObject({ type: 'welcome', resumeToken: expect.any(String) });

    const replacedClose = nextSocketClose(firstSocket);
    const resumedSocket = await openSocket(`ws://127.0.0.1:${port}/`);
    const resumedResponse = nextJsonMessage(resumedSocket);
    resumedSocket.send(JSON.stringify({
      type: 'join', protocol: PROTOCOL_VERSION, room: 'resume-close', name: 'PLAYER', resumeToken: firstWelcome.resumeToken,
    }));
    const resumedWelcome = await resumedResponse as { type: string; clientId: string; resumeToken: string };
    expect(resumedWelcome).toMatchObject({ type: 'welcome', clientId: firstWelcome.clientId });
    await expect(replacedClose).resolves.toEqual({ code: 4004, reason: 'Session replaced' });

    const pong = nextJsonMessageMatching(resumedSocket, (message) => (
      hasMessageType(message, 'pong') && (message as { clientTime?: unknown }).clientTime === 777
    ));
    resumedSocket.send(JSON.stringify({ type: 'ping', clientTime: 777 }));
    await expect(pong).resolves.toMatchObject({ type: 'pong', clientTime: 777 });
    resumedSocket.send(JSON.stringify({ type: 'leave' }));
    await closeSocket(resumedSocket);
  });

  it('does not let a rejected stale token displace the current resumed transport', async () => {
    const server = startMatchServer(0);
    runningServers.add(server);
    const port = await listeningPort(server);
    const firstSocket = await openSocket(`ws://127.0.0.1:${port}/`);
    const firstResponse = nextJsonMessage(firstSocket);
    firstSocket.send(JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, room: 'resume-leave', name: 'PLAYER' }));
    const firstWelcome = await firstResponse as { clientId: string; resumeToken: string };

    const replacedClose = nextSocketClose(firstSocket);
    const resumedSocket = await openSocket(`ws://127.0.0.1:${port}/`);
    const resumedResponse = nextJsonMessage(resumedSocket);
    resumedSocket.send(JSON.stringify({
      type: 'join', protocol: PROTOCOL_VERSION, room: 'resume-leave', name: 'PLAYER', resumeToken: firstWelcome.resumeToken,
    }));
    await resumedResponse;
    await replacedClose;

    const staleTokenSocket = await openSocket(`ws://127.0.0.1:${port}/`);
    const staleTokenResponse = nextJsonMessage(staleTokenSocket);
    staleTokenSocket.send(JSON.stringify({
      type: 'join', protocol: PROTOCOL_VERSION, room: 'resume-leave', name: 'PLAYER', resumeToken: firstWelcome.resumeToken,
    }));
    await expect(staleTokenResponse).resolves.toMatchObject({ type: 'error', code: 'resume_expired' });

    const currentPong = nextJsonMessageMatching(resumedSocket, (message) => (
      hasMessageType(message, 'pong') && (message as { clientTime?: unknown }).clientTime === 779
    ));
    resumedSocket.send(JSON.stringify({ type: 'ping', clientTime: 779 }));
    await expect(currentPong).resolves.toMatchObject({ type: 'pong', clientTime: 779 });

    await closeSocket(staleTokenSocket);
    resumedSocket.send(JSON.stringify({ type: 'leave' }));
    await closeSocket(resumedSocket);
  });

  it('terminates a half-open socket and lets its suspended session resume', async () => {
    const server = startMatchServer(0, { heartbeatIntervalMs: 100 });
    runningServers.add(server);
    const port = await listeningPort(server);
    const socket = await openSocket(`ws://127.0.0.1:${port}/`);
    Object.defineProperty(socket, 'pong', { value: () => socket });

    const welcomeResponse = nextJsonMessage(socket);
    socket.send(JSON.stringify({ type: 'join', protocol: PROTOCOL_VERSION, room: 'heartbeat-resume', name: 'PLAYER' }));
    const firstWelcome = await welcomeResponse as { clientId: string; resumeToken: string };
    const timedOutClose = nextSocketClose(socket);
    await expect(timedOutClose).resolves.toEqual({ code: 1006, reason: '' });

    const resumedSocket = await openSocket(`ws://127.0.0.1:${port}/`);
    const resumedResponse = nextJsonMessage(resumedSocket);
    resumedSocket.send(JSON.stringify({
      type: 'join', protocol: PROTOCOL_VERSION, room: 'heartbeat-resume', name: 'PLAYER', resumeToken: firstWelcome.resumeToken,
    }));
    await expect(resumedResponse).resolves.toMatchObject({
      type: 'welcome',
      clientId: firstWelcome.clientId,
      resumeToken: expect.any(String),
    });
    resumedSocket.send(JSON.stringify({ type: 'leave' }));
    await closeSocket(resumedSocket);
  });

  it('preserves PORT=0 as an ephemeral port', async () => {
    const previousPort = process.env.PORT;
    process.env.PORT = '0';
    try {
      const server = startMatchServer();
      runningServers.add(server);
      expect(await listeningPort(server)).toBeGreaterThan(0);
    } finally {
      if (previousPort === undefined) delete process.env.PORT;
      else process.env.PORT = previousPort;
    }
  });

  it('rejects invalid explicit ports before allocating server resources', () => {
    expect(() => startMatchServer(-1)).toThrow(RangeError);
    expect(() => startMatchServer(65_536)).toThrow(RangeError);
    expect(() => startMatchServer(1.5)).toThrow(RangeError);
  });

  it('rejects invalid heartbeat intervals before allocating server resources', () => {
    expect(() => startMatchServer(0, { heartbeatIntervalMs: 0 })).toThrow(RangeError);
    expect(() => startMatchServer(0, { heartbeatIntervalMs: 10.5 })).toThrow(RangeError);
  });

  it('shares one shutdown across concurrent and repeated close calls', async () => {
    const server = startMatchServer(0);
    runningServers.add(server);
    await listeningPort(server);

    const firstClose = server.close();
    expect(server.close()).toBe(firstClose);
    await expect(firstClose).resolves.toBeUndefined();
    await expect(server.close()).resolves.toBeUndefined();
  });
  it('lists immutable map rooms and rejects conflicting or invalid map joins', async () => {
    const server=startMatchServer(0);runningServers.add(server);const port=await listeningPort(server);
    const first=await openSocket(`ws://127.0.0.1:${port}`);
    const joined=nextJsonMessageMatching(first,m=>hasMessageType(m,'welcome'));
    first.send(JSON.stringify({type:'join',protocol:PROTOCOL_VERSION,room:'forest',name:'Explorer',map:'woodlands'}));
    expect(await joined).toMatchObject({type:'welcome',map:'woodlands'});
    const response=await fetch(`http://127.0.0.1:${port}/rooms`);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({rooms:[{room:'forest',map:'woodlands',players:1,capacity:8,state:'playing'}]});
    const second=await openSocket(`ws://127.0.0.1:${port}`);
    let rejected=nextJsonMessageMatching(second,m=>hasMessageType(m,'error'));
    second.send(JSON.stringify({type:'join',protocol:PROTOCOL_VERSION,room:'forest',name:'Other',map:'barrack'}));
    expect(await rejected).toMatchObject({type:'error',code:'map_mismatch'});
    rejected=nextJsonMessageMatching(second,m=>hasMessageType(m,'error'));
    second.send(JSON.stringify({type:'join',protocol:PROTOCOL_VERSION,room:'new-room',name:'Other',map:'unknown'}));
    expect(await rejected).toMatchObject({type:'error',code:'invalid_map'});
    const secondJoin=nextJsonMessageMatching(second,m=>hasMessageType(m,'welcome'));
    second.send(JSON.stringify({type:'join',protocol:PROTOCOL_VERSION,room:'forest',name:'Other',map:'woodlands'}));
    await secondJoin;
    const chat=nextJsonMessageMatching(second,m=>hasMessageType(m,'event') && (m as {event:{type:string}}).event.type==='chat');
    first.send(JSON.stringify({type:'chat',text:'Hello forest'}));
    expect(await chat).toMatchObject({type:'event',event:{type:'chat',data:{name:'Explorer',text:'Hello forest'}}});
    await closeSocket(second);await closeSocket(first);
  });

});
