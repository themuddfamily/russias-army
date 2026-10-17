import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ONLINE_HIT_VOLUMES, RemotePlayer } from './remotePlayer';
import { SoldierModel } from './soldierModel';
import { SoldierMaterialLibrary } from './soldierMaterials';
import type { SoldierGripPointDebugState } from './soldierModel';
import type { WeaponId } from './weapons';

const WEAPON_IDS:WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];

const EXACT_HELD_ANCHORS:Readonly<Record<WeaponId,{
  group:readonly[number,number,number];
  muzzle:readonly[number,number,number];
}>>={
  pistol:{group:[0,.28,.12],muzzle:[.13,.035,.405]},
  shotgun:{group:[0,.11,0],muzzle:[.08,.035,1.24]},
  rifle:{group:[0,.11,0],muzzle:[.08,.035,1.29]},
  launcher:{group:[0,.09,0],muzzle:[.08,.035,.8]},
  rpg:{group:[0,.2,-.05],muzzle:[.04,.02,1.76]},
  sniper:{group:[0,.11,0],muzzle:[.08,.035,1.62]},
};

const LONG_GUN_STOCKS:Readonly<Record<Exclude<WeaponId,'pistol'>,string>>={
  shotgun:'held-shotgun-stock',rifle:'held-rifle-stock',launcher:'held-launcher-stock',
  rpg:'held-rpg-tube',sniper:'held-sniper-stock',
};

function pointDistance(a:SoldierGripPointDebugState,b:SoldierGripPointDebugState):number{
  return Math.hypot(a.x-b.x,a.y-b.y,a.z-b.z);
}

function expectFinitePoint(point:SoldierGripPointDebugState):void{
  expect(Number.isFinite(point.x+point.y+point.z)).toBe(true);
}

function objectsNamed(root:THREE.Object3D,name:string):THREE.Object3D[]{
  const objects:THREE.Object3D[]=[];
  root.traverse((object)=>{if(object.name===name)objects.push(object);});
  return objects;
}

function objectGap(left:THREE.Object3D,right:THREE.Object3D):number{
  const a=new THREE.Box3().setFromObject(left);
  const b=new THREE.Box3().setFromObject(right);
  const x=Math.max(0,a.min.x-b.max.x,b.min.x-a.max.x);
  const y=Math.max(0,a.min.y-b.max.y,b.min.y-a.max.y);
  const z=Math.max(0,a.min.z-b.max.z,b.min.z-a.max.z);
  return Math.hypot(x,y,z);
}

function expectJoined(left:THREE.Object3D,right:THREE.Object3D,label:string,tolerance=.001):void{
  expect(objectGap(left,right),label).toBeLessThanOrEqual(tolerance);
}

describe('SoldierModel',()=>{
  it('keeps a natural feet-level infantry silhouette',()=>{
    const soldier=new SoldierModel({weapon:'rifle',showName:false});
    soldier.animate(1/60,{alive:true,moveSpeed:0,aimPitch:0});soldier.group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(soldier.group);
    expect(bounds.min.y).toBeGreaterThanOrEqual(-.03);
    expect(bounds.max.y).toBeGreaterThan(1.78);
    expect(bounds.max.y).toBeLessThanOrEqual(1.88);
    soldier.dispose();
  });

  it('switches all six held weapon silhouettes and muzzle anchors',()=>{
    const soldier=new SoldierModel({showName:false});
    for(const id of WEAPON_IDS){
      soldier.setWeapon(id);soldier.group.updateMatrixWorld(true);
      expect(soldier.weapon).toBe(id);
      for(const candidate of WEAPON_IDS)expect(soldier.group.getObjectByName(`held-${candidate}`)?.visible).toBe(candidate===id);
      const muzzle=soldier.getMuzzleWorldPosition();expect(Number.isFinite(muzzle.x)&&Number.isFinite(muzzle.y)&&Number.isFinite(muzzle.z)).toBe(true);
    }
    soldier.dispose();soldier.dispose();
  });

  it('plants both gloves on weapon-specific grips with separated elbow silhouettes',()=>{
    const soldier=new SoldierModel({showName:false,materialTier:'low'});
    const leftHands=new Map<WeaponId,SoldierGripPointDebugState>();
    for(const id of WEAPON_IDS){
      soldier.setWeapon(id);
      soldier.animate(1/60,{alive:true,moveSpeed:0,aimPitch:0});
      const pose=soldier.getGripDebugState();
      expect(pose.weapon).toBe(id);
      expect(pose.left.error,id).toBeLessThan(1e-5);
      expect(pose.right.error,id).toBeLessThan(1e-5);
      expect(pointDistance(pose.left.elbow,pose.right.elbow),id).toBeGreaterThan(.6);
      expect(pointDistance(pose.left.elbow,pose.right.elbow),id).toBeLessThan(.9);
      expect(pointDistance(pose.left.hand,pose.right.hand),id).toBeGreaterThan(.1);
      for(const side of [pose.left,pose.right]){
        expectFinitePoint(side.shoulder);expectFinitePoint(side.elbow);
        expectFinitePoint(side.hand);expectFinitePoint(side.grip);
      }
      leftHands.set(id,pose.left.hand);
    }
    expect(pointDistance(leftHands.get('pistol')!,leftHands.get('rifle')!)).toBeGreaterThan(.15);
    expect(pointDistance(leftHands.get('rpg')!,leftHands.get('rifle')!)).toBeGreaterThan(.06);
    soldier.dispose();
  });

  it('bridges the close-detail neck, shoulder, pelvis, limb, glove and boot transitions',()=>{
    const soldier=new SoldierModel({weapon:'rifle',showName:false,materialTier:'high'});
    soldier.animate(1/60,{alive:true,moveSpeed:0,aimPitch:0});
    soldier.group.updateMatrixWorld(true);

    const neck=soldier.group.getObjectByName('neck')!;
    const face=soldier.group.getObjectByName('face')!;
    const torso=soldier.group.getObjectByName('torso-shell')!;
    const pelvis=soldier.group.getObjectByName('pelvis-shell')!;
    const belt=soldier.group.getObjectByName('battle-belt')!;
    expectJoined(neck,face,'neck to face');
    expectJoined(neck,torso,'neck to torso');
    expectJoined(pelvis,belt,'pelvis to battle belt');

    const knees=objectsNamed(soldier.group,'knee-pad');
    expect(knees).toHaveLength(2);
    for(const knee of knees){
      const lower=knee.parent!;
      const upper=lower.parent!;
      const thigh=upper.getObjectByName('thigh')!;
      const calf=lower.getObjectByName('calf')!;
      const boot=lower.getObjectByName('boot')!;
      const sole=lower.getObjectByName('boot-sole')!;
      expectJoined(knee,thigh,'knee pad to thigh');
      expectJoined(knee,calf,'knee pad to calf');
      expectJoined(calf,boot,'calf to boot');
      expectJoined(boot,sole,'boot to sole',.002);
    }

    for(const side of ['left','right']){
      const upper=soldier.group.getObjectByName(`${side}-arm-upper`)!;
      const lower=upper.getObjectByName(`${side}-arm-lower`)!;
      const shoulder=upper.getObjectByName('shoulder-pad')!;
      const upperArm=upper.getObjectByName('upper-arm')!;
      const forearm=lower.getObjectByName('forearm')!;
      const cuff=lower.getObjectByName('glove-cuff')!;
      const glove=lower.getObjectByName('glove')!;
      expectJoined(shoulder,torso,`${side} shoulder to torso`);
      expectJoined(shoulder,upperArm,`${side} shoulder to upper arm`);
      expectJoined(forearm,cuff,`${side} forearm to cuff`);
      expectJoined(cuff,glove,`${side} cuff to glove`);
    }
    soldier.dispose();
  });

  it('seats long guns against the firing shoulder with tucked support arms and exact authored anchors',()=>{
    const soldier=new SoldierModel({showName:false,materialTier:'high'});
    for(const id of WEAPON_IDS){
      soldier.setWeapon(id);
      soldier.animate(1/60,{alive:true,moveSpeed:0,aimPitch:0});
      soldier.group.updateMatrixWorld(true);
      const held=soldier.group.getObjectByName(`held-${id}`)!;
      const muzzle=soldier.group.getObjectByName(`muzzle-${id}`)!;
      expect(held.position.toArray(),`${id} held transform`).toEqual(EXACT_HELD_ANCHORS[id].group);
      expect(muzzle.position.toArray(),`${id} muzzle anchor`).toEqual(EXACT_HELD_ANCHORS[id].muzzle);

      const pose=soldier.getGripDebugState();
      expect(pose.left.error,id).toBeLessThan(1e-5);
      expect(pose.right.error,id).toBeLessThan(1e-5);
      if(id==='pistol')continue;

      const stock=soldier.group.getObjectByName(LONG_GUN_STOCKS[id])!;
      const rightShoulder=soldier.group.getObjectByName('right-arm-upper')!.getObjectByName('shoulder-pad')!;
      expectJoined(stock,rightShoulder,`${id} stock to firing shoulder`,.006);
      expect(pointDistance(pose.left.elbow,pose.right.elbow),`${id} elbow separation`).toBeGreaterThan(.7);
      expect(pointDistance(pose.left.hand,pose.right.hand),`${id} hand readability`).toBeGreaterThan(.42);
      expect(Math.abs(pose.left.elbow.x-pose.left.shoulder.x),`${id} tucked support elbow`).toBeLessThan(.08);
      expect(pose.right.elbow.x-pose.right.shoulder.x,`${id} clear firing elbow`).toBeGreaterThan(.2);
    }
    soldier.dispose();
  });

  it('keeps arm transforms finite and grips stable through locomotion, aim and recoil',()=>{
    const soldier=new SoldierModel({weapon:'rifle',showName:false,materialTier:'low'});
    soldier.animate(1/60,{alive:true,moveSpeed:0,aimPitch:0});
    const upper=soldier.group.getObjectByName('left-arm-upper')!;
    const lower=soldier.group.getObjectByName('left-arm-lower')!;
    const previousUpper=upper.quaternion.clone();
    const previousLower=lower.quaternion.clone();
    let maximumAngularStep=0;
    let maximumGripError=0;
    for(let frame=0;frame<180;frame++){
      if(frame%30===0)soldier.fire();
      soldier.animate(1/60,{
        alive:true,
        moveSpeed:3.2,
        strafeSpeed:Math.sin(frame*.13)*2,
        aimPitch:Math.sin(frame*.07)*.35,
      });
      const pose=soldier.getGripDebugState();
      maximumGripError=Math.max(maximumGripError,pose.left.error,pose.right.error);
      maximumAngularStep=Math.max(
        maximumAngularStep,
        previousUpper.angleTo(upper.quaternion),
        previousLower.angleTo(lower.quaternion),
      );
      previousUpper.copy(upper.quaternion);previousLower.copy(lower.quaternion);
      for(const value of [...upper.quaternion.toArray(),...lower.quaternion.toArray()])expect(Number.isFinite(value)).toBe(true);
    }
    expect(maximumGripError).toBeLessThan(.09);
    expect(maximumAngularStep).toBeLessThan(.12);
    soldier.dispose();
  });

  it('restores the anatomical rig after crouch and a blended death pose',()=>{
    const soldier=new SoldierModel({weapon:'rifle',showName:false,materialTier:'low'});
    for(let frame=0;frame<90;frame++)soldier.animate(1/60,{alive:true,crouch:1,moveSpeed:2.4,aimPitch:.25});
    soldier.die();
    for(let frame=0;frame<120;frame++)soldier.animate(1/60);
    soldier.reset();
    soldier.animate(1/60,{alive:true,crouch:0,moveSpeed:0,aimPitch:0});
    soldier.group.updateMatrixWorld(true);
    const bounds=new THREE.Box3().setFromObject(soldier.group);
    const pose=soldier.getGripDebugState();
    expect(bounds.min.y).toBeGreaterThanOrEqual(-.03);
    expect(bounds.max.y).toBeGreaterThan(1.78);
    expect(pose.left.error).toBeLessThan(1e-5);
    expect(pose.right.error).toBeLessThan(1e-5);
    for(const name of ['pelvis-shell','thigh','calf','upper-arm','forearm']){
      const object=soldier.group.getObjectByName(name);
      expect(object,name).toBeDefined();
      expect(object!.matrixWorld.elements.every(Number.isFinite),name).toBe(true);
    }
    soldier.dispose();
  });

  it('shares semantic materials while retaining per-actor team tints and named modern gear',()=>{
    const library=new SoldierMaterialLibrary({tier:'low'});
    const red=new SoldierModel({team:'red',materialLibrary:library,showName:false});
    const blue=new SoldierModel({team:'blue',materialLibrary:library,showName:false});
    const redPatch=red.group.getObjectByName('team-patch-left') as THREE.Mesh;
    const bluePatch=blue.group.getObjectByName('team-patch-left') as THREE.Mesh;
    expect(redPatch.material).toBe(bluePatch.material);
    expect([...redPatch.geometry.getAttribute('color').array]).not.toEqual([...bluePatch.geometry.getAttribute('color').array]);
    for(const name of ['pelvis-shell','plate-carrier','assault-pack','helmet-shell','helmet-band','goggle-frame','boot','glove']){
      expect(red.group.getObjectByName(name),name).toBeDefined();
    }
    red.dispose();
    expect(library.isDisposed).toBe(false);
    expect((bluePatch.material as THREE.Material).visible).toBe(true);
    blue.dispose();library.dispose();
  });

  it('uses shared per-actor anatomical shells with core LOD metadata and safe ownership',()=>{
    const soldier=new SoldierModel({showName:false,materialTier:'high'});
    const named=(name:string):THREE.Mesh[]=>{
      const meshes:THREE.Mesh[]=[];
      soldier.group.traverse((object)=>{if(object instanceof THREE.Mesh&&object.name===name)meshes.push(object);});
      return meshes;
    };
    const torso=named('torso-shell');
    const pelvis=named('pelvis-shell');
    const thighs=named('thigh');
    const calves=named('calf');
    const upperArms=named('upper-arm');
    const forearms=named('forearm');
    expect(torso).toHaveLength(1);expect(pelvis).toHaveLength(1);
    for(const pair of [thighs,calves,upperArms,forearms])expect(pair).toHaveLength(2);
    expect(thighs[0].geometry).toBe(thighs[1].geometry);
    expect(calves[0].geometry).toBe(calves[1].geometry);
    expect(upperArms[0].geometry).toBe(upperArms[1].geometry);
    expect(forearms[0].geometry).toBe(forearms[1].geometry);

    const anatomy=[...torso,...pelvis,...thighs,...calves,...upperArms,...forearms];
    for(const mesh of anatomy){
      expect(mesh.userData.presentationOnly).toBe(true);
      expect(mesh.userData.soldierLod).toBe('core');
      expect(mesh.userData.soldierSurface).toBe('fabric');
      expect(mesh.geometry.index).not.toBeNull();
      expect(mesh.geometry.getAttribute('normal')).toBeDefined();
      expect(mesh.geometry.getAttribute('uv')).toBeDefined();
      expect(mesh.geometry.getAttribute('color')).toBeDefined();
    }
    expect(torso[0].geometry.name).toBe('AnatomicalTorsoShell');
    expect(pelvis[0].geometry.name).toBe('AnatomicalPelvisShell');
    expect(thighs[0].geometry.name).toBe('AnatomicalThighShell');

    const unique=[...new Set(anatomy.map((mesh)=>mesh.geometry))];
    const disposals=unique.map((geometry)=>vi.spyOn(geometry,'dispose'));
    soldier.dispose();soldier.dispose();
    for(const disposal of disposals)expect(disposal).toHaveBeenCalledTimes(1);
  });
});

describe('RemotePlayer hit presentation separation',()=>{
  it('uses stable non-shadow-casting proxies aligned with authoritative volumes',()=>{
    const remote=new RemotePlayer('test-id','TEST');
    const body=remote.hitMeshes.find(mesh=>mesh.userData.zone==='body')!;const head=remote.hitMeshes.find(mesh=>mesh.userData.zone==='head')!;
    expect(body.position.y).toBe(ONLINE_HIT_VOLUMES.body.y);expect((body.geometry as THREE.SphereGeometry).parameters.radius).toBe(ONLINE_HIT_VOLUMES.body.radius);
    expect(head.position.y).toBe(ONLINE_HIT_VOLUMES.head.y);expect((head.geometry as THREE.SphereGeometry).parameters.radius).toBe(ONLINE_HIT_VOLUMES.head.radius);
    expect(body.castShadow).toBe(false);expect(head.castShadow).toBe(false);remote.dispose();
  });
});
