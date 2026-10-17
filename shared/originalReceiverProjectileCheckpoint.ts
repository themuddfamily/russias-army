import type {ReceiverProjectileWorldCheckpoint,ReceiverProjectileWorldModel,ReceiverProjectileWorldWeapon} from './originalReceiverProjectileWorld';
import {validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';

export interface ReceiverProjectileCheckpointCopyOptions {
 readonly maxModels:number;readonly maxActors:number;readonly maxTextChars:number;
 /** Optional explicit canonical RPG material; omission never guesses one. */
 readonly rocketMaterialHandle?:string;
}
const resource=(weapon:ReceiverProjectileWorldWeapon)=>weapon==='launcher'?'rg6grenade':'rpgrocket';
const weapons:readonly ReceiverProjectileWorldWeapon[]=['launcher','rpg'];
const reserved=new Set(['pistol','spas12','ak47','rg6','rpg','dragunov','rocket']);
const validText=(s:unknown):s is string=>typeof s==='string'&&s.length>0&&s.trim()===s;
const affine=(m:readonly number[])=>Array.isArray(m)&&m.length===16&&m.every(Number.isFinite)&&m[3]===0&&m[7]===0&&m[11]===0&&m[15]===1;
const prefixCopy=(p:ReceiverScenePrefix):ReceiverScenePrefix=>{
 if(!p)throw Error('Invalid receiver scene prefix');
 const kind=p.kind,sceneGeneration=p.sceneGeneration,callback=p.callback;
 if(kind!=='callback'&&kind!=='receipt')throw Error('Invalid receiver scene prefix');
 const next:ReceiverScenePrefix=kind==='receipt'?{kind,sceneGeneration,callback,tick:p.tick}:{kind,sceneGeneration,callback};
 validateReceiverScenePrefix(next);return Object.freeze(next);
};
const arrayLength=(value:unknown,maximum:number):number=>{
 if(!Array.isArray(value))throw Error('Projectile world model/actor budget exceeded');
 const length=value.length;if(!Number.isSafeInteger(length)||length<0||length>maximum)throw Error('Projectile world model/actor budget exceeded');return length;
};

function detachModel(m:ReceiverProjectileWorldModel,add:(value:string)=>void,maxTextChars:number):ReceiverProjectileWorldModel {
  if(!m)throw Error('Invalid projectile model capture');
  const handle=m.handle,materialHandle=m.materialHandle,resource=m.resource,inWorld=m.inWorld,matrix=m.worldMatrix,ancestry=m.groupAncestry;
  add(handle);add(materialHandle);add(resource);
  if(arrayLength(matrix,16)!==16||typeof inWorld!=='boolean')throw Error('Invalid projectile model capture');
  const groupCount=arrayLength(ancestry,maxTextChars),worldMatrix:number[]=[],groupAncestry:string[]=[];
  for(let i=0;i<16;i++)worldMatrix.push(matrix[i]);
  if(!affine(worldMatrix))throw Error('Invalid projectile model capture');
  for(let i=0;i<groupCount;i++){const group=ancestry[i];add(group);groupAncestry.push(group);}
  return Object.freeze({handle,materialHandle,resource,inWorld,worldMatrix:Object.freeze(worldMatrix),groupAncestry:Object.freeze(groupAncestry)});
 }

/** Detached committed model ownership only; no body/physics state is copied.
 * Known-field indexed capture matches bank coherence and rejects unfinished
 * construction before publication. No resource allocation or disposal. */
export function copyReceiverProjectileWorldCheckpoint(input:ReceiverProjectileWorldCheckpoint,options:ReceiverProjectileCheckpointCopyOptions):ReceiverProjectileWorldCheckpoint {
  if(!options)throw Error('Missing projectile checkpoint copy limits');
  const maxModels=options.maxModels,maxActors=options.maxActors,maxTextChars=options.maxTextChars,rocketMaterialHandle=options.rocketMaterialHandle;
  if(![maxModels,maxActors,maxTextChars].every(n=>Number.isSafeInteger(n)&&n>0)||maxModels>10000||maxActors>10000||maxTextChars>65536)throw Error('Invalid projectile checkpoint copy limits');
  if(rocketMaterialHandle!==undefined&&(!validText(rocketMaterialHandle)||rocketMaterialHandle.length>maxTextChars))throw Error('Invalid projectile checkpoint rocket material');
  if(!input)throw Error('Invalid projectile checkpoint');
  const prefix=prefixCopy(input.prefix),rawTemplate=input.template,rawCatalog=input.catalog,rawModels=input.models,rawActors=input.actors,rawFifo=input.fifo,rawConstructing=input.constructing;
  const launcher=rawFifo?.launcher,rpg=rawFifo?.rpg,o=Object.freeze({maxModels,maxActors,maxTextChars});
  if(rawConstructing!==undefined)throw Error('Unfinished projectile checkpoint publication');
  // Capture bounds once, before indexed reads; custom iterators are never used.
  const catalogCount=arrayLength(rawCatalog,o.maxModels-1),modelCount=arrayLength(rawModels,o.maxModels-1),actorCount=arrayLength(rawActors,o.maxActors),launcherCount=arrayLength(launcher,o.maxModels-1),rpgCount=arrayLength(rpg,o.maxModels-1);
  let text=rocketMaterialHandle?.length??0;
  const add=(value:string)=>{if(!validText(value))throw Error('Invalid projectile world text');text+=value.length;if(!Number.isSafeInteger(text)||text>o.maxTextChars)throw Error('Projectile world text budget exceeded');};
  const copiedCatalog:ReceiverProjectileWorldCheckpoint['catalog'][number][]=[],copiedModels:ReceiverProjectileWorldModel[]=[],copiedActors:ReceiverProjectileWorldCheckpoint['actors'][number][]=[],copiedLauncher:string[]=[],copiedRpg:string[]=[];
  for(let i=0;i<catalogCount;i++){const c=rawCatalog[i];if(!c)throw Error('Invalid projectile creation catalog');const handle=c.handle,weapon=c.weapon;add(handle);copiedCatalog.push(Object.freeze({handle,weapon}));}
  const template=detachModel(rawTemplate,add,o.maxTextChars);
  for(let i=0;i<modelCount;i++)copiedModels.push(detachModel(rawModels[i],add,o.maxTextChars));
  const binding=(a:ReceiverProjectileWorldCheckpoint['actors'][number])=>{if(!a)throw Error('Invalid projectile actor binding');const launchId=a.launchId,handle=a.handle,weapon=a.weapon;add(launchId);add(handle);return Object.freeze({launchId,handle,weapon});};
  for(let i=0;i<actorCount;i++)copiedActors.push(binding(rawActors[i]));
  for(let i=0;i<launcherCount;i++){const handle=launcher[i];add(handle);copiedLauncher.push(handle);}
  for(let i=0;i<rpgCount;i++){const handle=rpg[i];add(handle);copiedRpg.push(handle);}
  const s:ReceiverProjectileWorldCheckpoint=Object.freeze({prefix,template,catalog:Object.freeze(copiedCatalog),models:Object.freeze(copiedModels),actors:Object.freeze(copiedActors),fifo:Object.freeze({launcher:Object.freeze(copiedLauncher),rpg:Object.freeze(copiedRpg)})});
  const catalog=new Map<string,ReceiverProjectileWorldWeapon>(),folded=new Set<string>();
  for(const c of s.catalog as ReceiverProjectileWorldCheckpoint['catalog']){
   if(reserved.has(c.handle.toLowerCase())||c.handle.toLowerCase()==='grenade'||folded.has(c.handle.toLowerCase())||!weapons.includes(c.weapon))throw Error('Invalid projectile creation catalog');
   folded.add(c.handle.toLowerCase());catalog.set(c.handle,c.weapon);
  }
  const models=new Map<string,ReceiverProjectileWorldModel>();
  const validateModel=(m:ReceiverProjectileWorldModel,template=false)=>{
   if(!m||!affine(m.worldMatrix)||typeof m.inWorld!=='boolean'||!Array.isArray(m.groupAncestry)||m.groupAncestry.length>o.maxTextChars)throw Error('Invalid projectile model capture');
   if(template?(m.handle!=='grenade'||m.resource!=='rg6grenade'||m.inWorld):(models.has(m.handle)||!catalog.has(m.handle)||m.resource!==resource(catalog.get(m.handle)!)))throw Error('Projectile model/catalog mismatch');
   if(!template&&m.resource==='rpgrocket'&&rocketMaterialHandle!==undefined&&m.materialHandle!==rocketMaterialHandle)throw Error('Foreign projectile rocket material');
   const groups=new Set<string>();for(const g of m.groupAncestry){if(g.toLowerCase()===m.handle.toLowerCase()||groups.has(g.toLowerCase()))throw Error('Invalid projectile model ancestry');groups.add(g.toLowerCase());}
  };
  validateModel(s.template,true);
  for(const m of s.models as readonly ReceiverProjectileWorldModel[]){validateModel(m);models.set(m.handle,m);}
  if(models.size!==catalog.size)throw Error('Missing retained projectile model');
  const roles=new Set<string>(),launches=new Set<string>();
  for(const a of s.actors as ReceiverProjectileWorldCheckpoint['actors']){
   if(launches.has(a.launchId)||roles.has(a.handle)||catalog.get(a.handle)!==a.weapon||!models.get(a.handle)?.inWorld)throw Error('Invalid projectile actor binding');launches.add(a.launchId);roles.add(a.handle);
  }
  for(const weapon of weapons)for(const handle of s.fifo[weapon]){if(roles.has(handle)||catalog.get(handle)!==weapon||models.get(handle)?.inWorld!==false)throw Error('Invalid projectile family FIFO');roles.add(handle);}
  if(roles.size!==catalog.size)throw Error('Missing projectile ownership role');
  // Ancestry references are labels supplied by the adapter; cycles among owned
  // handles cannot establish a valid full-WORLD capture.
  const owned=new Map<string,ReceiverProjectileWorldModel>([['grenade',s.template],...[...models].map(([handle,m])=>[handle.toLowerCase(),m] as const)]);
  const visiting=new Set<string>(),visited=new Set<string>();
  for(const root of owned.keys()){
   if(visited.has(root))continue;const stack:{handle:string;next:number}[]=[{handle:root,next:0}];visiting.add(root);
   while(stack.length){const node=stack[stack.length-1],groups=owned.get(node.handle)!.groupAncestry;
    if(node.next===groups.length){visiting.delete(node.handle);visited.add(node.handle);stack.pop();continue;}
    const parent=groups[node.next++].toLowerCase();if(!owned.has(parent)||visited.has(parent))continue;
    if(visiting.has(parent))throw Error('Cyclic projectile ancestry');visiting.add(parent);stack.push({handle:parent,next:0});
   }
  }
  return s;
 }
