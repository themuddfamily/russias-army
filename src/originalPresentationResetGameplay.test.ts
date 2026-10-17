import * as THREE from 'three';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {OriginalWeaponPresentation} from './originalWeaponPresentation';
import {createOriginalScope,type OriginalScopeState} from './originalScope';
import {WeaponState} from './weapons';

interface ResetHarness {
  resetCombatPresentation():void;
  camera:THREE.PerspectiveCamera;
  viewCamera:THREE.PerspectiveCamera;
  viewProjection:THREE.Group;
  originalScopeState:OriginalScopeState;
  originalScopeActive:boolean;
  originalScopeFov:number;
}

function harness(map:'barrack'|'woodlands'|'winter') {
  const elements=new Map<string,{style:Record<string,string>;classList:{remove:ReturnType<typeof vi.fn>;toggle:ReturnType<typeof vi.fn>}}>();
  const element=(id:string)=>{
    if(!elements.has(id))elements.set(id,{style:{},classList:{remove:vi.fn(),toggle:vi.fn()}});
    return elements.get(id)!;
  };
  vi.stubGlobal('document',{getElementById:element});
  const client=Object.create(Game.prototype) as ResetHarness;
  const camera=new THREE.PerspectiveCamera(8,16/9,.05,260);
  const viewCamera=new THREE.PerspectiveCamera(8,16/9,.05,260);
  const viewProjection=new THREE.Group();viewProjection.scale.set(2,2,2);
  Object.assign(client,{mapId:map,archivalWinter:map==='winter',camera,viewCamera,viewProjection,
    originalWeaponPresentation:map==='winter'?undefined:new OriginalWeaponPresentation('sniper'),
    originalScopeState:{...createOriginalScope(),active:true,fov:8,mouseDelta:.1,zoomonce:0},
    originalScopeActive:true,originalScopeFov:8,weaponState:new WeaponState(),
    domCache:new Map(),immersiveCaptureGeneration:0,
    viewRecoilPosition:new THREE.Vector3(),viewRecoilRotation:new THREE.Vector3(),
    muzzleLight:{intensity:1},worldMuzzleLight:{intensity:1},originalFlashes:[],
    combatEffects:{clear:vi.fn()},blastLights:[],weaponMetadata:new Map()});
  return {client,element};
}

afterEach(()=>vi.unstubAllGlobals());

describe('actual Game combat presentation reset projection',()=>{
  for(const map of ['barrack','woodlands'] as const)it(`${map} clears scope and preserves shared source projection before another callback`,()=>{
    const {client,element}=harness(map);
    client.resetCombatPresentation();
    expect(client.originalScopeState).toEqual(createOriginalScope());
    expect(client.originalScopeActive).toBe(false);
    expect(client.originalScopeFov).toBe(50);
    expect(client.camera.fov).toBe(50);
    expect(client.viewCamera.fov).toBe(50);
    expect(client.viewCamera.projectionMatrix.elements).toEqual(client.camera.projectionMatrix.elements);
    expect(client.viewProjection.scale.toArray()).toEqual([1,1,1]);
    expect(element('scope-overlay').classList.toggle).toHaveBeenCalledWith('active',false);
  });

  it('retains the authored Winter view-camera reset',()=>{
    const {client}=harness('winter');
    client.resetCombatPresentation();
    expect(client.originalScopeState).toEqual(createOriginalScope());
    expect(client.originalScopeActive).toBe(false);
    expect(client.viewCamera.fov).toBe(56);
    const expected=new THREE.PerspectiveCamera(56,16/9,.05,260);
    expect(client.viewCamera.projectionMatrix.elements).toEqual(expected.projectionMatrix.elements);
  });
});
