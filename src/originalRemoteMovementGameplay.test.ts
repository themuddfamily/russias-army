import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {RemotePlayer,type RemoteState} from './remotePlayer';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {OriginalRemoteView} from '../shared/originalRemoteView';
import {OriginalSoldierCollision,type OriginalSoldierCollisionAssets} from '../shared/originalSoldierCollision';
const base=new URL('../public/assets/',import.meta.url);
function resources(){return createOriginalSoldierResources({
  geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'],
  rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'],texture:new THREE.Texture(),
},{geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});}
const state:RemoteState={id:'source',name:'SOURCE',x:0,y:0,z:0,yaw:-Math.PI,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true,sourceMotionTime:0};
describe('source remote movement presentation',()=>{
  it('matches all skinned vertices and real triangle rays for an aligned receipt/callback authority mirror',()=>{
    // This establishes an aligned whole-callback basis, not client/server wire
    // integration. Actor creation shares callback zero with the mirror epoch.
    const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r,true);
    const assets:OriginalSoldierCollisionAssets={
      geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')),
      rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')),
    };
    const cpu=new OriginalSoldierCollision(assets),mirror=new OriginalRemoteView(1000);
    const packets=[
      {sent:0,received:0,value:state},
      {sent:2,received:5,value:{...state,x:4,y:.4,z:-3,yaw:Math.PI-.03,sourceMotionTime:125}},
      {sent:4,received:7,value:{...state,x:8,y:1,z:-5,yaw:-Math.PI+.04,sourceMotionTime:450}},
      {sent:7,received:10,value:{...state,x:-2,y:.2,z:2,yaw:1.7,sourceMotionTime:2000}},
      // After a long idle, source newstuff extends catch-up by negative steps.
      {sent:43,received:48,value:{...state,x:12,y:-.3,z:7,yaw:-2.9,sourceMotionTime:750}},
    ];
    const mesh=remote.hitMeshes[0] as THREE.SkinnedMesh;
    const positions=mesh.geometry.getAttribute('position'),faces=assets.geometry.meshes.find(item=>item.resource==='GI')!.faces;
    let maxError=0,rayChecks=0;
    try{
      for(let callback=0;callback<=90;callback++){
        if(callback>0)remote.update(1/30);
        packets.forEach((packet,tick)=>{
          if(packet.sent===callback){const v=packet.value;
            expect(mirror.recordSent({tick,sentAt:1000+callback*1000/30,targets:[{id:v.id,position:{x:v.x,y:v.y,z:v.z},yaw:v.yaw,motionTime:v.sourceMotionTime!,alive:true}]})).toEqual({ok:true});
          }
        });
        const receipts:Array<{tick:number;callbacks:number}>=[];
        packets.forEach((packet,tick)=>{
          if(packet.received===callback){remote.apply(packet.value,tick===0);receipts.push({tick,callbacks:callback});}
        });
        expect(mirror.accept({receipts,callbacks:callback},1000+callback*1000/30)).toEqual({ok:true});
        const pose=mirror.freeze()[0],rendered=remote.debugState();
        expect(rendered.rendered).toEqual({...pose.position,yaw:pose.yaw});
        expect(rendered.original!.timeMs).toBe(pose.motionTime);
        expect(rendered.sourceMovement!.steps).toBe(pose.steps);
        const vertices=cpu.evaluatePose(pose.position,pose.yaw,pose.motionTime);
        expect(vertices).toHaveLength(742);
        mesh.updateWorldMatrix(true,false);
        for(let index=0;index<positions.count;index++){
          const actual=mesh.applyBoneTransform(index,new THREE.Vector3().fromBufferAttribute(positions,index)).applyMatrix4(mesh.matrixWorld);
          maxError=Math.max(maxError,actual.distanceTo(new THREE.Vector3().copy(vertices[index])));
        }
        if([5,7,10,25,48,60,90].includes(callback)){
          for(const faceIndex of [100,300,500]){
            const [ia,ib,ic]=faces[faceIndex],a=new THREE.Vector3().copy(vertices[ia]),b=new THREE.Vector3().copy(vertices[ib]),c=new THREE.Vector3().copy(vertices[ic]);
            const center=a.clone().add(b).add(c).multiplyScalar(1/3),normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
            const origin=center.addScaledVector(normal,2),direction=normal.negate();
            const displayed=new THREE.Raycaster(origin,direction,0,5).intersectObject(mesh,false);
            const authoritative=cpu.intersectRay(origin,direction,5);
            expect(displayed.length).toBeGreaterThan(0);expect(authoritative).not.toBeNull();
            expect(authoritative!.distance).toBeCloseTo(displayed[0].distance,9);rayChecks++;
          }
        }
      }
      expect(maxError).toBeLessThan(1e-9);expect(rayChecks).toBe(21);
    }finally{remote.dispose();r.dispose();cpu.dispose();}
  });
  it('keeps source recurrence disabled until receipt history is mirrored by authority',()=>{
    const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r);remote.apply(state,true);
    remote.apply({...state,x:9,sourceMotionTime:250});remote.update(1/60);
    expect(remote.debugState().sourceMovement).toBeUndefined();
    expect(remote.debugState().rendered.x).toBeCloseTo(9*(1-Math.exp(-.2)));
    expect(remote.debugState().original!.timeMs).toBe(250);
    remote.dispose();r.dispose();
  });
  it('moves only on nominal callbacks, preserves exact packet recurrence and authoritative phase',()=>{
    const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r,true);remote.apply(state,true);
    remote.apply({...state,x:9,y:18,z:-27,yaw:0,sourceMotionTime:250});
    remote.update(1/60);expect(remote.debugState().rendered.x).toBe(0);
    remote.update(1/60);expect(remote.debugState().rendered).toMatchObject({x:1,y:2,z:-3});
    expect(remote.debugState().rendered.yaw).toBeCloseTo(Math.PI*2/9);
    expect(remote.debugState().original!.timeMs).toBe(250);
    remote.update(8/30);expect(remote.debugState().rendered).toMatchObject({x:9,y:18,z:-27});
    remote.update(1/30);expect(remote.debugState().sourceMovement!.steps).toBe(0);expect(remote.debugState().rendered.yaw).toBe(Math.PI);
    remote.update(5/30);expect(remote.debugState().sourceMovement!.steps).toBe(-5);
    remote.apply({...state,x:23,y:18,z:-27});expect(remote.debugState().sourceMovement!.steps).toBe(15);
    remote.update(1/30);expect(remote.debugState().rendered.x).toBe(10);
    remote.dispose();r.dispose();
  });
  it('advances untransported pose from retained source displacement even while snapped and stops moving on death',()=>{
    const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r,true);remote.apply({...state,sourceMotionTime:undefined},true);
    remote.apply({...state,x:.09,sourceMotionTime:undefined});remote.update(10/30);
    const phase=remote.debugState().original!.timeMs;remote.update(1/30);
    expect(remote.debugState().original!.timeMs).toBeGreaterThan(phase);expect(remote.debugState().rendered.x).toBeCloseTo(.09);
    remote.apply({...state,x:3,alive:false,health:0,sourceMotionTime:2400});expect(remote.update(1/30)?.reason).toBe('death');
    expect(remote.debugState().rendered.x).toBeCloseTo(.09);expect(remote.debugState().original!.timeMs).toBe(3000);
    remote.update(1/30);expect(remote.debugState().original).toMatchObject({timeMs:2408,deathBon:8});
    remote.apply({...state,x:20,sourceMotionTime:100});expect(remote.debugState().rendered.x).toBeCloseTo(.09);expect(remote.alive).toBe(false);
    const fresh=new RemotePlayer('source','SOURCE',undefined,r,true);fresh.apply({...state,x:20,sourceMotionTime:100},true);
    expect(fresh.debugState().rendered.x).toBe(20);expect(fresh.debugState().sourceMovement!.steps).toBe(10);fresh.dispose();
    remote.dispose();r.dispose();
  });
  it('resets callback remainder and speed for an explicit instant placement',()=>{
    const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r,true);remote.apply(state,true);
    remote.apply({...state,x:9});remote.update(1/60);remote.apply({...state,x:50},true);
    expect(remote.debugState().sourceMovement).toEqual({steps:10,speed:{x:0,y:0,z:0},callbackRemainder:0});
    remote.apply({...state,x:59});remote.update(1/60);expect(remote.debugState().rendered.x).toBe(50);
    remote.dispose();r.dispose();
  });
});
