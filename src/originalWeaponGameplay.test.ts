import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData,type OriginalWeaponCollection} from './originalWeapons';
import {OriginalWeaponPresentation,ORIGINAL_WEAPON_POSES,ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {WeaponState,type WeaponId} from './weapons';
import {createOriginalScope,type OriginalScopeState} from './originalScope';
interface Harness {
  originalWeapons:OriginalWeaponCollection;originalWeaponPresentation:OriginalWeaponPresentation;
  weaponState:WeaponState;weaponModels:Map<WeaponId,THREE.Group>;originalFlashes:Array<{mesh:THREE.Mesh}>;
  scene:THREE.Scene;camera:THREE.PerspectiveCamera;viewCamera:THREE.PerspectiveCamera;viewProjection:THREE.Group;
  aiming:boolean;phase:string;originalScopeFov:number;originalScopeActive:boolean;originalScopeState:OriginalScopeState;keys:Set<string>;
  openSourceScope():boolean;advanceSourceScope(created:boolean):void;elapsed:number;chatOpen:boolean;yaw:number;
  updateSourceWeaponInput(beforeGun?:()=>void):void;updateOriginalPlayerCallback():void;
  updateViewModelPresentation(dt:number,speed:number,sprint:boolean,x:number,y:number):void;
  triggerViewModelFire(id:WeaponId):void;advanceOriginalMuzzleFlashes():void;clearOriginalMuzzleFlashes():void;
  spawnOriginalMuzzleFlash(id:WeaponId):void;
  syncWeaponPresentation(id:WeaponId,equip:boolean):void;
}
function game():Harness {
  const data=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
  const collection=createOriginalWeapons({geometry:data,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});
  const result=Object.create(Game.prototype) as Harness;const worldCamera=new THREE.PerspectiveCamera(72,16/9);worldCamera.position.set(3,4,5);
  const viewCamera=new THREE.PerspectiveCamera(56,16/9),viewScene=new THREE.Scene();viewScene.add(viewCamera);
  for(const model of collection.models.values())viewCamera.add(model);
  Object.assign(result,{originalWeapons:collection,originalWeaponPresentation:new OriginalWeaponPresentation('rifle'),weaponModels:collection.models,
    weaponMetadata:new Map(),weaponState:new WeaponState(),viewRecoilPosition:new THREE.Vector3(),viewRecoilRotation:new THREE.Vector3(),
    camera:worldCamera,viewCamera,viewProjection:new THREE.Group(),scene:new THREE.Scene(),originalFlashes:[],enhancedRendering:true,
    originalScopeState:createOriginalScope(),controlsPreset:'legacy',keys:new Set(),chatOpen:false,velocity:new THREE.Vector3(),aiming:false,aimWeight:0,sprintWeight:0,originalScopeFov:50,originalScopeActive:false,phase:'playing',elapsed:1,
    el:()=>({classList:{toggle:vi.fn()},style:{setProperty:vi.fn()}})});return result;
}
describe('original weapons in actual Game presentation',()=>{
  for(const map of ['barrack','woodlands'])describe(`${map} reload before scope creation`,()=>{
    it('pins the reload, selection and scope order to the recovered edition',()=>{
      const edition=map==='woodlands'?'woodland':'barrack';
      const script=readFileSync(new URL(`../docs/research-evidence/2026-09-30/director-script-extraction/${edition}/casts/parents/ParentScript 6 - weaponry.ls`,import.meta.url),'utf8');
      const gun=script.slice(script.indexOf('on gun me'),script.indexOf('on bullettest me'));
      expect(gun.indexOf('reload(me)')).toBeLessThan(gun.indexOf('if goody.weapon = #dragunov'));
      const reload=script.slice(script.indexOf('on reload me'),script.indexOf('on gun me'));
      expect(reload).toContain('goody.weapon = VOID');expect(reload).toContain('if checkweapon(me, i) then');
    });
    function reloadClient():Harness {
      const client=game();
      Object.assign(client,{mapId:map,weaponState:new WeaponState(map),mode:'solo',playerAlive:true,
        elapsed:0,archivalWinter:false,updateWeaponReload:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),
        playOriginalCombatSound:vi.fn()});
      client.weaponState.select('sniper');client.keys.add('KeyR');client.keys.add('ShiftLeft');
      for(const id of Object.keys(client.weaponState.ammo) as WeaponId[]){client.weaponState.ammo[id]=0;client.weaponState.reserve[id]=0;}
      return client;
    }
    it('does not create a sniper actor when R exhausts every weapon',()=>{
      const client=reloadClient();client.updateSourceWeaponInput();
      expect(client.weaponState.unarmed).toBe(true);
      expect(client.originalScopeState).toEqual(createOriginalScope());
      expect(client.camera.fov).toBe(50);
      client.elapsed=1/30;client.updateSourceWeaponInput();
      expect(client.originalScopeState.active).toBe(false);client.originalWeapons.dispose();
    });
    it('checks the weapon selected by R and does not reopen on later held Shift',()=>{
      const client=reloadClient();client.weaponState.ammo.pistol=1;
      client.updateSourceWeaponInput();
      expect(client.weaponState.current).toBe('pistol');expect(client.weaponState.unarmed).toBe(false);
      expect(client.originalScopeState).toEqual(createOriginalScope());
      client.elapsed=1/30;client.updateSourceWeaponInput();
      expect(client.originalScopeState.active).toBe(false);client.originalWeapons.dispose();
    });
    it('closes an existing scope when R selects a usable fallback',()=>{
      const client=reloadClient();client.weaponState.ammo.pistol=1;
      expect(client.openSourceScope()).toBe(true);client.advanceSourceScope(true);
      client.updateSourceWeaponInput();
      expect(client.weaponState.current).toBe('pistol');
      expect(client.originalScopeState.active).toBe(false);expect(client.originalScopeState.zoomonce).toBe(1);
      expect(client.camera.fov).toBe(50);client.elapsed=1/30;client.updateSourceWeaponInput();
      expect(client.originalScopeState.active).toBe(false);client.originalWeapons.dispose();
    });
    it('creates the scope after a valid Dragunov reload and retains its birth callback',()=>{
      const client=reloadClient();client.weaponState.reserve.sniper=12;
      const creation=vi.spyOn(client,'openSourceScope');
      creation.mockImplementation(()=>{
        expect(client.weaponState.ammo.sniper).toBe(12);expect(client.weaponState.reserve.sniper).toBe(0);
        return Game.prototype['openSourceScope'].call(client);
      });
      client.updateSourceWeaponInput();
      expect(client.originalScopeState).toEqual({active:true,fov:35,mouseDelta:.5,ptog:'open',zoomonce:0});
      expect(client.camera.fov).toBe(35);client.originalWeapons.dispose();
    });
  });
  it('does not route Winter input through the source reload or scope actor',()=>{
    const client=game();Object.assign(client,{archivalWinter:true,playerAlive:true});
    client.keys.add('KeyR');client.keys.add('ShiftLeft');client.weaponState.select('sniper');
    const open=vi.spyOn(client,'openSourceScope');client.updateSourceWeaponInput();
    expect(open).not.toHaveBeenCalled();expect(client.originalScopeState).toEqual(createOriginalScope());
    client.originalWeapons.dispose();
  });
  it('equips and fires the rigid source model without procedural parts, and shares world/view projection',()=>{
    const client=game();client.syncWeaponPresentation('rifle',true);client.updateViewModelPresentation(1/30,0,false,0,0);
    const model=client.weaponModels.get('rifle')!;expect(model.rotation.order).toBe('ZYX');expect(client.camera.fov).toBe(50);expect(client.viewCamera.fov).toBe(50);
    expect(model.position.z/ORIGINAL_WEAPON_UNIT_SCALE).toBeCloseTo(5+(2-5)*.1);
    const shotPosition=model.position.clone();client.triggerViewModelFire('rifle');expect(client.originalWeaponPresentation.sourcePosition.toArray()).toEqual([...ORIGINAL_WEAPON_POSES.rifle.recoil]);
    expect(client.originalFlashes).toHaveLength(0);client.spawnOriginalMuzzleFlash('rifle'); // Explicit bullet-output seam; actual firing is covered separately.
    const flash=client.originalFlashes[0].mesh;expect(flash.matrix.elements.slice(12,15)).toEqual(shotPosition.add(client.camera.position).toArray());
    client.camera.position.x+=10;client.updateViewModelPresentation(.1,0,false,0,0);expect(flash.matrix.elements[12]).toBeLessThan(10);
    client.advanceOriginalMuzzleFlashes();expect(flash.parent).toBe(client.scene);client.advanceOriginalMuzzleFlashes();expect(client.originalFlashes).toHaveLength(0);expect(flash.parent).toBeNull();client.originalWeapons.dispose();
  });
  for(const edition of ['barrack','woodland'])it(`${edition} muzzle audit retains the actor and recycled birth ordering`,()=>{
    const base=`../docs/research-evidence/2026-09-30/director-script-extraction/${edition}/casts/parents/`;
    const actor=readFileSync(new URL(base+'ParentScript 20 - muzzle.ls',import.meta.url),'utf8');
    const pool=readFileSync(new URL(base+'MovieScript 24 - recycle and reuse.ls',import.meta.url),'utf8');
    expect(actor).toContain('bangtime = 1');
    const callback=actor.slice(actor.indexOf('on stepFrame'));
    expect(callback.indexOf('pmod.addToWorld()')).toBeLessThan(callback.indexOf('if bangtime = 0'));
    expect(callback.indexOf('storemodel(vtype, pmod)')).toBeLessThan(callback.indexOf('bangtime = bangtime - 1'));
    const recycle=pool.slice(pool.indexOf('on recyclemodel'),pool.indexOf('on recycleshader'));
    expect(recycle.indexOf('vmod.addToWorld()')).toBeLessThan(recycle.indexOf('return vmod'));
  });
  for(const map of ['barrack','woodlands'] as const)for(const fps of [15,60,240])it(`${map} muzzle follows source callbacks at ${fps} render FPS`,()=>{
    const client=game();Object.assign(client,{archivalWinter:false,mode:'solo',playerAlive:true,
      weaponState:new WeaponState(map),elapsed:0,nextSourceReloadPoll:0,
      updateWeaponReload:vi.fn(),updateHud:vi.fn()});
    client.syncWeaponPresentation('rifle',false);
    let born=false;
    client.updateSourceWeaponInput(()=>{if(!born){client.spawnOriginalMuzzleFlash('rifle');born=true;}});
    const flash=client.originalFlashes[0].mesh;
    expect(flash.visible).toBe(true);
    // Render-only calls, including repeated zero-time presentation, do not run
    // the muzzle actor or consume either callback of its lifetime.
    for(let frame=1;frame<=Math.ceil(fps/30);frame++){
      client.updateViewModelPresentation(0,0,false,0,0);
      client.elapsed=Math.min(frame/fps,1/30-1e-7);client.updateSourceWeaponInput();
      expect(flash.visible).toBe(true);expect(client.originalFlashes).toHaveLength(1);
    }
    client.elapsed=1/30;client.updateSourceWeaponInput();
    expect(flash.visible).toBe(true);expect(flash.parent).toBe(client.scene);
    client.elapsed=2/30;client.updateSourceWeaponInput();
    expect(client.originalFlashes).toHaveLength(0);expect(flash.parent).toBeNull();
    client.originalWeapons.dispose();
  });
  it('keeps each SPAS muzzle actor independent and consumes catch-up callbacks',()=>{
    const client=game();Object.assign(client,{archivalWinter:false,mode:'solo',playerAlive:true,
      weaponState:new WeaponState('barrack'),elapsed:0,nextSourceReloadPoll:0,updateWeaponReload:vi.fn()});
    client.spawnOriginalMuzzleFlash('shotgun');client.spawnOriginalMuzzleFlash('shotgun');
    const meshes=client.originalFlashes.map(record=>record.mesh);
    client.phase='paused';client.updateSourceWeaponInput();expect(meshes.every(mesh=>mesh.visible)).toBe(true);
    client.phase='playing';client.elapsed=0;client.updateSourceWeaponInput();expect(meshes.every(mesh=>mesh.visible)).toBe(true);
    client.elapsed=.1;client.updateSourceWeaponInput();expect(client.originalFlashes).toHaveLength(0);
    expect(meshes.every(mesh=>mesh.parent===null)).toBe(true);client.originalWeapons.dispose();
  });
  it('runs real goody mouse before the scope actor, preserving early-release latch and typing cleanup',()=>{
    const client=game();client.camera.position.set(0,1.72,0);client.weaponState.select('sniper');
    Object.assign(client,{mode:'solo',playerAlive:true,elapsed:0,archivalWinter:false,projectiles:[],yaw:0,pitch:0,recoil:0,
      sensitivity:1,grounded:true,arrowMovement:true,originalMouseDelta:{x:20,y:0},
      updateOriginalDoors:vi.fn(),sweepOriginalProjectile:()=>null,updateWeaponReload:vi.fn()});
    client.keys.add('ShiftLeft');client.updateSourceWeaponInput(()=>client.updateOriginalPlayerCallback());
    expect(client.yaw).toBeCloseTo(-20*.5*Math.PI/180);expect(client.originalScopeState.fov).toBe(35);
    Object.assign(client,{originalMouseDelta:{x:20,y:0}});client.elapsed=1/30;
    client.updateSourceWeaponInput(()=>client.updateOriginalPlayerCallback());
    expect(client.yaw).toBeCloseTo(-40*.5*Math.PI/180);expect(client.originalScopeState.fov).toBe(34.25);
    Object.assign(client,{originalMouseDelta:{x:20,y:0}});client.keys.clear();client.elapsed=2/30;
    client.updateSourceWeaponInput(()=>client.updateOriginalPlayerCallback());
    expect(client.yaw).toBeCloseTo(-(40*.5+20*.5*.93)*Math.PI/180);
    client.elapsed=1;client.updateSourceWeaponInput(()=>client.updateOriginalPlayerCallback());
    expect(client.originalScopeState.active).toBe(true);expect(client.originalScopeState.ptog).toBe('open');
    client.chatOpen=true;client.elapsed=31/30;client.updateSourceWeaponInput(()=>client.updateOriginalPlayerCallback());
    expect(client.originalScopeState.active).toBe(false);expect(client.originalScopeState.mouseDelta).toBe(.5);expect(client.camera.fov).toBe(50);
    client.originalWeapons.dispose();
  });
  it('keeps Modern aim immediately releasable without the Legacy actor latch',()=>{
    const client=game();Object.assign(client,{controlsPreset:'modern'});client.weaponState.select('sniper');client.aiming=true;
    client.updateViewModelPresentation(0,0,false,0,0);expect(client.camera.fov).toBe(35);
    client.updateViewModelPresentation(2,0,false,0,0);expect(client.camera.fov).toBe(8);
    client.aiming=false;client.updateViewModelPresentation(0,0,false,0,0);expect(client.camera.fov).toBe(50);
    expect(client.originalScopeState.active).toBe(false);client.originalWeapons.dispose();
  });
  it('uses only Dragunov source zoom and preserves rigid loaded-RPG attachment',()=>{
    const client=game();client.weaponState.select('sniper');client.syncWeaponPresentation('sniper',true);client.aiming=true;client.keys.add('ShiftLeft');
    expect(client.openSourceScope()).toBe(true);client.advanceSourceScope(true);
    client.updateViewModelPresentation(0,0,false,0,0);expect(client.camera.fov).toBe(35);
    client.updateViewModelPresentation(2,0,false,0,0);expect(client.camera.fov).toBe(35);
    for(let i=0;i<36;i++)client.advanceSourceScope(false);
    expect(client.camera.fov).toBe(8);expect(client.viewCamera.fov).toBe(8);expect(client.originalScopeState.mouseDelta).toBeCloseTo(.5*.93**36);
    client.aiming=false;client.keys.clear();client.advanceSourceScope(false);client.updateViewModelPresentation(0,0,false,0,0);expect(client.camera.fov).toBe(50);
    client.weaponState.select('rpg');client.syncWeaponPresentation('rpg',true);client.weaponState.ammo.rpg=0;client.updateViewModelPresentation(0,0,false,0,0);expect(client.originalWeapons.rocket.visible).toBe(false);
    client.weaponState.ammo.rpg=1;client.updateViewModelPresentation(0,0,false,0,0);expect(client.originalWeapons.rocket.visible).toBe(true);client.triggerViewModelFire('rpg');expect(client.originalFlashes).toHaveLength(0);client.originalWeapons.dispose();
  });
});
