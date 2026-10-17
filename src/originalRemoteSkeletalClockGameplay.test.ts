import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {RemotePlayer,type RemoteState} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {advanceOriginalRemoteSoldierPhase} from '../shared/originalRemoteSoldierPhase';
import {OriginalRemoteView} from '../shared/originalRemoteView';
import {OriginalSoldierCollision,type OriginalSoldierCollisionAssets} from '../shared/originalSoldierCollision';
import type {NetworkSnapshot} from './network';
const base=new URL('../public/assets/',import.meta.url);
const collisionAssets:OriginalSoldierCollisionAssets={geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')),rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8'))};
function resources(){return createOriginalSoldierResources({...collisionAssets,texture:new THREE.Texture()} as OriginalSoldierAssets,{geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});}
const state:RemoteState={id:'source',name:'SOURCE',x:0,y:0,z:0,yaw:-Math.PI,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true,sourceMotionTime:440};
afterEach(()=>vi.restoreAllMocks());
describe('source callback skeletal clock in actual remote presentation',()=>{
 it('matches every GI vertex and triangle rays throughout movement, retained-speed snap and ordered receipts',()=>{
  const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r,true,true),mirror=new OriginalRemoteView(0,{},'source-callback'),cpu=new OriginalSoldierCollision(collisionAssets);
  const mesh=remote.hitMeshes[0] as THREE.SkinnedMesh,positions=mesh.geometry.getAttribute('position'),faces=collisionAssets.geometry.meshes.find(item=>item.resource==='GI')!.faces;
  const packets=new Map([[0,state],[2,{...state,x:.09,y:.018,z:-.027,sourceMotionTime:999}],[18,{...state,x:.23,y:.018,z:-.027,sourceMotionTime:750}]]);
  let tick=0,maxError=0,rayChecks=0;
  try{
   for(let callback=0;callback<=35;callback++){
    if(callback>0)remote.update(0,undefined,1);
    const packet=packets.get(callback),receipts:Array<{tick:number;callbacks:number}>=[];
    if(packet){remote.apply(packet,callback===0);expect(mirror.recordSent({tick,sentAt:callback*1000/30,targets:[{id:packet.id,position:{x:packet.x,y:packet.y,z:packet.z},yaw:packet.yaw,motionTime:packet.sourceMotionTime!,alive:true}]})).toEqual({ok:true});receipts.push({tick:tick++,callbacks:callback});}
    if(callback===15){const report={...state,x:.09,y:.018,z:-.027,sourceShots:1};remote.apply(report);expect(mirror.recordSent({tick,sentAt:callback*1000/30,targets:[{id:state.id,position:{x:report.x,y:report.y,z:report.z},yaw:report.yaw,motionTime:440,alive:true,weapon:'rifle',sourceShots:1}]})).toEqual({ok:true});receipts.push({tick:tick++,callbacks:callback});}
    // An empty descriptor is the source view receipt for a projectile launch.
    if(callback===16){expect(mirror.recordSent({tick,sentAt:callback*1000/30,targets:[]})).toEqual({ok:true});receipts.push({tick:tick++,callbacks:callback});}
    const accepted=mirror.accept({callbacks:callback,receipts},callback*1000/30);expect(accepted).toMatchObject({ok:true});
    if(!accepted.ok)throw Error(accepted.reason);
    if(callback===16)expect(accepted.shots).toEqual([{id:'source',weapon:'rifle',callback:16,position:{x:.09,y:.018,z:-.027}}]);
    else expect(accepted.shots).toBeUndefined();
    const pose=mirror.freeze()[0],actual=remote.debugState();expect(actual.rendered).toEqual({...pose.position,yaw:pose.yaw});expect(actual.original!.timeMs).toBe(pose.motionTime);expect(actual.sourceMovement!.steps).toBe(pose.steps);
    if(callback===0)expect(pose.motionTime).toBe(0);if(callback===15)expect(actual.sourceShots).toEqual({misses:1,aiming:0});if(callback===16)expect(pose.motionTime).toBe(advanceOriginalRemoteSoldierPhase(2000,actual.sourceMovement!.speed));
    // Queue receipt is inert; zero callbacks sample the shared current phase.
    remote.update(0,undefined,0);const vertices=cpu.evaluatePose(pose.position,pose.yaw,pose.motionTime);expect(vertices).toHaveLength(742);mesh.updateWorldMatrix(true,false);
    for(let index=0;index<positions.count;index++){const displayed=mesh.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(positions,index)).applyMatrix4(mesh.matrixWorld);maxError=Math.max(maxError,displayed.distanceTo(new THREE.Vector3().copy(vertices[index])));}
    if([3,12,16,19,35].includes(callback))for(const faceIndex of [100,300,500]){
     const [ia,ib,ic]=faces[faceIndex],a=new THREE.Vector3().copy(vertices[ia]),b=new THREE.Vector3().copy(vertices[ib]),c=new THREE.Vector3().copy(vertices[ic]),center=a.clone().add(b).add(c).multiplyScalar(1/3),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize(),origin=center.addScaledVector(normal,2),direction=normal.negate();
     const displayed=new THREE.Raycaster(origin,direction,0,5).intersectObject(mesh,false),authority=cpu.intersectRay(origin,direction,5);expect(displayed.length).toBeGreaterThan(0);expect(authority).not.toBeNull();expect(authority!.distance).toBeCloseTo(displayed[0].distance,9);rayChecks++;
    }
   }
   expect(maxError).toBeLessThan(1e-9);expect(rayChecks).toBe(15);
  }finally{remote.dispose();r.dispose();cpu.dispose();}
 });
 it('preserves phase for packet receipts and zero callbacks, with batched callbacks equal to sequential steps',()=>{
  const r=resources(),batch=new RemotePlayer('source','SOURCE',undefined,r,true,true),single=new RemotePlayer('source','SOURCE',undefined,r,true,true);
  try{
   for(const remote of [batch,single]){remote.apply(state,true);expect(remote.debugState().original!.timeMs).toBe(0);remote.apply({...state,x:.09,sourceMotionTime:2000});remote.update(0,undefined,0);expect(remote.debugState().original!.timeMs).toBe(0);}
   batch.update(0,undefined,20);for(let i=0;i<20;i++)single.update(0,undefined,1);
   expect(batch.debugState()).toEqual(single.debugState());const phase=batch.debugState().original!.timeMs;batch.apply({...state,x:.23,sourceMotionTime:999});expect(batch.debugState().original!.timeMs).toBe(phase);
  }finally{batch.dispose();single.dispose();r.dispose();}
 });
 it('stationary bullet phase wraps once, death enters3000 then fades2408 and fresh registration starts0',()=>{
  const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r,true,true),fresh=new RemotePlayer('source','SOURCE',undefined,r,true,true);
  try{
   remote.apply({...state,sourceShots:1},true);remote.fire();expect(remote.debugState().original!.timeMs).toBe(0);remote.update(0,undefined,1);expect(remote.debugState().original!.timeMs).toBe(1000);
   remote.apply({...state,alive:false,health:0,sourceMotionTime:2999});expect(remote.debugState().original!.timeMs).toBe(1000);expect(remote.update(0,undefined,1)?.reason).toBe('death');expect(remote.debugState().original).toMatchObject({timeMs:3000,deathBon:0});
   remote.update(0,undefined,1);expect(remote.debugState().original).toMatchObject({timeMs:2408,deathBon:8});fresh.apply({...state,x:8,sourceMotionTime:999},true);expect(fresh.debugState().original!.timeMs).toBe(0);
  }finally{remote.dispose();fresh.dispose();r.dispose();}
 });
 it('actual negotiated Game snapshot creation enables source phase together with its callback clock',()=>{
  const r=resources(),game=Object.create(Game.prototype) as any;
  Object.assign(game,{mapId:'woodlands',mode:'online',archivalWinter:false,phase:'playing',network:{clientId:'viewer'},sourceRemoteViewEpoch:0,remotePlayers:new Map(),sourceTimeoutCorpses:new Set(),scene:new THREE.Scene(),camera:new THREE.PerspectiveCamera(),originalSoldierResources:r,arena:{},snowTracks:{resetActor:vi.fn()},attachOriginalDoors:vi.fn(),reconcileNetworkItems:vi.fn(),reconcileNetworkProjectiles:vi.fn(),updateNetworkStatus:vi.fn(),updateHud:vi.fn(),appendChat:vi.fn()});
  const snapshot:NetworkSnapshot={map:'woodlands',room:'clock',tick:0,serverTime:0,fragLimit:12,state:'playing',winnerId:null,projectiles:[],players:[{id:state.id,name:state.name,health:100,maxHealth:100,frags:0,deaths:0,alive:true,respawnAt:null,sourceMotionTime:440,sourceShots:1,transform:{position:{x:0,y:0,z:0},velocity:{x:0,y:0,z:0},yaw:state.yaw,pitch:0,weapon:'rifle',grounded:true}}]};
  try{game.applyNetworkSnapshot(snapshot);const remote=game.remotePlayers.get(state.id) as RemotePlayer;expect(remote.debugState().original!.timeMs).toBe(0);remote.fire();remote.update(0,undefined,1);expect(remote.debugState().original!.timeMs).toBe(1000);}
  finally{game.clearRemotePlayers();r.dispose();}
 });
});
