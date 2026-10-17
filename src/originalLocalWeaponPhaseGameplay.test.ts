import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {createOriginalWeapons,ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {OriginalWeaponPresentation,ORIGINAL_WEAPON_UNIT_SCALE as S} from './originalWeaponPresentation';
import {createOriginalScope} from './originalScope';
import {WeaponState,type WeaponId} from './weapons';
import {ORIGINAL_WEAPON_WAIT} from '../shared/originalWeaponCounter';

const geometry=JSON.parse(readFileSync(new URL('../public/assets/original-weapons/geometry.json',import.meta.url),'utf8')) as OriginalWeaponGeometryData;
// Real source models, presentation, ammunition, counters, selection and shot
// execution. World hit queries, projectile spawning, audio and UI are adapters.
function fixture(map:'barrack'|'woodlands',weapon:WeaponId='rifle') {
  const collection=createOriginalWeapons({geometry,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});
  const camera=new THREE.PerspectiveCamera(72,16/9);camera.position.set(3,4,5);
  const viewCamera=new THREE.PerspectiveCamera(56,16/9);new THREE.Scene().add(viewCamera);
  for(const model of collection.models.values())viewCamera.add(model);
  // The prototype harness intentionally exposes private integration methods.
  const game=Object.create(Game.prototype) as any;
  const state=new WeaponState(map);
  for(const id of Object.keys(state.ammo) as WeaponId[]){state.ammo[id]=id==='rpg'?1:10;state.reserve[id]=30;}
  state.select(weapon);
  Object.assign(game,{mapId:map,mode:'solo',archivalWinter:false,phase:'playing',playerAlive:true,
    elapsed:0,nextSourceReloadPoll:0,originalActorDispatchGeneration:0,arena:{runtime:{}},projectiles:[],
    originalWeapons:collection,originalWeaponPresentation:new OriginalWeaponPresentation(weapon),weaponModels:collection.models,
    weaponMetadata:new Map(),weaponState:state,viewRecoilPosition:new THREE.Vector3(),viewRecoilRotation:new THREE.Vector3(),
    camera,viewCamera,viewProjection:new THREE.Group(),scene:new THREE.Scene(),originalFlashes:[],enhancedRendering:true,
    originalScopeState:createOriginalScope(),originalScopeFov:50,originalScopeActive:false,controlsPreset:'legacy',
    keys:new Set<string>(),chatOpen:false,velocity:new THREE.Vector3(),aiming:false,aimWeight:0,sprintWeight:0,
    firing:false,yaw:0,pitch:0,recoil:0,shots:0,hits:0,muzzleLight:{intensity:0},worldMuzzleLight:{intensity:0},
    audio:{play:vi.fn()},playOriginalCombatSound:vi.fn(),updateHud:vi.fn(),setMessage:vi.fn(),
    enemies:[],soloCorpses:new Map(),raycaster:new THREE.Raycaster(),raycastWorld:vi.fn(()=>null),spawnTracer:vi.fn(),
    launchExplosive:vi.fn(),spawnMuzzleParticles:vi.fn(),spawnCasing:vi.fn(),
    el:()=>({classList:{toggle:vi.fn()},style:{setProperty:vi.fn()}})});
  game.syncWeaponPresentation(weapon,false);
  vi.spyOn(game,'hitscan');
  state.applyOriginalCounter({waitgun:map==='woodlands'?0:ORIGINAL_WEAPON_WAIT[weapon],poldwaitgun:0,ready:true},0);
  return {game,state,collection,presentation:game.originalWeaponPresentation as OriginalWeaponPresentation,
    dispose:()=>{game.clearOriginalMuzzleFlashes();collection.dispose();}};
}
function expectPosition(value:THREE.Vector3,expected:readonly number[]) {
  for(let i=0;i<3;i++)expect(value.getComponent(i)).toBeCloseTo(expected[i],12);
}
function expectDisplayed(game:any,weapon:WeaponId,source:readonly number[]) {
  expectPosition(game.weaponModels.get(weapon).position,source.map(value=>value*S));
}

describe('local source weapon phases through Game nominal callbacks',()=>{
  for(const map of ['barrack','woodlands'] as const)describe(map,()=>{
    it('fires from rest and assigns the once-eased recoil on the same callback',()=>{
      const f=fixture(map);try {
        f.game.firing=true;f.game.updateSourceWeaponInput();
        expect(f.game.hitscan).toHaveBeenCalledOnce();expect(f.state.ammo.rifle).toBe(9);
        expectPosition(f.presentation.sourcePosition,[3,-10,6.5]);expectDisplayed(f.game,'rifle',[3,-10,6.5]);
      }finally{f.dispose();}
    });
    it('assigns the held-R load pose after one interpolation on its reload callback',()=>{
      const f=fixture(map);try {
        f.game.keys.add('KeyR');f.game.updateSourceWeaponInput();
        expect(f.state.reloading).toBe(true);expect(f.state.ammo.rifle).toBeGreaterThan(10);
        expectPosition(f.presentation.sourcePosition,[-10.5,-19,4.7]);expectDisplayed(f.game,'rifle',[-10.5,-19,4.7]);
      }finally{f.dispose();}
    });
    it('fires the former displayed matrix before keyboard selection and its eased equip pose',()=>{
      const f=fixture(map);try {
        const rifle=f.collection.models.get('rifle')!;
        rifle.updateWorldMatrix(true,false);f.game.camera.updateWorldMatrix(true,false);
        const shotMatrix=new THREE.Matrix4().multiplyMatrices(f.game.camera.matrixWorld,rifle.matrixWorld);
        f.game.firing=true;f.game.keys.add('Digit1');f.game.updateSourceWeaponInput();
        expect(f.state.current).toBe('pistol');expect(f.state.ammo.rifle).toBe(9);expect(f.state.ammo.pistol).toBe(10);
        expect(f.game.originalFlashes).toHaveLength(1);
        const flash=f.game.originalFlashes[0].mesh as THREE.Mesh;
        for(let i=0;i<16;i++)expect(flash.matrix.elements[i]).toBeCloseTo(shotMatrix.elements[i],12);
        expect(flash.geometry).toBe(f.collection.resources.get('mfak47')!.geometry);
        expectPosition(f.presentation.sourcePosition,[-10.3,-18.9,3.5]);expectDisplayed(f.game,'pistol',[-10.3,-18.9,3.5]);
        expectDisplayed(f.game,'rifle',[3,-10,2]);
      }finally{f.dispose();}
    });
    it('reinitializes the load pose on every held keyboard selection callback',()=>{
      const f=fixture(map);try {
        f.game.keys.add('Digit1');f.game.updateSourceWeaponInput();
        expectPosition(f.presentation.sourcePosition,[-10.3,-18.9,3.5]);
        f.game.elapsed=1/30;f.game.updateSourceWeaponInput();
        expect(f.state.current).toBe('pistol');expectPosition(f.presentation.sourcePosition,[-10.3,-18.9,3.5]);
        expectDisplayed(f.game,'pistol',[-10.3,-18.9,3.5]);
      }finally{f.dispose();}
    });
    it('advances one ticker step per callback during bounded catch-up',()=>{
      const f=fixture(map);try {
        f.game.velocity.set(150*S,0,0);f.game.elapsed=2/30;
        const update=vi.spyOn(f.presentation,'update');const after=vi.fn();
        f.game.updateSourceWeaponInput(undefined,after);
        expect(after).toHaveBeenCalledTimes(3);expect(update).toHaveBeenCalledTimes(3);
        for(const call of update.mock.calls){expect(call[0]).toBe(1/30);expect(call[1]).toBeCloseTo(100*S,12);}
        expect(f.presentation.ticker).toBeCloseTo(16,12);expect(f.game.elapsed).toBe(2/30);
      }finally{f.dispose();}
    });
    it('still presents once per callback when authority has already advanced the gun',()=>{
      const f=fixture(map);try {
        Object.assign(f.game,{mode:'online',sourceGunAuthorityLocalTime:1});
        f.game.velocity.set(150*S,0,0);f.game.elapsed=2/30;f.game.firing=true;
        const counter=f.state.originalCounterState,update=vi.spyOn(f.presentation,'update'),before=vi.fn();
        f.game.updateSourceWeaponInput(before);
        expect(before).toHaveBeenCalledTimes(3);expect(update).toHaveBeenCalledTimes(3);
        expect(f.presentation.ticker).toBeCloseTo(16,12);expect(f.state.originalCounterState).toEqual(counter);
        expect(f.game.hitscan).not.toHaveBeenCalled();
      }finally{f.dispose();}
    });
    it('advances VOID ticker while retaining its stale model and source pose',()=>{
      const f=fixture(map);try {
        f.state.unarmed=true;f.game.velocity.set(150*S,0,0);f.presentation.reload();
        const pose=f.presentation.sourcePosition.clone(),model=f.collection.models.get('rifle')!.position.clone();
        const update=vi.spyOn(f.presentation,'update');f.game.updateSourceWeaponInput();
        expect(f.presentation.ticker).toBeCloseTo(6,12);expect(f.presentation.sourcePosition).toEqual(pose);
        expect(f.collection.models.get('rifle')!.position).toEqual(model);expect(update).not.toHaveBeenCalled();
      }finally{f.dispose();}
    });
    for(const transition of ['terminal','reset'] as const)it(`cancels final presentation after a beforeGun ${transition}`,()=>{
      const f=fixture(map);try {
        f.presentation.reload();const pose=f.presentation.sourcePosition.clone(),model=f.collection.models.get('rifle')!.position.clone();
        const update=vi.spyOn(f.presentation,'update'),after=vi.fn();
        f.game.updateSourceWeaponInput(()=>{
          if(transition==='terminal')f.game.phase='lost';
          else{f.game.resetOriginalActorDispatch();f.game.elapsed=42;}
        },after);
        expect(update).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled();
        expect(f.presentation.ticker).toBe(1);expect(f.presentation.sourcePosition).toEqual(pose);
        expect(f.collection.models.get('rifle')!.position).toEqual(model);expect(f.game.elapsed).toBe(transition==='reset'?42:0);
      }finally{f.dispose();}
    });
    it('retains the RPG loaded model through its last-shot debit until the next gun phase',()=>{
      const f=fixture(map,'rpg');try {
        f.state.reserve.rpg=0;f.game.firing=true;f.game.updateSourceWeaponInput();
        expect(f.game.launchExplosive).toHaveBeenCalledWith('rpg');expect(f.state.ammo.rpg).toBe(0);
        expect(f.collection.rocket.visible).toBe(true);
        expectPosition(f.presentation.sourcePosition,[-10.3,-19.3,2.5]);expectDisplayed(f.game,'rpg',[-10.3,-19.3,2.5]);
        f.game.firing=false;f.game.elapsed=1/30;f.game.updateSourceWeaponInput();
        expect(f.collection.rocket.visible).toBe(false);expect(f.game.launchExplosive).toHaveBeenCalledOnce();
      }finally{f.dispose();}
    });
    it('reparents the empty-chamber RPG rocket in keyboard whichgun with reserve available',()=>{
      const f=fixture(map);try {
        f.state.ammo.rpg=0;f.state.reserve.rpg=1;
        f.state.applyOriginalCounter({waitgun:map==='woodlands'?20:0,poldwaitgun:0,ready:false},0);
        f.game.keys.add('Digit5');f.game.updateSourceWeaponInput();
        expect(f.state.current).toBe('rpg');expect(f.state.ammo.rpg).toBe(0);expect(f.collection.rocket.visible).toBe(true);
        expectPosition(f.presentation.sourcePosition,[-10.3,-19.3,2.5]);
        f.game.keys.clear();f.game.elapsed=1/30;f.game.updateSourceWeaponInput();
        expect(f.state.ammo.rpg).toBe(0);expect(f.collection.rocket.visible).toBe(false);
      }finally{f.dispose();}
    });
    it('defers body presentation through the actual gameplay-frame wrapper',()=>{
      const f=fixture(map);try {
        // Body, coordinator phases, and explosives are explicit seams here:
        // this checks weapon presentation dispatch, not private-world physics.
        f.game.beginSoloCallback=vi.fn();f.game.completeSoloGoody=vi.fn();
        f.game.updateOriginalPlayerCallback=vi.fn();f.game.updateOriginalExplosives=vi.fn();f.game.updateAuthoredProjectiles=vi.fn();
        const update=vi.spyOn(f.presentation,'update');f.game.advanceGameplayFrame(1/30);
        expect(f.game.updateOriginalPlayerCallback).toHaveBeenCalledExactlyOnceWith(true);
        expect(update).toHaveBeenCalledOnce();expect(update.mock.calls[0][0]).toBe(1/30);
        expect(f.game.updateOriginalExplosives).toHaveBeenCalledExactlyOnceWith(true,[]);
        expect(f.game.updateAuthoredProjectiles).toHaveBeenCalledExactlyOnceWith(1/30);
      }finally{f.dispose();}
    });
  });
});
