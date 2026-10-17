import {describe,it,expect,vi} from 'vitest';
import {WeaponState,type WeaponId} from './weapons';
import type {ReceiverLoadoutCheckpoint} from '../shared/originalReceiverLoadoutWorld';
import type {ReceiverGunPhaseCheckpoint} from '../shared/originalReceiverGunPhase';
import {advanceOriginalReceiverGunCallback} from '../shared/originalReceiverGunCallback';

const slots:WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const counts=(n:number)=>Object.fromEntries(slots.map(w=>[w,n])) as Record<WeaponId,number>;
const presence=()=>Object.fromEntries(slots.map(w=>[w,true])) as Record<WeaponId,boolean>;
function checkpoint(map:'barrack'|'woodlands'='barrack',callback=1):ReceiverLoadoutCheckpoint {
 return {prefix:{kind:'callback',sceneGeneration:4,callback},map,selected:'pistol',owned:presence(),ammo:{...counts(8),rifle:1},reserve:counts(30),refillTarget:8,counter:{waitgun:30,poldwaitgun:7},score:15,goldScore:10};
}
function actualGate(map:'barrack'|'woodlands'):ReceiverGunPhaseCheckpoint {
 const final=checkpoint(map),previous:ReceiverLoadoutCheckpoint={...final,prefix:{kind:'callback',sceneGeneration:4,callback:0},selected:'rifle',ammo:{...final.ammo,rifle:2},counter:{waitgun:map==='barrack'?2:0,poldwaitgun:0}};
 const result=advanceOriginalReceiverGunCallback(previous,{prefix:{kind:'callback',sceneGeneration:4,callback:1},held:{typing:false,reload:false,fire:true,digits:[true,false,false,false,false,false]},weaponModelPresent:presence()});
 expect(result.checkpoint.selected).toBe('pistol');expect(result.checkpoint.ammo.rifle).toBe(1);
 return {prefix:{kind:'callback',sceneGeneration:4,callback:1},phase:result.gunPhase};
}
function view(state:WeaponState){return {ammo:{...state.ammo},reserve:{...state.reserve},current:state.current,unarmed:state.unarmed,lastShot:state.lastShot,reloading:state.reloading,reloadEnd:state.reloadEnd,counter:state.originalCounterState,loadout:state.originalLoadoutCheckpoint,phase:state.originalGunPhaseCheckpoint};}

describe('owned WeaponState saved gun phase is observation, not permission',()=>{
 it.each(['barrack','woodlands'] as const)('%s keeps the actual old-rifle ready gate separate from final pistol/pickup state',map=>{
  const state=new WeaponState(map),final=checkpoint(map),gate=actualGate(map);state.adoptOriginalLoadout(final,10);state.adoptOriginalGunPhase(gate);
  expect(state.originalGunPhaseCheckpoint?.phase).toMatchObject({weapon:'rifle',bullets:2,ready:true});
  expect(state.current).toBe('pistol');expect(state.ammo.rifle).toBe(1);expect(state.ammo.pistol).toBe(8);
  // Independent final pickup/reload counter fixture must survive the earlier
  // saved gate, whose shot/choosegun was supplied by the actual pure helper.
  expect(state.originalCounterState).toEqual({waitgun:30,poldwaitgun:7,ready:false});expect(state.canFire(1000)).toBe(false);
  expect(state.originalLoadoutCheckpoint).toEqual(final);expect(state.originalGunPhaseCheckpoint?.phase?.counter).not.toEqual(final.counter);
 });
 it('copies matching/null phase metadata and does not read it as final selected-weapon readiness',()=>{
  const state=new WeaponState('barrack');state.adoptOriginalLoadout(checkpoint(),10);
  const raw=actualGate('barrack'),mutable={...raw,phase:{...raw.phase!,counter:{...raw.phase!.counter}}};state.adoptOriginalGunPhase(mutable);
  mutable.phase.bullets=999;mutable.phase.counter.waitgun=-999;expect(state.originalGunPhaseCheckpoint?.phase?.bullets).toBe(2);expect(state.originalGunPhaseCheckpoint?.phase?.counter.waitgun).not.toBe(-999);
  const captured=state.originalGunPhaseCheckpoint!;expect(Object.isFrozen(captured)).toBe(true);expect(Object.isFrozen(captured.phase)).toBe(true);expect(Object.isFrozen(captured.phase!.counter)).toBe(true);
  state.adoptOriginalGunPhase(raw);expect(state.originalGunPhaseCheckpoint).toEqual(captured);
  state.adoptOriginalGunPhase({prefix:raw.prefix,phase:null});expect(state.originalGunPhaseCheckpoint?.phase).toBeNull();expect(state.canFire(1000)).toBe(false);expect(state.originalCounterState).toEqual({waitgun:30,poldwaitgun:7,ready:false});
 });
 it('rejects stale/foreign/malformed gates atomically, including gate adoption without a callback loadout',()=>{
  const state=new WeaponState('barrack'),gate=actualGate('barrack');expect(()=>state.adoptOriginalGunPhase(gate)).toThrow(/stale|foreign/i);
  state.adoptOriginalLoadout(checkpoint(),10);state.adoptOriginalGunPhase(gate);const before=view(state);
  for(const prefix of [{...gate.prefix,sceneGeneration:5},{...gate.prefix,callback:0},{...gate.prefix,callback:2}])expect(()=>state.adoptOriginalGunPhase({...gate,prefix})).toThrow(/stale|foreign/i);
  expect(()=>state.adoptOriginalGunPhase({...gate,phase:{...gate.phase!,bullets:-1}})).toThrow();expect(view(state)).toEqual(before);
  state.adoptOriginalLoadout({...checkpoint(),prefix:{kind:'receipt',sceneGeneration:4,callback:1,tick:1}},11);expect(state.originalGunPhaseCheckpoint).toBeUndefined();expect(()=>state.adoptOriginalGunPhase(gate)).toThrow(/stale|foreign/i);
 });
 it('blocks every imperative count/counter/selection path while owned, including ready-counter injection and RPG spawn callback',()=>{
  const state=new WeaponState('barrack');state.lastShot=3;state.reloading=true;state.reloadEnd=99;state.adoptOriginalLoadout(checkpoint(),10);state.adoptOriginalGunPhase(actualGate('barrack'));const before=view(state),spawn=vi.fn();
  state.applyOriginalCounter({waitgun:-1,poldwaitgun:0,ready:true},20);state.setOriginalTyping(true);state.shiftSourceClock(100);
  expect(state.stepSourceCounter(1000,{reload:true,inputEnabled:true})).toBe(false);expect(state.select('rpg')).toBe(false);expect(state.addReserve('rifle',100)).toBe(0);
  expect(state.canFire(1000)).toBe(false);expect(state.fire(1000,spawn)).toBe(false);expect(state.startReload(1000,true)).toBe(false);expect(state.startReload(1000)).toBe(false);expect(state.update(1000)).toBe(false);
  expect(spawn).not.toHaveBeenCalled();expect(view(state)).toEqual(before);
 });
 it('clears saved gate on each new valid loadout but preserves it when loadout validation fails',()=>{
  const state=new WeaponState('barrack');state.adoptOriginalLoadout(checkpoint(),10);state.adoptOriginalGunPhase(actualGate('barrack'));const before=view(state);
  expect(()=>state.adoptOriginalLoadout(checkpoint('woodlands'),11)).toThrow();expect(view(state)).toEqual(before);
  state.adoptOriginalLoadout(checkpoint('barrack',2),11);expect(state.originalGunPhaseCheckpoint).toBeUndefined();expect(()=>state.adoptOriginalGunPhase(actualGate('barrack'))).toThrow(/stale|foreign/i);
  state.adoptOriginalGunPhase({prefix:{kind:'callback',sceneGeneration:4,callback:2},phase:null});state.adoptOriginalLoadout(checkpoint('barrack',2),11);expect(state.originalGunPhaseCheckpoint).toBeUndefined();
 });
 it('reset releases ownership and restores ordinary source counter, selection, reserve and fire behavior',()=>{
  const state=new WeaponState('barrack');state.adoptOriginalLoadout(checkpoint(),10);state.adoptOriginalGunPhase(actualGate('barrack'));state.reset();
  expect(state.originalLoadoutCheckpoint).toBeUndefined();expect(state.originalGunPhaseCheckpoint).toBeUndefined();expect(state.current).toBe('launcher');expect(state.select('rifle')).toBe(true);
  const stock=state.reserve.rifle;expect(state.addReserve('rifle',2)).toBe(2);expect(state.reserve.rifle).toBe(stock+2);
  state.applyOriginalCounter({waitgun:-1,poldwaitgun:0,ready:true},20);expect(state.canFire(20)).toBe(true);const ammo=state.ammo.rifle;expect(state.fire(20)).toBe(true);expect(state.ammo.rifle).toBe(ammo-1);
 });
});
