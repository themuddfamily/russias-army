import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {installOriginalSoloLegacyFixture} from './originalSoloLegacy.fixture';
import {readFileSync} from 'node:fs';
import {registerOriginalMapRuntime} from '../shared/originalMapRuntime';
import {OriginalBarrelWorld} from '../shared/originalBarrelWorld';
import {WeaponState} from './weapons';
import {createOriginalPlayerHealth} from '../shared/originalPlayerHealth';
import {createOriginalBlast} from '../shared/originalExplosives';

const runtime=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync('public/assets/original-scenes/woodland/scene.json','utf8')));
function client(winter=false){
 const game=Object.create(Game.prototype) as any,camera=new THREE.PerspectiveCamera();camera.position.set(1000,1000,1000);

 Object.assign(game,{archivalWinter:winter,mapId:winter?'winter':'woodlands',originalActorDispatchGeneration:0,phase:'playing',playerAlive:true,health:100,sourceHealth:createOriginalPlayerHealth(),sourceHealthPrediction:[],sourceHealthAuthorityTime:-Infinity,
  armor:100,invulnerableUntil:1000,elapsed:0,mode:'solo',camera,velocity:new THREE.Vector3(),keys:new Set(),controlsPreset:'legacy',arrowMovement:false,chatOpen:false,
  yaw:0,pitch:0,recoil:0,weaponSwayX:0,weaponSwayY:0,weaponState:new WeaponState('woodlands'),firing:false,projectiles:[],enemies:[],originalBlasts:[],localCallsign:'Local goody',scene:new THREE.Scene(),arena:{runtime,barrelWorld:new OriginalBarrelWorld(runtime),pickups:[]},
  audio:{play:vi.fn(),playOriginalHurt:vi.fn()},updateHud:vi.fn(),showDamageDirection:vi.fn(),damageOpacity:0,killPlayer:vi.fn(),setLocalNetworkDead:vi.fn(),showNetworkDamage:vi.fn(),setMessage:vi.fn(),
  updateViewModelPresentation:vi.fn(),handledNetworkDamageEvents:new Set(),networkEffectCounts:{damageEvents:0},remotePlayers:new Map(),network:{clientId:'local'},
  snowTracks:{resetActor:vi.fn()},publishNetworkTransform:vi.fn(),syncWeaponPresentation:vi.fn(),nextSourceReloadPoll:-Infinity,score:0,distanceToWorld:()=>Infinity,
  reconcileNetworkItems:vi.fn(),reconcileNetworkProjectiles:vi.fn(),updateNetworkStatus:vi.fn(),playOriginalCombatSound:vi.fn(),createProjectileMesh:()=>new THREE.Mesh()});installOriginalSoloLegacyFixture(game);game.arena.barrelWorld.applySnapshots([]);return game;
}
/** Full private-world callbacks; repeated wall time intentionally selects a
 * supplied callback count, preserving these health-phase arithmetic fixtures. */
function goody(game:any){
 const worlds=game.ensureSoloWorlds();worlds.worlds.get('player').health=game.sourceHealth;
 game.updateOriginalPlayerCallback();game.completeSoloGoody();game.updateOriginalExplosives(true);
}
function blast(game:any){
 const worlds=game.ensureSoloWorlds(),admission=worlds.launch({ownerId:'player',weapon:'launcher',eye:game.camera.position,direction:{x:1,y:0,z:0}},game.elapsed);
 if(!admission.ok)throw Error(admission.reason);const human=worlds.worlds.get('player');
 const visual=game.projectiles.find((p:any)=>p.soloId===admission.launch.id);visual.mesh.removeFromParent();game.projectiles.splice(game.projectiles.indexOf(visual),1);human.projectiles.delete(admission.launch.id);
 const state=createOriginalBlast(game.camera.position,'player','launcher');human.blasts.set(admission.launch.id,{launch:admission.launch,state});game.originalBlasts.push(state);
}
function actors(game:any){
 const worlds=game.ensureSoloWorlds();worlds.physics(game.elapsed,{skipIds:new Set(['player'])});worlds.completeExternalGoody('player');worlds.completeGoody(game.elapsed);game.updateOriginalExplosives(true);
}
const source={kind:'hitscan',weapon:'pistol',zone:'body',shotId:'one',position:{x:0,y:1,z:0}} as const;
function damage(game:any,health:number,flick:2|-2,lethal:boolean,time=1000){game.handleNetworkEvent({type:'damaged',serverTime:time,data:{targetId:'local',attackerId:'remote',damage:12,health,sourceHealth:{canonical:health,flick},sourceHealthTime:time,lethal,source}});}
afterEach(()=>vi.unstubAllGlobals());
describe('actual Game recovered health arithmetic and phase',()=>{
 it('resolves self blast hurt and fades only on source goody callbacks',()=>{const g=client();g.yaw=-Math.PI/2;blast(g);actors(g);expect(g.sourceHurt).toEqual({blend:100,sourceAngle:-90});g.originalBlasts=[];g.soloWorlds.worlds.get('player').blasts.clear();for(let i=0;i<24;i++)goody(g);expect(g.sourceHurt.blend).toBe(4);goody(g);expect(g.sourceHurt.blend).toBe(0);expect(g.damageOpacity).toBe(0);expect(g.showDamageDirection).not.toHaveBeenCalled();});
 it('resolves online attackers and does not reset an overlay for an unknown attacker',()=>{const g=client();g.yaw=0;g.remotePlayers.set('remote',{group:{position:new THREE.Vector3(1001,998.28,1000)}});(Game.prototype as any).showNetworkDamage.call(g,{x:99,y:0,z:99},'remote');expect(g.sourceHurt).toEqual({blend:100,sourceAngle:-90});g.sourceHurt.blend=48;(Game.prototype as any).showNetworkDamage.call(g,{x:-99,y:0,z:99},'missing');expect(g.sourceHurt).toEqual({blend:48,sourceAngle:-90});expect(g.showDamageDirection).not.toHaveBeenCalled();});
 it('uses the recovered local hurt sample for online damage and keeps Winter generated audio',()=>{for(const winter of [false,true]){const g=client(winter);(Game.prototype as any).showNetworkDamage.call(g,{x:0,y:0,z:0});expect(g.audio.playOriginalHurt).toHaveBeenCalledTimes(winter?0:1);expect(g.audio.play).toHaveBeenCalledTimes(winter?1:0);}});
 it('takes immediate source damage directly through armor and spawn protection',()=>{const g=client();g.takeDamage(12,new THREE.Vector3());expect(g.health).toBe(88);expect(g.armor).toBe(100);expect(g.killPlayer).not.toHaveBeenCalled();expect(g.audio.playOriginalHurt).toHaveBeenCalledOnce();expect(g.audio.play).not.toHaveBeenCalled();});
 it('retains Winter spawn protection and armor absorption',()=>{const g=client(true);g.takeDamage(12,new THREE.Vector3());expect(g.health).toBe(100);g.elapsed=1001;g.takeDamage(12,new THREE.Vector3());expect(g.health).toBeCloseTo(94.6);expect(g.armor).toBeCloseTo(93.4);});
 it('flips exactly once at the end of goody before the gun, even while typing',()=>{const g=client();g.chatOpen=true;goody(g);expect(g.sourceHealth).toEqual({canonical:100,flick:-2});goody(g);expect(g.sourceHealth).toEqual({canonical:100,flick:2});g.chatOpen=false;g.firing=true;g.weaponState.originalCounterState;g.tryFire=vi.fn(()=>expect(g.sourceHealth.flick).toBe(-2));g.weaponState.stepSourceCounter=vi.fn();Object.defineProperty(g.weaponState,'originalCounterState',{get:()=>({ready:true})});g.nextSourceReloadPoll=0;g.updateSourceWeaponInput(()=>goody(g));expect(g.tryFire).toHaveBeenCalledOnce();});
 it('retains the positive-phase negative alive boundary and kills only below it',()=>{const g=client();g.takeDamage(104,new THREE.Vector3());expect(g.health).toBe(-4);expect(g.killPlayer).not.toHaveBeenCalled();g.takeDamage(.01,new THREE.Vector3());expect(g.killPlayer).toHaveBeenCalledOnce();});
 it('accepts H4 in the negative phase and does not kill merely on a flick flip',()=>{const g=client();g.sourceHealth=createOriginalPlayerHealth(5,-2);g.health=5;g.takeDamage(1,new THREE.Vector3());expect(g.health).toBe(4);expect(g.killPlayer).not.toHaveBeenCalled();g.sourceHealth=createOriginalPlayerHealth(0,2);g.health=0;goody(g);expect(g.sourceHealth.flick).toBe(-2);expect(g.killPlayer).not.toHaveBeenCalled();g.takeDamage(1,new THREE.Vector3());expect(g.killPlayer).toHaveBeenCalledOnce();});
 it('routes all sixteen five-point source blast callbacks after goody without armor or immunity',()=>{const g=client();blast(g);for(let i=0;i<16;i++)goody(g);expect(g.health).toBe(20);expect(g.armor).toBe(100);expect(g.sourceHealth.flick).toBe(2);expect(g.originalBlasts).toHaveLength(0);expect(g.audio.playOriginalHurt).toHaveBeenCalledTimes(16);expect(g.audio.play).not.toHaveBeenCalled();});
 it('uses the explicit source lethal result instead of signed health for online events',()=>{const g=client();damage(g,-4,2,false);expect(g.health).toBe(-4);expect(g.playerAlive).toBe(true);expect(g.setLocalNetworkDead).not.toHaveBeenCalled();damage(g,3,-2,true,1034);expect(g.setLocalNetworkDead).toHaveBeenCalledOnce();});
 it('restores authority then replays only pending flicks, without applying damage twice',()=>{const g=client();g.sourceHealthPrediction=[1000,1034,1067];damage(g,88,2,false,1034);expect(g.sourceHealth).toEqual({canonical:88,flick:-2});expect(g.sourceHealthPrediction).toEqual([1067]);damage(g,88,2,false,1034);expect(g.health).toBe(88);expect(g.sourceHealth.flick).toBe(-2);g.restoreOriginalHealth({canonical:100,flick:2},1000);expect(g.health).toBe(88);expect(g.sourceHealth.flick).toBe(-2);});
 it('preserves signed living health and phase across a fresh authoritative reconnect',()=>{const g=client();vi.stubGlobal('document',{getElementById:()=>({classList:{toggle:vi.fn()}})});g.sourceHealthPrediction=[1234];g.needsAuthoritativeSpawn=true;g.applyAuthoritativeSpawn({health:-4,sourceHealth:{canonical:-4,flick:2},armor:0,alive:true,transform:{position:{x:2,y:0,z:3},velocity:{x:0,y:0,z:0},yaw:0,pitch:0,grounded:true,weapon:'rifle'}},false);expect(g.health).toBe(-4);expect(g.sourceHealth).toEqual({canonical:-4,flick:2});expect(g.sourceHealthPrediction).toEqual([]);expect(g.playerAlive).toBe(true);expect(g.setMessage).not.toHaveBeenCalled();});
 it('consumes an explicitly supplied health pickup for uncapped twenty and score five',()=>{const g=client();g.health=110;g.sourceHealth=createOriginalPlayerHealth(110,-2);const mesh=new THREE.Mesh();mesh.position.copy(g.camera.position).add(new THREE.Vector3(0,-1.72,0));g.arena.pickups=[{type:'health',mesh,active:true,respawnAt:0}];g.collectPickups();expect(g.health).toBe(130);expect(g.sourceHealth.flick).toBe(-2);expect(g.score).toBe(5);expect(g.arena.pickups[0].active).toBe(false);expect(g.arena.pickups[0].respawnAt).toBe(Infinity);});
 it('restores snapshot health at its health epoch even when the physics epoch is different',()=>{const g=client();g.sourceHealthPrediction=[1034,1067];g.applyNetworkSnapshot({map:'woodlands',serverTime:1100,sourcePhysicsTime:1000,sourceHealthTime:1034,players:[{id:'local',health:-4,sourceHealth:{canonical:-4,flick:2},alive:true,frags:0,deaths:0,transform:{}}],projectiles:[]});expect(g.health).toBe(-4);expect(g.sourceHealth.flick).toBe(-2);expect(g.sourceHealthPrediction).toEqual([1067]);expect(g.playerAlive).toBe(true);});
});
