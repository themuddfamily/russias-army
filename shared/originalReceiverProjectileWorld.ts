import type {ReceiverProjectileModelCapture,ReceiverProjectileInventoryCapture} from './originalReceiverProjectileInventory';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import type {ReceiverSceneTransaction} from './originalReceiverModelWorld';

export type ReceiverProjectileWorldWeapon='launcher'|'rpg';
export interface ReceiverProjectileWorldModel extends ReceiverProjectileModelCapture {readonly materialHandle:string}
export interface ReceiverProjectileWorldCheckpoint {
 readonly prefix:ReceiverScenePrefix;readonly template:ReceiverProjectileWorldModel;
 /** Independent creation catalog, including every retained offworld clone. */
 readonly catalog:readonly Readonly<{handle:string;weapon:ReceiverProjectileWorldWeapon}>[];
 readonly models:readonly ReceiverProjectileWorldModel[];
 readonly fifo:Readonly<{launcher:readonly string[];rpg:readonly string[]}>;
 readonly actors:readonly Readonly<{launchId:string;handle:string;weapon:ReceiverProjectileWorldWeapon}>[];
 readonly constructing?:Readonly<{launchId:string;handle:string;weapon:ReceiverProjectileWorldWeapon}>;
}
export interface ReceiverProjectileWorldOptions {
 readonly maxModels:number;readonly maxActors:number;readonly maxCommands:number;readonly maxTextChars:number;
 /** Explicit captured shady('rpg') identity, not a native default. */
 readonly rocketMaterialHandle:string;
}
export interface ReceiverProjectileWorldBirth {
 readonly launchId:string;readonly weapon:ReceiverProjectileWorldWeapon;
 /** Fresh clone seed must explicitly capture matrix, material and membership.
  * With an allocator, its returned name must be the model handle. */
 readonly cloneFresh:(allocatedName?:string)=>ReceiverProjectileWorldModel;
 readonly resetModel:(retained:ReceiverProjectileWorldModel)=>ReceiverProjectileWorldModel;
 readonly onRecycled?:(readmitted:ReceiverProjectileWorldModel)=>void;
}
export interface ReceiverProjectileWorldTransaction {
 applyReceipt(prefix:ReceiverScenePrefix):void;advanceCallback(prefix:ReceiverScenePrefix):void;
 birth(input:ReceiverProjectileWorldBirth):string;
 capturePose(launchId:string,model:ReceiverProjectileWorldModel):void;
 captureModel(handle:string,model:ReceiverProjectileWorldModel):void;
 retire(launchId:string,emitBeforeStore:(model:ReceiverProjectileWorldModel)=>void):void;
 freeze():ReceiverProjectileWorldCheckpoint;snapshotAt(prefix:ReceiverScenePrefix):ReceiverProjectileInventoryCapture;
 prepareCommit():()=>void;commit():void;rollback():void;
}
export type ReceiverProjectileCloneAllocator=Pick<ReceiverSceneTransaction,'allocateCloneName'>;
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

/** Private model ownership only: no body creation, physics, fuse or contact
 * simulation. Full RAW-resource WORLD matrices and fresh clone defaults come
 * from explicit captures. The caller coordinates an optional shared allocator's
 * prepare/rollback with this participant; this bank has no private name counter.
 * Rocket template 'rocket' belongs to local weaponry, not this bank. Native
 * global actor ordering and body reuse remain separate evidence. Dummy parking
 * at source (0,0,-1000) is NOT a retained model transform. Input decoding is a
 * guarded mutation: query reads are allowed, but caught getter/hook reentry
 * poisons the stage. An injected allocator remains a separately coordinated
 * participant; cancelling this bank does not roll its counter back. */
export class OriginalReceiverProjectileWorld {
 private state:ReceiverProjectileWorldCheckpoint|undefined;private active=false;private released=false;
 private acquiring=false;private acquisitionFailed=false;
 private rollbackActive:(()=>void)|undefined;private lastReceiptTick:number|undefined;
 private readonly options:ReceiverProjectileWorldOptions;
 constructor(checkpoint:ReceiverProjectileWorldCheckpoint,options:ReceiverProjectileWorldOptions){
  if(!options)throw Error('Invalid projectile world options');
  const maxModels=options.maxModels,maxActors=options.maxActors,maxCommands=options.maxCommands,maxTextChars=options.maxTextChars,rocketMaterialHandle=options.rocketMaterialHandle;
  if(![maxModels,maxActors,maxCommands,maxTextChars].every(v=>Number.isSafeInteger(v)&&v>0)||!validText(rocketMaterialHandle)||rocketMaterialHandle.length>maxTextChars)throw Error('Invalid projectile world options');
  this.options=Object.freeze({maxModels,maxActors,maxCommands,maxTextChars,rocketMaterialHandle});
  this.state=this.copy(checkpoint);if(this.state.constructing)throw Error('Unfinished projectile checkpoint constructor');
  this.lastReceiptTick=this.state.prefix.kind==='receipt'?this.state.prefix.tick:undefined;
 }
 private detachModel(m:ReceiverProjectileWorldModel,add:(value:string)=>void):ReceiverProjectileWorldModel {
  if(!m)throw Error('Invalid projectile model capture');
  const handle=m.handle,materialHandle=m.materialHandle,resource=m.resource,inWorld=m.inWorld,matrix=m.worldMatrix,ancestry=m.groupAncestry;
  add(handle);add(materialHandle);add(resource);
  if(arrayLength(matrix,16)!==16||typeof inWorld!=='boolean')throw Error('Invalid projectile model capture');
  const groupCount=arrayLength(ancestry,this.options.maxTextChars),worldMatrix:number[]=[],groupAncestry:string[]=[];
  for(let i=0;i<16;i++)worldMatrix.push(matrix[i]);
  if(!affine(worldMatrix))throw Error('Invalid projectile model capture');
  for(let i=0;i<groupCount;i++){const group=ancestry[i];add(group);groupAncestry.push(group);}
  return Object.freeze({handle,materialHandle,resource,inWorld,worldMatrix:Object.freeze(worldMatrix),groupAncestry:Object.freeze(groupAncestry)});
 }
 private captureModelInput(m:ReceiverProjectileWorldModel):ReceiverProjectileWorldModel {
  let text=0;return this.detachModel(m,value=>{if(!validText(value))throw Error('Invalid projectile world text');text+=value.length;if(text>this.options.maxTextChars)throw Error('Projectile world text budget exceeded');});
 }
 private copy(input:ReceiverProjectileWorldCheckpoint):ReceiverProjectileWorldCheckpoint {
  if(!input)throw Error('Invalid projectile checkpoint');
  const prefix=prefixCopy(input.prefix),rawTemplate=input.template,rawCatalog=input.catalog,rawModels=input.models,rawActors=input.actors,rawFifo=input.fifo,rawConstructing=input.constructing;
  const launcher=rawFifo?.launcher,rpg=rawFifo?.rpg,o=this.options;
  // Capture bounds once, before indexed reads; custom iterators are never used.
  const catalogCount=arrayLength(rawCatalog,o.maxModels-1),modelCount=arrayLength(rawModels,o.maxModels-1),actorCount=arrayLength(rawActors,o.maxActors),launcherCount=arrayLength(launcher,o.maxModels-1),rpgCount=arrayLength(rpg,o.maxModels-1);
  if(actorCount+(rawConstructing?1:0)>o.maxActors)throw Error('Projectile world model/actor budget exceeded');
  let text=o.rocketMaterialHandle.length;
  const add=(value:string)=>{if(!validText(value))throw Error('Invalid projectile world text');text+=value.length;if(!Number.isSafeInteger(text)||text>o.maxTextChars)throw Error('Projectile world text budget exceeded');};
  const copiedCatalog:ReceiverProjectileWorldCheckpoint['catalog'][number][]=[],copiedModels:ReceiverProjectileWorldModel[]=[],copiedActors:ReceiverProjectileWorldCheckpoint['actors'][number][]=[],copiedLauncher:string[]=[],copiedRpg:string[]=[];
  for(let i=0;i<catalogCount;i++){const c=rawCatalog[i];if(!c)throw Error('Invalid projectile creation catalog');const handle=c.handle,weapon=c.weapon;add(handle);copiedCatalog.push(Object.freeze({handle,weapon}));}
  const template=this.detachModel(rawTemplate,add);
  for(let i=0;i<modelCount;i++)copiedModels.push(this.detachModel(rawModels[i],add));
  const binding=(a:ReceiverProjectileWorldCheckpoint['actors'][number])=>{if(!a)throw Error('Invalid projectile actor binding');const launchId=a.launchId,handle=a.handle,weapon=a.weapon;add(launchId);add(handle);return Object.freeze({launchId,handle,weapon});};
  for(let i=0;i<actorCount;i++)copiedActors.push(binding(rawActors[i]));
  const constructing=rawConstructing?binding(rawConstructing):undefined;
  for(let i=0;i<launcherCount;i++){const handle=launcher[i];add(handle);copiedLauncher.push(handle);}
  for(let i=0;i<rpgCount;i++){const handle=rpg[i];add(handle);copiedRpg.push(handle);}
  const s:ReceiverProjectileWorldCheckpoint=Object.freeze({prefix,template,catalog:Object.freeze(copiedCatalog),models:Object.freeze(copiedModels),actors:Object.freeze(copiedActors),fifo:Object.freeze({launcher:Object.freeze(copiedLauncher),rpg:Object.freeze(copiedRpg)}),...(constructing?{constructing}:{})});
  const catalog=new Map<string,ReceiverProjectileWorldWeapon>(),folded=new Set<string>();
  for(const c of s.catalog as ReceiverProjectileWorldCheckpoint['catalog']){
   if(reserved.has(c.handle.toLowerCase())||c.handle.toLowerCase()==='grenade'||folded.has(c.handle.toLowerCase())||!weapons.includes(c.weapon))throw Error('Invalid projectile creation catalog');
   folded.add(c.handle.toLowerCase());catalog.set(c.handle,c.weapon);
  }
  const models=new Map<string,ReceiverProjectileWorldModel>();
  const validateModel=(m:ReceiverProjectileWorldModel,template=false)=>{
   if(!m||!affine(m.worldMatrix)||typeof m.inWorld!=='boolean'||!Array.isArray(m.groupAncestry)||m.groupAncestry.length>o.maxTextChars)throw Error('Invalid projectile model capture');
   if(template?(m.handle!=='grenade'||m.resource!=='rg6grenade'||m.inWorld):(models.has(m.handle)||!catalog.has(m.handle)||m.resource!==resource(catalog.get(m.handle)!)))throw Error('Projectile model/catalog mismatch');
   const groups=new Set<string>();for(const g of m.groupAncestry){if(g.toLowerCase()===m.handle.toLowerCase()||groups.has(g.toLowerCase()))throw Error('Invalid projectile model ancestry');groups.add(g.toLowerCase());}
  };
  validateModel(s.template,true);
  for(const m of s.models as readonly ReceiverProjectileWorldModel[]){validateModel(m);models.set(m.handle,m);}
  if(models.size!==catalog.size)throw Error('Missing retained projectile model');
  const roles=new Set<string>(),launches=new Set<string>();
  for(const a of s.actors as ReceiverProjectileWorldCheckpoint['actors']){
   if(launches.has(a.launchId)||roles.has(a.handle)||catalog.get(a.handle)!==a.weapon||!models.get(a.handle)?.inWorld)throw Error('Invalid projectile actor binding');launches.add(a.launchId);roles.add(a.handle);
  }
  if(s.constructing){const a=s.constructing;if(launches.has(a.launchId)||roles.has(a.handle)||catalog.get(a.handle)!==a.weapon)throw Error('Invalid projectile construction binding');roles.add(a.handle);}
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
 freeze():ReceiverProjectileWorldCheckpoint {if(this.released||!this.state)throw Error('Projectile world released');return this.state;}
 private inventory(s:ReceiverProjectileWorldCheckpoint,prefix:ReceiverScenePrefix):ReceiverProjectileInventoryCapture {
  if(!sameReceiverScenePrefix(s.prefix,prefix))throw Error('Projectile world snapshot prefix mismatch');
  return Object.freeze({prefix:s.prefix,expectedHandles:Object.freeze(['grenade',...s.catalog.map(c=>c.handle)]),models:Object.freeze([s.template,...s.models])});
 }
 snapshotAt(prefix:ReceiverScenePrefix):ReceiverProjectileInventoryCapture{return this.inventory(this.freeze(),prefix);}
 release():void {if(this.released)return;this.released=true;try{this.rollbackActive?.();}finally{this.rollbackActive=undefined;this.active=false;this.state=undefined;this.lastReceiptTick=undefined;}}
 begin(allocator?:ReceiverProjectileCloneAllocator):ReceiverProjectileWorldTransaction {
  if(this.acquiring){this.acquisitionFailed=true;throw Error('Recursive projectile transaction acquisition');}
  const initial=this.freeze();if(this.active)throw Error('Projectile transaction active');
  // Lock acquisition before touching an externally supplied allocator getter.
  // A caught recursive begin or release cannot admit a stage from stale state.
  this.acquiring=true;this.acquisitionFailed=false;
  let allocate:ReceiverProjectileCloneAllocator['allocateCloneName']|undefined;
  try{
   const allocateMethod=allocator?.allocateCloneName;
   if(allocator!==undefined&&typeof allocateMethod!=='function')throw Error('Invalid projectile clone allocator');
   allocate=allocateMethod===undefined?undefined:Function.prototype.bind.call(allocateMethod,allocator);
   if(this.acquisitionFailed||this.released||this.active||this.state!==initial)throw Error('Projectile transaction acquisition failed');
   this.active=true;
  }finally{this.acquiring=false;this.acquisitionFailed=false;}
  let state=initial,tick=this.lastReceiptTick,count=0,open=true,failed=false,sealed=false,hook=false,running=false,publisher:(()=>void)|undefined;
  const read=()=>{if(!open||failed||this.released)throw Error('Projectile transaction closed or failed');return state;};
  const check=()=>{if(hook||running){failed=true;throw Error('Recursive projectile model operation');}read();if(sealed)throw Error('Projectile transaction prepared');};
  const guarded=<T>(operation:()=>T):T=>{check();running=true;try{if(++count>this.options.maxCommands)throw Error('Projectile command budget exceeded');const result=operation();read();return result;}catch(error){failed=true;throw error;}finally{running=false;}};
  const invoke=<T>(fn:()=>T):T=>{hook=true;let result:T;try{result=fn();}finally{hook=false;}read();return result;};
  const replace=(changes:Partial<ReceiverProjectileWorldCheckpoint>)=>{const next=this.copy({...state,...changes});read();state=next;};
  const rollback=()=>{if(hook||running)failed=true;if(!open)return;open=false;this.active=false;this.rollbackActive=undefined;};
  const prepare=()=>{check();running=true;try{if(state.constructing)throw Error('Unfinished projectile construction');const next=this.copy(state),nextTick=tick;read();state=next;sealed=true;publisher=()=>{if(!open)return;if(hook||running){failed=true;throw Error('Recursive projectile publication');}read();this.state=next;this.lastReceiptTick=nextTick;open=false;this.active=false;this.rollbackActive=undefined;};return publisher;}catch(error){failed=true;throw error;}finally{running=false;}};
  this.rollbackActive=rollback;
  return {
   applyReceipt:input=>guarded(()=>{const p=prefixCopy(input);read();if(p.kind!=='receipt'||p.sceneGeneration!==state.prefix.sceneGeneration||p.callback!==state.prefix.callback||tick!==undefined&&p.tick<=tick)throw Error('Projectile receipt replay or mismatch');replace({prefix:p});tick=p.tick;}),
   advanceCallback:input=>guarded(()=>{const p=prefixCopy(input);read();if(p.kind!=='callback'||p.sceneGeneration!==state.prefix.sceneGeneration||p.callback!==state.prefix.callback+1)throw Error('Projectile callback skip or mismatch');replace({prefix:p});}),
   birth:input=>guarded(()=>{
    if(!input)throw Error('Invalid projectile birth');
    const launchId=input.launchId,weapon=input.weapon,cloneFresh=input.cloneFresh,resetModel=input.resetModel,onRecycled=input.onRecycled;read();
    if(!validText(launchId)||launchId.length>this.options.maxTextChars||!weapons.includes(weapon)||typeof cloneFresh!=='function'||typeof resetModel!=='function'||onRecycled!==undefined&&typeof onRecycled!=='function'||state.actors.some(a=>a.launchId===launchId)||state.actors.length>=this.options.maxActors)throw Error('Invalid projectile birth');
    const queue=state.fifo[weapon],recycled=queue[0];let model:ReceiverProjectileWorldModel;
    if(recycled){
     model=Object.freeze({...state.models.find(m=>m.handle===recycled)!,inWorld:true});
     replace({models:state.models.map(m=>m.handle===recycled?model:m),fifo:{...state.fifo,[weapon]:queue.slice(1)},constructing:{launchId,handle:recycled,weapon}});
     if(onRecycled)invoke(()=>onRecycled(state.models.find(m=>m.handle===recycled)!));
    }else{
     if(state.models.length+1>=this.options.maxModels)throw Error('Projectile model budget requires scene reset');
     const name=allocate?invoke(()=>allocate(weapon==='launcher'?'grenade':'rocket','before')):undefined;
     if(name!==undefined&&(!validText(name)||name.length>this.options.maxTextChars))throw Error('Invalid allocated projectile name');
     model=this.captureModelInput(invoke(()=>cloneFresh(name)));read();
     if(!model||name!==undefined&&model.handle!==name||model.resource!==resource(weapon))throw Error('Invalid fresh projectile clone');
     replace({catalog:[...state.catalog,{handle:model.handle,weapon}],models:[...state.models,model],constructing:{launchId,handle:model.handle,weapon}});
    }
    const retained=state.models.find(m=>m.handle===model.handle)!,reset=this.captureModelInput(invoke(()=>resetModel(retained)));read();
    if(!reset||reset.handle!==retained.handle||reset.resource!==retained.resource||typeof reset.inWorld!=='boolean'||recycled&&!reset.inWorld||reset.materialHandle!==(weapon==='rpg'?this.options.rocketMaterialHandle:retained.materialHandle))throw Error('Invalid projectile constructor reset');
    // Fresh addToWorld is after captured constructor assignments; recycle was
    // already admitted before its reset. actorList registration follows both.
    replace({models:state.models.map(m=>m.handle===retained.handle?{...reset,inWorld:true}:m),constructing:undefined,actors:[...state.actors,{launchId,handle:retained.handle,weapon}]});return retained.handle;
   }),
   capturePose:(launchId,input)=>guarded(()=>{const model=this.captureModelInput(input);read();const actor=state.actors.find(a=>a.launchId===launchId);if(!actor||!model||model.handle!==actor.handle||!model.inWorld)throw Error('Absent projectile pose owner');replace({models:state.models.map(m=>m.handle===actor.handle?model:m)});}),
   captureModel:(handle,input)=>guarded(()=>{const model=this.captureModelInput(input);read();const retained=handle==='grenade'?state.template:state.models.find(m=>m.handle===handle);if(!retained||!model||model.handle!==handle||model.resource!==retained.resource||model.inWorld!==retained.inWorld)throw Error('Absent or changed projectile retained model');if(handle==='grenade')replace({template:model});else replace({models:state.models.map(m=>m.handle===handle?model:m)});}),
   retire:(launchId,emit)=>guarded(()=>{const actor=state.actors.find(a=>a.launchId===launchId);if(!actor||typeof emit!=='function')throw Error('Absent or repeated projectile retirement');const model=state.models.find(m=>m.handle===actor.handle)!;invoke(()=>emit(model));replace({models:state.models.map(m=>m.handle===actor.handle?{...m,inWorld:false}:m),actors:state.actors.filter(a=>a!==actor),fifo:{...state.fifo,[actor.weapon]:[...state.fifo[actor.weapon],actor.handle]}});}),
   freeze:()=>read(),snapshotAt:p=>this.inventory(read(),p),
   prepareCommit:()=>{if(publisher){if(hook||running){failed=true;throw Error('Recursive projectile prepare');}return publisher;}return prepare();},
   commit:()=>{if(!open)return;if(hook||running){failed=true;throw Error('Recursive projectile commit');}read();(publisher??prepare())();},rollback,
  };
 }
}
