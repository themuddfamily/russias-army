import {describe,it,expect} from 'vitest';
import {advanceOriginalReceiverGunCallback,type ReceiverGunCallbackResult,type ReceiverGunHeldInput} from './originalReceiverGunCallback';
import {captureOriginalReceiverGunOutputs,copyReceiverGunOutput,receiverGunOutputTextChars,type ReceiverGunOutput} from './originalReceiverGunOutput';
import type {ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import type {WeaponId} from './protocol';

const slots:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const waits:Record<WeaponId,number>={pistol:8,shotgun:15,rifle:2,launcher:10,rpg:10,sniper:50};
const targets:Record<WeaponId,number>={pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:28};
const models=Object.fromEntries(slots.map(id=>[id,true])) as Record<WeaponId,boolean>;
function step(map:'barrack'|'woodlands',weapon:WeaponId|null,held:Partial<ReceiverGunHeldInput>={}):ReceiverGunCallbackResult {
 const state:ReceiverLoadoutCheckpoint={prefix:{kind:'callback',sceneGeneration:3,callback:0},map,selected:weapon,owned:{...models},
  ammo:{pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:30},reserve:{pistol:54,shotgun:24,rifle:140,launcher:18,rpg:12,sniper:12},
  refillTarget:weapon?targets[weapon]:6,counter:{waitgun:map==='barrack'&&weapon?waits[weapon]:0,poldwaitgun:0},score:0,goldScore:0};
 return advanceOriginalReceiverGunCallback(state,{prefix:{kind:'callback',sceneGeneration:3,callback:1},weaponModelPresent:models,
  held:{typing:false,reload:false,fire:false,digits:[false,false,false,false,false,false],...held}});
}
const capture=(result:ReceiverGunCallbackResult,random3:readonly number[]=[],typing=false,shiftHeld=true)=>captureOriginalReceiverGunOutputs(result,{typing,shiftHeld,random3});
describe('bounded ordered source gun presentation capture',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} rifle retains sound after ray and source pitch/yaw degrees without a new debit`,()=>{
   const result=step(map,'rifle',{fire:true}),rows=capture(result,[3]);
   expect(rows.map(row=>row.output)).toEqual([
    {kind:'sound',weapon:'rifle',sound:'gunfire',channel:6},
    {kind:'look-kick',axis:'pitch',degrees:1},{kind:'look-kick',axis:'yaw',degrees:.5},
    {kind:'scope-frame',weapon:'rifle',typing:false,shiftHeld:true,sourceScopeEnabled:true},
   ]);
   expect(rows[0].intentIndex).toBeGreaterThan(result.intents.findIndex(intent=>intent.kind==='fire'));
   expect(result.checkpoint.ammo.rifle).toBe(27);expect(Object.isFrozen(rows)).toBe(true);
   expect(rows.every(row=>Object.isFrozen(row)&&Object.isFrozen(row.output))).toBe(true);
  });
  it(`${map} RPG records reload sound before constructor, without inventing its channel7 sound`,()=>{
   const result=step(map,'rpg',{fire:true}),rows=capture(result,[1]);
   expect(rows.map(row=>row.output)).toEqual([
    {kind:'sound',weapon:'rpg',sound:'rerg6',channel:6},
    {kind:'look-kick',axis:'pitch',degrees:1},{kind:'look-kick',axis:'yaw',degrees:-.5},
    {kind:'scope-frame',weapon:'rpg',typing:false,shiftHeld:true,sourceScopeEnabled:true},
   ]);
   expect(rows[0].intentIndex).toBeLessThan(result.intents.findIndex(intent=>intent.kind==='fire'));
   expect(result.checkpoint.ammo.rpg).toBe(0);
  });
  it(`${map} held reload emits literal sound but no kick or fire sound`,()=>{
   const result=step(map,'rifle',{reload:true,fire:true});
   expect(capture(result).map(row=>row.output)).toEqual([
    {kind:'sound',weapon:'rifle',sound:'reak47',channel:6},
    {kind:'scope-frame',weapon:'rifle',typing:false,shiftHeld:true,sourceScopeEnabled:true},
   ]);
   expect(result.gunPhase?.ready).toBe(false);
  });
  it(`${map} sniper poll precedes later pistol selection while terminal frame uses final slot`,()=>{
   const result=step(map,'sniper',{fire:true,digits:[true,false,false,false,false,false]}),rows=capture(result,[2]);
   expect(rows.map(row=>row.output)).toEqual([
    {kind:'scope-poll',weapon:'sniper',typing:false,shiftHeld:true,sourceScopeEnabled:true},
    {kind:'sound',weapon:'sniper',sound:'resniper',channel:6},
    {kind:'look-kick',axis:'pitch',degrees:2},{kind:'look-kick',axis:'pitch',degrees:1},
    {kind:'look-kick',axis:'yaw',degrees:0},{kind:'scope-frame',weapon:'pistol',typing:false,shiftHeld:true,sourceScopeEnabled:true},
   ]);
   expect(rows[0].intentIndex).toBeLessThan(result.intents.findIndex(intent=>intent.kind==='load-pose'&&intent.weapon==='pistol'));
   expect(rows.at(-1)?.intentIndex).toBe(result.intents.length);
  });
  it(`${map} SPAS two rays produce one sound and ordered six-plus-one pitch kicks`,()=>{
   const result=step(map,'shotgun',{fire:true}),rows=capture(result,[2]);
   expect(result.intents.find(intent=>intent.kind==='fire')).toMatchObject({rayCoordinates:[[310,190],[330,210]]});
   expect(rows.map(row=>row.output)).toEqual([
    {kind:'sound',weapon:'shotgun',sound:'spas12wav',channel:6},
    {kind:'look-kick',axis:'pitch',degrees:6},{kind:'look-kick',axis:'pitch',degrees:1},
    {kind:'look-kick',axis:'yaw',degrees:0},{kind:'scope-frame',weapon:'shotgun',typing:false,shiftHeld:true,sourceScopeEnabled:true},
   ]);
   expect(rows[0].intentIndex).toBeLessThan(result.intents.findIndex(intent=>intent.kind==='fire'));
  });
  it(`${map} VOID/chat still supplies the captured terminal scope actor frame`,()=>{
   const result=step(map,null,{typing:true});
   expect(capture(result,[],true,false)).toEqual([{intentIndex:result.intents.length,output:{kind:'scope-frame',weapon:null,typing:true,shiftHeld:false,sourceScopeEnabled:true}}]);
  });
 }
 it('copies only known fields once and ignores unrelated getters',()=>{
  let reads=0;
  const raw={kind:'sound' as const,get weapon(){reads++;return 'rifle' as const;},sound:'gunfire' as const,channel:6 as const,
   get unrelated(){throw Error('Must not read');}};
  const copied=copyReceiverGunOutput(raw);
  expect(reads).toBe(1);expect(copied).toEqual({kind:'sound',weapon:'rifle',sound:'gunfire',channel:6});expect(Object.isFrozen(copied)).toBe(true);
  expect(receiverGunOutputTextChars(copied)).toBe(17);
 });
 it('detaches captured samples and held booleans and consumes no appended random sample',()=>{
  const result=step('barrack','rifle',{fire:true}),random=[3];let typingReads=0,shiftReads=0,sampleReads=0;
  Object.defineProperty(random,0,{get(){sampleReads++;random.push(1);return 3;}});
  const rows=captureOriginalReceiverGunOutputs(result,{get typing(){typingReads++;return false;},get shiftHeld(){shiftReads++;return true;},random3:random});
  expect([typingReads,shiftReads,sampleReads]).toEqual([1,1,1]);
  random[1]=2;expect(rows.find(row=>row.output.kind==='look-kick'&&row.output.axis==='yaw')?.output).toMatchObject({degrees:.5});
 });
 it('rejects missing, surplus, fractional and out-of-range random(3) samples',()=>{
  const fired=step('barrack','rifle',{fire:true}),quiet=step('barrack','rifle');
  for(const samples of [[],[1,2],[0],[4],[1.5],[NaN]])expect(()=>capture(fired,samples)).toThrow();
  expect(()=>capture(quiet,[1])).toThrow(/count mismatch/);
  const holes=new Array<number>(1);expect(()=>capture(fired,holes)).toThrow(/sample/);
 });
 it('preflights fixed count before any oversized intent or sample entry reads',()=>{
  const result=step('barrack','rifle');let reads=0;
  const intents=new Proxy(new Array(65),{get(target,key,receiver){if(key==='0')reads++;return Reflect.get(target,key,receiver);}});
  expect(()=>capture({...result,intents} as ReceiverGunCallbackResult)).toThrow(/count budget/);expect(reads).toBe(0);
  const random=new Proxy(new Array<number>(65),{get(target,key,receiver){if(key==='0')reads++;return Reflect.get(target,key,receiver);}});
  expect(()=>capture(result,random)).toThrow(/count budget/);expect(reads).toBe(0);
 });
 it('rejects foreign sound pairs, channels, axes, degree literals and text budgets',()=>{
  const bad:unknown[]=[{kind:'sound',weapon:'rpg',sound:'gunfire',channel:6},{kind:'sound',weapon:'pistol',sound:'reak47',channel:6},
   {kind:'sound',weapon:'rifle',sound:'gunfire',channel:7},{kind:'look-kick',axis:'yaw',degrees:1},
   {kind:'look-kick',axis:'pitch',degrees:.5},{kind:'scope-poll',weapon:'pistol',typing:false,shiftHeld:true},
   {kind:'scope-frame',weapon:undefined,typing:false,shiftHeld:true}];
  for(const raw of bad)expect(()=>copyReceiverGunOutput(raw as ReceiverGunOutput)).toThrow();
  expect(()=>copyReceiverGunOutput({kind:'sound',weapon:'rifle',sound:'gunfire',channel:6},16)).toThrow(/text budget/);
 });
 it('rejects mutated yaw rules and unknown semantic intents rather than inferring outcomes',()=>{
  const result=step('barrack','rifle',{fire:true});
  const changed={...result,intents:result.intents.map(intent=>intent.kind==='yaw-kick-request'?{...intent,sourceRandom:{...intent.sourceRandom,maximum:4}}:intent)};
  expect(()=>capture(changed as ReceiverGunCallbackResult,[2])).toThrow(/yaw rule/);
  expect(()=>capture({...result,intents:[{kind:'native-fire'}]} as unknown as ReceiverGunCallbackResult)).toThrow(/Unknown/);
 });
 it('supports64 bounded non-presentation intents plus a65th terminal frame',()=>{
  const result=step('barrack',null),intents=Array.from({length:64},()=>({kind:'rocket-remove' as const}));
  expect(capture({...result,intents})).toEqual([{intentIndex:64,output:{kind:'scope-frame',weapon:null,typing:false,shiftHeld:true,sourceScopeEnabled:true}}]);
 });
 it.each([true,false])('captures sourceScopeEnabled=%s for both ordered scope operations',sourceScopeEnabled=>{
  const result=step('woodlands','sniper'),rows=captureOriginalReceiverGunOutputs(result,{typing:false,shiftHeld:true,random3:[],sourceScopeEnabled});
  expect(rows.filter(row=>row.output.kind==='scope-poll'||row.output.kind==='scope-frame').map(row=>row.output)).toEqual([
   {kind:'scope-poll',weapon:'sniper',typing:false,shiftHeld:true,sourceScopeEnabled},
   {kind:'scope-frame',weapon:'sniper',typing:false,shiftHeld:true,sourceScopeEnabled},
  ]);
 });
 it('reads scope policy once and canonicalizes omitted legacy output',()=>{
  let reads=0;const result=step('woodlands','sniper'),rows=captureOriginalReceiverGunOutputs(result,{typing:false,shiftHeld:true,random3:[],get sourceScopeEnabled(){reads++;return false;}});
  expect(reads).toBe(1);expect(rows.every(row=>row.output.kind!=='scope-poll'&&row.output.kind!=='scope-frame'||row.output.sourceScopeEnabled===false)).toBe(true);
  const raw={kind:'scope-frame' as const,weapon:'sniper' as const,typing:false,shiftHeld:true,get sourceScopeEnabled(){reads++;return false;}};
  expect(copyReceiverGunOutput(raw)).toEqual({kind:'scope-frame',weapon:'sniper',typing:false,shiftHeld:true,sourceScopeEnabled:false});expect(reads).toBe(2);
  expect(copyReceiverGunOutput({kind:'scope-poll',weapon:'sniper',typing:false,shiftHeld:true})).toEqual({kind:'scope-poll',weapon:'sniper',typing:false,shiftHeld:true,sourceScopeEnabled:true});
 });
 it.each([undefined,null,0,'false'])('rejects present malformed scope policy %s',sourceScopeEnabled=>{
  const input={typing:false,shiftHeld:true,random3:[],sourceScopeEnabled} as unknown as Parameters<typeof captureOriginalReceiverGunOutputs>[1];
  expect(()=>captureOriginalReceiverGunOutputs(step('woodlands','sniper'),input)).toThrow('scope-enabled');
  expect(()=>copyReceiverGunOutput({kind:'scope-frame',weapon:'sniper',typing:false,shiftHeld:true,sourceScopeEnabled} as unknown as ReceiverGunOutput)).toThrow('scope-enabled');
 });
});
