import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {RemotePlayer} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';
const read=(name:string)=>JSON.parse(readFileSync(new URL(`../public/assets/${name}`,import.meta.url),'utf8'));
function resources(){return createOriginalSoldierResources({geometry:read('original-soldier/geometry.json'),rigMotion:read('original-soldier/rig-motion.json'),texture:new THREE.Texture()} as OriginalSoldierAssets,{geometry:read('original-weapons/geometry.json') as OriginalWeaponGeometryData,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});}
const state={id:'original-peer',name:'GI',x:0,y:0,z:0,yaw:.4,pitch:.3,health:100,frags:0,deaths:0,weapon:'launcher' as const,alive:true};
describe('original GI remote integration',()=>{
  it('uses recovered skin for every selected weapon and retains it at long range',()=>{
    const bundle=resources(),remote=new RemotePlayer(state.id,state.name,undefined,bundle);
    remote.apply(state,true);remote.update(1/30,{x:0,y:0,z:200});
    expect(remote.debugState().original).toMatchObject({bones:25,vertices:742,triangles:832,detailLevel:'full',weapon:'launcher'});
    expect(remote.debugState().rendered.yaw).toBeCloseTo(state.yaw+Math.PI);
    for(const weapon of ['pistol','shotgun','rifle','launcher','rpg','sniper'] as const){remote.apply({...state,weapon});remote.update(1/30);expect(remote.debugState().original?.weapon).toBe(weapon);}
    remote.dispose();bundle.dispose();
  });
  it('advances source stride from interpolated distance without the authored speed cap',()=>{
    const bundle=resources(),remote=new RemotePlayer(state.id,state.name,undefined,bundle);remote.apply(state,true);
    remote.apply({...state,x:2});remote.update(1/30);
    const distance=remote.debugState().rendered.x;
    expect(distance/(1/30)).toBeGreaterThan(6.5);
    expect(remote.debugState().original?.timeMs).toBeCloseTo(distance/ORIGINAL_MAP_SCALE*10);
    remote.fire();expect(remote.debugState().original?.timeMs).toBe(2000);
    remote.apply({...state,alive:false,health:0});expect(remote.debugState().original?.alive).toBe(false);
    remote.update(1/30);expect(remote.debugState().original?.timeMs).toBe(2408);
    remote.apply({...state,alive:true},true);expect(remote.debugState().original).toMatchObject({alive:true,timeMs:0,weapon:'launcher'});
    remote.dispose();bundle.dispose();
  });
});
