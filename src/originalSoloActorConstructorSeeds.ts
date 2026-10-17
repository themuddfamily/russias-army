import * as THREE from 'three';
import {isOriginalSoldierConstructorCapture,isOriginalSoldierGunConstructorCapture,type OriginalSoldierConstructorCapture,type OriginalSoldierGunConstructorCapture,type OriginalSoldierResources} from './originalSoldier';
import {ORIGINAL_WEAPON_RESOURCES} from './originalWeapons';
import {ORIGINAL_WEAPON_UNIT_SCALE} from './originalWeaponPresentation';
import type {WeaponId} from '../shared/protocol';
import type {ReceiverModelRotation,ReceiverModelPose} from '../shared/originalReceiverModelWorld';
import type {OriginalSoloActorCloneSeed} from './originalSoloActorLifecycle';
import {ORIGINAL_MAP_SCALE} from '../shared/originalMapProfile';

export interface OriginalSoloActorConstructorSeedsOptions {
 readonly soldierResources:OriginalSoldierResources;
 readonly sourceScale:number;readonly renderToWorld:readonly number[];
 readonly gunScale:number;
 readonly giResourceOrientation:Readonly<ReceiverModelRotation>;
 readonly gunClonePolicy:'copy-fresh-gun-mesh-factory';
 readonly giProvenance:string;readonly gunProvenance:Readonly<Record<WeaponId,string>>;
 readonly maxSeeds:number;readonly maxTextChars:number;
}
function matrix(raw:readonly number[]):THREE.Matrix4 {
 if(!Array.isArray(raw)||raw.length!==16||Array.from({length:16},(_,i)=>raw[i]).some(n=>!Number.isFinite(n))||raw[3]!==0||raw[7]!==0||raw[11]!==0||raw[15]!==1)throw Error('Invalid actor constructor affine matrix');
 const value=new THREE.Matrix4().fromArray(raw),det=value.determinant();if(!Number.isFinite(det)||det===0)throw Error('Invalid actor constructor invertible matrix');return value;
}
function rotation(q:Readonly<ReceiverModelRotation>):THREE.Quaternion {
 if(!q||![q.x,q.y,q.z,q.w].every(Number.isFinite)||Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)>1e-6)throw Error('Invalid actor constructor resource orientation');
 return new THREE.Quaternion(q.x,q.y,q.z,q.w);
}
function pose(value:THREE.Matrix4,sourceScale:number):Readonly<ReceiverModelPose> {
 const e=value.elements;if(!e.every(Number.isFinite))throw Error('Actor constructor matrix arithmetic overflow');
 const axes=[new THREE.Vector3(e[0],e[1],e[2]),new THREE.Vector3(e[4],e[5],e[6]),new THREE.Vector3(e[8],e[9],e[10])],lengths=axes.map(a=>Math.hypot(a.x,a.y,a.z));
 if(lengths.some(n=>!Number.isFinite(n)||n<=0)||Math.abs(lengths[1]/lengths[0]-1)>1e-8||Math.abs(lengths[2]/lengths[0]-1)>1e-8)throw Error('Actor constructor requires uniform scale');
 axes.forEach((a,i)=>a.set(a.x/lengths[i],a.y/lengths[i],a.z/lengths[i]));
 if(Math.abs(axes[0].dot(axes[1]))>1e-8||Math.abs(axes[0].dot(axes[2]))>1e-8||Math.abs(axes[1].dot(axes[2]))>1e-8||axes[0].clone().cross(axes[1]).dot(axes[2])<=0)throw Error('Actor constructor rejects shear/reflection');
 const scale=lengths[0]/sourceScale,q=new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(axes[0],axes[1],axes[2])).normalize();
 if(!Number.isFinite(scale)||scale<=0||![q.x,q.y,q.z,q.w].every(Number.isFinite))throw Error('Actor constructor pose overflow');
 return Object.freeze({position:Object.freeze({x:e[12],y:e[13],z:e[14]}),rotation:Object.freeze({x:q.x,y:q.y,z:q.z,w:q.w}),yaw:new THREE.Euler().setFromQuaternion(q,'YXZ').y,phase:0,scale});
}
/** Convert issued fresh observations, never current/recycled rig state.
 * All six gun seeds use the explicitly declared installed fresh Mesh factory;
 * the oriented selected constructor gun is not its preparent clone pose.
 * Borrowed resources, bones, renderers and pools are never updated or allocated. */
export function captureOriginalSoloActorConstructorSeeds(capture:OriginalSoldierConstructorCapture,gunFactory:OriginalSoldierGunConstructorCapture,options:OriginalSoloActorConstructorSeedsOptions) {
 if(!options||!Number.isFinite(options.sourceScale)||options.sourceScale<=0||!Number.isSafeInteger(options.maxSeeds)||options.maxSeeds<7||options.maxSeeds>256||!Number.isSafeInteger(options.maxTextChars)||options.maxTextChars<1||options.maxTextChars>65536||options.gunClonePolicy!=='copy-fresh-gun-mesh-factory')throw Error('Invalid actor constructor seed policy or limits');
 const resources=options.soldierResources;
 if(!isOriginalSoldierConstructorCapture(capture)||!isOriginalSoldierGunConstructorCapture(gunFactory)||!resources||resources.muzzleModels.isDisposed||capture.phase!==0||capture.boneCount!==25||capture.selectedWeapon!=='rpg'||gunFactory.weapon!=='rpg'||gunFactory.phase!==0||gunFactory.inWorld!==false||!resources.resourceBindingId||capture.resourceBindingId!==resources.resourceBindingId||gunFactory.resourceBindingId!==resources.resourceBindingId)throw Error('Actor constructor seeds require the issued fresh RPG resource generation');
 if(capture.gi.geometry!==resources.geometry||capture.gi.material!==resources.material||capture.gun.geometry!==resources.gunGeometries.get('rpg')||capture.gun.material!==resources.gunMaterials.get('rpg')||gunFactory.geometry!==capture.gun.geometry||gunFactory.material!==capture.gun.material)throw Error('Actor constructor borrowed resource mismatch');
 const orientation=rotation(options.giResourceOrientation),observed=rotation(capture.gi.resourceOrientation);
 if(Math.abs(Math.abs(orientation.dot(observed))-1)>1e-8)throw Error('Actor constructor resource basis mismatch');
 let chars=0;
 const text=(value:unknown):string=>{if(typeof value!=='string'||!value||value.trim()!==value||(chars+=value.length)>options.maxTextChars)throw Error('Actor constructor text budget exceeded');return value;};
 for(const label of [capture.provenance,gunFactory.provenance,resources.resourceBindingId])text(label);
 const giProvenance=text(options.giProvenance),gunLabels={} as Record<WeaponId,string>;
 for(const weapon of Object.keys(ORIGINAL_WEAPON_RESOURCES) as WeaponId[]){gunLabels[weapon]=text(options.gunProvenance?.[weapon]);const resource=ORIGINAL_WEAPON_RESOURCES[weapon];if(!(resources.gunGeometries.get(resource) instanceof THREE.BufferGeometry)||!(resources.gunMaterials.get(resource) instanceof THREE.Material))throw Error('Missing actor constructor gun resource');}
 const identity=new THREE.Matrix4().elements;
 if(!gunFactory.worldMatrix.every((n,i)=>n===identity[i])||!gunFactory.localMatrix.every((n,i)=>n===identity[i])||gunFactory.worldMatrix.length!==16||gunFactory.localMatrix.length!==16)throw Error('Unsupported actor fresh gun constructor transform');
 const mapping=matrix(options.renderToWorld),giWorld=matrix(capture.gi.worldMatrix),mappingScale=pose(mapping,1).scale;
 if(Math.abs(options.sourceScale/(ORIGINAL_MAP_SCALE*mappingScale)-1)>1e-8||!Number.isFinite(options.gunScale)||options.gunScale<=0||Math.abs(options.gunScale/(ORIGINAL_WEAPON_UNIT_SCALE*mappingScale/options.sourceScale)-1)>1e-8)throw Error('Actor constructor copy unit/gun scale mismatch');
 const gi:OriginalSoloActorCloneSeed=Object.freeze({pose:pose(mapping.clone().multiply(giWorld).multiply(new THREE.Matrix4().makeRotationFromQuaternion(observed.clone().invert())),options.sourceScale),geometryProvenance:giProvenance});
 const fresh=pose(mapping.clone().multiply(matrix(gunFactory.worldMatrix)).scale(new THREE.Vector3().setScalar(ORIGINAL_WEAPON_UNIT_SCALE)),options.sourceScale);
 const guns={} as Record<WeaponId,OriginalSoloActorCloneSeed>;
 for(const weapon of Object.keys(ORIGINAL_WEAPON_RESOURCES) as WeaponId[])guns[weapon]=Object.freeze({pose:fresh,geometryProvenance:gunLabels[weapon]});
 return Object.freeze({gi,guns:Object.freeze(guns),constructorBone23WorldMatrix:Object.freeze(mapping.clone().multiply(matrix(capture.bone23WorldMatrix)).toArray()),constructorGunRawWorldMatrix:Object.freeze(mapping.clone().multiply(matrix(capture.gun.worldMatrix)).scale(new THREE.Vector3().setScalar(ORIGINAL_WEAPON_UNIT_SCALE)).toArray())});
}
