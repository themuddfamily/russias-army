import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {createOriginalSoloCurrentSceneLease} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,isOriginalSoloPhysicalPuffContext,type OriginalSoloPhysicalPuffContext,type OriginalSoloReceiverCurrentContext,type OriginalSoloReceiverSceneLease,type OriginalSoloEvent} from './originalSoloObserverWorld';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {originalPlayerEye} from './originalPlayerPhysics';
import type {ReceiverModelPose} from './originalReceiverModelWorld';

let cached:OriginalMapRuntime|undefined;
const runtime=()=>cached??=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8')));
// Explicit CPU renderer/oracle inputs. These tests prove the actual producer
// and coordinator admission boundary, not native flight or scene completeness.
function fixture(){
 const pose:ReceiverModelPose={position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}};
 const flags={failClone:false,rollbackInside:false,releaseInside:false,checkForgery:false};
 const counts={goody:0,samples:0,queries:0,releases:0},clones:string[]=[],pointTargets:{x:number;y:number;z:number}[]=[],contexts:OriginalSoloPhysicalPuffContext[]=[],currents:OriginalSoloReceiverCurrentContext[]=[],events:OriginalSoloEvent[]=[];
 let lease:OriginalSoloReceiverSceneLease;
 const worlds=new OriginalSoloObserverWorlds(runtime(),{samplePuffRandom36:()=>{counts.samples++;return 18;},onEvent:event=>events.push(event),createReceiverScene:()=>{
  lease=createOriginalSoloCurrentSceneLease({sourceScale:runtime().scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:32,maxOutcomes:32,maxModels:128,maxTextChars:65536},controller:{model:{eyeHeight:runtime().profile.eyeHeight,goodyBspWorld:runtime().scale*50,maxModels:128,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64,transientState:true},
   createBackends:()=>({model:{cloneGI:()=>({pose,geometryProvenance:'declared-GI'}),cloneGun:()=>({pose,geometryProvenance:'declared-gun'}),heldGunPose:()=>pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>{counts.queries++;return {hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-oracle'}};}},transient:{clonePlane:name=>{clones.push(name);if(flags.failClone)throw Error('physical puff constructor failed');return {pose,geometryProvenance:'declared-plane',inWorld:true};},cloneMuzzle:()=>({pose,geometryProvenance:'declared-muzzle',inWorld:true}),pointAt:(_pose,target)=>{pointTargets.push({...target});return pose.rotation!;},selfRotate:q=>q},release:()=>{counts.releases++;}}),
   goodyAt:context=>{counts.goody++;return {eyePosition:originalPlayerEye(context.body),modelPosition:{x:101,y:102,z:103},bspWorld:runtime().scale*50,weapon:context.weapon??'rifle'};},snapshotAt:prefix=>({prefix,models:[],missing:[],provenance:'declared-empty-oracle'})});
  const original=lease;
  return {...original,captureCurrent:context=>{currents.push(context);return original.captureCurrent!(context);},preparePhysicalPuff:context=>{
   contexts.push(context);expect(isOriginalSoloPhysicalPuffContext(context)).toBe(true);
   if(flags.checkForgery){expect(()=>original.preparePhysicalPuff!({...context})).toThrow('boundary');expect(isOriginalSoloPhysicalPuffContext({...context})).toBe(false);}
   let stage=original.preparePhysicalPuff!(context);
   if(flags.rollbackInside){expect(()=>original.captureCurrent!(currents.at(-1)!)).toThrow('transaction');stage.rollback();stage.rollback();stage=original.preparePhysicalPuff!(context);}
   if(flags.releaseInside)original.release();
   return stage;
  }};
 }});
 const world=worlds.register({id:'A',name:'Alpha',eye:{x:1000,y:1000,z:1000}});world.weapon='rifle';
 const launch=worlds.launch({ownerId:'A',weapon:'rpg',eye:originalPlayerEye(world.body),direction:{x:1,y:0,z:0}},0);if(!launch.ok)throw Error(launch.reason);
 const prepare=()=>{worlds.physics(0,{skipIds:new Set(['A'])});worlds.goody('A');worlds.completeGoody(0);};
 return {worlds,world,counts,flags,clones,pointTargets,contexts,events,prepare,get lease(){return lease!;}};
}
describe('CURRENT physical actor-stage puff lease delegation',()=>{
 it('uses the issued actual prefix and committed goody without another callback, receipt, query or goody read',()=>{
  const f=fixture();try{f.prepare();const before={callback:f.world.callback,tick:f.world.receiptTick,health:{...f.world.health},prefix:f.world.transientState!.prefix,goody:f.counts.goody,queries:f.counts.queries};f.events.length=0;f.flags.checkForgery=true;
   f.worlds.actors(0);expect(f.contexts).toHaveLength(1);const context=f.contexts[0];expect(context.prefix).toEqual(before.prefix);expect(context.event).toMatchObject({kind:'puff',angleSourceDegrees:180,position:context.projectile.state.position});
   expect(isOriginalSoloPhysicalPuffContext(context)).toBe(false);expect(f.world.callback).toBe(before.callback);expect(f.world.receiptTick).toBe(before.tick);expect(f.world.health).toEqual(before.health);expect(f.counts.goody).toBe(before.goody);expect(f.counts.queries).toBe(before.queries);expect(f.counts.samples).toBe(1);
   expect(f.world.transientState!.actors).toHaveLength(1);expect(f.world.transientState!.actors[0]).toMatchObject({kind:'puff',time:0});
   expect(f.pointTargets).toEqual([{x:101,y:102,z:103}]);expect(Object.isFrozen(context.event.position)).toBe(true);
   const publication=f.events.find(e=>e.kind==='transient-state');expect(publication?.kind==='transient-state'&&publication.checkpoint).toBe(f.world.transientState);
   expect(()=>f.lease.preparePhysicalPuff!(context)).toThrow('boundary');
  }finally{f.worlds.clear();}
 });
 it('rolls back constructor failure and retries the retained issued sample without stepping projectile or aging prior FX twice',()=>{
  const f=fixture();try{f.prepare();const before=f.world.transientState,projectile=[...f.world.projectiles.values()][0],remaining=projectile.state.remainingCallbacks,goody=f.counts.goody;f.events.length=0;f.flags.failClone=true;
   expect(()=>f.worlds.actors(0)).toThrow('physical puff constructor failed');expect(f.world.transientState).toBe(before);expect(projectile.state.remainingCallbacks).toBe(remaining);expect(f.events).toEqual([]);expect(f.counts.samples).toBe(1);const issued=f.contexts[0];
   f.flags.failClone=false;f.worlds.actors(0);expect(f.contexts[1]).toBe(issued);expect(f.counts.samples).toBe(1);expect(f.counts.goody).toBe(goody);expect(projectile.state.remainingCallbacks).toBe(remaining-1);expect(f.clones[1]).toBe(f.clones[0]);expect(f.world.transientState!.actors).toHaveLength(1);
  }finally{f.worlds.clear();}
 });
 it('supports explicit stage rollback and blocks CURRENT acquisition while the puff stage is open',()=>{
  const f=fixture();try{f.prepare();f.flags.rollbackInside=true;f.worlds.actors(0);expect(f.clones).toHaveLength(2);expect(f.clones[0]).toBe(f.clones[1]);expect(f.world.transientState!.actors).toHaveLength(1);expect(f.counts.samples).toBe(1);}finally{f.worlds.clear();}
 });
 it('publishes the terminal invocation puff before detonation and removes the actual projectile only afterwards',()=>{
  const f=fixture();try{f.prepare();const projectile=[...f.world.projectiles.values()][0];projectile.state.remainingCallbacks=1;f.events.length=0;f.worlds.actors(0);
   expect(f.events.map(e=>e.kind)).toEqual(['transient-state','detonated']);expect(f.world.projectiles.size).toBe(0);expect(f.world.blasts.size).toBe(1);expect(f.world.transientState!.actors[0].kind).toBe('puff');expect(f.counts.samples).toBe(1);
  }finally{f.worlds.clear();}
 });
 it('cancels an open physical stage on lease release without publishing its checkpoint',()=>{
  const f=fixture();try{f.prepare();const before=f.world.transientState;f.events.length=0;f.flags.releaseInside=true;expect(()=>f.worlds.actors(0)).toThrow('released');expect(f.world.transientState).toBe(before);expect(f.counts.releases).toBe(1);expect(f.events).toEqual([]);f.lease.release();expect(f.counts.releases).toBe(1);}finally{f.worlds.clear();}
 });
});
