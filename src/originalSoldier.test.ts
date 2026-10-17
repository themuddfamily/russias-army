import * as THREE from 'three';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {OriginalSoldier,createOriginalSoldierResources,ORIGINAL_GI_ROOT_HEIGHT,ORIGINAL_GI_SCALE,ORIGINAL_GI_DEATH_RADIUS,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import type {WeaponId} from './weapons';
const base=new URL('../public/assets/original-soldier/',import.meta.url);
const data=JSON.parse(readFileSync(new URL('geometry.json',base),'utf8')) as OriginalSoldierAssets['geometry'];
const rigMotion=JSON.parse(readFileSync(new URL('rig-motion.json',base),'utf8')) as OriginalSoldierAssets['rigMotion'];
function bundle(){const gi=new THREE.Texture(),gunTextures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));return {gi,gunTextures,resources:createOriginalSoldierResources({geometry:data,rigMotion,texture:gi},{geometry:JSON.parse(readFileSync(new URL('../original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData,textures:gunTextures})};}

describe('original source GI skin and animation',()=>{
  it('preserves hashes and equal geometry/rig/texture across publisher builds',()=>{
    const provenance=JSON.parse(readFileSync(new URL('provenance.json',base),'utf8'));
    for(const name of ['geometry.json','rig-motion.json','GI.png']){const bytes=readFileSync(new URL(name,base));expect(createHash('sha256').update(bytes).digest('hex')).toBe(provenance.files[name].sha256);}
    for(const category of ['sourceGeometry','sourceRigMotion'])expect(provenance[category].barrack.canonicalSha256).toBe(provenance[category].woodland.canonicalSha256);
    expect(provenance.textureSources.barrack.sha256).toBe(provenance.textureSources.woodland.sha256);
  });
  it('keeps original25 joints, exact influences and raw mesh, with a valid near-identity rest skin',()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources);expect(soldier.bones).toHaveLength(25);expect(soldier.bones[22].name).toBe('rightfingers');expect(soldier.mesh.geometry.getAttribute('position').count).toBe(742);expect(soldier.mesh.geometry.index!.count/3).toBe(832);
    const source=data.meshes[0],geometry=soldier.mesh.geometry;let maxError=0;
    for(let i=0;i<source.positions.length;i++){
      for(let slot=0;slot<4;slot++){expect(geometry.getAttribute('skinIndex').getComponent(i,slot)).toBe(source.bone_indices[i][slot]??0);expect(geometry.getAttribute('skinWeight').getComponent(i,slot)).toBe(source.bone_weights[i][slot]??0);}
      const raw=new THREE.Vector3().fromArray(source.positions[i]),skinned=soldier.mesh.applyBoneTransform(i,raw.clone());maxError=Math.max(maxError,raw.distanceTo(skinned));
    }
    expect(maxError).toBeLessThan(.002);expect(soldier.nativeRoot.scale.x).toBe(ORIGINAL_GI_SCALE);expect(soldier.nativeRoot.position.y).toBe(ORIGINAL_GI_ROOT_HEIGHT);
    const lowest=Math.min(...source.positions.map(p=>p[2]))*ORIGINAL_GI_SCALE+ORIGINAL_GI_ROOT_HEIGHT;expect(lowest).toBeCloseTo(.0244,3);soldier.dispose();resources.dispose();
  });
  it('uses source native basis and real locomotion/death keys, with speed interpreted as position delta',()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources);const forward=new THREE.Vector3(1,0,0).applyQuaternion(soldier.nativeRoot.quaternion);expect(forward.distanceTo(new THREE.Vector3(0,0,1))).toBeLessThan(1e-12);
    const vertex=0,rest=soldier.mesh.applyBoneTransform(vertex,new THREE.Vector3().fromBufferAttribute(soldier.mesh.geometry.getAttribute('position'),vertex));
    soldier.animate(.5,{moveSpeed:100*ORIGINAL_MAP_SCALE,alive:true});expect(soldier.debugState().timeMs).toBeCloseTo(500);
    const moved=soldier.mesh.applyBoneTransform(vertex,new THREE.Vector3().fromBufferAttribute(soldier.mesh.geometry.getAttribute('position'),vertex));expect(moved.distanceTo(rest)).toBeGreaterThan(1);
    soldier.animate(.6,{moveSpeed:100*ORIGINAL_MAP_SCALE});expect(soldier.debugState().timeMs).toBeCloseTo(100);
    soldier.die();expect(soldier.debugState().timeMs).toBe(2400);expect(soldier.weaponRoot.visible).toBe(false);soldier.animate(1/30,{alive:false});expect(soldier.debugState().timeMs).toBe(2408);
    soldier.animate(1,{alive:false});soldier.animate(1,{alive:false});soldier.animate(.5-1/30,{alive:false});expect(soldier.debugState().timeMs).toBeCloseTo(3000);const finalPose=soldier.bones[1].quaternion.clone();soldier.animate(10,{alive:false});expect(soldier.bones[1].quaternion.equals(finalPose)).toBe(true);
    soldier.reset();expect(soldier.debugState().timeMs).toBe(0);expect(soldier.weaponRoot.visible).toBe(true);soldier.dispose();resources.dispose();
  });
  it('sinks from the source eye origin and removes the skin only after fadeaway bon exceeds600',()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources);soldier.die();
    expect(soldier.nativeRoot.position.y).toBe(85*ORIGINAL_MAP_SCALE);expect(soldier.group.visible).toBe(true);
    soldier.animate(1/30,{alive:false});expect(soldier.debugState().deathBon).toBe(8);
    expect(soldier.nativeRoot.position.y).toBeCloseTo(85*ORIGINAL_MAP_SCALE-ORIGINAL_GI_DEATH_RADIUS/300*8);
    for(let i=0;i<74;i++)soldier.animate(1/30,{alive:false});expect(soldier.debugState().deathBon).toBe(600);expect(soldier.group.visible).toBe(true);
    expect(soldier.nativeRoot.position.y).toBeCloseTo(85*ORIGINAL_MAP_SCALE-ORIGINAL_GI_DEATH_RADIUS*2);expect(resources.material.opacity).toBe(1);
    soldier.animate(1/30,{alive:false});expect(soldier.debugState().deathBon).toBe(608);expect(soldier.debugState().timeMs).toBe(3008);expect(soldier.group.visible).toBe(false);
    soldier.reset();expect(soldier.group.visible).toBe(true);expect(soldier.nativeRoot.position.y).toBe(ORIGINAL_GI_ROOT_HEIGHT);soldier.dispose();resources.dispose();
  });
  it('orients the held gun from the previous rendered bone world pose before updating the actor',()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources);soldier.getMuzzleWorldPosition();const oldGun=soldier.weaponRoot.matrixWorld.clone();
    soldier.group.position.x=10;soldier.animate(1/30,{moveSpeed:1});soldier.getMuzzleWorldPosition();
    for(let component=0;component<16;component++)expect(soldier.weaponRoot.matrixWorld.elements[component]).toBeCloseTo(oldGun.elements[component],12);
    expect(soldier.bones[22].getWorldPosition(new THREE.Vector3()).x).toBeGreaterThan(9);
    const nextBone=soldier.bones[22].matrixWorld.clone();soldier.animate(1/30,{moveSpeed:0});soldier.getMuzzleWorldPosition();
    const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();nextBone.decompose(position,rotation,scale);
    rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,170*Math.PI/180,10*Math.PI/180,'ZYX')));position.add(new THREE.Vector3(0,-3*ORIGINAL_MAP_SCALE,0).applyQuaternion(rotation));
    expect(soldier.weaponRoot.getWorldPosition(new THREE.Vector3()).distanceTo(position)).toBeLessThan(1e-10);soldier.dispose();resources.dispose();
  });
  it('uses source shoot bon2000 and strict single wrapping while flash retains the prior pose',()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources);soldier.animate(.2,{moveSpeed:1});
    soldier.fire();expect(soldier.debugState().timeMs).toBe(2000);
    soldier.animate(1/30,{moveSpeed:0});expect(soldier.debugState().timeMs).toBe(1000);
    soldier.animate(1/30,{moveSpeed:0});expect(soldier.debugState().timeMs).toBe(1000);
    soldier.animate(1/30,{moveSpeed:30*ORIGINAL_MAP_SCALE});expect(soldier.debugState().timeMs).toBeCloseTo(10);
    const fast=new OriginalSoldier(resources),slow=new OriginalSoldier(resources);fast.fire();slow.fire();
    for(let i=0;i<15;i++)fast.animate(1/30,{moveSpeed:1});slow.animate(.5,{moveSpeed:1});
    expect(slow.debugState().timeMs).toBeCloseTo(fast.debugState().timeMs);soldier.dispose();fast.dispose();slow.dispose();resources.dispose();
  });
  for(const fps of [15,60,240])it(`steps muzzle actors twice at ${fps} FPS without advancing on pose refresh`,()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources);soldier.fire();
    const flash=soldier.group.children.find(child=>child.name==='original-GI-shot-flash')!;
    expect(flash.visible).toBe(true);
    for(let i=0;i<5;i++)soldier.animate(0);expect(flash.visible).toBe(true);
    let elapsed=0;
    while(elapsed+1/fps<1/30-1e-9){soldier.animate(1/fps);elapsed+=1/fps;expect(flash.visible).toBe(true);}
    soldier.animate(1/30-elapsed);expect(flash.visible).toBe(true);expect(flash.parent).toBe(soldier.group);
    soldier.animate(0);expect(flash.parent).toBe(soldier.group);
    soldier.animate(1/30);expect(flash.parent).toBeNull();
    soldier.fire();const next=soldier.group.children.find(child=>child.name==='original-GI-shot-flash')!;
    soldier.animate(.1);expect(next.parent).toBeNull();soldier.dispose();resources.dispose();
  });
  for(const death of ['die','animate','fadeaway'] as const)it(`retains the independent muzzle world pose and two callbacks through ${death} death`,()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources),scene=new THREE.Scene();scene.add(soldier.group);
    try {
      soldier.group.position.set(3,4,5);soldier.group.rotation.y=.6;soldier.animate(0);soldier.fire();
      const flash=soldier.group.children.find(child=>child.name==='original-GI-shot-flash')!;flash.updateWorldMatrix(true,false);const birthWorld=flash.matrixWorld.clone();
      if(death==='fadeaway')soldier.beginSourceFadeaway();else if(death==='die')soldier.die();else soldier.animate(0,{alive:false});
      expect(soldier.weaponRoot.visible).toBe(false);expect(flash.parent).toBe(soldier.group);expect(flash.visible).toBe(true);
      soldier.group.position.set(-2,7,1);soldier.group.rotation.y=-.4;soldier.animate(0,{alive:false});flash.updateWorldMatrix(true,false);
      for(let component=0;component<16;component++)expect(flash.matrixWorld.elements[component]).toBeCloseTo(birthWorld.elements[component],10);
      soldier.animate(1/30,{alive:false});expect(flash.parent).toBe(soldier.group);expect(flash.visible).toBe(true);flash.updateWorldMatrix(true,false);
      for(let component=0;component<16;component++)expect(flash.matrixWorld.elements[component]).toBeCloseTo(birthWorld.elements[component],10);
      soldier.animate(0,{alive:false});expect(flash.parent).toBe(soldier.group);soldier.animate(1/30,{alive:false});expect(flash.parent).toBeNull();
    } finally {soldier.dispose();resources.dispose();}
  });
  it('preserves a partially accumulated muzzle callback across fadeaway birth',()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources);
    try {
      soldier.fire();const flash=soldier.group.children.find(child=>child.name==='original-GI-shot-flash')!;
      soldier.animate(1/60);soldier.beginSourceFadeaway();expect(flash.parent).toBe(soldier.group);
      soldier.animate(1/60,{alive:false});expect(flash.parent).toBe(soldier.group);
      soldier.animate(1/60,{alive:false});expect(flash.parent).toBe(soldier.group);
      soldier.animate(1/60,{alive:false});expect(flash.parent).toBeNull();
    } finally {soldier.dispose();resources.dispose();}
  });
  it('still clears independently retained death flashes on full reset and disposal',()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources);
    try {
      soldier.fire();const old=soldier.group.children.find(child=>child.name==='original-GI-shot-flash')!;soldier.beginSourceFadeaway();expect(old.parent).toBe(soldier.group);
      soldier.reset();expect(old.parent).toBeNull();expect(soldier.weaponRoot.visible).toBe(true);
      soldier.fire();const fresh=soldier.group.children.find(child=>child.name==='original-GI-shot-flash')!;soldier.die();expect(fresh.parent).toBe(soldier.group);
      soldier.dispose();expect(fresh.parent).toBeNull();expect(soldier.group.children).toHaveLength(0);
    } finally {soldier.dispose();resources.dispose();}
  });
  it('clears a muzzle on the explicit immediate-removal adapter instead of retaining a stopped callback',()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources);
    try {
      soldier.fire();const flash=soldier.group.children.find(child=>child.name==='original-GI-shot-flash')!;
      soldier.die(true);expect(flash.parent).toBeNull();soldier.animate(1/30,{alive:false});expect(soldier.debugState().removed).toBe(true);
      expect(soldier.group.children.some(child=>child.name==='original-GI-shot-flash')).toBe(false);
    } finally {soldier.dispose();resources.dispose();}
  });
  it('attaches every gun to bone22 world pose while excluding GI scale and preserving source self correction',()=>{
    const {resources}=bundle(),soldier=new OriginalSoldier(resources),scene=new THREE.Scene();scene.add(soldier.group);soldier.group.position.set(3,4,5);soldier.group.rotation.y=.6;
    soldier.animate(0);
    const previousBone=soldier.bones[22].matrixWorld.clone();soldier.animate(.4,{moveSpeed:2});
    const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3();previousBone.decompose(position,rotation,scale);
    rotation.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0,170*Math.PI/180,10*Math.PI/180,'ZYX')));position.add(new THREE.Vector3(0,-3*ORIGINAL_MAP_SCALE,0).applyQuaternion(rotation));
    for(const weapon of ['rifle','pistol','shotgun','launcher','rpg','sniper'] as WeaponId[]){soldier.setWeapon(weapon);soldier.getMuzzleWorldPosition();expect(soldier.weaponRoot.getWorldPosition(new THREE.Vector3()).distanceTo(position)).toBeLessThan(1e-10);expect(soldier.weaponRoot.getWorldQuaternion(new THREE.Quaternion()).angleTo(rotation)).toBeLessThan(1e-7);expect(soldier.weaponRoot.getWorldScale(new THREE.Vector3()).distanceTo(new THREE.Vector3(1,1,1))).toBeLessThan(1e-10);expect(soldier.weaponRoot.children.filter(child=>child instanceof THREE.Mesh&&child.visible)).toHaveLength(1);}
    soldier.dispose();resources.dispose();
  });
  it('retains sourcefull mesh for requested LOD and disposes skeletons separately from borrowed resources/textures',()=>{
    const {resources,gi,gunTextures}=bundle(),first=new OriginalSoldier(resources),second=new OriginalSoldier(resources);
    const giDispose=vi.spyOn(gi,'dispose'),gunDisposes=[...gunTextures.values()].map(texture=>vi.spyOn(texture,'dispose')),geometryDispose=vi.spyOn(resources.geometry,'dispose'),materialDispose=vi.spyOn(resources.material,'dispose');
    first.setName('Example');first.setDetailLevel('silhouette');expect(first.setDistanceToCamera(100)).toBe('full');expect(first.mesh.visible).toBe(true);expect(first.group.userData.originalName).toBe('Example');
    first.fire();first.animate(.1);first.animate(.1);first.dispose();first.dispose();expect(geometryDispose).not.toHaveBeenCalled();expect(second.mesh.geometry).toBe(resources.geometry);
    second.dispose();resources.dispose();resources.dispose();expect(geometryDispose).toHaveBeenCalledOnce();expect(materialDispose).toHaveBeenCalledOnce();expect(giDispose).not.toHaveBeenCalled();for(const dispose of gunDisposes)expect(dispose).not.toHaveBeenCalled();
  });
});
