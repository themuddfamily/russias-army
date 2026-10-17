import {describe,expect,it} from 'vitest';
import {OriginalLauncherPrediction,type OriginalLauncherPredictionStep} from './originalLauncherPrediction';
import {cloneOriginalAngularBody} from '../shared/originalAngularBody';
import {createOriginalProjectile,stepOriginalProjectile,ORIGINAL_COLLISION_CONTACT_DISTANCE,ORIGINAL_PROJECTILE_RADIUS,type OriginalProjectileState} from '../shared/originalExplosives';
import {createOriginalSceneGeometry} from '../shared/originalSceneGeometry';

const clone=(s:OriginalProjectileState):OriginalProjectileState=>({...s,position:{...s.position},velocity:{...s.velocity},direction:{...s.direction},...(s.angular?{angular:cloneOriginalAngularBody(s.angular)}:{})});
const seed=()=>createOriginalProjectile('launcher',{x:-0,y:2,z:0},{x:-0,y:-1,z:0},'owner');
function replay(s:OriginalProjectileState,n:number,step:OriginalLauncherPredictionStep){const p=clone(s);for(let i=0;i<n;i++)if(step(p).detonated)break;return p;}
function floor(y=0){
 const positions=[[-5,y,-5],[5,y,-5],[5,y,5],[-5,y,5]].map(([x,h,z])=>[x,-z,h]);
 return createOriginalSceneGeometry({nodes:[{name:'floor',resource:'floor',matrix:[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],parent:'World',visibility:1,shader:'default'}],meshes:[{resource:'floor',part:0,positions,faces:[[0,2,1],[0,3,2]],normals:[],tex_coords:[]}]},{scale:1});
}
const physical=(geometry:ReturnType<typeof floor>)=> (s:OriginalProjectileState)=>stepOriginalProjectile(s,{radius:ORIGINAL_PROJECTILE_RADIUS.launcher,sweep:(a,b,r)=>geometry.sweepSphere(a,b,r,ORIGINAL_COLLISION_CONTACT_DISTANCE),sweepConvex:(a,b,h,v)=>geometry.sweepConvex(a,b,h,ORIGINAL_COLLISION_CONTACT_DISTANCE,v)});

describe('launcher physical prediction prefixes',()=>{
 it('preserves exact source gravity/spin states for repeated, decreasing and extended requests',()=>{
  const s=seed();s.angular!.angularVelocity={x:31,y:-17,z:23};const before=clone(s),geometry=floor(),run=physical(geometry);let calls=0;
  const step:OriginalLauncherPredictionStep=p=>{calls++;return run(p);},cache=new OriginalLauncherPrediction();
  for(const frames of [0,2,2,1,4,3])expect(cache.predict(s,geometry,frames,step)).toStrictEqual(replay(s,frames,run));
  expect(calls).toBe(4);expect(s).toStrictEqual(before);expect(Object.is(cache.predict(s,geometry,0,step).position.x,-0)).toBe(true);
 });

 it('matches genuine finite-floor impacts and recomputes when the collision snapshot changes',()=>{
  const s=seed();s.position.y=.12;s.velocity.y=-2;const ground=floor(),raised=floor(.08),cache=new OriginalLauncherPrediction();let geometry=ground,calls=0,contacts=0;
  const step:OriginalLauncherPredictionStep=p=>{calls++;const result=physical(geometry)(p);contacts+=result.contacts;return result;};
  expect(cache.predict(s,ground,3,step)).toStrictEqual(replay(s,3,physical(ground)));expect(contacts).toBeGreaterThan(0);
  const priorCalls=calls;geometry=raised;
  expect(cache.predict(s,raised,3,step)).toStrictEqual(replay(s,3,physical(raised)));expect(calls-priorCalls).toBe(3);
 });

 it('invalidates on fresh authority seed and callback identity, even at the same requested count',()=>{
  const cache=new OriginalLauncherPrediction(),token={},first=seed();let calls=0;
  const step:OriginalLauncherPredictionStep=p=>{calls++;p.position.x+=p.velocity.x;p.remainingCallbacks--;return {detonated:false};};
  cache.predict(first,token,2,step);const fresh=seed();fresh.velocity.x=4;
  expect(cache.predict(fresh,token,2,step).position.x).toBe(8);expect(calls).toBe(4);
  const replacement:OriginalLauncherPredictionStep=p=>{calls++;p.velocity.z+=3;return {detonated:false};};
  expect(cache.predict(fresh,token,2,replacement).velocity.z).toBe(6);expect(calls).toBe(6);
  cache.clear();cache.predict(fresh,token,2,replacement);expect(calls).toBe(8);
 });

 it('detaches all mutable returned state from cached prefixes and authority state',()=>{
  const s=seed(),token={},cache=new OriginalLauncherPrediction(),step=physical(floor());const expected=replay(s,2,step),returned=cache.predict(s,token,2,step);
  returned.position.x=999;returned.velocity.y=999;returned.direction.z=999;returned.angular!.orientation.w=0;returned.angular!.angularVelocity.x=999;returned.remainingCallbacks=0;returned.hit=true;
  expect(cache.predict(s,token,2,step)).toStrictEqual(expected);expect(s.remainingCallbacks).toBe(60);expect(s.angular!.orientation.w).toBe(1);
  expect(cache.predict(s,token,2,step)).not.toBe(cache.predict(s,token,2,step));
 });

 it('retains exact real fuse termination and earlier states without executing later callbacks',()=>{
  const s=seed();s.remainingCallbacks=3;const geometry=floor(),run=physical(geometry),cache=new OriginalLauncherPrediction();let calls=0;
  const step:OriginalLauncherPredictionStep=p=>{calls++;return run(p);};
  expect(cache.predict(s,geometry,8,step)).toStrictEqual(replay(s,8,run));expect(calls).toBe(2);
  expect(cache.predict(s,geometry,1,step)).toStrictEqual(replay(s,1,run));expect(cache.predict(s,geometry,20,step)).toStrictEqual(replay(s,20,run));expect(calls).toBe(2);
 });

 it('does not commit a partially mutated endpoint when a callback throws',()=>{
  const cache=new OriginalLauncherPrediction(),s=seed(),token={};let fail=true;
  const step:OriginalLauncherPredictionStep=p=>{p.position.x+=1;if(fail)throw Error('callback interrupted');return {detonated:false};};
  expect(()=>cache.predict(s,token,1,step)).toThrow('callback interrupted');fail=false;
  expect(cache.predict(s,token,1,step).position.x).toBe(1);expect(cache.predict(s,token,0,step).position.x).toBe(-0);
 });

 it('rejects unsupported RPG, noninteger frames and missing collision tokens',()=>{
  const cache=new OriginalLauncherPrediction(),s=seed(),step:OriginalLauncherPredictionStep=()=>({detonated:false});
  for(const n of [-1,.5,NaN,Infinity])expect(()=>cache.predict(s,{},n,step)).toThrow('callback count');
  expect(()=>cache.predict(s,null as unknown as object,0,step)).toThrow('dependency');
  expect(()=>cache.predict(createOriginalProjectile('rpg',{x:0,y:2,z:0},{x:0,y:0,z:-1},'owner'),{},0,step)).toThrow('launcher seed');
 });
});
