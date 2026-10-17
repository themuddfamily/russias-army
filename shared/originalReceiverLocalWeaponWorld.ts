import {assertReceiverPickupOutputDrain,type ReceiverPickupOutputDrain,type ReceiverSceneTransaction} from './originalReceiverModelWorld';
import type {WeaponId,Vec3} from './protocol';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES,type ReceiverLocalWeaponModelCapture,type ReceiverLocalWeaponCapture} from './originalReceiverLocalWeaponInventory';
import {sameReceiverScenePrefix,validateReceiverScenePrefix,type ReceiverScenePrefix} from './originalReceiverPrefix';
import {createOriginalWeaponMotion,selectOriginalWeaponMotion,loadOriginalWeaponMotion,fireOriginalWeaponMotion,advanceOriginalWeaponMotion,type OriginalWeaponMotionState} from './originalWeaponMotion';
import type {ReceiverLoadoutIntent} from './originalReceiverLoadoutWorld';

export interface ReceiverLocalWeaponWorldCheckpoint {
 readonly prefix:ReceiverScenePrefix;readonly cameraHandle:string;readonly cameraWorldMatrix:readonly number[];
 readonly selectedWeapon:WeaponId|null;readonly loadedRocket:boolean;readonly motion:OriginalWeaponMotionState;
 readonly models:readonly ReceiverLocalWeaponModelCapture[];
}
export type ReceiverLocalWeaponBindingOperation=
 |Readonly<{kind:'camera';cameraWorldMatrix:readonly number[]}>
 |Readonly<{kind:'whichgun';weapon:WeaponId|null}>
 |Readonly<{kind:'rocket';loadedRocket:boolean}>
 |Readonly<{kind:'position';weapon:WeaponId;positionSource:OriginalWeaponMotionState['gunPositionSource']}>;
export interface ReceiverLocalWeaponWorldOptions {
 readonly sourceScale:number;readonly maxCommands:number;readonly maxTextChars:number;
 /** Pure explicit WORLD/membership binding. All seven models must be returned.
  * This is an adapter attestation, not a native parent-setter implementation. */
 readonly bindModels:(operation:ReceiverLocalWeaponBindingOperation,previousFrozenState:ReceiverLocalWeaponWorldCheckpoint)=>Readonly<{models:readonly ReceiverLocalWeaponModelCapture[];loadedRocket:boolean}>;
}
export interface ReceiverLocalWeaponWorldTransaction {
 applyReceipt(prefix:ReceiverScenePrefix):void;
 /** Source outer goody=VOID skips camera and motion, while chronology advances. */
 skipCallback(prefix:ReceiverScenePrefix):void;
 beginCallback(prefix:ReceiverScenePrefix,cameraWorldMatrix:readonly number[]):void;
 whichGun(weapon:WeaponId|null):void;equip(weapon:WeaponId):void;reload():void;fire():void;
 /** Explicit ordered loadout writes at the current prefix, including after
  * physical finish. They never reopen the callback or age/reposition motion. */
 applyLoadoutIntent(prefix:ReceiverScenePrefix,intent:Extract<ReceiverLoadoutIntent,{kind:'whichgun'|'reload-pose'}>):void;
 refreshRocket(loadedRocket:boolean):void;finishCallback(sourceSpeed:number):void;
 finishPhysicalCallback(velocityWorld:Readonly<Vec3>):void;
 /** Model-issued output flush; never reopens or advances physical motion. */
 finishPickupWindowDrain(token:ReceiverPickupOutputDrain):void;
 snapshotAt(prefix:ReceiverScenePrefix):ReceiverLocalWeaponCapture;
 freeze():ReceiverLocalWeaponWorldCheckpoint;
 prepareCommit():()=>void;commit():void;rollback():void;
}
const handles=Object.freeze(Object.keys(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES));
const normalized=(name:string)=>name.trim().toLowerCase();
const affine=(m:readonly number[])=>Array.isArray(m)&&m.length===16&&m.every(Number.isFinite)&&m[3]===0&&m[7]===0&&m[11]===0&&m[15]===1;
const prefixCopy=(p:ReceiverScenePrefix):ReceiverScenePrefix=>Object.freeze(p.kind==='receipt'?{kind:'receipt',sceneGeneration:p.sceneGeneration,callback:p.callback,tick:p.tick}:{kind:'callback',sceneGeneration:p.sceneGeneration,callback:p.callback});

/** Receiver-private seven-model bank. Every WORLD matrix/membership comes
 * from an explicit checkpoint or binding policy. Source conversion belongs to
 * that policy exactly once; this ledger never guesses local parent transforms.
 * Receipt admission alone does not age motion or perform binding operations;
 * explicitly supplied loadout intents may bind selection at that same prefix.
 * reload/fire assign motion only: the driver must issue source whichGun after
 * sortweapons explicitly. This is not a gun/ammo/cooldown simulator. */
export class OriginalReceiverLocalWeaponWorld {
 private state:ReceiverLocalWeaponWorldCheckpoint|undefined;private active=false;private released=false;private activeRollback:(()=>void)|undefined;private lastReceiptTick:number|undefined;
 private readonly options:ReceiverLocalWeaponWorldOptions;
 constructor(checkpoint:ReceiverLocalWeaponWorldCheckpoint,options:ReceiverLocalWeaponWorldOptions){
  if(!options||!Number.isFinite(options.sourceScale)||options.sourceScale<=0||![options.maxCommands,options.maxTextChars].every(v=>Number.isSafeInteger(v)&&v>0)||typeof options.bindModels!=='function')throw Error('Invalid local weapon world options');
  this.options=Object.freeze({sourceScale:options.sourceScale,maxCommands:options.maxCommands,maxTextChars:options.maxTextChars,bindModels:options.bindModels});
  this.state=this.copy(checkpoint);this.lastReceiptTick=checkpoint.prefix.kind==='receipt'?checkpoint.prefix.tick:undefined;
 }
 private copy(c:ReceiverLocalWeaponWorldCheckpoint):ReceiverLocalWeaponWorldCheckpoint {
  if(!c||!c.prefix)throw Error('Invalid local weapon checkpoint');validateReceiverScenePrefix(c.prefix);
  if(!Array.isArray(c.models)||c.models.length!==7||!affine(c.cameraWorldMatrix)||typeof c.cameraHandle!=='string'||!normalized(c.cameraHandle)||handles.includes(normalized(c.cameraHandle))||['smokes','gsmokes'].includes(normalized(c.cameraHandle))||typeof c.loadedRocket!=='boolean')throw Error('Invalid local weapon checkpoint shape');
  const motion=createOriginalWeaponMotion(c.motion);if(motion.weapon!==c.selectedWeapon)throw Error('Local weapon motion selection mismatch');
  let text=c.cameraHandle.length;const seen=new Set<string>(),ancestors=new Map<string,readonly string[]>();
  if(text>this.options.maxTextChars)throw Error('Local weapon world text budget exceeded');
  for(const model of c.models as readonly ReceiverLocalWeaponModelCapture[]){
   if(!model||!handles.includes(model.handle)||seen.has(model.handle)||model.resource!==ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES[model.handle]||typeof model.inWorld!=='boolean'||!affine(model.worldMatrix)||!Array.isArray(model.groupAncestry)||model.groupAncestry.length>this.options.maxTextChars)throw Error('Invalid local weapon model capture');
   seen.add(model.handle);text+=model.handle.length+model.resource.length;
   const groups=new Set<string>();
   for(const group of model.groupAncestry){if(typeof group!=='string'||!normalized(group)||normalized(group)===model.handle||['smokes','gsmokes'].includes(normalized(group))||groups.has(normalized(group)))throw Error('Invalid local weapon ancestry');groups.add(normalized(group));text+=group.length;if(text>this.options.maxTextChars)throw Error('Local weapon world text budget exceeded');}
   ancestors.set(model.handle,[...groups]);
  }
  if(text>this.options.maxTextChars)throw Error('Local weapon world text budget exceeded');
  const visited=new Set<string>(),visiting=new Set<string>();
  const visit=(handle:string)=>{if(visiting.has(handle))throw Error('Cyclic local weapon ancestry');if(visited.has(handle))return;visiting.add(handle);for(const group of ancestors.get(handle)??[])if(ancestors.has(group))visit(group);visiting.delete(handle);visited.add(handle);};
  for(const handle of handles)visit(handle);
  return Object.freeze({prefix:prefixCopy(c.prefix),cameraHandle:c.cameraHandle,cameraWorldMatrix:Object.freeze([...c.cameraWorldMatrix]),selectedWeapon:c.selectedWeapon,loadedRocket:c.loadedRocket,motion,
   models:Object.freeze(c.models.map((m:ReceiverLocalWeaponModelCapture)=>Object.freeze({handle:m.handle,resource:m.resource,inWorld:m.inWorld,worldMatrix:Object.freeze([...m.worldMatrix]),groupAncestry:Object.freeze([...m.groupAncestry])})))});
 }
 /** Captured unit scale for joint participant coherence; callers cannot alter it. */
 get sourceScale():number {return this.options.sourceScale;}
 freeze():ReceiverLocalWeaponWorldCheckpoint {if(this.released||!this.state)throw Error('Local weapon world released');return this.state;}
 release():void {if(this.released)return;this.released=true;try{this.activeRollback?.();}finally{this.activeRollback=undefined;this.active=false;this.state=undefined;this.lastReceiptTick=undefined;}}
 snapshotAt(prefix:ReceiverScenePrefix):ReceiverLocalWeaponCapture {
  const s=this.freeze();if(!sameReceiverScenePrefix(s.prefix,prefix))throw Error('Local weapon snapshot prefix mismatch');
  return Object.freeze({prefix:s.prefix,models:s.models,selectedWeapon:s.selectedWeapon,loadedRocket:s.loadedRocket,cameraHandle:s.cameraHandle});
 }
 begin(pickupDrainOwner?:ReceiverSceneTransaction):ReceiverLocalWeaponWorldTransaction {
  const initial=this.freeze();if(this.active)throw Error('Local weapon transaction active');this.active=true;
  let state=initial,tick=this.lastReceiptTick,commands=0,open=true,failed=false,sealed=false,callbackOpen=false,binding=false,draining=false,publisher:(()=>void)|undefined;
  const drainedTokens=new WeakSet<ReceiverPickupOutputDrain>();
  const check=()=>{if(draining){failed=true;throw Error('Recursive local weapon pickup drain');}if(binding){failed=true;throw Error('Recursive local weapon binding');}if(!open||failed||sealed)throw Error('Local weapon transaction closed or failed');};
  const guarded=<T>(operation:()=>T):T=>{check();try{return operation();}catch(error){failed=true;throw error;}};
  const command=()=>{if(++commands>this.options.maxCommands)throw Error('Local weapon command budget exceeded');};
  const gunPhase=()=>{if(!callbackOpen)throw Error('Local weapon callback not begun');};
  const bind=(operation:ReceiverLocalWeaponBindingOperation,changes:Partial<ReceiverLocalWeaponWorldCheckpoint>={})=>{
   binding=true;
   try{
    const answer=this.options.bindModels(Object.freeze(operation),state);
    if(failed||!open)throw Error('Local weapon binding failed or cancelled');
    if(!answer)throw Error('Invalid local weapon binding result');
    const loadedRocket=answer.loadedRocket,models=answer.models;
    if(typeof loadedRocket!=='boolean')throw Error('Invalid local weapon binding result');
    const next=this.copy({...state,...changes,models,loadedRocket});
    if(failed||!open)throw Error('Local weapon binding failed or cancelled');
    state=next;
   }finally{binding=false;}
  };
  const which=(weapon:WeaponId|null,requireCallback=true)=>{if(requireCallback)gunPhase();command();const motion=selectOriginalWeaponMotion(state.motion,weapon);bind({kind:'whichgun',weapon},{motion,selectedWeapon:weapon});};
  const finish=(sourceSpeed:number)=>{gunPhase();command();const result=advanceOriginalWeaponMotion(state.motion,{frames:1,sourceSpeed});
   if(result.positionSource&&result.state.weapon!==null)bind({kind:'position',weapon:result.state.weapon,positionSource:result.positionSource},{motion:result.state});
   else state=this.copy({...state,motion:result.state});callbackOpen=false;};
  const prepareCommit=()=>{
   if(publisher)return publisher;check();if(callbackOpen){failed=true;throw Error('Local weapon callback unfinished');}
   const next=state,nextTick=tick;sealed=true;
   publisher=()=>{if(!open||failed)return;this.state=next;this.lastReceiptTick=nextTick;this.active=false;this.activeRollback=undefined;open=false;};return publisher;
  };
  const rollback=()=>{if(!open)return;open=false;this.active=false;this.activeRollback=undefined;};this.activeRollback=rollback;
  return {
   applyReceipt:prefix=>guarded(()=>{command();validateReceiverScenePrefix(prefix);if(callbackOpen||prefix.kind!=='receipt'||prefix.sceneGeneration!==state.prefix.sceneGeneration||prefix.callback!==state.prefix.callback||tick!==undefined&&prefix.tick<=tick)throw Error('Invalid local weapon receipt');state=this.copy({...state,prefix});tick=prefix.tick;}),
   skipCallback:prefix=>guarded(()=>{command();validateReceiverScenePrefix(prefix);if(callbackOpen||prefix.kind!=='callback'||prefix.sceneGeneration!==state.prefix.sceneGeneration||prefix.callback!==state.prefix.callback+1)throw Error('Invalid skipped local weapon callback');state=this.copy({...state,prefix});}),
   beginCallback:(prefix,cameraWorldMatrix)=>guarded(()=>{command();validateReceiverScenePrefix(prefix);if(callbackOpen||prefix.kind!=='callback'||prefix.sceneGeneration!==state.prefix.sceneGeneration||prefix.callback!==state.prefix.callback+1||!affine(cameraWorldMatrix))throw Error('Invalid local weapon callback');
    state=this.copy({...state,prefix});bind({kind:'camera',cameraWorldMatrix:Object.freeze([...cameraWorldMatrix])},{cameraWorldMatrix});callbackOpen=true;}),
   whichGun:weapon=>guarded(()=>which(weapon)),
   applyLoadoutIntent:(rawPrefix,rawIntent)=>guarded(()=>{
    // Decode known input scalars under the same reentry barrier as binding.
    // Caught getter preparation/mutation cannot seal an unfinished write.
    let prefix:ReceiverScenePrefix,kind:ReceiverLoadoutIntent['kind'],weapon:WeaponId|null;
    binding=true;
    try{
     if(!rawPrefix||!rawIntent)throw Error('Invalid local weapon loadout intent');
     const prefixKind=rawPrefix.kind,sceneGeneration=rawPrefix.sceneGeneration,callback=rawPrefix.callback;
     if(prefixKind!=='callback'&&prefixKind!=='receipt')throw Error('Invalid local weapon loadout prefix');
     prefix=prefixKind==='receipt'?{kind:prefixKind,sceneGeneration,callback,tick:rawPrefix.tick}:{kind:prefixKind,sceneGeneration,callback};
     kind=rawIntent.kind;weapon=rawIntent.weapon;
    }finally{binding=false;}
    check();validateReceiverScenePrefix(prefix);
    if(!sameReceiverScenePrefix(state.prefix,prefix))throw Error('Local weapon loadout prefix mismatch');
    if(kind==='whichgun'){which(weapon,false);return;}
    if(kind!=='reload-pose'||weapon===null||weapon!==state.selectedWeapon)throw Error('Invalid local weapon loadout intent');
    command();state=this.copy({...state,motion:loadOriginalWeaponMotion(state.motion)});
   }),
   equip:weapon=>guarded(()=>{which(weapon);state=this.copy({...state,motion:loadOriginalWeaponMotion(state.motion)});}),
   reload:()=>guarded(()=>{gunPhase();command();state=this.copy({...state,motion:loadOriginalWeaponMotion(state.motion)});}),
   fire:()=>guarded(()=>{gunPhase();command();state=this.copy({...state,motion:fireOriginalWeaponMotion(state.motion)});}),
   refreshRocket:loadedRocket=>guarded(()=>{gunPhase();command();if(typeof loadedRocket!=='boolean')throw Error('Invalid local weapon rocket input');bind({kind:'rocket',loadedRocket});}),
   finishCallback:sourceSpeed=>guarded(()=>finish(sourceSpeed)),
   finishPhysicalCallback:velocityWorld=>guarded(()=>{if(!velocityWorld||![velocityWorld.x,velocityWorld.y,velocityWorld.z].every(Number.isFinite))throw Error('Invalid local weapon physical velocity');const sourceSpeed=Math.hypot(velocityWorld.x,velocityWorld.y,velocityWorld.z)/this.options.sourceScale;if(!Number.isFinite(sourceSpeed))throw Error('Local weapon physical speed overflow');finish(sourceSpeed);}),
   finishPickupWindowDrain:token=>guarded(()=>{
    if(callbackOpen||!pickupDrainOwner)throw Error('Local weapon pickup drain unavailable');
    const prefix=state.prefix;draining=true;
    try{assertReceiverPickupOutputDrain(token,pickupDrainOwner,prefix);}finally{draining=false;}
    check();if(!sameReceiverScenePrefix(state.prefix,prefix))throw Error('Local weapon pickup drain state changed');
    if(drainedTokens.has(token))throw Error('Local weapon pickup drain already consumed');
    drainedTokens.add(token);commands=0;
   }),
   snapshotAt:prefix=>guarded(()=>{if(!sameReceiverScenePrefix(state.prefix,prefix))throw Error('Local weapon snapshot prefix mismatch');return Object.freeze({prefix:state.prefix,models:state.models,selectedWeapon:state.selectedWeapon,loadedRocket:state.loadedRocket,cameraHandle:state.cameraHandle});}),
   freeze:()=>guarded(()=>state),prepareCommit,
   commit:()=>{if(open)prepareCommit()();},rollback,
  };
 }
}
