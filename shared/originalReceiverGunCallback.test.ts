import {describe,it,expect} from 'vitest';
import {advanceOriginalReceiverGunCallback,type ReceiverGunHeldInput,type ReceiverGunSemanticIntent} from './originalReceiverGunCallback';
import type {ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import type {WeaponId} from './protocol';

const slots:readonly WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
// Independent literals from the preserved weaponry gun/pwaits handlers.
const waits:Record<WeaponId,number>={pistol:8,shotgun:15,rifle:2,launcher:10,rpg:10,sniper:50};
const targets:Record<WeaponId,number>={pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:28};
const present=Object.fromEntries(slots.map(id=>[id,true])) as Record<WeaponId,boolean>;
const blank:ReceiverGunHeldInput={typing:false,reload:false,fire:false,digits:[false,false,false,false,false,false]};
function seed(map:'barrack'|'woodlands',selected:WeaponId|null='launcher'):ReceiverLoadoutCheckpoint {
 return {prefix:{kind:'callback',sceneGeneration:7,callback:0},map,selected,owned:{...present},ammo:{pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:30},reserve:{pistol:54,shotgun:24,rifle:140,launcher:18,rpg:12,sniper:12},refillTarget:selected?targets[selected]:6,counter:{waitgun:map==='barrack'?10:0,poldwaitgun:0},score:0,goldScore:0};
}
function step(state:ReceiverLoadoutCheckpoint,held:Partial<ReceiverGunHeldInput>={},models=present){
 return advanceOriginalReceiverGunCallback(state,{prefix:{kind:'callback',sceneGeneration:state.prefix.sceneGeneration,callback:state.prefix.callback+1},held:{...blank,...held},weaponModelPresent:models});
}
const fires=(intents:readonly ReceiverGunSemanticIntent[])=>intents.filter((i):i is Extract<ReceiverGunSemanticIntent,{kind:'fire'}>=>i.kind==='fire');
describe('staged private receiver source gun callback',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} admits the constructor RG6 on the first callback without forced readiness`,()=>{
   const previous=seed(map),result=step(previous,{fire:true});
   expect(result.gunPhase?.ready).toBe(true);expect(fires(result.intents)).toMatchObject([{weapon:'launcher',savedAmmo:6,temporaryAmmo:6}]);
   expect(result.checkpoint.ammo.launcher).toBe(5);expect(previous.ammo.launcher).toBe(6);
  });
  for(const weapon of slots)it(`${map} ${weapon} matches the literal saved-delta/decrement schedule through80 held-fire callbacks`,()=>{
   let state=seed(map,weapon);state={...state,ammo:{...state.ammo,[weapon]:1000},reserve:{...state.reserve,[weapon]:0}};
   let wait=state.counter.waitgun,old=state.counter.poldwaitgun,ammo=1000;
   for(let callback=1;callback<=80;callback++){
    let ready:boolean;
    if(map==='woodlands'){wait--;ready=wait<1;}
    else{let delta=wait-old;if(delta>waits[weapon]*2){old=wait;delta=0;}else if(delta<=waits[weapon])wait++;ready=delta>=waits[weapon];}
    const gate={waitgun:wait,poldwaitgun:old};
    if(ready){
     if(map==='barrack'){wait=old;if(weapon==='rpg')old=wait+20;}
     else wait=waits[weapon];
     ammo--;
    }
    const result=step(state,{fire:true});
    expect(result.gunPhase).toMatchObject({weapon,ready,counter:gate});expect(fires(result.intents)).toHaveLength(ready?1:0);
    expect(result.checkpoint.counter).toEqual({waitgun:wait,poldwaitgun:old});expect(result.checkpoint.ammo[weapon]).toBe(ammo);state=result.checkpoint;
   }
  });
  it(`${map} held R repeatedly locks a full gun and prevents held fire`,()=>{
   let state=seed(map,'rifle');
   for(let n=0;n<40;n++){
    const result=step(state,{reload:true,fire:true});expect(fires(result.intents)).toEqual([]);expect(result.gunPhase?.ready).toBe(false);
    expect(result.checkpoint.ammo.rifle).toBe(28);expect(result.checkpoint.reserve.rifle).toBe(140);expect(result.intents.some(i=>i.kind==='load-pose')).toBe(true);state=result.checkpoint;
   }
  });
  it(`${map} fires the saved old slot before numeric selection and retains the gate's old weapon`,()=>{
   const result=step(seed(map),{fire:true,digits:[true,false,false,false,false,false]});
   expect(fires(result.intents)[0].weapon).toBe('launcher');expect(result.gunPhase?.weapon).toBe('launcher');expect(result.checkpoint.selected).toBe('pistol');
   expect(result.checkpoint.ammo.launcher).toBe(5);expect(result.checkpoint.ammo.pistol).toBe(8);
   expect(result.intents.findIndex(i=>i.kind==='fire')).toBeLessThan(result.intents.findIndex(i=>i.kind==='load-pose'&&i.weapon==='pistol'));
  });
  it(`${map} freezes selection during typing while preserving the edition counter difference`,()=>{
   const previous=seed(map),result=step(previous,{typing:true,reload:true,fire:true,digits:[true,false,false,false,false,false]});
   expect(result.gunPhase).toBeNull();expect(fires(result.intents)).toEqual([]);expect(result.checkpoint.selected).toBe('launcher');
   expect(result.checkpoint.counter).toEqual({waitgun:map==='woodlands'?-1:10,poldwaitgun:0});expect(result.checkpoint.ammo).toEqual(previous.ammo);
  });
  it(`${map} the first pressed unavailable numeric slot blocks later pressed slots`,()=>{
   const previous=seed(map),state={...previous,ammo:{...previous.ammo,pistol:0},reserve:{...previous.reserve,pistol:0}};
   const result=step(state,{digits:[true,false,true,false,false,false]});expect(result.checkpoint.selected).toBe('launcher');expect(result.intents.some(i=>i.kind==='load-pose')).toBe(false);
  });
  it(`${map} reserve-only numeric selection assigns a load pose without transferring ammunition`,()=>{
   const previous=seed(map),state={...previous,ammo:{...previous.ammo,pistol:0}};
   const result=step(state,{digits:[true,false,false,false,false,false]});expect(result.checkpoint.selected).toBe('pistol');expect(result.checkpoint.ammo.pistol).toBe(0);expect(result.checkpoint.reserve.pistol).toBe(54);
   expect(result.intents.some(i=>i.kind==='load-pose'&&i.weapon==='pistol')).toBe(true);expect(result.intents.some(i=>i.kind==='reload')).toBe(false);
  });
  it(`${map} empty R chooses a loaded fallback and can fire it without creating a reload lock`,()=>{
   const previous=seed(map),state={...previous,ammo:{...previous.ammo,launcher:0},reserve:{...previous.reserve,launcher:0}};
   const result=step(state,{reload:true,fire:true});expect(result.gunPhase).toMatchObject({weapon:'pistol',bullets:8,ready:true});expect(fires(result.intents)[0].weapon).toBe('pistol');expect(result.checkpoint.ammo.pistol).toBe(7);
   expect(result.intents.some(i=>i.kind==='counter'&&i.reason==='reload')).toBe(false);
  });
  it(`${map} an empty ready RPG transfers stock but never fires its freshly filled chamber in the saved-empty branch`,()=>{
   const previous=seed(map,'rpg'),state={...previous,ammo:{...previous.ammo,rpg:0}};
   const result=step(state,{fire:true});expect(result.gunPhase).toMatchObject({weapon:'rpg',bullets:0,ready:true});expect(fires(result.intents)).toEqual([]);
   expect(result.checkpoint.ammo.rpg).toBe(1);expect(result.checkpoint.reserve.rpg).toBe(11);expect(result.intents.filter(i=>i.kind==='reload')).toHaveLength(2);
  });
  it(`${map} missing RPG model retains the stale target through temporary refill, constructor and saved overwrite`,()=>{
   const state={...seed(map,'rpg'),refillTarget:8},result=step(state,{fire:true},{...present,rpg:false});
   expect(fires(result.intents)).toMatchObject([{weapon:'rpg',savedAmmo:1,temporaryAmmo:8,temporaryReserve:5}]);
   expect(result.checkpoint.ammo.rpg).toBe(0);expect(result.checkpoint.reserve.rpg).toBe(5);expect(result.checkpoint.refillTarget).toBe(8);
   const reload=result.intents.findIndex(i=>i.kind==='reload'),fire=result.intents.findIndex(i=>i.kind==='fire'),overwrite=result.intents.findIndex(i=>i.kind==='ammo-overwrite');expect(reload).toBeLessThan(fire);expect(fire).toBeLessThan(overwrite);
   const shot=result.intents.findIndex(i=>i.kind==='counter'&&i.reason==='shot');if(map==='woodlands')expect(shot).toBeGreaterThan(fire);else expect(shot).toBeLessThan(reload);
  });
  it(`${map} initial VOID can rearm by numeric input without fabricating a gun gate`,()=>{
   const result=step(seed(map,null),{digits:[false,false,true,false,false,false]});expect(result.gunPhase).toBeNull();expect(result.checkpoint.selected).toBe('rifle');expect(result.checkpoint.refillTarget).toBe(28);
  });
  it(`${map} refunds the source over-target Dragunov chamber before applying its reload lock`,()=>{
   const result=step(seed(map,'sniper'),{reload:true});expect(result.checkpoint.ammo.sniper).toBe(28);expect(result.checkpoint.reserve.sniper).toBe(14);expect(fires(result.intents)).toEqual([]);
   const pose=result.intents.findIndex(i=>i.kind==='load-pose'),sound=result.intents.findIndex(i=>i.kind==='reload-sound'),counter=result.intents.findIndex(i=>i.kind==='counter'&&i.reason==='reload');expect(pose).toBeLessThan(sound);expect(sound).toBeLessThan(counter);
  });
  it(`${map} fails closed for the unestablished missing-property continuation after R reaches VOID`,()=>{
   const previous=seed(map),zero=Object.fromEntries(slots.map(id=>[id,0])) as Record<WeaponId,number>,state={...previous,ammo:{...zero},reserve:{...zero}};
   expect(()=>step(state,{reload:true})).toThrow(/VOID/);expect(state.selected).toBe('launcher');expect(state.counter).toEqual(previous.counter);
  });
 }
 it('requires a single next callback in the same scene life',()=>{
  const state=seed('barrack');for(const prefix of [{kind:'callback' as const,sceneGeneration:7,callback:2},{kind:'callback' as const,sceneGeneration:8,callback:1},{kind:'receipt' as const,sceneGeneration:7,callback:1,tick:1}])expect(()=>advanceOriginalReceiverGunCallback(state,{prefix,held:blank,weaponModelPresent:present})).toThrow();
 });
 it('freezes output without retaining mutable input count/digit aliases or performing scope/random work',()=>{
  const state=seed('woodlands','sniper'),result=step(state,{fire:true});expect(result.intents.some(i=>i.kind==='scope-poll')).toBe(true);expect(result.intents.some(i=>i.kind==='yaw-kick-request')).toBe(true);
  expect(result.intents.filter(i=>i.kind==='pitch-kick')).toEqual([{kind:'pitch-kick',degrees:2},{kind:'pitch-kick',degrees:1}]);expect(Object.isFrozen(result.checkpoint.ammo)).toBe(true);expect(Object.isFrozen(result.intents)).toBe(true);
 });
 it('rejects sparse physical digit levels instead of skipping their holes',()=>{
  const sparse=Array<boolean>(6) as unknown as ReceiverGunHeldInput['digits'];expect(()=>step(seed('barrack'),{digits:sparse})).toThrow();
 });
 it('captures counter scalars once and excludes unknown prefix payload getters',()=>{
  const state=seed('barrack'),reads:string[]=[];
  const counter={get waitgun(){reads.push('wait');return 10;},get poldwaitgun(){reads.push('old');return 0;}};
  const prefix={kind:'callback' as const,sceneGeneration:7,callback:1,get payload(){throw Error('Unexpected retained prefix payload');}};
  const result=advanceOriginalReceiverGunCallback({...state,counter},{prefix,held:blank,weaponModelPresent:present});expect(reads).toEqual(['wait','old']);expect(result.checkpoint.prefix).toEqual({kind:'callback',sceneGeneration:7,callback:1});
 });
 it.each(['pistol','shotgun','rifle','sniper'] as const)('%s preserves the recovered firing sound side of its ray action',weapon=>{
  const result=step({...seed('woodlands',weapon),counter:{waitgun:0,poldwaitgun:0}},{fire:true});
  const sound=result.intents.findIndex(i=>i.kind==='fire-sound'),ray=result.intents.findIndex(i=>i.kind==='fire');expect(sound).toBeGreaterThan(-1);if(weapon==='rifle')expect(sound).toBeGreaterThan(ray);else expect(sound).toBeLessThan(ray);
 });
});
