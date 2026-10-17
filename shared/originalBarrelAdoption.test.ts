import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {registerOriginalMapRuntime} from './originalMapRuntime';
import {OriginalBarrelWorld} from './originalBarrelWorld';
import type {OriginalSceneData} from './originalSceneGeometry';
const runtime=(map:'barrack'|'woodlands'='barrack')=>registerOriginalMapRuntime(map,JSON.parse(readFileSync(new URL(`../public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,import.meta.url),'utf8')) as OriginalSceneData);
const point=(x=0,y=0,z=0)=>({x,y,z});
const moved=(world:OriginalBarrelWorld)=>{const candidate=world.fork(),packet=candidate.snapshots();packet[0].position=point(100,50,100);packet[0].velocity=point(1,2,3);candidate.applySnapshots(packet);return candidate;};
describe('private barrel fork adoption',()=>{
 it('publishes real moved Barrack models, rays and support only at commit without stepping physics',()=>{
  const world=new OriginalBarrelWorld(runtime()),before=world.snapshots(),candidate=moved(world);
  const hit=candidate.raycast(point(95,50.6,100),point(1),10),top=candidate.playerSupportHeightAt(100,100,100,.1,.2);
  expect(hit).not.toBeNull();expect(top).toBeGreaterThan(50);
  const stage=world.prepareAdopt(candidate);expect(world.snapshots()).toEqual(before);expect(world.raycast(point(95,50.6,100),point(1),10)).toBeNull();
  stage.commit();expect(world.snapshots()).toEqual(candidate.snapshots());expect(world.raycast(point(95,50.6,100),point(1),10)?.distance).toBeCloseTo(hit!.distance,12);expect(world.playerSupportHeightAt(100,100,100,.1,.2)).toBeCloseTo(top!,12);
  stage.commit();stage.rollback();expect(world.snapshots()).toEqual(candidate.snapshots());
 });
 it('adopts angular geometry and later removed bodies, invalidating a populated query cache',()=>{
  const world=new OriginalBarrelWorld(runtime()),candidate=moved(world),packet=candidate.snapshots();packet[0].orientation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};packet[0].angularVelocity=point(12,23,34);candidate.applySnapshots(packet);
  world.prepareAdopt(candidate).commit();expect(world.snapshots()[0].angularVelocity).toEqual(point(12,23,34));
  expect(world.raycast(point(95,50,100),point(1),10)?.distance).toBeCloseTo(candidate.raycast(point(95,50,100),point(1),10)!.distance,12);
  expect(world.playerSupportHeightAt(99.4,100,100,.05,.1)).toBeCloseTo(candidate.playerSupportHeightAt(99.4,100,100,.05,.1)!,12);
  const removed=world.fork();removed.applySnapshots([]);const stage=world.prepareAdopt(removed);expect(world.bodies).toHaveLength(1);stage.commit();expect(world.bodies).toEqual([]);expect(world.raycast(point(95,50,100),point(1),10)).toBeNull();expect(world.playerSupportHeightAt(99.4,100,100,.05,.1)).toBeUndefined();
 });
 it('rejects foreign, sibling, grandchild and manually seeded candidates without target mutation',()=>{
  const r=runtime(),world=new OriginalBarrelWorld(r),first=world.fork(),second=world.fork(),before=world.snapshots();
  for(const invalid of [new OriginalBarrelWorld(r),first.fork(),new OriginalBarrelWorld(r,world)])expect(()=>world.prepareAdopt(invalid)).toThrow();
  expect(()=>first.prepareAdopt(second)).toThrow();expect(()=>new OriginalBarrelWorld(runtime('woodlands'),world)).toThrow();expect(world.snapshots()).toEqual(before);
  world.prepareAdopt(first).rollback();
 });
 it.each(['position','velocity','orientation','angularVelocity'] as const)('rejects a fork made stale by a direct %s write before prepare',field=>{
  const world=new OriginalBarrelWorld(runtime()),candidate=world.fork(),body=world.bodies[0];
  if(field==='position')body.position.x+=1;else if(field==='velocity')body.velocity.x+=1;else if(field==='orientation')body.angular!.orientation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};else body.angular!.angularVelocity.x+=1;
  const changed=world.snapshots();expect(()=>world.prepareAdopt(candidate)).toThrow(/stale/);expect(world.snapshots()).toEqual(changed);
 });
 it('rejects method-stale forks even if reset restores identical scalars; rollback unlocks all guarded mutators',()=>{
  const world=new OriginalBarrelWorld(runtime()),old=world.fork();world.reset();expect(()=>world.prepareAdopt(old)).toThrow(/stale/);
  const candidate=moved(world),before=world.snapshots(),stage=world.prepareAdopt(candidate);
  expect(()=>world.reset()).toThrow(/prepared/);expect(()=>world.applySnapshots([])).toThrow(/prepared/);expect(()=>world.prepareAdopt(candidate)).toThrow(/prepared/);
  stage.rollback();stage.rollback();stage.commit();expect(world.snapshots()).toEqual(before);world.reset();world.applySnapshots(before);world.prepareAdopt(world.fork()).rollback();
 });
 it('detaches prepared data from later candidate writes and old target body/snapshot references',()=>{
  const world=new OriginalBarrelWorld(runtime()),oldBody=world.bodies[0],oldSnapshot=world.snapshots(),candidate=moved(world),candidateBody=candidate.bodies[0],prepared=candidate.snapshots(),stage=world.prepareAdopt(candidate);
  candidateBody.position.x=999;candidateBody.velocity.y=999;candidateBody.angular!.orientation={x:0,y:0,z:Math.SQRT1_2,w:Math.SQRT1_2};candidateBody.angular!.angularVelocity.z=999;candidate.applySnapshots([]);
  stage.commit();oldBody.position.x=777;oldBody.velocity.z=777;oldBody.angular!.angularVelocity.x=777;oldSnapshot[0].position.y=777;prepared[0].position.y=777;
  expect(world.snapshots()[0]).toMatchObject({position:point(100,50,100),velocity:point(1,2,3),orientation:{x:0,y:0,z:0,w:1},angularVelocity:point()});expect(world.bodies[0]).not.toBe(oldBody);expect(world.bodies[0]).not.toBe(candidateBody);
 });
 it('rejects invalid candidate IDs, nonfinite values and malformed angular state without locking the target',()=>{
  const world=new OriginalBarrelWorld(runtime()),before=world.snapshots();
  for(const mutate of [(c:OriginalBarrelWorld)=>{c.bodies[0].id='foreign';},(c:OriginalBarrelWorld)=>{c.bodies[0].position.x=Infinity;},(c:OriginalBarrelWorld)=>{c.bodies[0].velocity.y=NaN;},(c:OriginalBarrelWorld)=>{c.bodies[0].angular!.orientation.w=2;},(c:OriginalBarrelWorld)=>{c.bodies[0].angular!.angularVelocity.x=Infinity;},(c:OriginalBarrelWorld)=>{Object.assign(c.bodies[0].angular!,{centerOfMass:point(999)});},(c:OriginalBarrelWorld)=>{Object.assign(c.bodies[0].angular!,{inverseInertia:{...c.bodies[0].angular!.inverseInertia,xx:999}});},(c:OriginalBarrelWorld)=>{Object.assign(c.bodies[0].angular!,{inverseInertia:{}});},(c:OriginalBarrelWorld)=>{c.bodies[0].position.x=Number.MAX_VALUE;}]){
   const candidate=world.fork();mutate(candidate);expect(()=>world.prepareAdopt(candidate)).toThrow();expect(world.snapshots()).toEqual(before);
  }
  world.prepareAdopt(world.fork()).rollback();world.reset();
 });
 it('adopts the actual empty Woodland population without inventing blockers and invalidates competing forks',()=>{
  const world=new OriginalBarrelWorld(runtime('woodlands')),first=world.fork(),second=world.fork();world.prepareAdopt(first).commit();
  expect(world.snapshots()).toEqual([]);expect(world.raycast(point(),point(1),10)).toBeNull();expect(world.playerSupportHeightAt(0,0,10,.1,.2)).toBeUndefined();expect(()=>world.prepareAdopt(second)).toThrow(/stale/);world.prepareAdopt(world.fork()).rollback();
 });
});
