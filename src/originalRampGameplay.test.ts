import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {describe,it,expect} from 'vitest';
import {Game} from './game';
import {WeaponState} from './weapons';
import {registerOriginalMapRuntime,type OriginalMapRuntime} from '../shared/originalMapRuntime';
import {originalNodeWorldMatrices,sourcePointToWorld,type OriginalSceneData} from '../shared/originalSceneGeometry';
import {ORIGINAL_SOURCE_SPAWNS} from '../shared/originalMapProfile';
import {ORIGINAL_PLAYER_DERIVATIVE_GRAVITY} from '../shared/originalPlayerPhysics';
import {ORIGINAL_COLLISION_CONTACT_DISTANCE} from '../shared/originalExplosives';

function runtime(map:'barrack'|'woodlands') {
 return registerOriginalMapRuntime(map,JSON.parse(readFileSync(`public/assets/original-scenes/${map==='barrack'?'barrack':'woodland'}/scene.json`,'utf8')) as OriginalSceneData);
}
function ramp(r:OriginalMapRuntime) {
 // The two preserved plinth faces form the broad inclined quad, rather than an authored ramp.
 const mesh=r.data.meshes.find(m=>m.resource==='plinths'&&m.part===0)!,matrix=originalNodeWorldMatrices(r.data).get('plinths')!;
 const points=[...new Set([...mesh.faces[12],...mesh.faces[34]])].map(i=>{
  const p=mesh.positions[i];return [matrix[0]*p[0]+matrix[4]*p[1]+matrix[8]*p[2]+matrix[12],matrix[1]*p[0]+matrix[5]*p[1]+matrix[9]*p[2]+matrix[13],matrix[2]*p[0]+matrix[6]*p[1]+matrix[10]*p[2]+matrix[14]];
 });
 const edge=(z:number)=>{const ps=points.filter(p=>p[2]===z);return ps[0].map((_,i)=>ps.reduce((sum,p)=>sum+p[i],0)/ps.length);};
 const low=edge(Math.min(...points.map(p=>p[2]))),high=edge(Math.max(...points.map(p=>p[2])));
 const start=sourcePointToWorld([low[0]-75,low[1],low[2]],r.scale),finish=sourcePointToWorld([high[0]+75,high[1],high[2]],r.scale);
 start.y=r.geometry.playerSupportHeightAt(start.x,start.z,start.y+1,r.profile.radius,r.profile.bodyHeight)!;
 finish.y=r.geometry.playerSupportHeightAt(finish.x,finish.z,finish.y+1,r.profile.radius,r.profile.bodyHeight)!;
 return {start,finish};
}
interface Client {camera:THREE.PerspectiveCamera;velocity:THREE.Vector3;keys:Set<string>;grounded:boolean;yaw:number;updateMovement(delta:number):void}
function client(r:OriginalMapRuntime,feet:{x:number;y:number;z:number},yaw:number):Client {
 const game=Object.create(Game.prototype) as Client,camera=new THREE.PerspectiveCamera();camera.position.set(feet.x,feet.y+r.profile.eyeHeight,feet.z);
 Object.assign(game,{camera,velocity:new THREE.Vector3(),keys:new Set(['KeyW']),grounded:true,yaw,pitch:0,controlsPreset:'legacy',arrowMovement:true,rightMouseAiming:false,chatOpen:false,archivalWinter:false,mode:'solo',playerAlive:true,projectiles:[],originalProjectileAccumulator:0,
  aiming:false,recoil:0,bob:0,stepDistance:0,weaponSwayX:0,weaponSwayY:0,weaponState:new WeaponState(r.map),weaponMetadata:new Map(),audio:{play(){}},
  arena:{runtime:r,colliders:[],supportHeightAt:(x:number,z:number,max:number)=>r.geometry.playerSupportHeightAt(x,z,max,r.profile.radius,r.profile.bodyHeight)}});
 return game;
}
function feet(g:Client){return {x:g.camera.position.x,y:g.camera.position.y-1.72,z:g.camera.position.z};}
function check(r:OriginalMapRuntime,g:Client){expect(r.geometry.playerIntersects(feet(g),r.profile.radius,r.profile.bodyHeight),JSON.stringify({feet:feet(g),velocity:g.velocity,grounded:g.grounded})).toBe(false);}
function contactSupport(r:OriginalMapRuntime,x:number,z:number,maxY:number){
 // Only this expectation uses an expanded query: its surface is the sphere's
 // one-source-unit contact envelope. The gameplay sphere remains physical size.
 const distance=ORIGINAL_COLLISION_CONTACT_DISTANCE;
 const support=r.geometry.playerSupportHeightAt(x,z,maxY-distance,r.profile.radius+distance,r.profile.bodyHeight+2*distance);
 return support===undefined?undefined:support+distance;
}
describe('recovered source terrain in actual Game movement',()=>{
 it('walks from Barrack floor through the broad source ramp onto its roof and back down',()=>{
  const r=runtime('barrack'),route=ramp(r),g=client(r,route.start,-Math.PI/2);
  let climbed=false;
  for(let i=0;i<600&&feet(g).x<route.finish.x;i++){g.updateMovement(1/60);check(r,g);if(feet(g).y>7)climbed=true;}
  expect(climbed).toBe(true);expect(feet(g).x).toBeGreaterThanOrEqual(route.finish.x);
  // A source sphere can leave the inclined face at the crest. Release input
  // and verify actual landing rather than require sticking on the first frame.
  g.keys.clear();for(let i=0;i<60;i++){g.updateMovement(1/60);check(r,g);}
  expect(feet(g).y).toBeCloseTo(contactSupport(r,feet(g).x,feet(g).z,feet(g).y+.1)!,2);expect(g.grounded).toBe(true);
  g.keys=new Set(['KeyS']);
  for(let i=0;i<600&&feet(g).x>route.start.x;i++){g.updateMovement(1/60);check(r,g);expect(g.velocity.y).toBeGreaterThan(-19);}
  g.keys.clear();for(let i=0;i<60;i++){g.updateMovement(1/60);check(r,g);}
  expect(feet(g).x).toBeLessThanOrEqual(route.start.x);expect(feet(g).y).toBeCloseTo(contactSupport(r,feet(g).x,feet(g).z,feet(g).y+.1)!,2);expect(g.grounded).toBe(true);
 });
 it('keeps an unsteered sphere supported while source gravity and drag allow it to slide down the ramp',()=>{
  const r=runtime('barrack'),route=ramp(r),x=(route.start.x+route.finish.x)/2,z=route.start.z;
  const y=r.geometry.playerSupportHeightAt(x,z,20,r.profile.radius,r.profile.bodyHeight)!,g=client(r,{x,y,z},0);
  g.keys.clear();
  for(let i=0;i<600;i++){
   g.updateMovement(1/120);check(r,g);expect(g.grounded).toBe(true);
   // Contact constrains descent to less than one callback of free-fall gain.
   expect(Math.abs(g.velocity.y)).toBeLessThan(ORIGINAL_PLAYER_DERIVATIVE_GRAVITY/30);
   const here=feet(g),support=r.geometry.playerSupportHeightAt(here.x,here.z,here.y+.1,r.profile.radius,r.profile.bodyHeight);
   const contactHeight=contactSupport(r,here.x,here.z,here.y+.1);
   expect(support).toBeDefined();expect(contactHeight).toBeDefined();
   // The fixture starts at physical support, already within the source skin.
   // Contact may stop subsequent approach anywhere in that initial skin band.
   expect(here.y).toBeGreaterThanOrEqual(support!-1e-6);
   expect(here.y).toBeLessThanOrEqual(contactHeight!+1e-4);
  }
  expect(feet(g).y).toBeLessThan(y);expect(feet(g).x).toBeLessThan(x);
 });
 it('moves Woodland spawn zero with W at its recovered source heading',()=>{
  const r=runtime('woodlands'),start=r.spawnPoints[0],yaw=ORIGINAL_SOURCE_SPAWNS.woodlands[0].rotation[2]*Math.PI/180,g=client(r,start,yaw);
  for(let i=0;i<900;i++){g.updateMovement(1/60);check(r,g);}
  expect(Math.hypot(feet(g).x-start.x,feet(g).z-start.z)).toBeGreaterThan(2);
 });
});
