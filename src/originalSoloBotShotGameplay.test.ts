import * as THREE from 'three';
import {describe,it,expect,vi,afterEach} from 'vitest';
import {Game} from './game';
import {isOriginalSoloBotShotCapture} from './originalSoloBotShotCapture';
import {ORIGINAL_PLAYER_EYE_OFFSET,originalPlayerEye} from '../shared/originalPlayerPhysics';
import type {WeaponId} from '../shared/protocol';
import type {OriginalSoloReceiverCurrentContext} from '../shared/originalSoloObserverWorld';

function fixture(weapon:WeaponId='rifle',map:'barrack'|'woodlands'='woodlands'){
 const owner={lifeGeneration:3,body:{id:'bot',position:{x:0,y:2-ORIGINAL_PLAYER_EYE_OFFSET,z:0},velocity:{x:0,y:0,z:0},supported:false}},target={lifeGeneration:5};
 const ray=vi.fn(()=>({id:'player',distance:20,normal:{x:0,y:0,z:-1}}));
 const worlds={worlds:new Map<string,any>([['bot',owner],['player',target]]),freezeRay:vi.fn(()=>ray),reportShots:vi.fn(),launch:vi.fn(()=>({ok:true})),actors:vi.fn()};
 const shooter={id:'bot',name:'Bot',weapon,sourceTargets:new Map([['player',new THREE.Vector3(0,2,20)]])};
 const game=Object.assign(Object.create(Game.prototype),{phase:'playing',playerAlive:true,elapsed:1,mapId:map,archivalWinter:false,tracerSequence:0,soloBotShotSequence:0,soloBotShots:[],soloWorlds:worlds,isSourceSolo:()=>true,ensureSoloWorlds:()=>worlds,takeDamage:vi.fn(),spawnImpact:vi.fn(),originalActorDispatchGeneration:0,originalActorDispatchActive:()=>false}) as any;
 const random=vi.spyOn(Math,'random').mockReturnValue(.01).mockReturnValueOnce(.5).mockReturnValueOnce(.5).mockReturnValueOnce(.5);
 return {game,worlds,owner,target,shooter,ray,random};
}
afterEach(()=>vi.restoreAllMocks());
function callbackContext(f:ReturnType<typeof fixture>):OriginalSoloReceiverCurrentContext {
 Object.assign(f.owner,{id:'bot',name:'Bot',alive:true,health:{canonical:100,flick:1},callback:0,receiptTick:0,updatedAt:2,barrels:{},projectiles:new Map(),blasts:new Map(),actorNames:new Map()});
 return {id:'bot',name:'Bot',observer:f.owner,target:f.owner,lifeGeneration:3,body:f.owner.body,health:(f.owner as any).health,alive:true,deliveryKind:'where',afterGoody:true,phase:'physics',mirrorCallback:0,physicalCallback:1,receiptTick:0,barrels:(f.owner as any).barrels,projectiles:(f.owner as any).projectiles,blasts:(f.owner as any).blasts,actorNames:(f.owner as any).actorNames,order:{callbacks:1,receiptCallbacks:0},time:2} as unknown as OriginalSoloReceiverCurrentContext;
}
describe('actual Game captures authored bot operands without human gun replay',()=>{
 it('reads issued queued requests without retiring or re-sampling them before commit',()=>{
  const f=fixture('rpg');f.game.combatantShoot(f.shooter,null,new THREE.Vector3(),31.125);const context=callbackContext(f),queued=f.game.soloBotShots[0],a=f.game.readSoloBotProjectileShots(context),b=f.game.readSoloBotProjectileShots(context);
  expect(Object.isFrozen(a)).toBe(true);expect(a).toEqual([queued]);expect(b[0]).toBe(queued);expect(f.game.soloBotShots).toEqual([queued]);expect(f.random).toHaveBeenCalledTimes(4);expect(f.worlds.launch).not.toHaveBeenCalled();
 });
 it('retires only exact committed issued requests and retains newer requests without a legacy duplicate launch',()=>{
  const f=fixture('rpg');f.game.combatantShoot(f.shooter,null,new THREE.Vector3(),31);const context=callbackContext(f),first=f.game.readSoloBotProjectileShots(context)[0];f.game.combatantShoot(f.shooter,null,new THREE.Vector3(),32);const second=f.game.soloBotShots[1];
  const checkpoint=Object.freeze({prefix:Object.freeze({kind:'callback' as const,sceneGeneration:3,callback:1}),shots:Object.freeze([first])});Object.assign(f.owner,{botProjectileCommit:checkpoint,botProjectileOwned:true,botProjectileSequence:1,callback:1});
  f.game.receiveSoloWorldEvent({kind:'bot-projectile-commit',recipientId:'bot',lifeGeneration:3,time:2,checkpoint});expect(f.game.soloBotShots).toEqual([second]);Object.assign(f.owner,{botProjectileCommit:undefined});f.game.completeSoloActors();expect(f.worlds.launch).not.toHaveBeenCalled();expect(f.game.soloBotShots).toEqual([second]);
  expect(f.game.readSoloBotProjectileShots({...context,mirrorCallback:1,physicalCallback:2,order:{callbacks:2,receiptCallbacks:1}})).toEqual([second]);
 });
 it('ignores foreign committed checkpoint identity and old owner-life delivery',()=>{
  const f=fixture('rpg');f.game.combatantShoot(f.shooter,null,new THREE.Vector3(),31);callbackContext(f);const shot=f.game.soloBotShots[0],checkpoint=Object.freeze({prefix:Object.freeze({kind:'callback' as const,sceneGeneration:3,callback:1}),shots:Object.freeze([shot])});Object.assign(f.owner,{botProjectileCommit:checkpoint});
  f.game.receiveSoloWorldEvent({kind:'bot-projectile-commit',recipientId:'bot',lifeGeneration:3,time:2,checkpoint:{...checkpoint}});f.game.receiveSoloWorldEvent({kind:'bot-projectile-commit',recipientId:'bot',lifeGeneration:2,time:2,checkpoint});expect(f.game.soloBotShots).toEqual([shot]);
 });
 it.each(['before-goody','receipt','foreign-owner','stale-callback'] as const)('rejects %s reads without consuming queued requests',kind=>{
  const f=fixture('rpg');f.game.combatantShoot(f.shooter,null,new THREE.Vector3(),31);const context=callbackContext(f),patch=kind==='before-goody'?{afterGoody:false}:kind==='receipt'?{deliveryKind:'death'}:kind==='foreign-owner'?{observer:{...f.owner}}:{mirrorCallback:1};expect(()=>f.game.readSoloBotProjectileShots({...context,...patch})).toThrow('context');expect(f.game.soloBotShots).toHaveLength(1);expect(f.worlds.launch).not.toHaveBeenCalled();
 });
 it('preflights request budget and issuer before inspecting unissued fields',()=>{
  const f=fixture('rpg'),context=callbackContext(f);let walked=0;const raw={get ownerId(){walked++;throw Error('unissued fields');}};f.game.soloBotShots=[raw];expect(()=>f.game.readSoloBotProjectileShots(context)).toThrow('trigger');expect(walked).toBe(0);f.game.soloBotShots=new Array(65);expect(()=>f.game.readSoloBotProjectileShots(context)).toThrow('budget');
 });
 it.each(['pistol','shotgun','rifle','sniper'] as const)('%s preserves immediate single-authority fractional damage and four source draws',weapon=>{
  const f=fixture(weapon);f.game.combatantShoot(f.shooter,null,new THREE.Vector3(99,99,99),12.375);
  expect(f.random).toHaveBeenCalledTimes(4);expect(f.ray).toHaveBeenCalledTimes(1);expect(f.game.takeDamage).toHaveBeenCalledExactlyOnceWith(12.375,new THREE.Vector3(0,2,0),f.shooter);expect(f.game.soloBotShotSequence).toBe(1);expect(f.game.soloBotShots).toEqual([]);expect(f.worlds.launch).not.toHaveBeenCalled();
 });
 it.each(['launcher','rpg'] as const)('%s captures a failed chance roll but constructs at the next goody eye',weapon=>{
  const f=fixture(weapon);f.random.mockReturnValue(.999);f.game.combatantShoot(f.shooter,null,new THREE.Vector3(99,99,99),31.125);
  expect(f.random).toHaveBeenCalledTimes(4);expect(f.ray).not.toHaveBeenCalled();expect(f.game.takeDamage).not.toHaveBeenCalled();const shot=f.game.soloBotShots[0];
  expect(isOriginalSoloBotShotCapture(shot)).toBe(true);expect(shot).toMatchObject({ownerId:'bot',ownerLife:3,targetId:'player',targetLife:5,sequence:1,capturedAt:1,authoredDamage:31.125,chanceRoll:.999});expect(shot.chanceRoll).toBeGreaterThan(shot.chance);expect(shot.sourceShotOrigin).toEqual({x:0,y:2,z:0});
  f.owner.body.position.x=4;f.target.lifeGeneration=6;f.game.elapsed=2;f.game.completeSoloActors();
  expect(f.worlds.launch).toHaveBeenCalledOnce();expect(f.worlds.launch.mock.calls[0]).toMatchObject([{ownerId:'bot',weapon,eye:originalPlayerEye(f.owner.body),direction:shot.aimDirection},2]);expect(f.game.soloBotShots).toEqual([]);expect(f.worlds.actors).toHaveBeenCalledExactlyOnceWith(2);expect(f.random).toHaveBeenCalledTimes(4);
 });
 it('discards a stale owner life without admitting its retained projectile request',()=>{
  const f=fixture('rpg');f.game.combatantShoot(f.shooter,null,new THREE.Vector3(),31);f.owner.lifeGeneration=4;f.game.completeSoloActors();expect(f.worlds.launch).not.toHaveBeenCalled();expect(f.game.soloBotShots).toEqual([]);
 });
 it('rejects a structural copy before admitting a queued projectile',()=>{
  const f=fixture('rpg');f.game.combatantShoot(f.shooter,null,new THREE.Vector3(),31);f.game.soloBotShots=[{...f.game.soloBotShots[0]}];expect(()=>f.game.completeSoloActors()).toThrow('Invalid Solo bot projectile capture');expect(f.worlds.launch).not.toHaveBeenCalled();expect(f.worlds.actors).not.toHaveBeenCalled();
 });
});
