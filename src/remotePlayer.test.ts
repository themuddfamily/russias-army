import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {RemotePlayer,type RemoteState} from './remotePlayer';
import {createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';

const assetBase=new URL('../public/assets/',import.meta.url);
function originalResources(){return createOriginalSoldierResources({
  geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',assetBase),'utf8')) as OriginalSoldierAssets['geometry'],
  rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',assetBase),'utf8')) as OriginalSoldierAssets['rigMotion'],texture:new THREE.Texture(),
},{geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',assetBase),'utf8')) as OriginalWeaponGeometryData,textures:new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]))});}
const sourceState:RemoteState={id:'source-timeout',name:'SOURCE',x:2,y:3,z:4,yaw:.5,pitch:.1,health:100,frags:0,deaths:0,weapon:'launcher',alive:true,sourceMotionTime:137};

function visible(root:THREE.Object3D,name:string):boolean {
  let current:THREE.Object3D|null=root.getObjectByName(name)??null;
  while(current){if(!current.visible)return false;current=current.parent;}
  return true;
}

describe('RemotePlayer presentation LOD',()=>{
  it('selects distance tiers from the rendered position without changing interpolation',()=>{
    const remote=new RemotePlayer('remote-lod','LOD');
    remote.apply({id:'remote-lod',name:'LOD',x:0,y:0,z:0,yaw:0,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true},true);

    remote.update(1/60,{x:0,y:1.6,z:60});
    expect(visible(remote.group,'soldier-detailed')).toBe(false);
    expect(visible(remote.group,'soldier-silhouette')).toBe(true);

    remote.update(1/60,{x:0,y:1.6,z:0});
    expect(visible(remote.group,'soldier-detailed')).toBe(true);
    expect(visible(remote.group,'soldier-silhouette')).toBe(false);
    expect(remote.debugState().rendered).toMatchObject({x:0,y:0,z:0});
    remote.dispose();
  });

  it('keeps Winter exponential movement and shortest-path angular interpolation',()=>{
    const remote=new RemotePlayer('winter','WINTER');
    const state={id:'winter',name:'WINTER',x:0,y:0,z:0,yaw:-.1,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle' as const,alive:true};
    remote.apply(state,true);remote.apply({...state,x:9,yaw:-Math.PI*2+.1});remote.update(1/60);
    expect(remote.debugState().rendered.x).toBeCloseTo(9*(1-Math.exp(-.2)));
    expect(remote.debugState().rendered.yaw).toBeCloseTo(Math.PI-.1+.2*.2);
    expect(remote.debugState().sourceMovement).toBeUndefined();remote.dispose();
  });

  it('keeps the viewer argument optional for non-render callers',()=>{
    const remote=new RemotePlayer('remote-compatible','COMPAT');
    expect(()=>remote.update(1/60)).not.toThrow();
    remote.dispose();
  });
});

describe('source remote timeout presentation',()=>{
  it('a dead receipt keeps the last where target and gun until the next source callback',()=>{
    const resources=originalResources(),remote=new RemotePlayer(sourceState.id,sourceState.name,undefined,resources,true);
    try{
      remote.apply(sourceState,true);remote.apply({...sourceState,x:11});
      const before=remote.debugState();
      remote.apply({...sourceState,name:'DEAD PAYLOAD',x:99,y:99,z:99,yaw:2,weapon:'pistol',sourceMotionTime:3008,health:0,alive:false});
      expect(remote.alive).toBe(false);expect(remote.sourceActorActive).toBe(true);expect(remote.weapon).toBe('launcher');expect(remote.name).toBe('SOURCE');
      expect(remote.debugState().rendered).toEqual(before.rendered);expect(remote.debugState().authoritative).toEqual(before.authoritative);
      expect(remote.debugState().sourceMovement).toEqual(before.sourceMovement);expect(remote.debugState().original).toMatchObject({alive:true,timeMs:137});
      remote.fire();expect(remote.debugState().sourceMotionTime).toBeUndefined();
      expect(remote.update(0,undefined,0)).toBeUndefined();expect(remote.debugState().original).toMatchObject({alive:true,timeMs:137});
      const death=remote.update(1/30,undefined,1);
      expect(death).toEqual({reason:'death',id:sourceState.id,name:'SOURCE',weapon:'launcher',position:{x:3,y:3,z:4},yaw:.5+Math.PI,callbackOffset:1});
      expect(remote.debugState().sourceMovement?.steps).toBe(9);expect(remote.debugState().original).toMatchObject({alive:false,timeMs:3000,deathBon:0});
      expect(remote.sourceActorActive).toBe(false);
      remote.apply({...sourceState,x:90,weapon:'pistol',alive:true});remote.fire();
      expect(remote.alive).toBe(false);expect(remote.weapon).toBe('launcher');expect(remote.debugState().rendered.x).toBe(3);
      expect(remote.update(1/30,undefined,1)).toBeUndefined();expect(remote.debugState().original).toMatchObject({timeMs:2408,deathBon:8});
      remote.apply({...sourceState,alive:false,sourceMotionTime:3008});expect(remote.debugState().original).toMatchObject({timeMs:2408,deathBon:8});
    }finally{remote.dispose();resources.dispose();}
  });

  it('genuine where data updates a pending baddie without cancelling its death',()=>{
    const resources=originalResources(),remote=new RemotePlayer(sourceState.id,sourceState.name,undefined,resources,true);
    try{
      remote.apply(sourceState,true);remote.apply({...sourceState,alive:false,health:0});
      remote.apply({...sourceState,x:11,weapon:'pistol',sourceMotionTime:440});
      expect(remote.alive).toBe(false);expect(remote.health).toBe(0);expect(remote.sourceActorActive).toBe(true);expect(remote.weapon).toBe('pistol');
      expect(remote.debugState().sourceMovement?.steps).toBe(10);expect(remote.debugState().original).toMatchObject({alive:true,timeMs:440});
      expect(remote.update(1/30,undefined,1)).toMatchObject({reason:'death',weapon:'pistol',position:{x:3,y:3,z:4}});
      expect(remote.alive).toBe(false);expect(remote.sourceActorActive).toBe(false);expect(remote.debugState().original).toMatchObject({timeMs:3000,deathBon:0});
    }finally{remote.dispose();resources.dispose();}
  });

  it('a pending death consumes one baddie callback and fades only through the remainder of the batch',()=>{
    const resources=originalResources(),remote=new RemotePlayer(sourceState.id,sourceState.name,undefined,resources,true);
    try{
      remote.apply(sourceState,true);remote.apply({...sourceState,alive:false,health:0});
      expect(remote.update(6/30,undefined,6)).toMatchObject({reason:'death',callbackOffset:1,weapon:'launcher'});
      expect(remote.debugState().sourceMovement?.steps).toBe(9);expect(remote.debugState().original).toMatchObject({timeMs:2440,deathBon:40});
      expect(remote.update(1/30,undefined,1)).toBeUndefined();expect(remote.debugState().sourceMovement?.steps).toBe(9);
    }finally{remote.dispose();resources.dispose();}
  });

  it('emits once on ordinary callback460 after459 living callbacks',()=>{
    const resources=originalResources(),remote=new RemotePlayer(sourceState.id,sourceState.name,undefined,resources,true);
    try{
      remote.apply(sourceState,true);
      for(let callback=0;callback<459;callback++)expect(remote.update(1/30,undefined,1)).toBeUndefined();
      expect(remote.alive).toBe(true);expect(remote.debugState().sourceMovement?.steps).toBe(-449);
      expect(remote.debugState().original?.timeMs).toBe(137);
      const result=remote.update(1/30,undefined,1);
      expect(result).toEqual({reason:'timeout',id:sourceState.id,name:sourceState.name,weapon:'launcher',position:{x:2,y:3,z:4},yaw:.5+Math.PI,callbackOffset:1});
      expect(remote.alive).toBe(false);expect(remote.health).toBe(-1);
      expect(remote.debugState().sourceMovement?.steps).toBe(-450);
      expect(remote.debugState().sourceMotionTime).toBeUndefined();
      expect(remote.debugState().original).toMatchObject({alive:false,timeMs:3000,deathBon:0,removed:false});
      expect(remote.update(1/30,undefined,1)).toBeUndefined();
      expect(remote.debugState().original).toMatchObject({timeMs:2408,deathBon:8});
    }finally{remote.dispose();resources.dispose();}
  });

  it('uses the remaining callbacks of a batch to fade instead of moving a timed-out actor',()=>{
    const resources=originalResources(),remote=new RemotePlayer(sourceState.id,sourceState.name,undefined,resources,true);
    try{
      remote.apply(sourceState,true);
      const timeout=remote.update(465/30,undefined,465);
      expect(timeout?.callbackOffset).toBe(460);
      expect(remote.debugState().sourceMovement?.steps).toBe(-450);
      expect(remote.debugState().original).toMatchObject({alive:false,timeMs:2440,deathBon:40,removed:false});
      expect(remote.update(70/30,undefined,70)).toBeUndefined();
      expect(remote.debugState().original).toMatchObject({deathBon:600,removed:false});
      expect(remote.update(1/30,undefined,1)).toBeUndefined();
      expect(remote.debugState().original).toMatchObject({deathBon:608,removed:true});
      expect(timeout?.position).toEqual({x:2,y:3,z:4});
    }finally{remote.dispose();resources.dispose();}
  });

  it('a received movement packet at-449 resets the native recurrence before timeout',()=>{
    const resources=originalResources(),remote=new RemotePlayer(sourceState.id,sourceState.name,undefined,resources,true);
    try{
      remote.apply(sourceState,true);
      for(let callback=0;callback<459;callback++)remote.update(1/30,undefined,1);
      remote.apply({...sourceState,x:12});
      expect(remote.debugState().sourceMovement?.steps).toBe(459);
      expect(remote.update(1/30,undefined,1)).toBeUndefined();expect(remote.alive).toBe(true);
      expect(remote.debugState().sourceMovement?.steps).toBe(458);
      expect(remote.debugState().rendered.x).toBeCloseTo(2+10/458);
    }finally{remote.dispose();resources.dispose();}
  });

  it('keeps non-negotiated source presentation and Winter free of source timeouts',()=>{
    const resources=originalResources(),source=new RemotePlayer(sourceState.id,sourceState.name,undefined,resources),winter=new RemotePlayer('winter-no-timeout','WINTER');
    try{
      source.apply(sourceState,true);winter.apply({...sourceState,id:winter.id,name:winter.name},true);
      for(let callback=0;callback<460;callback++){
        expect(source.update(1/30,undefined,1)).toBeUndefined();expect(winter.update(1/30,undefined,1)).toBeUndefined();
      }
      expect(source.alive).toBe(true);expect(winter.alive).toBe(true);
      expect(source.debugState().sourceMovement).toBeUndefined();expect(winter.debugState().sourceMovement).toBeUndefined();
    }finally{source.dispose();winter.dispose();resources.dispose();}
  });
});
