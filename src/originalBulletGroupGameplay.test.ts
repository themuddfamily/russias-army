import * as THREE from 'three';
import {describe,expect,it,vi} from 'vitest';
import {Game} from './game';
import {WEAPONS,WeaponState} from './weapons';
import {createOriginalSceneGeometry,type OriginalSceneMesh,type OriginalSceneNode} from '../shared/originalSceneGeometry';

const identity=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
function node(name:string,resource=name,parent='World'):OriginalSceneNode {
 return {name,resource,parent,matrix:[...identity],visibility:1,shader:'default'};
}
/** World-space vertical quad, encoded in the recovered scene's Z-up basis. */
function wall(resource:string,distance:number):OriginalSceneMesh {
 return {resource,part:0,positions:[[-3,distance,-3],[3,distance,-3],[3,distance,3],[-3,distance,3]],faces:[[0,1,2],[0,2,3]],normals:[],tex_coords:[]};
}
function fixture(map:'barrack'|'woodlands',removedName:string,retainedWall=false,descendant=false){
 const nodes=descendant?[node(removedName,''),node('group-child','removed',removedName)]:[node(removedName,'removed')];
 const meshes=[wall('removed',1)];
 if(retainedWall){nodes.push(node('floorwall','retained'));meshes.push(wall('retained',1.5));}
 const geometry=createOriginalSceneGeometry({nodes,meshes},{scale:1,cellSize:.5});
 const remoteGeometry=new THREE.PlaneGeometry(2,2),remoteMaterial=new THREE.MeshBasicMaterial({side:THREE.DoubleSide});
 const target=new THREE.Mesh(remoteGeometry,remoteMaterial);target.position.z=-2;target.userData.remoteId='remote';target.updateMatrixWorld(true);
 const camera=new THREE.PerspectiveCamera();camera.updateMatrixWorld(true);
 const g=Object.create(Game.prototype) as any;
 Object.assign(g,{mapId:map,archivalWinter:false,mode:'online',phase:'playing',camera,weaponState:new WeaponState(map),
  keys:new Set(),controlsPreset:'legacy',aiming:false,arrowMovement:false,elapsed:0,
  arena:{runtime:{geometry},colliders:[]},remotePlayers:new Map([['remote',{sourceActorActive:true,hitMeshes:[target],group:new THREE.Group()}]]),sourceTimeoutCorpses:new Set(),enemies:[],raycaster:new THREE.Raycaster(),playOriginalCombatSound:vi.fn(),
  flushOriginalReconciliation:vi.fn(),network:{shoot:vi.fn(()=>'bullet-group-shot'),hit:vi.fn()},spawnTracer:vi.fn(),
  originalCombatEffectPresentation:{spawnBlood:vi.fn(),spawnMiss:vi.fn()}});
 g.weaponState.select('pistol');
 return {g,geometry,target,dispose:()=>{target.removeFromParent();remoteGeometry.dispose();remoteMaterial.dispose();}};
}
function ordinaryRayStillHitsRemovedGroup(g:any,model:string){
 const direction=new THREE.Vector3(0,0,-1);
 expect(g.distanceToWorld(g.camera.position,direction,10)).toBe(1);
 expect(g.raycastWorld(g.camera.position,direction,10)).toMatchObject({id:model,distance:1});
}

describe('actual Game bullet-only removed source groups',()=>{
 for(const map of ['barrack','woodlands'] as const){
  it(`${map} hits the remote behind outerfencing without changing ordinary world rays`,()=>{
   const s=fixture(map,'outerfencing');
   try{
    ordinaryRayStillHitsRemovedGroup(s.g,'outerfencing');
    expect(s.g.hitscan(WEAPONS.pistol)).toBe(true);
    expect(s.g.network.shoot).toHaveBeenCalledTimes(1);
    expect(s.g.network.hit).toHaveBeenCalledExactlyOnceWith({shotId:'bullet-group-shot',targetId:'remote'});
    expect(s.g.originalCombatEffectPresentation.spawnBlood).toHaveBeenCalledTimes(1);
    expect(s.g.originalCombatEffectPresentation.spawnMiss).not.toHaveBeenCalled();
    expect(s.g.spawnTracer.mock.calls[0][0].z).toBe(-2);
    ordinaryRayStillHitsRemovedGroup(s.g,'outerfencing');
   }finally{s.dispose();}
  });
  it(`${map} removes descendant ray geometry with its outerfencing parent`,()=>{
   const s=fixture(map,'outerfencing',false,true);
   try{
    ordinaryRayStillHitsRemovedGroup(s.g,'group-child');
    expect(s.g.hitscan(WEAPONS.pistol)).toBe(true);
    expect(s.g.network.hit).toHaveBeenCalledExactlyOnceWith({shotId:'bullet-group-shot',targetId:'remote'});
    ordinaryRayStillHitsRemovedGroup(s.g,'group-child');
   }finally{s.dispose();}
  });
  it(`${map} retains a nearer ordinary wall after excluding outerfencing`,()=>{
   const s=fixture(map,'outerfencing',true);
   try{
    ordinaryRayStillHitsRemovedGroup(s.g,'outerfencing');
    expect(s.g.hitscan(WEAPONS.pistol)).toBe(true);
    expect(s.g.network.shoot).toHaveBeenCalledTimes(1);
    expect(s.g.network.hit).not.toHaveBeenCalled();
    expect(s.g.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();
    expect(s.g.originalCombatEffectPresentation.spawnMiss).toHaveBeenCalledTimes(1);
    expect(s.g.originalCombatEffectPresentation.spawnMiss.mock.calls[0][0].z).toBe(-1.5);
    expect(s.g.spawnTracer.mock.calls[0][0].z).toBe(-1.5);
   }finally{s.dispose();}
  });
 }
 for(const map of ['barrack','woodlands'] as const)it(`${map} keeps its recovered birch group membership`,()=>{
  const s=fixture(map,'birch');
  try{
   ordinaryRayStillHitsRemovedGroup(s.g,'birch');
   expect(s.g.hitscan(WEAPONS.pistol)).toBe(true);
   if(map==='woodlands'){
    expect(s.g.network.hit).toHaveBeenCalledExactlyOnceWith({shotId:'bullet-group-shot',targetId:'remote'});
    expect(s.g.originalCombatEffectPresentation.spawnBlood).toHaveBeenCalledTimes(1);
    expect(s.g.originalCombatEffectPresentation.spawnMiss).not.toHaveBeenCalled();
   }else{
    expect(s.g.network.hit).not.toHaveBeenCalled();
    expect(s.g.originalCombatEffectPresentation.spawnBlood).not.toHaveBeenCalled();
    expect(s.g.originalCombatEffectPresentation.spawnMiss).toHaveBeenCalledTimes(1);
    expect(s.g.spawnTracer.mock.calls[0][0].z).toBe(-1);
   }
   ordinaryRayStillHitsRemovedGroup(s.g,'birch');
  }finally{s.dispose();}
 });
});
