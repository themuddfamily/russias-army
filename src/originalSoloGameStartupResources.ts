import * as THREE from 'three';
import type {OriginalMapRuntime} from '../shared/originalMapRuntime';
import type {OriginalSkyDescription} from '../shared/originalSkyRay';
import type {OriginalSoldierResources,OriginalSoldierConstructorCapture,OriginalSoldierGunConstructorCapture} from './originalSoldier';
import type {OriginalWeaponAssets} from './originalWeapons';
import type {OriginalSoloTransientBinding} from './originalSoloTransientResources';
import type {OriginalSoloLoadedSceneFactoryOptions} from './originalSoloLoadedSceneFactory';
import {createOriginalSoloPlaneMaterial,type OriginalSoloPlaneMaterial} from './originalSoloPlaneMaterial';
import {captureOriginalSoloActorConstructorSeeds} from './originalSoloActorConstructorSeeds';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';

export interface OriginalSoloGameStartupResourcesOptions {
 readonly runtime:OriginalMapRuntime;readonly doorNames:readonly string[];
 readonly soldierResources:OriginalSoldierResources;readonly weapons:OriginalWeaponAssets['geometry'];
 readonly transientBinding:OriginalSoloTransientBinding;
 readonly constructorCapture:OriginalSoldierConstructorCapture;readonly gunFactory:OriginalSoldierGunConstructorCapture;
 readonly renderToWorld:readonly number[];readonly sourceScale?:number;readonly sky?:OriginalSkyDescription;
}
export interface OriginalSoloGameStartupResources {
 readonly resources:OriginalSoloLoadedSceneFactoryOptions['resources'];
 readonly inventory:OriginalSoloLoadedSceneFactoryOptions['inventory'];
 readonly planeOwner:OriginalSoloPlaneMaterial;
 release():void;
}
const maxTextChars=65536;
const gunProvenance=Object.freeze({pistol:'installed fresh pistol Mesh constructor',shotgun:'installed fresh spas12 Mesh constructor',rifle:'installed fresh ak47 Mesh constructor',launcher:'installed fresh rg6 Mesh constructor',rpg:'installed fresh rpg Mesh constructor',sniper:'installed fresh dragunov Mesh constructor'});
function skyCopy(raw:OriginalSkyDescription|undefined):OriginalSkyDescription {
 if(!raw)throw Error('Missing loaded Solo startup sky');
 const radius=raw.radius,height=raw.height,p=raw.position,r=raw.rotationDegrees;
 if(!Number.isFinite(radius)||radius<=0||!Number.isFinite(height)||height<=0||!Array.isArray(p)||p.length!==3||!Array.isArray(r)||r.length!==3)throw Error('Invalid loaded Solo startup sky');
 const position=[p[0],p[1],p[2]],rotationDegrees=[r[0],r[1],r[2]];
 if(!position.every(Number.isFinite)||!rotationDegrees.every(Number.isFinite))throw Error('Invalid loaded Solo startup sky');
 return Object.freeze({radius,height,position:Object.freeze(position),rotationDegrees:Object.freeze(rotationDegrees)});
}
/** Construct resource-generation policy once outside gameplay callbacks. Map
 * decodes and installed render assets remain borrowed. The only owned renderer
 * allocation is the plane BasicMaterial wrapper; the named shader policy is an
 * installed-copy observation, not recovered native first-barrel shader evidence. */
export function createOriginalSoloGameStartupResources(options:OriginalSoloGameStartupResourcesOptions):OriginalSoloGameStartupResources {
 if(!options)throw Error('Missing loaded Solo startup options');
 const runtime=options.runtime,scale=options.sourceScale??runtime?.scale,data=runtime?.data,rawMapping=options.renderToWorld;
 if(!runtime||!['barrack','woodlands'].includes(runtime.map)||!Number.isFinite(scale)||scale<=0||scale!==runtime.scale||options.transientBinding?.resources?.sourceScale!==scale)throw Error('Loaded Solo startup map/scale mismatch');
 if(!Array.isArray(rawMapping)||rawMapping.length!==16)throw Error('Invalid loaded Solo startup mapping');
 const renderToWorld=Object.freeze(Array.from({length:16},(_,i)=>rawMapping[i]));
 if(renderToWorld.some(n=>!Number.isFinite(n))||renderToWorld[3]!==0||renderToWorld[7]!==0||renderToWorld[11]!==0||renderToWorld[15]!==1)throw Error('Invalid loaded Solo startup mapping');
 const mapping=new THREE.Matrix4().fromArray(renderToWorld),mappingScale=Math.hypot(renderToWorld[0],renderToWorld[1],renderToWorld[2]);
 if(!Number.isFinite(mapping.determinant())||mapping.determinant()===0)throw Error('Invalid loaded Solo startup mapping');
 if(!data||!Array.isArray(data.nodes)||data.nodes.length>2048||!Array.isArray(data.meshes)||data.meshes.length>256||!Array.isArray(options.weapons?.meshes)||options.weapons.meshes.length>256)throw Error('Loaded Solo startup mesh/model budget exceeded');
 let vertices=0,faces=0;
 for(let i=0;i<data.meshes.length;i++){const mesh=data.meshes[i];if(!Array.isArray(mesh?.positions)||!Array.isArray(mesh.faces))throw Error('Invalid loaded Solo startup geometry');vertices+=mesh.positions.length;faces+=mesh.faces.length;if(vertices>2000000||faces>2000000)throw Error('Loaded Solo startup geometry budget exceeded');}
 const rawDoors=options.doorNames;
 if(!Array.isArray(rawDoors)||rawDoors.length>2048)throw Error('Loaded Solo startup door budget exceeded');
 let chars=0;const doorNames:string[]=[],seen=new Set<string>();
 for(let i=0;i<rawDoors.length;i++){const name=rawDoors[i];if(typeof name!=='string'||!name||seen.has(name)||(chars+=name.length)>maxTextChars)throw Error('Invalid loaded Solo startup door names');seen.add(name);doorNames.push(name);}
 const decoded=data as typeof data&{runtime?:{sky?:OriginalSkyDescription}};
 const sky=skyCopy(options.sky??decoded.runtime?.sky),capture=options.constructorCapture,gunFactory=options.gunFactory,gunScale=ORIGINAL_WEAPON_UNIT_SCALE*mappingScale/scale;
 const constructorSeeds={capture,gunFactory,gunClonePolicy:'copy-fresh-gun-mesh-factory' as const,giProvenance:'issued installed fresh GI constructor',gunProvenance,maxSeeds:7,maxTextChars};
 // Validate issued resource joins, basis, uniform mapping and unit conversion
 // before acquiring a renderer wrapper. No borrowed rig is advanced or sampled.
 captureOriginalSoloActorConstructorSeeds(capture,gunFactory,{...constructorSeeds,soldierResources:options.soldierResources,sourceScale:scale,gunScale,renderToWorld,giResourceOrientation:capture?.gi.resourceOrientation});
 let planeOwner:OriginalSoloPlaneMaterial|undefined;
 try{
  planeOwner=createOriginalSoloPlaneMaterial(options.transientBinding,{texture:'bangrocket',constructorPolicy:'copy-fresh-basic-material-borrowed-texture',maxTextChars,
   shaderObservation:{policy:'installed-basic-material-uv-with-unit-z',handle:'installed-startup-plane',recycled:false,provenance:'installed BasicMaterial UV copy with explicit unit Z'}});
  const initialShader=planeOwner.initialShader;
  if(!initialShader)throw Error('Missing installed Solo startup shader observation');
  const muzzle=(name:string)=>Object.freeze({geometryProvenance:`installed soldier ${name} geometry`,group:'scene' as const,groupAncestry:Object.freeze([] as string[])});
  const resources:OriginalSoloLoadedSceneFactoryOptions['resources']=Object.freeze({soldierResources:options.soldierResources,weapons:options.weapons,transientBinding:options.transientBinding,renderToWorld,
   actor:Object.freeze({sourceScale:scale,giResourceOrientation:capture.gi.resourceOrientation,gunScale,maxVertices:100000,maxFaces:100000,maxMotionKeys:100000,maxMeshes:256,maxDescriptorTextChars:maxTextChars,provenance:'loaded installed Solo actor resources',sidedness:'double' as const}),
   actorLifecycle:Object.freeze({parentRestoresMembership:true,maxTextChars,constructorSeeds:Object.freeze(constructorSeeds)}),
   transientQuery:Object.freeze({maxVertices:100000,maxFaces:100000,maxMeshes:256,maxTextChars}),
   transientPolicy:Object.freeze({initialShader,initialShaderIdentity:'per-clone-name' as const,cloneMembership:'copy-effect-birth-parented' as const,pointAtPolicy:'copy-plane-positive-z' as const,omittedUpPolicy:'copy-negative-z' as const,parallelUpPolicy:'copy-x' as const,explicitUpPolicy:'copy-three-lookat' as const,selfRotatePolicy:'copy-local-xyz' as const,coincidentPolicy:'retain' as const,maxTextChars}),
   effectPrototypes:Object.freeze({planeMaterial:planeOwner.planeMaterial,constructorPolicy:'copy-fresh-mesh-identity-offworld-phase-zero' as const,maxModels:5,maxTextChars,muzzles:Object.freeze({pistol:muzzle('mfpistol'),shotgun:muzzle('mfspas12'),rifle:muzzle('mfak47'),sniper:muzzle('mfdragunov')})})});
  const inventory:OriginalSoloLoadedSceneFactoryOptions['inventory']=Object.freeze({data,sky,doorNames:Object.freeze(doorNames),transientUnresolved:Object.freeze([] as string[]),provenance:'loaded installed Solo complete scene inventory',sidedness:'double' as const,budgets:Object.freeze({maxModels:2048,maxVertices:2000000,maxFaces:2000000,maxTextChars,maxMeshes:256})});
  const owned=planeOwner;let released=false;const check=()=>{if(released)throw Error('Loaded Solo startup resources released');void owned.planeMaterial;};
  return Object.freeze({get resources(){check();return resources;},get inventory(){check();return inventory;},get planeOwner(){check();return owned;},release:()=>{if(released)return;released=true;owned.release();}});
 }catch(error){try{planeOwner?.release();}catch(cleanup){throw new AggregateError([error,cleanup],'Loaded Solo startup and cleanup failed',{cause:error});}throw error;}
}
