import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {RemotePlayer,type RemoteConsumedShot,type RemoteState} from './remotePlayer';
import {OriginalSoldier,createOriginalSoldierResources,type OriginalSoldierAssets} from './originalSoldier';
import {ORIGINAL_WEAPON_TEXTURES,type OriginalWeaponGeometryData} from './originalWeapons';
import {OriginalRemoteView} from '../shared/originalRemoteView';

const base=new URL('../public/assets/',import.meta.url);
function resources(){
 const texture=new THREE.Texture(),textures=new Map(ORIGINAL_WEAPON_TEXTURES.map(name=>[name,new THREE.Texture()]));
 const r=createOriginalSoldierResources({geometry:JSON.parse(readFileSync(new URL('original-soldier/geometry.json',base),'utf8')),rigMotion:JSON.parse(readFileSync(new URL('original-soldier/rig-motion.json',base),'utf8')),texture} as OriginalSoldierAssets,
  {geometry:JSON.parse(readFileSync(new URL('original-weapons/geometry.json',base),'utf8')) as OriginalWeaponGeometryData,textures});
 return {r,dispose(){r.dispose();texture.dispose();for(const item of textures.values())item.dispose();}};
}
const state:RemoteState={id:'source',name:'SOURCE',x:0,y:0,z:0,yaw:-Math.PI,pitch:0,health:100,frags:0,deaths:0,weapon:'rifle',alive:true,sourceMotionTime:440};
const flashes=(remote:RemotePlayer)=>{const result:THREE.Mesh[]=[];remote.group.traverse(object=>{if(object.name==='original-GI-shot-flash')result.push(object as THREE.Mesh);});return result;};
const rig=(remote:RemotePlayer)=>(remote as unknown as {rig:OriginalSoldier}).rig;
const matrixError=(a:THREE.Matrix4,b:THREE.Matrix4)=>Math.max(...a.elements.map((value,index)=>Math.abs(value-b.elements[index])));

describe('actual negotiated remote queued shooting callbacks',()=>{
 for(const [weapon,cooldown] of [['pistol',8],['shotgun',15],['rifle',2],['sniper',2]] as const)it(`${weapon} consumes its packet report only on callbacks and waits through zero cooldown`,()=>{
  const owned=resources(),remote=new RemotePlayer(state.id,state.name,undefined,owned.r,true,true),effects:RemoteConsumedShot[]=[];
  const capture=(effect:RemoteConsumedShot)=>{effects.push(effect);expect(rig(remote).debugState().timeMs).toBe(2000);};
  try{
   remote.apply({...state,weapon,sourceShots:weapon==='shotgun'?4:2},true);remote.fire();remote.update(0,undefined,0,capture);
   expect(effects).toHaveLength(0);expect(flashes(remote)).toHaveLength(0);expect(remote.debugState().original!.timeMs).toBe(0);
   remote.update(0,undefined,1,capture);expect(effects).toHaveLength(1);expect(remote.debugState().sourceShots).toEqual({misses:weapon==='shotgun'?2:1,aiming:cooldown});
   remote.update(0,undefined,cooldown,capture);expect(effects).toHaveLength(1);expect(remote.debugState().sourceShots!.aiming).toBe(0);
   remote.update(0,undefined,1,capture);expect(effects).toHaveLength(2);expect(remote.debugState().sourceShots!.misses).toBe(0);
  }finally{remote.dispose();owned.dispose();}
 });

 it('replaces positive reports, preserves absent/zero reports and detaches debug counters',()=>{
  const owned=resources(),remote=new RemotePlayer(state.id,state.name,undefined,owned.r,true,true);
  try{
   remote.apply({...state,sourceShots:9},true);remote.apply({...state,sourceShots:2});remote.apply({...state,sourceShots:0});remote.apply(state);
   expect(remote.debugState().sourceShots).toEqual({misses:2,aiming:0});
   const debug=remote.debugState().sourceShots!;debug.misses=128;debug.aiming=999;
   expect(remote.debugState().sourceShots).toEqual({misses:2,aiming:0});
   remote.update(0,undefined,1);expect(remote.debugState().sourceShots).toEqual({misses:1,aiming:2});
   remote.apply({...state,sourceShots:3});expect(remote.debugState().sourceShots).toEqual({misses:3,aiming:2});
   const before=remote.debugState();expect(()=>remote.apply({...state,x:999,weapon:'pistol',sourceShots:129})).toThrow();expect(remote.debugState()).toEqual(before);
  }finally{remote.dispose();owned.dispose();}
 });

 it('keeps shotgun negative residue when a positive report contains one ray',()=>{
  const owned=resources(),remote=new RemotePlayer(state.id,state.name,undefined,owned.r,true,true),effects:RemoteConsumedShot[]=[];
  try{remote.apply({...state,weapon:'shotgun',sourceShots:1},true);remote.update(0,undefined,1,effect=>effects.push(effect));expect(remote.debugState().sourceShots).toEqual({misses:-1,aiming:15});remote.update(0,undefined,20,effect=>effects.push(effect));expect(effects).toHaveLength(1);expect(remote.debugState().sourceShots).toEqual({misses:-1,aiming:0});}
  finally{remote.dispose();owned.dispose();}
 });

 it('uses new logical weapon geometry at the previous displayed gun world pose before refreshing or moving',()=>{
  const owned=resources(),remote=new RemotePlayer(state.id,state.name,undefined,owned.r,true,true);let effect:RemoteConsumedShot|undefined;
  try{
   remote.apply({...state,x:1,z:2},true);remote.update(0,undefined,1);rig(remote).debugState();rig(remote).weaponRoot.updateWorldMatrix(true,false);const previous=rig(remote).weaponRoot.matrixWorld.clone(),position=remote.group.position.clone();
   remote.apply({...state,x:10,z:4,yaw:.7,weapon:'shotgun',sourceShots:2});expect(remote.weapon).toBe('shotgun');expect(rig(remote).weapon).toBe('rifle');
   remote.update(0,undefined,1,shot=>{
    effect=shot;expect(rig(remote).weapon).toBe('rifle');expect(shot.position).toEqual({x:position.x,y:position.y,z:position.z});
    const flash=flashes(remote)[0];expect(flash.geometry).toBe(owned.r.gunGeometries.get('mfspas12'));flash.updateWorldMatrix(true,false);expect(matrixError(flash.matrixWorld,previous)).toBeLessThan(1e-10);
   });
   expect(effect!.weapon).toBe('shotgun');expect(rig(remote).weapon).toBe('shotgun');expect(remote.group.position.equals(position)).toBe(false);
   const flash=flashes(remote)[0];flash.updateWorldMatrix(true,false);expect(matrixError(flash.matrixWorld,previous)).toBeLessThan(1e-10);
  }finally{remote.dispose();owned.dispose();}
 });

 for(const weapon of ['launcher','rpg'] as const)it(`${weapon} consumes queued prefix and phase without creating bullet flash`,()=>{
  const owned=resources(),remote=new RemotePlayer(state.id,state.name,undefined,owned.r,true,true),effects:RemoteConsumedShot[]=[];
  try{remote.apply({...state,weapon,sourceShots:2},true);remote.update(0,undefined,1,effect=>effects.push(effect));expect(remote.debugState().sourceShots).toEqual({misses:1,aiming:0});expect(remote.debugState().original!.timeMs).toBe(1000);expect(flashes(remote)).toHaveLength(0);remote.update(0,undefined,1,effect=>effects.push(effect));expect(effects.map(effect=>effect.weapon)).toEqual([weapon,weapon]);}
  finally{remote.dispose();owned.dispose();}
 });

 it('consumes the registered pending-death prefix before removal and retains independent flash callbacks',()=>{
  const owned=resources(),remote=new RemotePlayer(state.id,state.name,undefined,owned.r,true,true),effects:RemoteConsumedShot[]=[];
  try{
   remote.apply({...state,sourceShots:1},true);remote.apply({...state,alive:false,health:0,x:999,weapon:'pistol',sourceShots:128});
   const death=remote.update(0,undefined,1,effect=>{effects.push(effect);expect(remote.sourceActorActive).toBe(true);expect(rig(remote).debugState().timeMs).toBe(2000);});
   expect(effects).toEqual([{weapon:'rifle',position:{x:0,y:0,z:0},callbackOffset:1}]);expect(death?.reason).toBe('death');expect(remote.debugState().original!.timeMs).toBe(3000);
   const flash=flashes(remote)[0];expect(flash).toBeDefined();remote.apply({...state,sourceShots:8});remote.update(0,undefined,1,effect=>effects.push(effect));expect(flash.parent).not.toBeNull();remote.update(0,undefined,1,effect=>effects.push(effect));expect(flash.parent).toBeNull();expect(effects).toHaveLength(1);expect(remote.sourceActorActive).toBe(false);
  }finally{remote.dispose();owned.dispose();}
 });

 it('matches authority poses through ordered reports, weapon changes, cooldown replacement and death',()=>{
  const owned=resources(),remote=new RemotePlayer(state.id,state.name,undefined,owned.r,true,true),mirror=new OriginalRemoteView(0,{},'source-callback');let tick=0;
  const packets=new Map<number,RemoteState>([[0,{...state,sourceShots:3}],[2,{...state,x:.09,weapon:'pistol',sourceShots:2}],[6,{...state,x:.15,weapon:'shotgun',sourceShots:1}],[12,{...state,x:.2,weapon:'sniper',sourceShots:3}],[22,{...state,alive:false,health:0}]]);
  try{
   for(let callback=0;callback<=25;callback++){
    if(callback>0)remote.update(0,undefined,1);
    const packet=packets.get(callback),receipts:Array<{tick:number;callbacks:number}>=[];
    if(packet){remote.apply(packet,callback===0);expect(mirror.recordSent({tick,sentAt:callback*1000/30,targets:[{id:packet.id,position:{x:packet.x,y:packet.y,z:packet.z},yaw:packet.yaw,motionTime:packet.sourceMotionTime!,weapon:packet.weapon,alive:packet.alive,sourceShots:packet.sourceShots}]})).toEqual({ok:true});receipts.push({tick:tick++,callbacks:callback});}
    if(callback===5){remote.fire();expect(mirror.recordSent({tick,sentAt:callback*1000/30,targets:[],firePlayerId:state.id})).toEqual({ok:true});receipts.push({tick:tick++,callbacks:callback});}
    const accepted=mirror.accept({callbacks:callback,receipts},callback*1000/30);expect(accepted.ok).toBe(true);
    const pose=mirror.freeze()[0],actual=remote.debugState();
    if(pose){expect(actual.rendered).toEqual({...pose.position,yaw:pose.yaw});expect(actual.original!.timeMs).toBe(pose.motionTime);expect(actual.sourceMovement!.steps).toBe(pose.steps);}
    else{const corpse=mirror.freezeCorpses()[0];expect(corpse).toBeDefined();expect(actual.rendered).toEqual({...corpse.position,yaw:corpse.yaw});expect(actual.original!.timeMs).toBe(corpse.motionTime);}
   }
  }finally{remote.dispose();owned.dispose();}
 });

 it('keeps the standalone source-movement fire adapter immediate and ignores packet queues',()=>{
  const owned=resources(),remote=new RemotePlayer(state.id,state.name,undefined,owned.r,true,false);
  try{remote.apply({...state,sourceShots:3},true);remote.fire();expect(remote.debugState().original!.timeMs).toBe(2000);expect(remote.debugState().sourceShots).toBeUndefined();expect(flashes(remote)).toHaveLength(1);}
  finally{remote.dispose();owned.dispose();}
 });
});
