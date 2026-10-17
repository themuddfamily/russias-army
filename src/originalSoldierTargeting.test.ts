import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoldier,createOriginalSoldierResources,ORIGINAL_GI_DEATH_RADIUS,type OriginalSoldierAssets} from './originalSoldier';
import {RemotePlayer,type RemoteState} from './remotePlayer';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
const base=new URL('../public/assets/',import.meta.url);
function resources(){return createOriginalSoldierResources({
  geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'],
  rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'],texture:new THREE.Texture(),
},{geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});}
const state:RemoteState={id:'source',name:'SOURCE',x:0,y:0,z:0,yaw:-Math.PI,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true,sourceMotionTime:0};
function ray(x:number,y:number,meshes:THREE.Mesh[]){return new THREE.Raycaster(new THREE.Vector3(x,y,5),new THREE.Vector3(0,0,-1)).intersectObjects(meshes,false);}

describe('recovered GI triangle targeting',()=>{
  it('misses empty space inside old torso proxy and hits a foot outside both proxies',()=>{
    const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r),compat=new RemotePlayer('winter','WINTER');
    remote.apply(state,true);compat.apply({...state,id:'winter'},true);compat.group.updateMatrixWorld(true);
    expect(remote.hitMeshes).toHaveLength(1);expect(remote.hitMeshes[0]).toBeInstanceOf(THREE.SkinnedMesh);
    expect(remote.hitMeshes[0].userData).toMatchObject({remoteId:'source',zone:'body'});
    expect(ray(.35,.98,compat.hitMeshes).length).toBeGreaterThan(0);expect(ray(.35,.98,remote.hitMeshes)).toHaveLength(0);
    expect(ray(.15,.15,compat.hitMeshes)).toHaveLength(0);expect(ray(.15,.15,remote.hitMeshes).length).toBeGreaterThan(0);
    remote.dispose();compat.dispose();r.dispose();
  });
  it('samples transported animation phase exactly and keeps it between snapshots',()=>{
    const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r);remote.apply(state,true);
    expect(ray(.15,.15,remote.hitMeshes).length).toBeGreaterThan(0);
    remote.apply({...state,sourceMotionTime:250,x:2});
    expect(remote.debugState().original!.timeMs).toBe(250);
    expect(ray(.15,.15,remote.hitMeshes)).toHaveLength(0);expect(ray(-.15,.15,remote.hitMeshes).length).toBeGreaterThan(0);
    remote.update(.5);expect(remote.debugState().original!.timeMs).toBe(250);
    const feetX=remote.group.position.x;
    expect(ray(feetX-.15,.15,remote.hitMeshes).length).toBeGreaterThan(0);
    remote.apply({...state,sourceMotionTime:500},true);expect(remote.debugState().original!.timeMs).toBe(500);
    remote.dispose();r.dispose();
  });
  it('uses absolute source shoot and death poses without wrapping or resurrecting the dead',()=>{
    const r=resources(),soldier=new OriginalSoldier(r);
    soldier.setSourceMotionTime(2000);expect(soldier.debugState().timeMs).toBe(2000);
    const bones=soldier.bones.map(bone=>bone.quaternion.clone());soldier.setSourceMotionTime(Number.NaN);soldier.setSourceMotionTime(-1);
    expect(soldier.debugState().timeMs).toBe(2000);expect(soldier.bones.every((bone,index)=>bone.quaternion.equals(bones[index]))).toBe(true);
    soldier.die();soldier.setSourceMotionTime(2416);expect(soldier.debugState()).toMatchObject({timeMs:2416,deathBon:16,alive:false,removed:false});
    expect(soldier.nativeRoot.position.y).toBeCloseTo(85*ORIGINAL_MAP_SCALE-ORIGINAL_GI_DEATH_RADIUS/300*16);
    soldier.setSourceMotionTime(3008);expect(soldier.group.visible).toBe(false);soldier.reset();expect(soldier.group.visible).toBe(true);
    soldier.dispose();r.dispose();
  });
  it('advances death locally when room phases stop and leaves borrowed geometry owned by resources',()=>{
    const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r),dispose=vi.spyOn(r.geometry,'dispose');
    remote.apply(state,true);remote.apply({...state,alive:false,health:0,sourceMotionTime:2408});remote.update(.5);
    expect(remote.debugState().original).toMatchObject({timeMs:2528,deathBon:128,alive:false,removed:false});
    remote.apply({...state,sourceMotionTime:100},true);expect(remote.debugState().original).toMatchObject({timeMs:100,alive:true});
    remote.dispose();expect(dispose).not.toHaveBeenCalled();r.dispose();expect(dispose).toHaveBeenCalledOnce();
  });
  it('does not rewind a death with stale living or dead phases and does not restore a removed corpse',()=>{
    const r=resources(),remote=new RemotePlayer('source','SOURCE',undefined,r);remote.apply({...state,sourceMotionTime:1000},true);
    remote.apply({...state,alive:false,health:0,sourceMotionTime:1000});
    expect(remote.debugState().original).toMatchObject({timeMs:2400,deathBon:0,alive:false});
    remote.update(1/30);expect(remote.debugState().original!.timeMs).toBe(2408);
    remote.apply({...state,alive:false,health:0,sourceMotionTime:2400});expect(remote.debugState().original!.timeMs).toBe(2408);
    remote.apply({...state,alive:false,health:0,sourceMotionTime:2800});expect(remote.debugState().original!.timeMs).toBe(2800);
    remote.update(1);expect(remote.debugState().original).toMatchObject({timeMs:3008,removed:true});
    remote.apply({...state,alive:false,health:0,sourceMotionTime:2400});remote.update(1/30);
    expect(remote.debugState().original).toMatchObject({timeMs:3008,removed:true});
    remote.dispose();r.dispose();
  });
});
