import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {SoldierMaterialLibrary} from './soldierMaterials';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';

const base=new URL('../public/assets/original-soldier/',import.meta.url);
const read=(name:string)=>JSON.parse(readFileSync(new URL(name,base),'utf8'));
const cleanup:Array<()=>void>=[];
afterEach(()=>{for(const dispose of cleanup.splice(0))dispose();vi.restoreAllMocks();});
function actor(source=true){
  const library=new SoldierMaterialLibrary({presentation:'modern',tier:'low'});
  const textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
  const gi=new THREE.Texture();
  const resources=source?createOriginalSoldierResources({geometry:read('geometry.json') as OriginalSoldierAssets['geometry'],rigMotion:read('rig-motion.json') as OriginalSoldierAssets['rigMotion'],texture:gi},{geometry:read('../original-weapons/geometry.json') as OriginalWeaponGeometryData,textures}):undefined;
  // Use Game's actual factory rather than reproducing the private Enemy class.
  const game=Object.create(Game.prototype) as any;
  Object.assign(game,{scene:new THREE.Scene(),enemies:[],soldierMaterialLibrary:library,originalSoldierResources:resources,arena:{spawnPoints:[new THREE.Vector3(),new THREE.Vector3()]}});
  game.spawnEnemies();const enemy=game.enemies[0];
  enemy.group.rotation.set(0,0,0);enemy.alert=3;enemy.strafe=1;enemy.nextDecision=Infinity;enemy.lastShot=Infinity;
  cleanup.push(()=>{game.clearEnemies();resources?.dispose();library.dispose();gi.dispose();for(const texture of textures.values())texture.dispose();});
  return enemy;
}
const delta=1/30,opponent=new THREE.Vector3(0,1.55,10);

describe('actual source Enemy GI stride follows travelled distance',()=>{
  it('counts pure strafe once, matching both recovered edition scripts',()=>{
    for(const edition of ['woodland','barrack']){
      const script=readFileSync(new URL(`../docs/research-evidence/2026-09-30/director-script-extraction/${edition}/casts/parents/ParentScript 8 - baddies.ls`,import.meta.url),'utf8');
      expect(script).toContain('bon = bon + (speed.magnitude * 10)');
    }
    const enemy=actor(),before=enemy.group.position.clone();
    enemy.update(delta,0,opponent,{colliders:[]},vi.fn());
    expect(enemy.rig).toBeInstanceOf(OriginalSoldier);
    expect(enemy.group.position.distanceTo(before)).toBeCloseTo(2.65*delta,12);
    expect(enemy.rig.debugState().timeMs).toBeCloseTo(enemy.group.position.distanceTo(before)/ORIGINAL_MAP_SCALE*10,10);
  });
  it('includes support-height movement in the source position magnitude',()=>{
    const enemy=actor(),before=enemy.group.position.clone();
    enemy.update(delta,0,opponent,{colliders:[],supportHeightAt:(x:number)=>x*.75},vi.fn());
    expect(enemy.group.position.y).toBeCloseTo(enemy.group.position.x*.75,12);
    expect(enemy.rig.debugState().timeMs).toBeCloseTo(enemy.group.position.distanceTo(before)/ORIGINAL_MAP_SCALE*10,10);
    expect(enemy.rig.debugState().timeMs).toBeGreaterThan(2.65*delta/ORIGINAL_MAP_SCALE*10);
  });
  it('does not advance stride when a collider rejects the proposed move',()=>{
    const enemy=actor();
    enemy.update(delta,0,opponent,{colliders:[new THREE.Box3(new THREE.Vector3(-1,-1,-1),new THREE.Vector3(1,3,1))]},vi.fn());
    expect(enemy.group.position.length()).toBe(0);expect(enemy.rig.debugState().timeMs).toBe(0);
  });
  it('keeps zero-duration updates finite',()=>{
    const enemy=actor();enemy.update(0,0,opponent,{colliders:[]},vi.fn());
    expect(enemy.rig.debugState().timeMs).toBe(0);
  });
  it('preserves Winter total-speed and lateral-component animation inputs',()=>{
    const enemy=actor(false),animate=vi.spyOn(enemy.rig,'animate');
    enemy.update(delta,0,opponent,{colliders:[]},vi.fn());
    expect(animate).toHaveBeenCalledWith(delta,expect.objectContaining({moveSpeed:2.65,strafeSpeed:-2.65,alive:true}));
  });
});
