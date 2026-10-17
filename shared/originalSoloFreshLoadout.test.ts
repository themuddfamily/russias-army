import {describe,it,expect} from 'vitest';
import {createOriginalSoloFreshLoadoutWorld,type OriginalSoloFreshLoadoutOptions} from './originalSoloFreshLoadout';
import {advanceOriginalReceiverGunCallback} from './originalReceiverGunCallback';

const presence=()=>({pistol:true,shotgun:true,rifle:true,launcher:true,rpg:true,sniper:true});
const options=(map:'barrack'|'woodlands'='barrack',sceneGeneration=4):OriginalSoloFreshLoadoutOptions=>({
 map,sceneGeneration,score:0,goldScore:0,weaponModelPresent:presence(),maxCommands:256,maxTextChars:65536,
});
describe('fresh source Solo loadout ownership',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} preserves constructor properties and the real first gun gate`,()=>{
   const bank=createOriginalSoloFreshLoadoutWorld(options(map)),seed=bank.freeze();
   expect(seed).toEqual({prefix:{kind:'callback',sceneGeneration:4,callback:0},map,selected:'launcher',owned:presence(),
    ammo:{pistol:8,shotgun:6,rifle:28,launcher:6,rpg:1,sniper:30},reserve:{pistol:54,shotgun:24,rifle:140,launcher:18,rpg:12,sniper:12},
    refillTarget:6,counter:{waitgun:map==='barrack'?10:0,poldwaitgun:0},score:0,goldScore:0});
   const result=advanceOriginalReceiverGunCallback(seed,{prefix:{kind:'callback',sceneGeneration:4,callback:1},
    held:{typing:false,reload:false,fire:true,digits:[false,false,false,false,false,false]},weaponModelPresent:bank.freezeWeaponModelPresence()});
   expect(result.gunPhase).toMatchObject({weapon:'launcher',ready:true,bullets:6});
   expect(result.intents.filter(i=>i.kind==='fire')).toMatchObject([{weapon:'launcher',action:'grenade-constructor',savedAmmo:6}]);
   const tx=bank.begin();tx.advanceCallback(result.checkpoint.prefix);tx.capture(result.checkpoint);tx.commit();
   expect(bank.freeze().ammo.launcher).toBe(5);expect(seed.ammo.launcher).toBe(6);
   expect(bank.freeze().counter).toEqual({waitgun:map==='barrack'?0:10,poldwaitgun:0});
   bank.release();
  });
  it(`${map} allocates independent replacement lives and rolls back partial work`,()=>{
   const old=createOriginalSoloFreshLoadoutWorld(options(map)),other=createOriginalSoloFreshLoadoutWorld(options(map,5));
   const tx=old.begin();tx.addScore(7);tx.rollback();expect(old.freeze().score).toBe(0);
   const committed=old.begin();committed.addScore(7);committed.commit();expect(old.freeze().score).toBe(7);
   old.release();expect(()=>old.freeze()).toThrow('released');
   const replacement=createOriginalSoloFreshLoadoutWorld(options(map,6));
   expect(replacement.freeze()).toMatchObject({prefix:{sceneGeneration:6,callback:0},score:0,goldScore:0,ammo:{launcher:6}});
   expect(other.freeze()).toMatchObject({prefix:{sceneGeneration:5,callback:0},score:0,goldScore:0,ammo:{launcher:6}});
   other.release();replacement.release();
  });
 }
 it('keeps explicit session scores and model presence detached from caller mutation',()=>{
  const input={...options(),score:21,goldScore:12.75,weaponModelPresent:{...presence(),sniper:false}};
  const bank=createOriginalSoloFreshLoadoutWorld(input);input.weaponModelPresent.sniper=true;input.score=0;
  expect(bank.freeze()).toMatchObject({score:21,goldScore:12.75,owned:{sniper:true},ammo:{sniper:30}});
  expect(bank.freezeWeaponModelPresence().sniper).toBe(false);
  expect(Object.isFrozen(bank.freeze().owned)).toBe(true);bank.release();
 });
 it('rejects a missing initial RG6 model instead of inventing its chamber target',()=>{
  expect(()=>createOriginalSoloFreshLoadoutWorld({...options(),weaponModelPresent:{...presence(),launcher:false}})).toThrow('launcher model');
 });
 it('rejects incomplete model presence and missing explicit scores',()=>{
  expect(()=>createOriginalSoloFreshLoadoutWorld({...options(),weaponModelPresent:{...presence(),pistol:undefined} as never})).toThrow('model presence');
  expect(()=>createOriginalSoloFreshLoadoutWorld({...options(),score:undefined as never})).toThrow('options');
  expect(()=>createOriginalSoloFreshLoadoutWorld({...options(),goldScore:undefined as never})).toThrow('options');
 });
 it('validates maps, generation and budgets before reading model slots',()=>{
  const poison=new Proxy(presence(),{get:()=>{throw Error('model slots read before validation');}});
  const invalid=[{map:'winter'},{sceneGeneration:-1},{sceneGeneration:1.5},{score:NaN},{goldScore:Infinity},{maxCommands:0},{maxTextChars:0}];
  for(const change of invalid)expect(()=>createOriginalSoloFreshLoadoutWorld({...options(),...change,weaponModelPresent:poison} as OriginalSoloFreshLoadoutOptions)).toThrow(/Invalid/);
 });
});
