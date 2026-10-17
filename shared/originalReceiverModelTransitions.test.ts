import {describe,expect,it} from 'vitest';
import {copyReceiverModelTransitions,type ReceiverModelTransitionCopyOptions} from './originalReceiverModelTransitions';
import type {ReceiverModelTransition} from './originalReceiverModelWorld';

const bounds:ReceiverModelTransitionCopyOptions={sceneGeneration:3,minCallback:4,maxCallback:5,receiptTick:7,maxEntries:256,maxTextChars:65536};
const prefix=()=>({kind:'receipt' as const,sceneGeneration:3,callback:4,tick:7});
const born=():ReceiverModelTransition=>({kind:'birth',ordinal:1,prefix:prefix(),actorId:'a',giHandle:'gi:baddy1',gunHandle:'gun:rpg:baddy1',reused:false});
const pickup=()=>({id:1,handle:'gun:rpg:baddy1',weapon:'rpg' as const,position:{x:1,y:2,z:3}});

describe('bounded detached model-transition delivery copies (not native lifecycle validation)',()=>{
 it('captures the fade sound position independently of drop position and ignores unknown payload getters',()=>{
  const position={x:11,y:12,z:13},raw:ReceiverModelTransition={kind:'detach',ordinal:1,prefix:prefix(),actorId:'a',giHandle:'gi:baddy1',gunHandle:'gun:rpg:baddy1',pickup:pickup(),fadeId:1,fadePositionWorld:position};
  Object.defineProperty(position,'metadata',{get:()=>{throw Error('unknown sound payload');},enumerable:true});
  const copied=copyReceiverModelTransitions([raw],bounds)[0];if(copied.kind!=='detach')throw Error('fixture kind');
  expect(copied.fadePositionWorld).toEqual({x:11,y:12,z:13});expect(copied.fadePositionWorld).not.toEqual(copied.pickup.position);expect(Object.isFrozen(copied.fadePositionWorld)).toBe(true);
  position.y=99;expect(copied.fadePositionWorld.y).toBe(12);
 });
 it('rejects missing or nonfinite fade sound positions before publication',()=>{
  const raw={kind:'detach' as const,ordinal:1,prefix:prefix(),actorId:'a',giHandle:'gi:baddy1',gunHandle:'gun:rpg:baddy1',pickup:pickup(),fadeId:1};
  for(const position of [undefined,{x:Infinity,y:0,z:0},{x:0,y:NaN,z:0}])expect(()=>copyReceiverModelTransitions([{...raw,fadePositionWorld:position} as ReceiverModelTransition],bounds)).toThrow('position');
 });
 it('preserves every known transition payload, receipt-to-callback labels and ordinal order',()=>{
  const events:ReceiverModelTransition[]=[born(),{kind:'gun-bound',ordinal:2,prefix:{kind:'callback',sceneGeneration:3,callback:5},actorId:'a',giHandle:'gi:baddy1',gunHandle:'gun:ak47:baddy1',previousGunHandle:'gun:rpg:baddy1',weapon:'rifle'},{kind:'detach',ordinal:3,prefix:{kind:'callback',sceneGeneration:3,callback:5},actorId:'a',giHandle:'gi:baddy1',gunHandle:'gun:rpg:baddy1',pickup:pickup(),fadeId:1,fadePositionWorld:{x:4,y:5,z:6}},{kind:'pickup-collected',ordinal:4,prefix:{kind:'callback',sceneGeneration:3,callback:5},pickup:pickup()},{kind:'corpse-retired',ordinal:5,prefix:{kind:'callback',sceneGeneration:3,callback:5},fadeId:1,giHandle:'gi:baddy1',terminalPose:{position:{x:5,y:6,z:7},yaw:.3,phase:3008,scale:.045,rotation:{x:0,y:0,z:0,w:1}}}];
  const copied=copyReceiverModelTransitions(events,bounds);expect(copied).toEqual(events);expect(copied).not.toBe(events);expect(copied.every((e,i)=>e!==events[i]&&Object.isFrozen(e)&&Object.isFrozen(e.prefix))).toBe(true);expect(copyReceiverModelTransitions([],bounds)).toEqual([]);
 });
 it('deeply detaches pickup/terminal quaternion snapshots from later owner mutation',()=>{
  const drop=pickup(),terminal={position:{x:1,y:2,z:3},yaw:.4,phase:3008,scale:1,rotation:{x:0,y:0,z:0,w:1}},raw:ReceiverModelTransition[]=[{kind:'pickup-collected',ordinal:1,prefix:prefix(),pickup:drop},{kind:'corpse-retired',ordinal:2,prefix:prefix(),fadeId:1,giHandle:'gi:baddy1',terminalPose:terminal}],copied=copyReceiverModelTransitions(raw,bounds),before=JSON.stringify(copied);drop.position.x=99;terminal.position.y=88;terminal.rotation.w=0;raw.length=0;expect(JSON.stringify(copied)).toBe(before);const collected=copied[0],retired=copied[1];if(collected.kind!=='pickup-collected'||retired.kind!=='corpse-retired')throw Error('fixture kind');expect(Object.isFrozen(collected.pickup.position)).toBe(true);expect(Object.isFrozen(retired.terminalPose.rotation)).toBe(true);
 });
 it('rejects oversized arrays before accessing entries or custom iterators',()=>{
  const oversized=new Array(257);let reads=0;Object.defineProperty(oversized,0,{get:()=>{reads++;throw Error('entry read');}});Object.defineProperty(oversized,Symbol.iterator,{get:()=>{reads++;throw Error('iterator read');}});expect(()=>copyReceiverModelTransitions(oversized,bounds)).toThrow('entry budget');expect(reads).toBe(0);
 });
 it('uses bounded indexed reads and known scalar fields without invoking arbitrary getters or iterators',()=>{
  const raw=[born()];Object.defineProperty(raw,Symbol.iterator,{get:()=>{throw Error('iterator must not run');}});Object.defineProperty(raw[0],'metadata',{get:()=>{throw Error('extra payload must not be copied');},enumerable:true});Object.defineProperty(raw[0].prefix,'metadata',{get:()=>{throw Error('extra prefix must not be copied');},enumerable:true});let actorReads=0;Object.defineProperty(raw[0],'actorId',{get:()=>++actorReads===1?'a':'changed'});const copied=copyReceiverModelTransitions(raw,bounds);expect(copied[0]).toMatchObject({actorId:'a'});expect(actorReads).toBe(1);expect('metadata' in copied[0]).toBe(false);expect('metadata' in copied[0].prefix).toBe(false);
 });
 it('rejects foreign life, stale/future receipt tick, out-of-window and decreasing callback labels',()=>{
  for(const changed of [{...prefix(),sceneGeneration:4},{...prefix(),tick:6},{...prefix(),tick:8},{...prefix(),callback:3},{...prefix(),callback:5},{...prefix(),callback:6},{kind:'callback' as const,sceneGeneration:3,callback:4}])expect(()=>copyReceiverModelTransitions([{...born(),prefix:changed}],bounds)).toThrow('prefix');
  expect(()=>copyReceiverModelTransitions([{...born(),prefix:{kind:'callback',sceneGeneration:3,callback:5}},{...born(),ordinal:2}],bounds)).toThrow('prefix');
 });
 it('rejects ordinal gaps, unknown kinds, malformed ownership and nonfinite terminal transforms',()=>{
  for(const changed of [{...born(),ordinal:0},{...born(),ordinal:2},{...born(),kind:'unknown'},{...born(),actorId:''},{...born(),reused:'yes'}])expect(()=>copyReceiverModelTransitions([changed as ReceiverModelTransition],bounds)).toThrow();
  for(const invalid of [{...pickup(),id:0},{...pickup(),weapon:'unknown'},{...pickup(),position:{x:Infinity,y:2,z:3}}])expect(()=>copyReceiverModelTransitions([{kind:'pickup-collected',ordinal:1,prefix:prefix(),pickup:invalid} as ReceiverModelTransition],bounds)).toThrow();
  expect(()=>copyReceiverModelTransitions([{kind:'detach',ordinal:1,prefix:prefix(),actorId:'a',giHandle:'gi:baddy1',gunHandle:'gun:ak47:baddy1',pickup:pickup(),fadeId:1,fadePositionWorld:{x:4,y:5,z:6}}],bounds)).toThrow();
  for(const terminalPose of [{position:{x:0,y:0,z:0},yaw:0,phase:-1,scale:1},{position:{x:0,y:0,z:0},yaw:0,phase:3008,scale:0},{position:{x:NaN,y:0,z:0},yaw:0,phase:3008,scale:1},{position:{x:0,y:0,z:0},yaw:0,phase:3008,scale:1,rotation:{x:0,y:0,z:0,w:2}}])expect(()=>copyReceiverModelTransitions([{kind:'corpse-retired',ordinal:1,prefix:prefix(),giHandle:'gi:baddy1',fadeId:1,terminalPose}],bounds)).toThrow();
 });
 it('accounts retained prefix-kind and identity text and rejects malformed named limits',()=>{
  const event=born(),exact='receipt'.length+'birth'.length+'a'.length+'gi:baddy1'.length+'gun:rpg:baddy1'.length;expect(copyReceiverModelTransitions([event],{...bounds,maxTextChars:exact})).toEqual([event]);expect(()=>copyReceiverModelTransitions([event],{...bounds,maxTextChars:exact-1})).toThrow('text budget');for(const invalid of [{...bounds,maxEntries:0},{...bounds,maxEntries:257},{...bounds,maxTextChars:65537},{...bounds,maxTextChars:NaN},{...bounds,minCallback:6},{...bounds,receiptTick:-1}])expect(()=>copyReceiverModelTransitions([],invalid)).toThrow('bounds');
 });
});
