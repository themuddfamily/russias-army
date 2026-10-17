import type {Vec3,WeaponId} from './protocol';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import {validateReceiverScenePrefix} from './originalReceiverPrefix';
import type {OriginalReceiverTransientModel,OriginalReceiverTransientShader,OriginalReceiverTransientBirth} from './originalReceiverTransientWorld';
export interface ReceiverTransientTexture {readonly name:string;readonly nearFiltering?:true;readonly renderFormat?:'rgba8888'}
export interface ReceiverTransientActor {readonly id:string;readonly kind:OriginalReceiverTransientBirth['kind'];readonly handle:string;readonly position:Readonly<Vec3>;readonly time:number;readonly weapon?:WeaponId;readonly attackerName?:string|null}
export interface ReceiverTransientCheckpoint {
 readonly sceneGeneration:number;readonly prefix:ReceiverScenePrefix;readonly planeWidthWorld:number|null;
 readonly models:readonly Readonly<OriginalReceiverTransientModel>[];readonly shaders:readonly OriginalReceiverTransientShader[];
 readonly textures:readonly ReceiverTransientTexture[];readonly actors:readonly ReceiverTransientActor[];
 readonly planePool:readonly string[];readonly muzzlePools:readonly Readonly<{weapon:WeaponId;handles:readonly string[]}>[];readonly shaderPool:readonly string[];
}
export interface ReceiverTransientCheckpointLimits {readonly maxModels:number;readonly maxActors:number;readonly maxShaders:number;readonly maxTextures:number;readonly maxPoolEntries:number;readonly maxTextChars:number}
const issued=new WeakMap<object,{models:number;actors:number;shaders:number;textures:number;pools:number;text:number}>();
const muzzle:Partial<Record<WeaponId,string>>={pistol:'mfpistol',shotgun:'mfspas12',rifle:'mfak47',sniper:'mfdragunov'};
function limitsCopy(raw:ReceiverTransientCheckpointLimits):ReceiverTransientCheckpointLimits {
 const maxModels=raw.maxModels,maxActors=raw.maxActors,maxShaders=raw.maxShaders,maxTextures=raw.maxTextures,maxPoolEntries=raw.maxPoolEntries,maxTextChars=raw.maxTextChars;
 if(![maxModels,maxActors,maxShaders,maxTextures,maxPoolEntries,maxTextChars].every(n=>Number.isSafeInteger(n)&&n>0)||[maxModels,maxActors,maxShaders,maxTextures,maxPoolEntries].some(n=>n>256)||maxTextChars>65536)throw Error('Invalid transient checkpoint limits');return {maxModels,maxActors,maxShaders,maxTextures,maxPoolEntries,maxTextChars};
}
/** Trusted issuer brand proves detached bounded source data, not native resource
 * equality, primitive defaults, rendering or complete scene coverage. */
export function createOriginalReceiverTransientCheckpoint(raw:ReceiverTransientCheckpoint,inputLimits:ReceiverTransientCheckpointLimits):ReceiverTransientCheckpoint {
 const limits=limitsCopy(inputLimits);if(!raw)throw Error('Invalid transient checkpoint');
 const sceneGeneration=raw.sceneGeneration,p=raw.prefix,planeWidthWorld=raw.planeWidthWorld,rawModels=raw.models,rawShaders=raw.shaders,rawTextures=raw.textures,rawActors=raw.actors,rawPlanes=raw.planePool,rawMuzzles=raw.muzzlePools,rawPool=raw.shaderPool;
 const count=(a:readonly unknown[],cap:number):number=>{if(!Array.isArray(a))throw Error('Invalid transient checkpoint array');const n=a.length;if(!Number.isSafeInteger(n)||n<0||n>cap)throw Error('Transient checkpoint count budget exceeded');return n;};
 const modelCount=count(rawModels,limits.maxModels),shaderCount=count(rawShaders,limits.maxShaders),textureCount=count(rawTextures,limits.maxTextures),actorCount=count(rawActors,limits.maxActors),planeCount=count(rawPlanes,limits.maxPoolEntries),muzzleCount=count(rawMuzzles,4),shaderPoolCount=count(rawPool,limits.maxPoolEntries);
 if(!Number.isSafeInteger(sceneGeneration)||sceneGeneration<0||!p||planeWidthWorld!==null&&(!Number.isFinite(planeWidthWorld)||planeWidthWorld<=0))throw Error('Invalid transient checkpoint generation or width');
 const kind=p.kind,generation=p.sceneGeneration,callback=p.callback;
 if(kind!=='callback'&&kind!=='receipt')throw Error('Invalid transient checkpoint prefix');
 const prefix:ReceiverScenePrefix=kind==='receipt'?{kind,sceneGeneration:generation,callback,tick:p.tick}:{kind,sceneGeneration:generation,callback};validateReceiverScenePrefix(prefix);if(generation!==sceneGeneration)throw Error('Foreign transient checkpoint prefix');
 let text=0,poolCount=planeCount;
 const label=(value:string,empty=false):string=>{if(typeof value!=='string'||!empty&&!value)throw Error('Invalid transient checkpoint text');text+=value.length;if(!Number.isSafeInteger(text)||text>limits.maxTextChars)throw Error('Transient checkpoint text budget exceeded');return value;};label(kind);
 const point=(v:Readonly<Vec3>):Readonly<Vec3>=>{if(!v)throw Error('Invalid transient checkpoint vector');const x=v.x,y=v.y,z=v.z;if(![x,y,z].every(Number.isFinite))throw Error('Invalid transient checkpoint vector');return Object.freeze({x,y,z});};
 const flags=(near:unknown,format:unknown)=>{if(near!==undefined&&near!==true||format!==undefined&&format!=='rgba8888')throw Error('Invalid transient texture flags');if(format!==undefined)label(format as string);return {...(near!==undefined?{nearFiltering:true as const}:{}),...(format!==undefined?{renderFormat:'rgba8888' as const}:{})};};
 const textures:ReceiverTransientTexture[]=[],textureMap=new Map<string,ReceiverTransientTexture>();
 for(let i=0;i<textureCount;i++){const item=rawTextures[i];if(!item)throw Error('Missing transient texture');const name=label(item.name),near=item.nearFiltering,format=item.renderFormat;if(textureMap.has(name))throw Error('Duplicate transient texture');const value=Object.freeze({name,...flags(near,format)});textures.push(value);textureMap.set(name,value);}
 const shaders:OriginalReceiverTransientShader[]=[],shaderMap=new Map<string,OriginalReceiverTransientShader>();
 for(let i=0;i<shaderCount;i++){
  const item=rawShaders[i];if(!item)throw Error('Missing transient shader');const handle=label(item.handle),texture=label(item.texture),recycled=item.recycled,rawScale=item.textureScale,rawPosition=item.texturePosition,blend=item.blend,emissiveWhite=item.emissiveWhite,specularBlack=item.specularBlack,shininess=item.shininess,near=item.nearFiltering,format=item.renderFormat;
  if(shaderMap.has(handle)||!textureMap.has(texture)||typeof recycled!=='boolean'||typeof emissiveWhite!=='boolean'||!Number.isFinite(blend)||specularBlack!==undefined&&typeof specularBlack!=='boolean'||shininess!==undefined&&shininess!==0)throw Error('Invalid transient shader join');
  const f=flags(near,format),t=textureMap.get(texture)!;if(f.nearFiltering!==t.nearFiltering||f.renderFormat!==t.renderFormat)throw Error('Contradictory transient texture flags');const textureScale=point(rawScale),texturePosition=point(rawPosition);
  const value=Object.freeze({handle,texture,recycled,textureScale,texturePosition,blend,emissiveWhite,...(specularBlack!==undefined?{specularBlack}:{}),...(shininess!==undefined?{shininess}:{}),...f});shaders.push(value);shaderMap.set(handle,value);
 }
 const models:Readonly<OriginalReceiverTransientModel>[]=[],modelMap=new Map<string,Readonly<OriginalReceiverTransientModel>>();
 for(let i=0;i<modelCount;i++){
  const item:Readonly<OriginalReceiverTransientModel>=rawModels[i];if(!item)throw Error('Missing transient model');const handle=label(item.handle),name=label(item.name),resource=label(item.resource),group=item.group,modelKind=item.kind,inWorld=item.inWorld,provenance=label(item.geometryProvenance),shaderHandle=label(item.shaderHandle),pose=item.pose,matrix=item.worldMatrix;
  if(modelMap.has(handle)||modelKind!=='transient'||group!=='gsmokes'||typeof inWorld!=='boolean'||!shaderMap.has(shaderHandle)||!(resource==='plane'||Object.values(muzzle).includes(resource))||!pose||resource==='plane'&&planeWidthWorld===null)throw Error('Invalid transient model join');label(group);label(modelKind);
  const rawPosition=pose.position,yaw=pose.yaw,phase=pose.phase,scale=pose.scale,q=pose.rotation;if(![yaw,phase,scale].every(Number.isFinite)||phase<0||scale<=0||!q)throw Error('Invalid transient model pose');const position=point(rawPosition),x=q.x,y=q.y,z=q.z,w=q.w;if(![x,y,z,w].every(Number.isFinite)||Math.abs(Math.hypot(x,y,z,w)-1)>1e-6)throw Error('Invalid transient model rotation');
  let worldMatrix:readonly number[]|undefined;if(matrix!==undefined){if(count(matrix,16)!==16)throw Error('Invalid transient model matrix');const values:number[]=[];for(let j=0;j<16;j++){const n=matrix[j];if(!Number.isFinite(n))throw Error('Invalid transient model matrix');values.push(n);}if(values[3]!==0||values[7]!==0||values[11]!==0||values[15]!==1)throw Error('Invalid transient model affine');worldMatrix=Object.freeze(values);}
  const value=Object.freeze({handle,name,resource,group,kind:modelKind,inWorld,geometryProvenance:provenance,shaderHandle,pose:Object.freeze({position,yaw,phase,scale,rotation:Object.freeze({x,y,z,w})}),...(worldMatrix?{worldMatrix}:{})});models.push(value);modelMap.set(handle,value);
 }
 const roles=new Set<string>(),actors:ReceiverTransientActor[]=[],ids=new Set<string>();
 const role=(handle:string,resource:string,pooled=false)=>{const m=modelMap.get(handle);if(!m||m.resource!==resource||roles.has(handle)||pooled&&m.inWorld)throw Error('Invalid transient model role');roles.add(handle);};
 for(let i=0;i<actorCount;i++){
  const item=rawActors[i];if(!item)throw Error('Missing transient actor');const id=label(item.id),kind=item.kind,handle=label(item.handle),rawPosition=item.position,time=item.time,weapon=item.weapon,attackerName=item.attackerName;
  if(ids.has(id)||!['bang','puff','miss','blood','muzzle'].includes(kind)||!Number.isSafeInteger(time)||time<0||weapon!==undefined&&!Object.hasOwn(muzzle,weapon)||attackerName!==undefined&&attackerName!==null&&typeof attackerName!=='string')throw Error('Invalid transient actor');ids.add(id);label(kind);
  if(kind==='muzzle'){if(weapon===undefined||attackerName!==undefined)throw Error('Invalid transient muzzle actor');label(weapon);role(handle,muzzle[weapon]!);}else{if(weapon!==undefined||kind!=='bang'&&attackerName!==undefined||kind==='bang'&&attackerName===undefined)throw Error('Invalid transient actor metadata');role(handle,'plane');}
  if(kind==='muzzle'&&time>1||kind==='bang'&&(time<1||time>16)||kind==='blood'&&(time>8||time%4!==0)||kind==='miss'&&time>80||kind==='puff'&&(time>180||time%6!==0))throw Error('Invalid transient actor time');
  if(typeof attackerName==='string')label(attackerName,true);actors.push(Object.freeze({id,kind,handle,position:point(rawPosition),time,...(weapon!==undefined?{weapon}:{}),...(attackerName!==undefined?{attackerName}:{})}));
 }
 const planePool:string[]=[];for(let i=0;i<planeCount;i++){const handle=label(rawPlanes[i]);role(handle,'plane',true);planePool.push(handle);}
 const muzzlePools:Array<Readonly<{weapon:WeaponId;handles:readonly string[]}>>=[],families=new Set<WeaponId>();
 for(let i=0;i<muzzleCount;i++){const item=rawMuzzles[i];if(!item)throw Error('Missing transient muzzle pool');const weapon=item.weapon,rawHandles=item.handles,n=count(rawHandles,limits.maxPoolEntries);poolCount+=n;if(poolCount>limits.maxPoolEntries)throw Error('Transient pool entry budget exceeded');if(!Object.hasOwn(muzzle,weapon)||families.has(weapon))throw Error('Invalid transient muzzle pool');families.add(weapon);label(weapon);const handles:string[]=[];for(let j=0;j<n;j++){const handle=label(rawHandles[j]);role(handle,muzzle[weapon]!,true);handles.push(handle);}muzzlePools.push(Object.freeze({weapon,handles:Object.freeze(handles)}));}
 const shaderPool:string[]=[];for(let i=0;i<shaderPoolCount;i++){const handle=label(rawPool[i]);if(!shaderMap.has(handle))throw Error('Invalid transient shader pool join');shaderPool.push(handle);}if(poolCount>limits.maxPoolEntries||roles.size!==modelMap.size)throw Error('Incomplete transient role partition or pool budget');
 const result:ReceiverTransientCheckpoint=Object.freeze({sceneGeneration,prefix:Object.freeze(prefix),planeWidthWorld,models:Object.freeze(models),shaders:Object.freeze(shaders),textures:Object.freeze(textures),actors:Object.freeze(actors),planePool:Object.freeze(planePool),muzzlePools:Object.freeze(muzzlePools),shaderPool:Object.freeze(shaderPool)});
 issued.set(result,{models:modelCount,actors:actorCount,shaders:shaderCount,textures:textureCount,pools:Math.max(poolCount,shaderPoolCount),text});return result;
}
export function validateOriginalReceiverTransientCheckpoint(value:ReceiverTransientCheckpoint,inputLimits:ReceiverTransientCheckpointLimits):void {
 const limits=limitsCopy(inputLimits),cost=value&&issued.get(value);if(!cost||cost.models>limits.maxModels||cost.actors>limits.maxActors||cost.shaders>limits.maxShaders||cost.textures>limits.maxTextures||cost.pools>limits.maxPoolEntries||cost.text>limits.maxTextChars)throw Error('Unbranded or oversized transient checkpoint');
}
