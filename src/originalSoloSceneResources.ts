import * as THREE from 'three';
import type {OriginalSoldierResources,OriginalSoldierConstructorCapture,OriginalSoldierGunConstructorCapture} from './originalSoldier';
import type {ReceiverWeaponGeometry} from '../shared/originalReceiverActorResources';
import type {ReceiverTransientTemplateCapture} from '../shared/originalReceiverTransientInventory';
import {createOriginalSoloActorQueryResources} from './originalSoloActorQueryResources';
import {createOriginalSoloTransientQueryResources,type OriginalSoloTransientBinding,type OriginalSoloTransientQueryLimits} from './originalSoloTransientResources';
import {captureOriginalSoloTransientSeed,createOriginalSoloTransientBackend,type OriginalSoloTransientBackendOptions} from './originalSoloTransientBackend';
import {createOriginalSoloActorLifecycle,type OriginalSoloActorLifecycleOptions} from './originalSoloActorLifecycle';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import {captureOriginalSoloActorConstructorSeeds,type OriginalSoloActorConstructorSeedsOptions} from './originalSoloActorConstructorSeeds';

export interface OriginalSoloActorConstructorLifecycleOptions extends Omit<OriginalSoloActorLifecycleOptions,'actorResources'|'sourceScale'|'gi'|'guns'> {
 readonly constructorSeeds:Omit<OriginalSoloActorConstructorSeedsOptions,'soldierResources'|'sourceScale'|'gunScale'|'renderToWorld'|'giResourceOrientation'> & {
  readonly capture:OriginalSoldierConstructorCapture;readonly gunFactory:OriginalSoldierGunConstructorCapture;
 };
}

export interface OriginalSoloMuzzlePrototype {
 readonly mesh:THREE.Mesh;readonly phase:number;readonly geometryProvenance:string;readonly inWorld:boolean;
 readonly group:'scene'|'gsmokes';readonly groupAncestry:readonly string[];
}
export interface OriginalSoloSceneResourcesOptions {
 readonly soldierResources:OriginalSoldierResources;readonly weapons:ReceiverWeaponGeometry;
 readonly transientBinding:OriginalSoloTransientBinding;readonly renderToWorld:readonly number[];
 readonly actor:Parameters<typeof createOriginalSoloActorQueryResources>[2];
 readonly actorLifecycle:Omit<OriginalSoloActorLifecycleOptions,'actorResources'|'sourceScale'>|OriginalSoloActorConstructorLifecycleOptions;
 readonly transientQuery:OriginalSoloTransientQueryLimits;
 readonly plane:Omit<OriginalSoloMuzzlePrototype,'group'|'groupAncestry'>;
 readonly muzzles:Readonly<Record<'pistol'|'shotgun'|'rifle'|'sniper',OriginalSoloMuzzlePrototype>>;
 readonly transientPolicy:Omit<OriginalSoloTransientBackendOptions,'plane'|'muzzles'|'planeWidthWorld'>;
}
const families={pistol:'mfpistol',shotgun:'mfspas12',rifle:'mfak47',sniper:'mfdragunov'} as const;
/** Pair actual borrowed render buffers with both query providers and their
 * detached lifecycle adapters. This supplies resources, not a complete map,
 * callback program, bot policy, actor scheduler or native clone-default proof. */
export function createOriginalSoloSceneResources(options:OriginalSoloSceneResourcesOptions) {
 if(!options||!options.actor||!options.transientPolicy||!options.actorLifecycle||!options.transientQuery)throw Error('Missing Solo scene resource options');
 const binding=options.transientBinding,resources=binding?.resources,maxText=options.transientPolicy.maxTextChars;
 if(!resources||options.actor.sourceScale!==resources.sourceScale||!Number.isSafeInteger(maxText)||maxText<1||maxText>65536)throw Error('Solo scene resource scale or text mismatch');
 const lifecycleInput=options.actorLifecycle;
 const lifecycle='constructorSeeds' in lifecycleInput?{...lifecycleInput,...captureOriginalSoloActorConstructorSeeds(lifecycleInput.constructorSeeds.capture,lifecycleInput.constructorSeeds.gunFactory,{...lifecycleInput.constructorSeeds,soldierResources:options.soldierResources,sourceScale:options.actor.sourceScale,gunScale:options.actor.gunScale,renderToWorld:options.renderToWorld,giResourceOrientation:options.actor.giResourceOrientation})}:lifecycleInput;
 const seen=new Set<THREE.Mesh>();
 const inspect=(prototype:OriginalSoloSceneResourcesOptions['plane'],resource:string)=>{
  const entry=resources.geometries.get(resource);
  if(!prototype||!(prototype.mesh instanceof THREE.Mesh)||seen.has(prototype.mesh)||!entry||prototype.mesh.geometry!==entry.geometry)throw Error('Foreign or aliased Solo effect prototype');
  seen.add(prototype.mesh);
  return captureOriginalSoloTransientSeed(prototype.mesh,{renderToWorld:options.renderToWorld,phase:prototype.phase,geometryProvenance:prototype.geometryProvenance,inWorld:prototype.inWorld,maxTextChars:maxText});
 };
 if(options.plane?.geometryProvenance!==resources.planeGeometryProvenance)throw Error('Solo plane provenance mismatch');
 const plane=inspect(options.plane,'plane');
 const muzzleSeeds={} as Record<keyof typeof families,ReturnType<typeof inspect>>;
 const muzzleTemplates:ReceiverTransientTemplateCapture[]=[];
 let text=0;
 for(const weapon of Object.keys(families) as (keyof typeof families)[]){
  const resource=families[weapon],prototype=options.muzzles?.[weapon];
  const seed=inspect(prototype,resource);
  const scale=seed.pose.scale*(ORIGINAL_WEAPON_UNIT_SCALE/resources.sourceScale);
  if(!Number.isFinite(scale)||scale<=0)throw Error('Solo muzzle seed scale overflow');
  muzzleSeeds[weapon]=Object.freeze({...seed,pose:Object.freeze({...seed.pose,scale})});
  if(!['scene','gsmokes'].includes(prototype.group)||!Array.isArray(prototype.groupAncestry)||prototype.groupAncestry.length>maxText)throw Error('Invalid Solo muzzle template group');
  const ancestry:string[]=[];const names=new Set<string>();
  for(const name of prototype.groupAncestry){
   if(typeof name!=='string'||!name||name.trim()!==name||name.toLowerCase()===resource||names.has(name.toLowerCase()))throw Error('Invalid Solo muzzle template ancestry');
   names.add(name.toLowerCase());text+=name.length;if(text>maxText)throw Error('Solo muzzle template text budget exceeded');ancestry.push(name);
  }
  if((prototype.group==='gsmokes')!==(names.has('gsmokes')||names.has('smokes')))throw Error('Solo muzzle template group ancestry mismatch');
  // RAW template matrices and clone poses both represent the actual borrowed
  // pre-scaled mesh; clone scale compensates for the provider sourceScale.
  const rawWorld=new THREE.Matrix4().fromArray(options.renderToWorld).multiply(prototype.mesh.matrixWorld).scale(new THREE.Vector3().setScalar(ORIGINAL_WEAPON_UNIT_SCALE));
  if(!rawWorld.elements.every(Number.isFinite))throw Error('Solo muzzle template matrix overflow');
  muzzleTemplates.push(Object.freeze({handle:resource,resource,worldMatrix:Object.freeze(rawWorld.toArray()),inWorld:seed.inWorld,group:prototype.group,groupAncestry:Object.freeze(ancestry)}));
 }
 const observedShader=options.transientPolicy.initialShader;
 if(observedShader){
  const texture=resources.textures.get(observedShader.texture),material=options.plane.mesh.material;
  if(!texture||!(material instanceof THREE.MeshBasicMaterial)||material.map!==texture)throw Error('Solo initial plane shader texture mismatch');
 }
 const transientBase=createOriginalSoloTransientBackend({plane,planeWidthWorld:resources.planeWidthWorld,muzzles:muzzleSeeds,
  initialShader:observedShader,initialShaderIdentity:options.transientPolicy.initialShaderIdentity,cloneMembership:options.transientPolicy.cloneMembership,pointAtPolicy:options.transientPolicy.pointAtPolicy,omittedUpPolicy:options.transientPolicy.omittedUpPolicy,
  parallelUpPolicy:options.transientPolicy.parallelUpPolicy,explicitUpPolicy:options.transientPolicy.explicitUpPolicy,selfRotatePolicy:options.transientPolicy.selfRotatePolicy,
  coincidentPolicy:options.transientPolicy.coincidentPolicy,maxTextChars:maxText});
 const actorQueryResources=createOriginalSoloActorQueryResources(options.soldierResources,options.weapons,options.actor);
 let transientQueryResources:ReturnType<typeof createOriginalSoloTransientQueryResources>|undefined;
 let released=false;
 const release=()=>{
  if(released)return;released=true;const errors:unknown[]=[];
  try{transientQueryResources?.dispose();}catch(error){errors.push(error);}
  try{actorQueryResources.dispose();}catch(error){errors.push(error);}
  if(errors.length)throw new AggregateError(errors,'Solo scene resource release failed');
 };
 try{
  transientQueryResources=createOriginalSoloTransientQueryResources(options.weapons,binding,options.transientQuery);
  const actorDescriptor=actorQueryResources.readResourceDescriptor()!,transientDescriptor=transientQueryResources.readResourceDescriptor()!;
  if(!actorDescriptor||!transientDescriptor)throw Error('Missing Solo scene resource descriptors');
  const actorBase=createOriginalSoloActorLifecycle({actorResources:actorQueryResources,sourceScale:actorDescriptor.sourceScale,
   gi:lifecycle.gi,guns:lifecycle.guns,parentRestoresMembership:lifecycle.parentRestoresMembership,
   readDropYawPlan:lifecycle.readDropYawPlan,maxTextChars:lifecycle.maxTextChars});
  const check=()=>{if(released)throw Error('Solo scene resources released');};
  const actorLifecycle=Object.freeze<ReturnType<typeof createOriginalSoloActorLifecycle>>({
   cloneGI:(...a)=>{check();return actorBase.cloneGI(...a);},cloneGun:(...a)=>{check();return actorBase.cloneGun(...a);},
   sphere:(...a)=>{check();return actorBase.sphere(...a);},heldGunPose:(...a)=>{check();return actorBase.heldGunPose(...a);},
   reparentGunMembership:(...a)=>{check();return actorBase.reparentGunMembership(...a);},dropYaw:(...a)=>{check();return actorBase.dropYaw(...a);},
  });
  const transientBackend=Object.freeze<ReturnType<typeof createOriginalSoloTransientBackend>>({
   clonePlane:(...a)=>{check();return transientBase.clonePlane(...a);},cloneMuzzle:(...a)=>{check();return transientBase.cloneMuzzle(...a);},
   pointAt:(...a)=>{check();return transientBase.pointAt(...a);},selfRotate:(...a)=>{check();return transientBase.selfRotate(...a);},
  });
  return Object.freeze({actorQueryResources,transientQueryResources,actorDescriptor,transientDescriptor,actorLifecycle,transientBackend,muzzleTemplates:Object.freeze(muzzleTemplates),release});
 }catch(error){
  try{release();}catch(cleanup){throw new AggregateError([error,cleanup],'Solo scene resource construction and cleanup failed',{cause:error});}
  throw error;
 }
}
