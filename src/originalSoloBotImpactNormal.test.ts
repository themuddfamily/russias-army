import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalCombatEffectResources,OriginalCombatEffectPresentation} from './originalCombatEffectPresentation';
import {createOriginalSceneGeometry,type OriginalSceneData} from '../shared/originalSceneGeometry';
import {ORIGINAL_PLAYER_EYE_OFFSET} from '../shared/originalPlayerPhysics';
import type {ArenaRayHit} from '../shared/arenaCollision';
import type {Vec3} from '../shared/protocol';

function fixture(map:'barrack'|'woodlands'='woodlands',modify?:(hit:ArenaRayHit)=>ArenaRayHit){
 const worldVertices=[[-4,-2,8],[4,-2,12],[4,6,12],[-4,6,8]],data:OriginalSceneData={nodes:[{name:'oblique-wall',resource:'wall',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],parent:'World',visibility:1,shader:'default'}],meshes:[{resource:'wall',part:0,positions:worldVertices.map(([x,y,z])=>[x,-z,y]),faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]}]},geometry=createOriginalSceneGeometry(data,{scale:1,cellSize:1}),ray=vi.fn((origin:Vec3,direction:Vec3,max:number,options:any)=>{const hit=geometry.raycast(origin,direction,max,options);return hit&&modify?modify(hit):hit;}),world={lifeGeneration:1,body:{id:'bot',position:{x:0,y:2-ORIGINAL_PLAYER_EYE_OFFSET,z:0},velocity:{x:0,y:0,z:0},supported:false}},worlds={worlds:new Map([['bot',world],['player',{...world,body:{...world.body,id:'player'}}]]),freezeRay:vi.fn(()=>ray),reportShots:vi.fn()},resources=createOriginalCombatEffectResources({spatter:new THREE.Texture(),decal:new THREE.Texture(),decalspas:new THREE.Texture(),pufft:new THREE.Texture()}),scene=new THREE.Scene(),effects=new OriginalCombatEffectPresentation(resources,scene),camera=new THREE.PerspectiveCamera();camera.position.set(0,2,20);
 const game=Object.assign(Object.create(Game.prototype),{mapId:map,mode:'solo',phase:'playing',archivalWinter:false,playerAlive:true,elapsed:1,tracerSequence:0,soloWorlds:worlds,ensureSoloWorlds:vi.fn(()=>worlds),camera,arena:{colliders:[],runtime:{geometry}},weaponState:{current:'rifle'},originalCombatEffectPresentation:effects,playOriginalCombatSound:vi.fn(),takeDamage:vi.fn(),distanceToWorld:vi.fn(()=>{throw Error('private ray must remain authoritative');}),combatEffects:{emitTracer:vi.fn()}}) as any,shooter={id:'bot',name:'Bot',weapon:'rifle',sourceTargets:new Map([['player',camera.position.clone()]])};
 const impact=vi.spyOn(game,'spawnImpact'),fallback=vi.spyOn(game,'surfaceNormalAt');
 // Three aim jitter draws are zero; the fourth is the existing chance roll.
 const roll=(chance=.99)=>vi.spyOn(Math,'random').mockReturnValue(chance).mockReturnValueOnce(.5).mockReturnValueOnce(.5).mockReturnValueOnce(.5);
 return {game,shooter,worlds,ray,impact,fallback,effects,roll,dispose(){effects.dispose();resources.dispose();}};
}
afterEach(()=>vi.restoreAllMocks());

// Real triangle intersection/normal and actual Game bot-impact routing. The
// small ray provider is an explicit private-world fixture, not complete map,
// contact solver, source shader/raster or hit-probability fidelity evidence.
describe('Solo bot miss retains its selected private geometry normal',()=>{
 it.each(['barrack','woodlands'] as const)('%s routes an oblique wall normal to the actual miss actor rather than the empty authored-collider fallback',map=>{
  const f=fixture(map),random=f.roll();try{f.game.combatantShoot(f.shooter,null,new THREE.Vector3(99,99,99),12);expect(f.worlds.freezeRay).toHaveBeenCalledOnce();expect(f.worlds.freezeRay).toHaveBeenCalledWith('bot');expect(f.ray).toHaveBeenCalledOnce();expect(f.ray.mock.calls[0][0]).toEqual(new THREE.Vector3(0,2,0));expect(f.ray.mock.calls[0][2]).toBe(48);expect(f.ray.mock.results[0].value).toMatchObject({id:'oblique-wall',distance:10});expect(f.impact).toHaveBeenCalledOnce();const [point,normal,count,scale,leaveMark]=f.impact.mock.calls[0] as [THREE.Vector3,THREE.Vector3,number,number,boolean];expect(point.toArray()).toEqual([0,2,10]);expect(normal.distanceTo(new THREE.Vector3(1,0,-2).normalize())).toBeLessThan(1e-12);expect([count,scale,leaveMark]).toEqual([4,.82,true]);expect(f.fallback).not.toHaveBeenCalled();expect(f.effects.getStats().miss).toBe(1);expect(f.worlds.reportShots).toHaveBeenCalledOnce();expect(f.worlds.reportShots).toHaveBeenCalledWith('bot',1);expect(f.game.tracerSequence).toBe(1);expect(f.game.takeDamage).not.toHaveBeenCalled();expect(f.game.distanceToWorld).not.toHaveBeenCalled();expect(random.mock.invocationCallOrder.filter(call=>call<f.impact.mock.invocationCallOrder[0])).toHaveLength(4);}finally{f.dispose();}
 });
 it('normalizes a finite nonunit geometry normal without mutating the selected hit or querying again',()=>{
  const f=fixture('woodlands',hit=>({...hit,normal:{x:hit.normal.x*7,y:hit.normal.y*7,z:hit.normal.z*7}}));f.roll();try{f.game.combatantShoot(f.shooter,null,new THREE.Vector3(),12);const selected=f.ray.mock.results[0].value!,normal=f.impact.mock.calls[0][1] as THREE.Vector3;expect(normal.length()).toBeCloseTo(1,12);expect(normal.distanceTo(new THREE.Vector3(1,0,-2).normalize())).toBeLessThan(1e-12);expect(Math.hypot(selected.normal.x,selected.normal.y,selected.normal.z)).toBeCloseTo(7,12);expect(f.ray).toHaveBeenCalledOnce();expect(f.fallback).not.toHaveBeenCalled();}finally{f.dispose();}
 });
 it.each(['zero-GI','missing','nonfinite','overflow'] as const)('keeps the existing empty-collider fallback for %s normals',kind=>{
  const f=fixture('woodlands',hit=>({...hit,id:'player',normal:kind==='missing'?undefined as unknown as ArenaRayHit['normal']:kind==='zero-GI'?{x:0,y:0,z:0}:kind==='nonfinite'?{x:NaN,y:0,z:1}:{x:1e308,y:0,z:1e308}}));f.roll();try{f.game.combatantShoot(f.shooter,null,new THREE.Vector3(),12);expect(f.fallback).toHaveBeenCalledOnce();expect((f.impact.mock.calls[0][1] as THREE.Vector3).distanceTo(new THREE.Vector3(0,0,-1))).toBeLessThan(1e-12);expect((f.impact.mock.calls[0][0] as THREE.Vector3).toArray()).toEqual([0,2,10]);expect(f.effects.getStats().miss).toBe(1);expect(f.ray).toHaveBeenCalledOnce();expect(f.worlds.reportShots).toHaveBeenCalledWith('bot',1);expect(f.game.takeDamage).not.toHaveBeenCalled();}finally{f.dispose();}
 });
 it('preserves the existing successful target chance path and its damage amount/origin without emitting a miss',()=>{
  const f=fixture('woodlands',hit=>({...hit,id:'player',normal:{x:0,y:0,z:0}}));f.roll(0);try{f.game.combatantShoot(f.shooter,null,new THREE.Vector3(99,99,99),12);expect(f.game.takeDamage).toHaveBeenCalledOnce();expect(f.game.takeDamage).toHaveBeenCalledWith(12,new THREE.Vector3(0,2,0),f.shooter);expect(f.impact).not.toHaveBeenCalled();expect(f.fallback).not.toHaveBeenCalled();expect(f.effects.size).toBe(0);expect(f.ray).toHaveBeenCalledOnce();expect(f.worlds.reportShots).toHaveBeenCalledWith('bot',1);expect(f.game.tracerSequence).toBe(1);}finally{f.dispose();}
 });
});
