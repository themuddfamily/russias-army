import {createOriginalReceiverTransientCheckpoint,type ReceiverTransientCheckpoint,type ReceiverTransientCheckpointLimits} from './originalReceiverTransientCheckpoint';
import type {ReceiverScenePrefix} from './originalReceiverPrefix';
import type {Vec3,WeaponId} from './protocol';
import type {ReceiverModelEntry,ReceiverModelPose,ReceiverModelRotation} from './originalReceiverModelWorld';

export interface OriginalReceiverTransientGoody {
  /** A present player can be unarmed; null weapon never means absent goody. */
  readonly bspWorld:number;readonly modelPosition:Readonly<Vec3>;readonly eyePosition:Readonly<Vec3>;readonly weapon:WeaponId|null;
}
export interface OriginalReceiverTransientBackend {
  clonePlane(name:string,resourceWidthWorld:number,context?:OriginalReceiverTransientCloneContext):{pose:ReceiverModelPose;geometryProvenance:string;inWorld:boolean;initialShader?:OriginalReceiverTransientInitialShader};
  cloneMuzzle(name:string,weapon:WeaponId):{pose:ReceiverModelPose;geometryProvenance:string;inWorld:boolean};
  /** Pure source orientation adapters. Neither may mutate the supplied pose. */
  pointAt(pose:Readonly<ReceiverModelPose>,target:Readonly<Vec3>,up?:Readonly<Vec3>):ReceiverModelRotation;
  selfRotate(rotation:Readonly<ReceiverModelRotation>,sourceEulerDegrees:Readonly<Vec3>):ReceiverModelRotation;
}
export interface OriginalReceiverTransientCloneContext {
  /** Detached observation of this transaction's retained named texture flags.
   * Valid only while staging; no renderer or external history is consulted. */
  readTexture(name:string):Readonly<{nearFiltering?:true;renderFormat?:'rgba8888'}>|undefined;
}
export type OriginalReceiverTransientBirth =
  |{readonly id:string;readonly kind:'puff';readonly position:Readonly<Vec3>;readonly angleSourceDegrees:number}
  |{readonly id:string;readonly kind:'bang';readonly position:Readonly<Vec3>;readonly type:'rocket'|'grenade';readonly attackerName:string}
  |{readonly id:string;readonly kind:'bang';readonly position:Readonly<Vec3>;readonly type:'barrel';readonly attackerName?:null}
  /** normal is the already converted source normal offset, in world units. */
  |{readonly id:string;readonly kind:'miss';readonly position:Readonly<Vec3>;readonly normal:Readonly<Vec3>}
  |{readonly id:string;readonly kind:'blood';readonly position:Readonly<Vec3>}
  |{readonly id:string;readonly kind:'muzzle';readonly weapon:WeaponId;readonly gunPose:Readonly<ReceiverModelPose>};
export type OriginalReceiverTransientEffect =
  |{readonly kind:'sound';readonly sound:'boomnew';readonly position:Readonly<Vec3>}
  /** Intent only. Caller owns strict source proximity and staged health. It may
   * consume this in the SAME rollbackable controller transaction before the
   * next actor. Publish health/audio externally only after JOINT commit. */
  |{readonly kind:'bang-hurt';readonly effectId:string;readonly position:Readonly<Vec3>;readonly attackerName:string|null;readonly amount:5;readonly radiusSource:250};
export interface OriginalReceiverTransientShader {
  readonly handle:string;readonly texture:string;readonly recycled:boolean;
  readonly textureScale:Readonly<Vec3>;readonly texturePosition:Readonly<Vec3>;
  readonly blend:number;readonly emissiveWhite:boolean;readonly specularBlack?:boolean;
  readonly shininess?:0;readonly nearFiltering?:true;readonly renderFormat?:'rgba8888';
}
/** Explicit backend observation of a fresh plane's existing shader/texture.
 * No default shader is inferred; aliases must agree with existing observations. */
export interface OriginalReceiverTransientInitialShader extends OriginalReceiverTransientShader {}
export interface OriginalReceiverTransientModel extends ReceiverModelEntry {readonly shaderHandle:string}
export interface OriginalReceiverTransientOptions {readonly maxModels:number;readonly maxActors:number;readonly maxShaders:number;readonly maxShaderPoolEntries?:number;readonly maxTextChars?:number}
export interface OriginalReceiverTransientTransaction {
  birth(event:OriginalReceiverTransientBirth,goody:OriginalReceiverTransientGoody|null):readonly OriginalReceiverTransientEffect[];
  /** One source callback, visiting actors admitted before this call in insertion order. */
  step(goody:OriginalReceiverTransientGoody|null):readonly OriginalReceiverTransientEffect[];
  stepActor(id:string,goody:OriginalReceiverTransientGoody|null):readonly OriginalReceiverTransientEffect[];
  freezeActorIds():readonly string[];
  freezeModels():readonly Readonly<OriginalReceiverTransientModel>[];
  freezePlaneWidth():number|null;
  freezeCheckpoint(prefix:ReceiverScenePrefix,limits:ReceiverTransientCheckpointLimits):ReceiverTransientCheckpoint;
  prepareCommit():()=>void;
  commit():void;rollback():void;
}
interface Shader {handle:string;texture:string;recycled:boolean;textureScale:Vec3;texturePosition:Vec3;blend:number;emissiveWhite:boolean;specularBlack?:boolean;shininess?:0}
interface Actor {id:string;kind:OriginalReceiverTransientBirth['kind'];handle:string;position:Vec3;time:number;weapon?:WeaponId;attackerName?:string|null}
interface Texture {nearFiltering?:true;renderFormat?:'rgba8888'}
interface State {textures:Map<string,Texture>;models:Map<string,ReceiverModelEntry>;actors:Map<string,Actor>;shaders:Map<string,Shader>;modelShaders:Map<string,string>;planePool:string[];muzzlePools:Map<WeaponId,string[]>;shaderPool:string[];planeWidth?:number}
const resources:Record<WeaponId,string>={pistol:'pistol',shotgun:'spas12',rifle:'ak47',launcher:'rg6',rpg:'rpg',sniper:'dragunov'};
const finite=(v:Readonly<Vec3>)=>[v.x,v.y,v.z].every(Number.isFinite);
const rotationValid=(q:Readonly<ReceiverModelRotation>|undefined)=>q!==undefined&&[q.x,q.y,q.z,q.w].every(Number.isFinite)&&Math.abs(Math.hypot(q.x,q.y,q.z,q.w)-1)<=1e-6;
const vec=(v:Readonly<Vec3>):Vec3=>({x:v.x,y:v.y,z:v.z});
const quat=(q:Readonly<ReceiverModelRotation>):ReceiverModelRotation=>({x:q.x,y:q.y,z:q.z,w:q.w});
const copyPose=(p:Readonly<ReceiverModelPose>):ReceiverModelPose=>({position:vec(p.position),yaw:p.yaw,phase:p.phase,scale:p.scale,...(p.rotation?{rotation:quat(p.rotation)}:{})});
const freezePose=(p:Readonly<ReceiverModelPose>)=>Object.freeze({...copyPose(p),position:Object.freeze(vec(p.position)),...(p.rotation?{rotation:Object.freeze(quat(p.rotation))}:{})});
const freezeModel=(m:ReceiverModelEntry,shaderHandle:string)=>Object.freeze({...m,pose:freezePose(m.pose),shaderHandle});
const freezeShader=(s:Shader,texture:Texture)=>Object.freeze({...s,...texture,textureScale:Object.freeze({...s.textureScale}),texturePosition:Object.freeze({...s.texturePosition})});
function checkpoint(s:State,prefix:ReceiverScenePrefix,rawLimits:ReceiverTransientCheckpointLimits):ReceiverTransientCheckpoint {
 const limits={maxModels:rawLimits.maxModels,maxActors:rawLimits.maxActors,maxShaders:rawLimits.maxShaders,maxTextures:rawLimits.maxTextures,maxPoolEntries:rawLimits.maxPoolEntries,maxTextChars:rawLimits.maxTextChars};
 if(![limits.maxModels,limits.maxActors,limits.maxShaders,limits.maxTextures,limits.maxPoolEntries].every(n=>Number.isSafeInteger(n)&&n>0&&n<=256)||!Number.isSafeInteger(limits.maxTextChars)||limits.maxTextChars<1||limits.maxTextChars>65536)throw Error('Invalid transient checkpoint limits');
 let pooled=0;for(const handles of s.muzzlePools.values()){pooled+=handles.length;if(pooled>limits.maxPoolEntries)throw Error('Transient checkpoint pool budget exceeded');}if(pooled+s.planePool.length>limits.maxPoolEntries)throw Error('Transient checkpoint pool budget exceeded');
 if(s.models.size>limits.maxModels||s.actors.size>limits.maxActors||s.shaders.size>limits.maxShaders||s.textures.size>limits.maxTextures||s.planePool.length>limits.maxPoolEntries||s.shaderPool.length>limits.maxPoolEntries)throw Error('Transient checkpoint state budget exceeded');
 return createOriginalReceiverTransientCheckpoint({sceneGeneration:prefix.sceneGeneration,prefix,planeWidthWorld:s.planeWidth??null,models:[...s.models.values()].map(m=>({...m,shaderHandle:s.modelShaders.get(m.handle)!})),shaders:[...s.shaders.values()].map(sh=>({...sh,...s.textures.get(sh.texture)!})),textures:[...s.textures].map(([name,flags])=>({name,...flags})),actors:[...s.actors.values()],planePool:s.planePool,muzzlePools:[...s.muzzlePools].map(([weapon,handles])=>({weapon,handles})),shaderPool:s.shaderPool},limits);
}
const fresh=():State=>({textures:new Map(),models:new Map(),actors:new Map(),shaders:new Map(),modelShaders:new Map(),planePool:[],muzzlePools:new Map(),shaderPool:[]});
function clone(s:State):State {return {textures:new Map([...s.textures].map(([id,value])=>[id,{...value}])),models:new Map([...s.models].map(([id,m])=>[id,{...m,pose:copyPose(m.pose)}])),actors:new Map([...s.actors].map(([id,a])=>[id,{...a,position:{...a.position}}])),shaders:new Map([...s.shaders].map(([id,v])=>[id,{...v,textureScale:{...v.textureScale},texturePosition:{...v.texturePosition}}])),modelShaders:new Map(s.modelShaders),planePool:[...s.planePool],muzzlePools:new Map([...s.muzzlePools].map(([id,p])=>[id,[...p]])),shaderPool:[...s.shaderPool],planeWidth:s.planeWidth};}
function validatePose(p:Readonly<ReceiverModelPose>):void {
  if(!finite(p.position)||![p.yaw,p.phase,p.scale].every(Number.isFinite)||p.phase<0||p.scale<=0||!rotationValid(p.rotation))throw Error('Invalid transient full model pose');
}
function validateGoody(g:OriginalReceiverTransientGoody|null):void {
  if(g&&(!Number.isFinite(g.bspWorld)||g.bspWorld<=0||!finite(g.modelPosition)||!finite(g.eyePosition)||g.weapon!==null&&!Object.hasOwn(resources,g.weapon)))throw Error('Invalid transient goody context');
}

/** Receiver-local source visual lifecycle. Plane FIFO is shared across puff,
 * bang, miss and blood; muzzle pools are weapon-specific; recycled shader FIFO
 * is shared between puff/bang. Native plane, pointAt and clone/reparent behavior
 * remain explicit backend inputs. No sounds, damage, RNG or rendering are run.
 * The injected gmodinc allocator MUST belong to the caller's same transaction:
 * caller commits/rolls back allocator and this ledger together.
 */
export class OriginalReceiverTransientWorld {
  private state:State=fresh();private active=false;
  readonly options:Readonly<OriginalReceiverTransientOptions>;
  constructor(private readonly backend:OriginalReceiverTransientBackend,options:OriginalReceiverTransientOptions){
    if(![options.maxModels,options.maxActors,options.maxShaders,options.maxShaderPoolEntries??options.maxShaders,options.maxTextChars??65536].every(value=>Number.isSafeInteger(value)&&value>0))throw Error('Invalid transient scene budgets');
    this.options=Object.freeze({maxModels:options.maxModels,maxActors:options.maxActors,maxShaders:options.maxShaders,maxShaderPoolEntries:options.maxShaderPoolEntries??options.maxShaders,maxTextChars:options.maxTextChars??65536});
  }
  reset():void {if(this.active)throw Error('Transient scene transaction active');this.state=fresh();}
  freezeModels():readonly Readonly<OriginalReceiverTransientModel>[] {return Object.freeze([...this.state.models.values()].map(m=>freezeModel(m,this.state.modelShaders.get(m.handle)!)));}
  freezePlaneWidth():number|null {return this.state.planeWidth??null;}
  freezeCheckpoint(prefix:ReceiverScenePrefix,limits:ReceiverTransientCheckpointLimits):ReceiverTransientCheckpoint {return checkpoint(this.state,prefix,limits);}
  freezeShaders():readonly OriginalReceiverTransientShader[] {return Object.freeze([...this.state.shaders.values()].map(sh=>freezeShader(sh,this.state.textures.get(sh.texture)!)));}
  debugState():{planeWidth:number|undefined;planePool:readonly string[];shaderPool:readonly string[];muzzlePools:readonly {weapon:WeaponId;handles:readonly string[]}[];actors:readonly {id:string;kind:Actor['kind'];handle:string;time:number;shader:string}[]}{
    return Object.freeze({planeWidth:this.state.planeWidth,planePool:Object.freeze([...this.state.planePool]),shaderPool:Object.freeze([...this.state.shaderPool]),muzzlePools:Object.freeze([...this.state.muzzlePools].map(([weapon,handles])=>Object.freeze({weapon,handles:Object.freeze([...handles])}))),actors:Object.freeze([...this.state.actors.values()].map(a=>Object.freeze({id:a.id,kind:a.kind,handle:a.handle,time:a.time,shader:this.state.modelShaders.get(a.handle)!})))});
  }
  begin(allocateName:(prefix:string,increment?:'before'|'after')=>string):OriginalReceiverTransientTransaction {
    if(this.active)throw Error('Transient scene transaction active');this.active=true;
    const s=clone(this.state),b=this.backend,o=this.options;let open=true,failed=false,prepared=false;
    const check=()=>{if(!open||failed||prepared)throw Error('Transient scene transaction closed or failed');};
    const guarded=<T>(operation:()=>T):T=>{check();try{return operation();}catch(error){failed=true;throw error;}};
    const allocate=(prefix:string,increment:'before'|'after'='before')=>{const name=allocateName(prefix,increment);if(typeof name!=='string'||!name||name.length>o.maxTextChars!)throw Error('Invalid transient clone name');return name;};
    const shader=(texture:string,recycled:boolean):Shader=>{
      if(!s.textures.has(texture))s.textures.set(texture,{renderFormat:'rgba8888'});else s.textures.get(texture)!.renderFormat='rgba8888';
      const existing=recycled?s.shaderPool.shift():texture;
      if(existing){const retained=s.shaders.get(existing);if(retained){retained.texture=texture;if(recycled){retained.textureScale={x:1,y:1,z:1};retained.texturePosition={x:0,y:0,z:0};}else{retained.emissiveWhite=true;retained.specularBlack=true;}return retained;}}
      if(s.shaders.size>=o.maxShaders)throw Error('Transient shader budget requires resynchronization');
      const handle=recycled?allocate('shad','after'):texture;if(s.shaders.has(handle))throw Error('Transient shader identity collision');
      const value:Shader={handle,texture,recycled,textureScale:{x:1,y:1,z:1},texturePosition:{x:0,y:0,z:0},blend:100,emissiveWhite:true,...(recycled?{shininess:0 as const}:{specularBlack:true})};s.shaders.set(handle,value);return value;
    };
    const seedShader=(seed:OriginalReceiverTransientInitialShader):Shader=>{
      if(!seed||typeof seed.handle!=='string'||!seed.handle||typeof seed.texture!=='string'||!seed.texture||seed.handle.length+seed.texture.length>o.maxTextChars!
        ||!seed.textureScale||!seed.texturePosition||!finite(seed.textureScale)||!finite(seed.texturePosition)||!Number.isFinite(seed.blend)
        ||typeof seed.recycled!=='boolean'||typeof seed.emissiveWhite!=='boolean'
        ||(seed.specularBlack!==undefined&&typeof seed.specularBlack!=='boolean')||(seed.shininess!==undefined&&seed.shininess!==0)
        ||(seed.nearFiltering!==undefined&&seed.nearFiltering!==true)||(seed.renderFormat!==undefined&&seed.renderFormat!=='rgba8888'))throw Error('Invalid transient initial shader seed');
      const observed:Shader={handle:seed.handle,texture:seed.texture,recycled:seed.recycled,textureScale:vec(seed.textureScale),texturePosition:vec(seed.texturePosition),blend:seed.blend,emissiveWhite:seed.emissiveWhite,
        ...(seed.specularBlack!==undefined?{specularBlack:seed.specularBlack}:{}),...(seed.shininess!==undefined?{shininess:seed.shininess}:{})};
      const texture:Texture={...(seed.renderFormat!==undefined?{renderFormat:seed.renderFormat}:{}),...(seed.nearFiltering!==undefined?{nearFiltering:seed.nearFiltering}:{})};
      const oldTexture=s.textures.get(seed.texture);
      if(oldTexture&&(oldTexture.renderFormat!==texture.renderFormat||oldTexture.nearFiltering!==texture.nearFiltering))throw Error('Transient initial texture alias mismatch');
      const old=s.shaders.get(seed.handle);
      if(old&&(old.texture!==observed.texture||old.recycled!==observed.recycled||old.blend!==observed.blend||old.emissiveWhite!==observed.emissiveWhite||old.specularBlack!==observed.specularBlack||old.shininess!==observed.shininess
        ||old.textureScale.x!==observed.textureScale.x||old.textureScale.y!==observed.textureScale.y||old.textureScale.z!==observed.textureScale.z
        ||old.texturePosition.x!==observed.texturePosition.x||old.texturePosition.y!==observed.texturePosition.y||old.texturePosition.z!==observed.texturePosition.z))throw Error('Transient initial shader alias mismatch');
      if(!old&&s.shaders.size>=o.maxShaders)throw Error('Transient shader budget requires resynchronization');
      if(!oldTexture)s.textures.set(seed.texture,texture);
      if(!old)s.shaders.set(seed.handle,observed);
      return old??observed;
    };
    const model=(kind:'plane'|'muzzle',goody:OriginalReceiverTransientGoody|null,weapon?:WeaponId)=>{
      const pool=kind==='plane'?s.planePool:s.muzzlePools.get(weapon!)??[];
      if(kind==='muzzle'&&!s.muzzlePools.has(weapon!))s.muzzlePools.set(weapon!,pool);
      const reused=pool.shift();if(reused){const m=s.models.get(reused)!;m.inWorld=true;return m;}
      if(s.models.size>=o.maxModels)throw Error('Transient model budget requires resynchronization');
      if(kind==='plane'&&s.planeWidth===undefined){if(!goody)throw Error('First source plane resource requires goody bsp');s.planeWidth=goody.bspWorld;}
      const resource=kind==='plane'?'plane':`mf${resources[weapon!]}`,name=allocate(resource);
      if(s.models.has(name))throw Error('Transient model identity collision');
      let cloneOpen=true;
      const cloneContext=Object.freeze<OriginalReceiverTransientCloneContext>({readTexture:(textureName:string)=>{check();if(!cloneOpen)throw Error('Transient clone observation expired');if(typeof textureName!=='string'||!textureName||textureName.trim()!==textureName||textureName.length>o.maxTextChars!)throw Error('Invalid transient clone texture name');const texture=s.textures.get(textureName);return texture?Object.freeze({...(texture.nearFiltering!==undefined?{nearFiltering:texture.nearFiltering}:{}),...(texture.renderFormat!==undefined?{renderFormat:texture.renderFormat}:{})}):undefined;}});
      let value:{pose:ReceiverModelPose;geometryProvenance:string;inWorld:boolean;initialShader?:OriginalReceiverTransientInitialShader};
      try{value=kind==='plane'?b.clonePlane(name,s.planeWidth!,cloneContext):b.cloneMuzzle(name,weapon!);}finally{cloneOpen=false;}
      validatePose(value.pose);
      if(typeof value.geometryProvenance!=='string'||!value.geometryProvenance||value.geometryProvenance.length>o.maxTextChars!||typeof value.inWorld!=='boolean')throw Error('Invalid transient clone provenance');
      const m:ReceiverModelEntry={handle:name,name,resource,group:'gsmokes',kind:'transient',inWorld:value.inWorld,pose:copyPose(value.pose),geometryProvenance:value.geometryProvenance};s.models.set(name,m);if(kind==='plane'&&value.initialShader!==undefined)s.modelShaders.set(name,seedShader(value.initialShader).handle);return m;
    };
    const pointAt=(m:ReceiverModelEntry,target:Readonly<Vec3>,up?:Readonly<Vec3>)=>{
      const result=b.pointAt(freezePose(m.pose),Object.freeze(vec(target)),up?Object.freeze(vec(up)):undefined);
      if(!rotationValid(result))throw Error('Invalid transient pointAt result');m.pose.rotation=quat(result);
    };
    const rotate=(m:ReceiverModelEntry,degrees:Vec3)=>{
      const result=b.selfRotate(Object.freeze(quat(m.pose.rotation!)),Object.freeze({...degrees}));
      if(!rotationValid(result))throw Error('Invalid transient self rotation');m.pose.rotation=quat(result);
    };
    const retire=(a:Actor)=>{
      if((a.kind==='puff'||a.kind==='bang')&&s.shaderPool.length>=o.maxShaderPoolEntries!)throw Error('Transient shader pool entry budget requires resynchronization');
      const m=s.models.get(a.handle)!;m.inWorld=false;
      if(a.kind==='muzzle')s.muzzlePools.get(a.weapon!)!.push(a.handle);else s.planePool.push(a.handle);
      if(a.kind==='puff'||a.kind==='bang')s.shaderPool.push(s.modelShaders.get(a.handle)!);s.actors.delete(a.id);validateText();
    };
    const effects=(values:OriginalReceiverTransientEffect[])=>Object.freeze(values.map(e=>Object.freeze({...e,position:Object.freeze({...e.position})})));
    const stepActor=(a:Actor,goody:OriginalReceiverTransientGoody|null):readonly OriginalReceiverTransientEffect[]=>{
      validateGoody(goody);const out:OriginalReceiverTransientEffect[]=[];
      const m=s.models.get(a.handle)!,sh=s.shaders.get(s.modelShaders.get(a.handle)!)!;
      if(a.kind==='puff'){
        a.time+=6;sh.blend=100-a.time*.55;m.pose.scale=a.time*.02;if(a.time>180)retire(a);
      }else if(a.kind==='bang'){
        if(goody){m.inWorld=true;sh.texturePosition.x-=1;if(sh.texturePosition.x===-4){sh.texturePosition.x=0;sh.texturePosition.y+=1;}
          if(Math.hypot(goody.eyePosition.x-a.position.x,goody.eyePosition.z-a.position.z)>0)pointAt(m,goody.eyePosition,{x:0,y:1,z:0});
          a.time-=1;out.push({kind:'bang-hurt',effectId:a.id,position:{...a.position},attackerName:a.attackerName??null,amount:5,radiusSource:250});
        }
        if(a.time===0)retire(a);
      }else if(a.kind==='blood'){
        if(goody){sh.texturePosition.x-=1;if(sh.texturePosition.x===-3){sh.texturePosition.x=0;sh.texturePosition.y+=1;}
          pointAt(m,goody.eyePosition,{x:0,y:1,z:0});if(a.time<1)retire(a);a.time-=4;
        }
      }else{m.inWorld=true;if(a.time===0)retire(a);a.time-=1;}
      validatePose(m.pose);
      return effects(out);
    };
    const validateText=()=>{
      let count=0;
      for(const m of s.models.values())count+=m.handle.length+m.name.length+m.resource.length+m.geometryProvenance.length;
      for(const a of s.actors.values())count+=a.id.length+(a.attackerName?.length??0);
      for(const sh of s.shaders.values())count+=sh.handle.length+sh.texture.length;
      for(const handle of s.planePool)count+=handle.length;
      for(const handles of s.muzzlePools.values())for(const handle of handles)count+=handle.length;
      for(const handle of s.shaderPool)count+=handle.length;
      for(const name of s.textures.keys())count+=name.length;
      if(!Number.isSafeInteger(count)||count>o.maxTextChars!)throw Error('Transient text budget requires resynchronization');
    };
    const prepareCommit=()=>{
      check();prepared=true;
      return ()=>{if(!open||!prepared||failed)throw Error('Transient scene publication closed');this.state=s;open=false;this.active=false;};
    };
    return {
      birth:(event,goody)=>guarded(()=>{
        validateGoody(goody);if(typeof event.id!=='string'||!event.id||event.id.length>o.maxTextChars!||s.actors.has(event.id)||s.actors.size>=o.maxActors)throw Error('Invalid transient actor or actor budget');
        const out:OriginalReceiverTransientEffect[]=[];let m:ReceiverModelEntry,sh:Shader,a:Actor;
        if(event.kind==='muzzle'){
          if(!['pistol','shotgun','rifle','sniper'].includes(event.weapon))throw Error('Unsupported source transient muzzle weapon');validatePose(event.gunPose);
          m=model('muzzle',goody,event.weapon);m.pose.position=vec(event.gunPose.position);m.pose.rotation=quat(event.gunPose.rotation!);
          sh=shader('mfmachinegun',false);s.textures.get(sh.texture)!.nearFiltering=true;sh.blend=100;
          a={id:event.id,kind:event.kind,handle:m.handle,position:{...m.pose.position},time:1,weapon:event.weapon};
        }else{
          if(!['puff','bang','miss','blood'].includes(event.kind)||!finite(event.position))throw Error('Invalid transient birth position');
          if(event.kind==='puff'&&(!goody||!Number.isSafeInteger(event.angleSourceDegrees)||event.angleSourceDegrees<10||event.angleSourceDegrees>360||event.angleSourceDegrees%10!==0))throw Error('Invalid puff source rotation or goody');
          if(event.kind==='miss'&&(!goody||!finite(event.normal)))throw Error('Invalid miss source context');
          if(event.kind==='bang'&&(!['rocket','grenade','barrel'].includes(event.type)||(event.type==='barrel'?event.attackerName!=null:typeof event.attackerName!=='string'||event.attackerName.length>o.maxTextChars!)))throw Error('Invalid bang source context');
          m=model('plane',goody);m.pose.position=vec(event.position);
          a={id:event.id,kind:event.kind,handle:m.handle,position:vec(event.position),time:0};
          if(event.kind==='puff'){
            sh=shader('pufft',true);sh.emissiveWhite=true;sh.blend=50;m.pose.scale=.01;m.pose.position.y+=goody!.bspWorld*.2;
            pointAt(m,goody!.modelPosition);rotate(m,{x:0,y:0,z:event.angleSourceDegrees});
          }else if(event.kind==='bang'){
            m.inWorld=true;
            if(event.type==='barrel'){
              const handle=s.modelShaders.get(m.handle);const retained=handle===undefined?undefined:s.shaders.get(handle);
              if(!retained)throw Error('Fresh barrel plane requires explicit initial shader seed');
              sh=retained;
            }else{m.pose.scale=event.type==='rocket'?8:7;sh=shader(event.type==='rocket'?'bangrocket':'banggrenade',true);}
            s.textures.get(sh.texture)!.nearFiltering=true;s.textures.get(sh.texture)!.renderFormat='rgba8888';sh.blend=50;sh.textureScale={x:4,y:4,z:4};sh.texturePosition={x:0,y:0,z:0};a.time=16;a.attackerName=event.type==='barrel'?null:event.attackerName;
            out.push({kind:'sound',sound:'boomnew',position:vec(event.position)});
          }else if(event.kind==='miss'){
            const shotgun=goody!.weapon==='shotgun';m.pose.scale=shotgun ? .5 : .4;sh=shader(shotgun?'decalspas':'decal',false);
            s.textures.get(sh.texture)!.nearFiltering=true;sh.blend=40;m.pose.position={x:event.position.x+event.normal.x,y:event.position.y+event.normal.y,z:event.position.z+event.normal.z};
            pointAt(m,event.position);rotate(m,{x:180,y:0,z:0});a.time=80;
          }else{
            m.pose.scale=2;sh=shader('spatter',false);s.textures.get(sh.texture)!.nearFiltering=true;sh.blend=50;
            sh.textureScale={x:3,y:3,z:3};sh.texturePosition={x:1,y:1,z:0};a.time=8;
          }
        }
        validatePose(m.pose);s.modelShaders.set(m.handle,sh.handle);s.actors.set(a.id,a);validateText();return effects(out);
      }),
      // Convenience projection with one stable goody context; production health
      // ordering must use freezeActorIds + stepActor and refresh between actors.
      step:goody=>guarded(()=>{
        validateGoody(goody);const out:OriginalReceiverTransientEffect[]=[];
        for(const a of [...s.actors.values()])out.push(...stepActor(a,goody));return effects(out);
      }),
      stepActor:(id,goody)=>guarded(()=>{const actor=s.actors.get(id);if(!actor)throw Error('Unknown transient actor');return stepActor(actor,goody);}),
      freezeActorIds:()=>{check();return Object.freeze([...s.actors.keys()]);},
      freezeModels:()=>{check();return Object.freeze([...s.models.values()].map(m=>freezeModel(m,s.modelShaders.get(m.handle)!)));},
      freezePlaneWidth:()=>{check();return s.planeWidth??null;},
      freezeCheckpoint:(prefix,limits)=>guarded(()=>checkpoint(s,prefix,limits)),
      prepareCommit,
      commit:()=>{prepareCommit()();},
      rollback:()=>{if(open){open=false;this.active=false;}},
    };
  }
}
