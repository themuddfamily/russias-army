import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from './originalMapRuntime';
import {OriginalSoloObserverWorlds,type OriginalSoloReceiverCurrentContext} from './originalSoloObserverWorld';
import {OriginalReceiverModelWorld,type ReceiverModelBackend} from './originalReceiverModelWorld';

let cached:OriginalMapRuntime|undefined;
function setup(){
 const runtime=cached??(cached=registerOriginalMapRuntime('woodlands',JSON.parse(readFileSync(new URL('../public/assets/original-scenes/woodland/scene.json',import.meta.url),'utf8'))));
 const captures:OriginalSoloReceiverCurrentContext[]=[];
 let captureHook:((context:OriginalSoloReceiverCurrentContext)=>void)|undefined;
 const pose=()=>({position:{x:0,y:0,z:0},yaw:0,phase:0,scale:1});
 // This controlled CPU oracle has no external models. It proves clock and
 // phase admission only, not complete native query coverage or grounding.
 const backend:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'fixture-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'fixture-gun'}),heldGunPose:()=>pose(),sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-clock-fixture'}})};
 const worlds=new OriginalSoloObserverWorlds(runtime,{createReceiverScene:context=>({scene:new OriginalReceiverModelWorld(backend,{sceneGeneration:context.lifeGeneration,eyeHeight:runtime.profile.eyeHeight,sourceScale:runtime.scale,goodyBspWorld:1,maxModels:64,maxPickups:16}),release:()=>{},captureCurrent:context=>{captures.push(context);captureHook?.(context);},drainOutcomes:()=>[]})});
 const register=(id:string,time=0)=>worlds.register({id,name:id,eye:{x:1000,y:1000,z:1000}},time);
 const physical=(time:number)=>worlds.physics(time,{skipIds:new Set(worlds.worlds.keys())});
 const cycle=(time:number)=>{physical(time);for(const world of worlds.worlds.values())worlds.goody(world.id);worlds.completeGoody(time);worlds.actors(time);};
 return {worlds,captures,register,physical,cycle,setHook:(hook:(context:OriginalSoloReceiverCurrentContext)=>void)=>{captureHook=hook;}};
}

describe('Solo capture physical admission and completed goody clocks',()=>{
 it('labels an initial idle death receipt as CURRENT zero without inventing completed controls',()=>{
  const f=setup();try{
   f.register('A');f.register('B');f.worlds.dispose('B');
   expect(f.captures).toHaveLength(1);expect(f.captures[0]).toMatchObject({id:'A',physicalCallback:0,mirrorCallback:0,receiptTick:0,phase:'idle',afterGoody:false,deliveryKind:'death',order:{receiptCallbacks:0,callbacks:0}});
   expect(f.worlds.worlds.get('A')?.receiptTick).toBe(1);expect(f.worlds.worlds.has('B')).toBe(false);
  }finally{f.worlds.clear();}
 });
 it('counts callbacks per life when a receiver joins an already running population',()=>{
  const f=setup();try{
   f.register('A');f.cycle(1/30);f.cycle(2/30);f.register('B',2/30);f.cycle(3/30);
   expect(f.captures.filter(c=>c.id==='A').at(-1)).toMatchObject({physicalCallback:3,mirrorCallback:2,order:{receiptCallbacks:2,callbacks:3},afterGoody:true});
   expect(f.captures.filter(c=>c.id==='B').at(-1)).toMatchObject({physicalCallback:1,mirrorCallback:0,receiptTick:0,order:{receiptCallbacks:0,callbacks:1},afterGoody:true});
  }finally{f.worlds.clear();}
 });
 it('does not claim controls completed after an internal goody callback throws',()=>{
  const f=setup();try{
   f.register('A');f.physical(1/30);
   expect(()=>f.worlds.goody('A',undefined,'source',()=>{throw Error('controls failed');})).toThrow('controls failed');
   expect(()=>f.worlds.completeGoody(1/30)).toThrow('Solo CURRENT goody not complete');
   expect(f.captures).toEqual([]);expect(f.worlds.worlds.get('A')?.callback).toBe(0);
  }finally{f.worlds.clear();}
 });
 it('exposes the physical/mirror gap during reentrant mid-goody death and lets a producer reject it',()=>{
  const f=setup();try{
   f.register('A');const b=f.register('B');f.physical(1/30);
   f.setHook(context=>{if(context.deliveryKind==='death'){expect(context).toMatchObject({id:'A',physicalCallback:1,mirrorCallback:0,afterGoody:false,phase:'physics',order:{receiptCallbacks:0,callbacks:0}});throw Error('unsupported midphysics CURRENT');}});
   f.worlds.goody('A',undefined,'source',()=>{expect(()=>f.worlds.dispose('B')).toThrow('unsupported midphysics CURRENT');return {grounded:false,jumped:false};});
   expect(f.worlds.worlds.get('B')).toBe(b);f.worlds.goody('B');f.worlds.completeGoody(1/30);
   expect(f.captures.filter(c=>c.deliveryKind==='where').map(c=>[c.id,c.afterGoody,c.physicalCallback])).toEqual([['A',true,1],['B',true,1]]);
  }finally{f.worlds.clear();}
 });
});
