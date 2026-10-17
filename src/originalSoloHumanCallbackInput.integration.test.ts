import * as THREE from 'three';
import {describe,it,expect,vi} from 'vitest';
import {Game} from './game';
import {WeaponState} from './weapons';
import {ORIGINAL_WEAPON_RESOURCES} from './originalWeapons';
import {createOriginalSoloCurrentSceneLease} from '../shared/originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloReceiverCurrentContext} from '../shared/originalSoloObserverWorld';
import {createOriginalSoloFreshBanks} from './originalSoloFreshBanks';
import type {OriginalWeaponCollection} from './originalWeapons';
import {advanceOriginalReceiverGunCallback} from '../shared/originalReceiverGunCallback';
import {createOriginalSceneGeometry,type OriginalSceneData} from '../shared/originalSceneGeometry';
import type {OriginalMapRuntime} from '../shared/originalMapRuntime';
import type {ReceiverCurrentEnvironmentCommand} from '../shared/originalReceiverCurrentEnvironment';
import type {ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import type {ReceiverLoadoutCheckpoint} from '../shared/originalReceiverLoadoutWorld';
import type {OriginalSoloHumanCallbackInput as CapturedInput} from './originalSoloHumanCallbackInput';
import {originalPlayerEye} from '../shared/originalPlayerPhysics';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],zero={x:0,y:0,z:0};
const presence=()=>({pistol:true,shotgun:true,rifle:true,launcher:true,rpg:true,sniper:true});
const pose=():ReceiverModelPose=>({position:{...zero},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}});


// Actual Game input reader, completeSoloGoody boundary, CURRENT producer,
// coordinator and private loadout/local banks. Geometry/backends below are
// controlled CPU fixtures, not native render or full scene coverage evidence.
function fixture(map:'barrack'|'woodlands'='woodlands'){
 const scale=.02,data:OriginalSceneData={nodes:[{name:'floor',parent:'World',resource:'floor',matrix:I,visibility:1,shader:'default'}],meshes:[{resource:'floor',part:0,positions:[[-100,-100,-100],[100,-100,-100],[0,100,-100]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
 const geometry=createOriginalSceneGeometry(data,{scale}),runtime:OriginalMapRuntime={map,data,scale,geometry,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const camera=new THREE.PerspectiveCamera(),parent=new THREE.Group();parent.position.set(3,4,5);parent.rotation.y=.2;parent.add(camera);camera.position.set(0,10,0);camera.rotation.set(.3,.4,0,'YXZ');
 const resources=new Map<string,THREE.Mesh>();for(const resource of [...Object.values(ORIGINAL_WEAPON_RESOURCES),'rpgrocket','rg6grenade'])resources.set(resource,new THREE.Mesh());
 const allResourceMeshes=[...resources.values()];
 const game=Object.assign(Object.create(Game.prototype),{mapId:map,mode:'solo',archivalWinter:false,phase:'playing',playerAlive:true,elapsed:0,arena:{runtime},weaponState:new WeaponState(map),keys:new Set<string>(['KeyR','Digit1','ShiftRight']),firing:false,chatOpen:false,controlsPreset:'legacy',yaw:.4,pitch:.1,velocity:new THREE.Vector3(900,800,700),camera,enemies:[],originalWeapons:{resources},originalScopeState:{enabled:true},syncSoloMirrors:vi.fn()}) as any;
 const localReads:CapturedInput[]=[],loadoutReads:CapturedInput[]=[],contexts:OriginalSoloReceiverCurrentContext[]=[],checkpoints:ReceiverLoadoutCheckpoint[]=[];
 let betweenHooks:(()=>void)|undefined;
 const worlds=new OriginalSoloObserverWorlds(runtime,{createReceiverScene:()=>createOriginalSoloCurrentSceneLease({sourceScale:scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:64,maxOutcomes:32,maxModels:64,maxTextChars:65536},controller:{model:{eyeHeight:1,goodyBspWorld:1,maxModels:64,maxPickups:16},transient:{maxModels:32,maxActors:32,maxShaders:32},maxEffects:64},
  createBackends:c=>{
   camera.updateWorldMatrix(true,false);
   const collection={resources,rocket:resources.get('rpgrocket')} as OriginalWeaponCollection;
   const banks=createOriginalSoloFreshBanks(collection,{map,sceneGeneration:c.lifeGeneration,score:0,goldScore:0,sourceScale:scale,
    renderToWorld:I,cameraHandle:'camera',cameraWorldMatrix:camera.matrixWorld.toArray(),initialGunPositionSource:{x:-12,y:-20,z:5},initialLoadedRocket:false,
    membership:{pistol:false,spas12:false,ak47:false,rg6:false,rpg:false,dragunov:false,rocket:false},
    ancestry:{pistol:['camera'],spas12:['camera'],ak47:['camera'],rg6:['camera'],rpg:['camera'],dragunov:['camera'],rocket:['rpg','camera']},
    followOffworldParents:true,parentRestoresMembership:true,grenadeMaterialHandle:'captured-grenade-material',grenadeAncestry:[],rocketMaterialHandle:'captured-rpg-material',
    maxCommands:64,maxTextChars:65536,maxProjectileModels:32,maxProjectileActors:8,maxReportNames:16});
   return {...banks,model:{cloneGI:()=>({pose:pose(),geometryProvenance:'GI-fixture'}),cloneGun:()=>({pose:pose(),geometryProvenance:'gun-fixture'}),heldGunPose:()=>pose(),sphere:()=>({bspWorld:1,provenance:'declared-resource' as const}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'controlled-downward'}})},transient:{clonePlane:()=>({pose:pose(),geometryProvenance:'plane-fixture',inWorld:true}),cloneMuzzle:()=>({pose:pose(),geometryProvenance:'muzzle-fixture',inWorld:true}),pointAt:()=>pose().rotation!,selfRotate:q=>q}};
  },
  captureLocalWeaponCallback:(c,p)=>{
   contexts.push(c);const input=game.readSoloHumanCallbackInput(c,p) as CapturedInput;localReads.push(input);betweenHooks?.();
   return {cameraWorldMatrix:input.cameraWorldMatrix,velocityWorld:input.velocityWorld,commands:[]};
  },
  captureLoadoutProgram:(c,p,previous,admitted)=>{
   const receiptCommands=admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast}));if(!p.callback)return {receiptCommands};if(p.callback.kind!=='callback')throw Error('Expected callback');
   const input=game.readSoloHumanCallbackInput(c,p.callback) as CapturedInput;loadoutReads.push(input);
   const result=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:p.callback,held:input.held,weaponModelPresent:input.weaponModelPresent});checkpoints.push(result.checkpoint);
   const commands:ReceiverCurrentEnvironmentCommand[]=[];
   for(const intent of result.intents){
    if(intent.kind==='load-pose')commands.push({kind:'weapon-reload'});
    else if(intent.kind==='sortweapons')commands.push({kind:'weapon-whichgun',weapon:intent.weapon});
    else if(intent.kind==='rocket-remove')commands.push({kind:'weapon-rocket',loadedRocket:false});
    else if(intent.kind==='rocket-parent')commands.push({kind:'weapon-rocket',loadedRocket:true});
    else if(intent.kind==='fire')throw Error('Fixture permits held reload/selection only');
   }
   commands.push({kind:'loadout-capture',checkpoint:result.checkpoint},{kind:'weapon-finish'});
   return {receiptCommands,callbackCommands:commands,gunPhase:result};
  },goodyAt:c=>({eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:1,weapon:c.weapon!}),snapshotAt:prefix=>({prefix,missing:[],provenance:'controlled-empty-offworld-fixture',models:[]})
 })});
 game.soloWorlds=worlds;const world=worlds.register({id:'player',name:'Human',eye:camera.position,velocity:{x:2,y:3,z:4}});world.weapon='launcher';
 const begin=()=>{worlds.physics(game.elapsed,{skipIds:new Set(['player'])});game.completeSoloGoody();};
 const advance=()=>{worlds.actors(game.elapsed);game.elapsed+=1/30;};
 return {game,camera,parent,resources,world,worlds,localReads,loadoutReads,contexts,checkpoints,begin,advance,setBetweenHooks:(fn:()=>void)=>{betweenHooks=fn;},dispose:()=>{worlds.clear();for(const m of allResourceMeshes){m.geometry.dispose();if(Array.isArray(m.material))for(const material of m.material)material.dispose();else m.material.dispose();}}};
}

describe('Game captures one post-goody human callback for CURRENT consumers',()=>{
 it.each(['barrack','woodlands'] as const)('%s shares detached input between real local and loadout hooks',map=>{
  const f=fixture(map);try{
   const expectedMatrix=(()=>{f.camera.updateWorldMatrix(true,false);return f.camera.matrixWorld.toArray();})();
   f.setBetweenHooks(()=>{f.game.keys.clear();f.game.firing=true;f.game.chatOpen=true;f.game.pitch=1;f.game.yaw=2;f.camera.position.x+=99;f.resources.delete('pistol');});
   f.begin();const input=f.localReads[0];expect(f.loadoutReads[0]).toBe(input);
   expect(input.cameraWorldMatrix).toEqual(expectedMatrix);expect(input.velocityWorld).toEqual({x:2,y:3,z:4});
   expect(input.sourceRotation.x).toBeCloseTo(.1*180/Math.PI);expect(input.sourceRotation.z).toBeCloseTo(.4*180/Math.PI);expect(input.sourceRotation.y).toBe(0);
   expect(input.held).toEqual({typing:false,reload:true,fire:false,digits:[true,false,false,false,false,false]});expect(input.shiftHeld).toBe(true);expect(input.sourceScopeEnabled).toBe(true);
   expect(input.weaponModelPresent).toEqual(presence());expect(Object.isFrozen(input)).toBe(true);expect(Object.isFrozen(input.cameraWorldMatrix)).toBe(true);expect(Object.isFrozen(input.held.digits)).toBe(true);
   expect(f.world.loadout?.selected).toBe('pistol');expect(f.world.loadout?.ammo.launcher).toBe(6);expect(f.world.loadout?.ammo.pistol).toBe(8);expect(f.game.syncSoloMirrors).toHaveBeenCalledExactlyOnceWith(true);
  }finally{f.dispose();}
 });
 it('retains the same capture through rollback and captures new input on the next callback',()=>{
  const f=fixture();try{
   const fail=vi.spyOn(f.world.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('hold current publication');});
   expect(f.begin).toThrow('hold current publication');expect(f.world.loadout).toBeUndefined();const original=f.localReads[0],context=f.contexts[0];
   f.game.keys.clear();f.game.chatOpen=true;f.game.firing=true;f.game.pitch=.8;f.camera.position.x=7;
   expect(f.game.readSoloHumanCallbackInput(context,original.prefix)).toBe(original);
   fail.mockRestore();f.worlds.completeGoody(f.game.elapsed);expect(f.localReads).toHaveLength(1);expect(f.loadoutReads).toHaveLength(1);expect(f.world.loadout?.selected).toBe('pistol');
   f.advance();f.begin();expect(f.localReads).toHaveLength(2);const next=f.localReads[1];expect(next).not.toBe(original);expect(next.prefix.callback).toBe(2);expect(next.held).toMatchObject({typing:true,reload:false,fire:true});expect(next.sourceRotation.x).toBeCloseTo(.8*180/Math.PI);
  }finally{f.dispose();}
 });
 it('keeps camera WORLD rotation separate from post-goody logical pitch and ignores renderer velocity',()=>{
  const f=fixture();try{
   f.game.pitch=-.25;f.game.yaw=-.6;f.camera.rotation.set(.5,.8,0,'YXZ');f.begin();const input=f.localReads[0];
   const q=new THREE.Quaternion(),p=new THREE.Vector3(),s=new THREE.Vector3();new THREE.Matrix4().fromArray([...input.cameraWorldMatrix]).decompose(p,q,s);
   const actualCamera=new THREE.Quaternion();f.camera.getWorldQuaternion(actualCamera);expect(q.angleTo(actualCamera)).toBeCloseTo(0);
   expect(input.sourceRotation).toEqual({x:-.25*180/Math.PI,y:0,z:-.6*180/Math.PI});expect(input.velocityWorld).toEqual(f.world.body.velocity);expect(input.velocityWorld).not.toEqual(f.game.velocity);
  }finally{f.dispose();}
 });
 it.each([false,true])('clears its only retained input when Game disposes worlds (preserve=%s)',preserve=>{
  const f=fixture();try{
   f.begin();const context=f.contexts[0],prefix=f.localReads[0].prefix;
   expect(f.game.soloHumanCallbackInput.input).toBe(f.localReads[0]);
   f.game.disposeSoloWorlds(preserve);
   expect(f.game.soloHumanCallbackInput).toBeUndefined();expect(f.game.soloWorlds).toBeUndefined();expect(f.worlds.worlds.size).toBe(0);
   expect(()=>f.game.readSoloHumanCallbackInput(context,prefix)).toThrow();
  }finally{f.dispose();}
 });
 it('rejects mismatched live operands and boundaries, then rejects a stale same-ID life',()=>{
  const f=fixture();try{
   let liveGuardChecks=0;
   f.setBetweenHooks(()=>{
    const context=f.contexts.at(-1)!,input=f.localReads.at(-1)!,prefix=input.prefix;
    expect(f.game.readSoloHumanCallbackInput(context,prefix)).toBe(input);
    for(const change of [{id:'bot'},{body:{...context.body}},{target:{...context.target}},{afterGoody:false},{phase:'goody'},{deliveryKind:'death'},{physicalCallback:context.physicalCallback+1}])expect(()=>f.game.readSoloHumanCallbackInput({...context,...change},prefix)).toThrow();
    expect(()=>f.game.readSoloHumanCallbackInput(context,{...prefix,callback:prefix.callback+1})).toThrow();
    expect(f.game.readSoloHumanCallbackInput(context,prefix)).toBe(input);liveGuardChecks++;
   });
   f.begin();const context=f.contexts[0],prefix=f.localReads[0].prefix;
   expect(liveGuardChecks).toBe(1);expect(()=>f.game.readSoloHumanCallbackInput(context,prefix)).toThrow();
   f.advance();f.worlds.dispose('player');const replacement=f.worlds.register({id:'player',name:'Replacement',eye:{x:0,y:10,z:0}});expect(replacement.lifeGeneration).not.toBe(context.lifeGeneration);
   expect(()=>f.game.readSoloHumanCallbackInput(context,prefix)).toThrow();f.begin();expect(liveGuardChecks).toBe(2);expect(f.localReads[1].prefix.sceneGeneration).toBe(replacement.lifeGeneration);expect(f.localReads[1]).not.toBe(f.localReads[0]);
  }finally{f.dispose();}
 });
});
