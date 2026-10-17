import { describe, expect, it } from 'vitest';
import {
  PROTOCOL_VERSION,
  isExplosiveWeaponId,
  isFiniteVec3,
  isHitscanWeaponId,
  isWeaponId,
  parseClientMessage,
} from './protocol';

describe('protocol v12 client envelope', () => {
  it('exports protocol version 12 from the shared contract', () => {
    expect(PROTOCOL_VERSION).toBe(12);
  });

  it('accepts only a fieldless source Escape intent',()=>{
    expect(parseClientMessage('{"type":"source_escape"}')).toEqual({type:'source_escape'});
    for(const fields of [{damage:1000},{targetId:'p2'},{direct:true},{typing:false},{killer:'Cowardice'},{sourceRemoteView:null}]){
      expect(parseClientMessage(JSON.stringify({type:'source_escape',...fields}))).toBeNull();
    }
    const sourceRemoteView={generation:1,callbacks:0,receipts:[]};
    expect(parseClientMessage(JSON.stringify({type:'source_escape',sourceRemoteView}))).toEqual({type:'source_escape',sourceRemoteView});
  });

  it('accepts the v5 client message types with minimal combat claims', () => {
    expect(parseClientMessage(JSON.stringify({
      type: 'join', protocol: PROTOCOL_VERSION, room: 'alpha', name: 'Player', resumeToken: 'opaque-token',
    }))).toEqual({
      type: 'join', protocol: PROTOCOL_VERSION, room: 'alpha', name: 'Player', resumeToken: 'opaque-token',
    });
    expect(parseClientMessage(JSON.stringify({
      type: 'shoot',
      shot: { shotId: 's1', origin: { x: 0, y: 1, z: 0 }, direction: { x: 0, y: 0, z: -1 }, weapon: 'rpg' },
    }))).toMatchObject({ type: 'shoot', shot: { shotId: 's1', weapon: 'rpg' } });
    expect(parseClientMessage(JSON.stringify({ type: 'hit', hit: { shotId: 's1', targetId: 'p2' } }))).toEqual({
      type: 'hit', hit: { shotId: 's1', targetId: 'p2' },
    });
    expect(parseClientMessage(JSON.stringify({ type: 'reload', weapon: 'rifle' }))).toEqual({
      type: 'reload', weapon: 'rifle',
    });
  });

  it.each(['welcome', 'snapshot', 'event', 'loadout', 'projectile_spawned', 'explosion', 'damaged', 'killed'])(
    'rejects the server-only %s envelope from clients',
    (type) => {
      expect(parseClientMessage(JSON.stringify({ type, data: {} }))).toBeNull();
    },
  );

  it('fits a bounded 128-sample movement path inside the 64 KiB envelope',()=>{
    const vector={x:1.2345678901234567,y:-1.2345678901234567,z:1.2345678901234567};
    const message={type:'transform',sequence:1,clientTime:0,transform:{position:vector,velocity:vector,grounded:false,yaw:0,pitch:0,weapon:'launcher'},path:Array.from({length:128},()=>({position:vector,velocity:vector,grounded:false}))};
    const raw=JSON.stringify(message);expect(raw.length).toBeGreaterThan(16_384);expect(raw.length).toBeLessThan(65_536);expect(parseClientMessage(raw)).toEqual(message);
  });

  it('rejects malformed, array, empty, and oversized envelopes', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('[]')).toBeNull();
    expect(parseClientMessage('')).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'unknown' }))).toBeNull();
    expect(parseClientMessage(JSON.stringify({ type: 'ping', padding: 'x'.repeat(65_536) }))).toBeNull();
  });
});

describe('protocol primitive guards', () => {
  it('partitions hitscan and explosive weapon identifiers', () => {
    expect(['pistol', 'shotgun', 'rifle', 'sniper'].every(isHitscanWeaponId)).toBe(true);
    expect(['launcher', 'rpg'].every(isExplosiveWeaponId)).toBe(true);
    expect(['pistol', 'shotgun', 'rifle', 'sniper', 'launcher', 'rpg'].every(isWeaponId)).toBe(true);
    expect(isHitscanWeaponId('rpg')).toBe(false);
    expect(isExplosiveWeaponId('rifle')).toBe(false);
    expect(isWeaponId('grenade')).toBe(false);
  });

  it('accepts only finite object vectors', () => {
    expect(isFiniteVec3({ x: 1, y: 2, z: 3 })).toBe(true);
    expect(isFiniteVec3({ x: Infinity, y: 2, z: 3 })).toBe(false);
    expect(isFiniteVec3([1, 2, 3])).toBe(false);
    expect(isFiniteVec3(null)).toBe(false);
  });
});

describe('source remote view wire validation',()=>{
  const trace={generation:1,callbacks:10,receipts:[{tick:0,callbacks:3},{tick:1,callbacks:10}]};
  it('accepts bounded ordered receipts on transforms and shots',()=>{
    for(const type of ['transform','shoot'])expect(parseClientMessage(JSON.stringify({type,sourceRemoteView:trace}))).toMatchObject({sourceRemoteView:trace});
  });
  it.each([null,[],{...trace,generation:-1},{...trace,callbacks:0.5},{...trace,callbacks:Number.MAX_SAFE_INTEGER+1},{...trace,receipts:Array(65).fill({tick:0,callbacks:0})},{...trace,receipts:[{tick:0,callbacks:11}]},{...trace,receipts:[{tick:0,callbacks:5},{tick:0,callbacks:6}]},{...trace,receipts:[{tick:0,callbacks:5},{tick:1,callbacks:4}]}])('rejects forged trace %j',sourceRemoteView=>{
    expect(parseClientMessage(JSON.stringify({type:'shoot',sourceRemoteView}))).toBeNull();
  });
  it('requires boolean join negotiation',()=>expect(parseClientMessage(JSON.stringify({type:'join',sourceRemoteView:1}))).toBeNull());
});

describe('source RPG launch rotation envelope',()=>{
 const shot={shotId:'s',weapon:'rpg',origin:{x:0,y:0,z:0},direction:{x:0,y:0,z:-1},sourceRotation:{x:0,y:0,z:0}};
 it('preserves a consistent provided launch rotation',()=>expect(parseClientMessage(JSON.stringify({type:'shoot',shot}))).toMatchObject({shot}));
 it.each([{x:0,y:1,z:0},{x:10,y:0,z:0},null,[],{x:0,y:0,z:'zero'}])('rejects invalid or direction-mismatching launch rotation %j',sourceRotation=>expect(parseClientMessage(JSON.stringify({type:'shoot',shot:{...shot,sourceRotation}}))).toBeNull());
});
