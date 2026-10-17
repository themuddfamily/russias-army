import {describe,it,expect,vi} from 'vitest';
import {OriginalSoloLaunchBatch,type OriginalSoloReservedLaunchAdmission} from './originalSoloLaunchBatch';
import type {OriginalSoloObserver,OriginalSoloLaunch,OriginalSoloProjectile} from './originalSoloObserverWorld';
import {ORIGINAL_MAP_SCALE} from './originalMapProfile';

const world=(id:string,name=id,life=1)=>({id,name,lifeGeneration:life,callback:0,alive:true,projectiles:new Map<string,OriginalSoloProjectile>()} as OriginalSoloObserver);
const prefix=(life=1)=>({kind:'callback' as const,sceneGeneration:life,callback:1});
const command=()=>({weapon:'launcher' as const,eye:{x:1,y:2,z:3},direction:{x:0,y:0,z:-1},sourceRotation:{x:0,y:0,z:0}});
function fixture(hook?:(recipient:OriginalSoloObserver,launch:OriginalSoloLaunch)=>boolean){
 const a=world('A','Alpha'),b=world('B','Bravo'),c=world('C','ALPHA'),worlds=new Map([['A',a],['B',b],['C',c]]),launches=new Map<string,OriginalSoloLaunch>(),receipts=new Map<string,Map<string,number>>();
 const batch=new OriginalSoloLaunchBatch({worlds,launches,receipts,sequence:0,callback:7,time:1,deliverLaunch:hook});return {a,b,c,worlds,launches,receipts,batch};
}
const reservation=(admission:OriginalSoloReservedLaunchAdmission)=>{if(!admission.ok)throw Error('Expected admission');return admission.reservation;};

describe('bounded staged Solo launch admission (declared transport/physics adapters)',()=>{
 it('constructs immutable detached seeds, reuses exact admissions and publishes private mutable states once',()=>{
  const f=fixture(),raw=command(),admission=f.batch.reserve(f.a,prefix(),0,raw),r=reservation(admission);
  expect(r.launch.id).toBe('solo-projectile-1');expect(r.launch.birthCallback).toBe(7);expect(r.prototype.remainingCallbacks).toBe(60);expect(r.prototype.velocity.z).toBe(-1300*ORIGINAL_MAP_SCALE);
  expect(Object.isFrozen(r)).toBe(true);expect(Object.isFrozen(r.prototype.position)).toBe(true);expect(Object.isFrozen(r.prototype.angular!.orientation)).toBe(true);
  expect(f.batch.reserve(f.a,prefix(),0,command())).toBe(admission);raw.eye.x=999;expect(r.launch.eye.x).toBe(1);
  expect(f.launches.size).toBe(0);expect(f.a.projectiles.size).toBe(0);f.batch.validateClaim(f.a,prefix(),admission);f.batch.seal([admission]);
  expect(f.batch.incoming(f.a)).toEqual([]);expect(f.batch.incoming(f.b)[0].reservation).toBe(r);expect(f.batch.incoming(f.c)).toEqual([]);
  const events=f.batch.spawnEvents;expect(events.map(row=>row.world.id)).toEqual(['A','B']);expect(Object.isFrozen(events)).toBe(true);expect(Object.isFrozen(events[0].event)).toBe(true);
  const publish=f.batch.prepareCommit();publish();publish();expect(f.launches.size).toBe(1);expect(f.receipts.get(r.launch.id)).toEqual(new Map([['A',1],['B',1]]));expect(f.batch.nextSequence).toBe(1);
  const a=f.a.projectiles.get(r.launch.id)!,b=f.b.projectiles.get(r.launch.id)!;expect(a.state).toBe(events[0].event.state);expect(a.state).not.toBe(b.state);expect(a.state).not.toBe(r.prototype);a.state.position.x=99;a.state.angular!.angularVelocity.x=2;expect(b.state.position.x).toBe(1);expect(r.prototype.position.x).toBe(1);expect(b.state.angular!.angularVelocity.x).toBe(0);
 });
 it('keeps RPG outbound eye/rotation separate from shifted constructor position and pre-recoil state',()=>{
  const f=fixture(),input={...command(),weapon:'rpg' as const},admission=f.batch.reserve(f.a,prefix(),0,input),r=reservation(admission);
  expect(r.launch.eye).toEqual(input.eye);expect(r.launch.sourceRotation).toEqual(input.sourceRotation);expect(r.prototype.position.z).toBe(3-50*ORIGINAL_MAP_SCALE);expect(r.prototype.velocity.z).toBe(-800*ORIGINAL_MAP_SCALE);expect(r.prototype.remainingCallbacks).toBe(200);
  input.sourceRotation.x=5;expect(r.launch.sourceRotation!.x).toBe(0);expect(()=>f.batch.reserve(f.a,prefix(),0,input)).toThrow(/changed/i);
 });
 it('counts stable-owner live projectiles anywhere plus pending launches and retains failed-cap claims',()=>{
  const f=fixture();
  // A prior-life launch still counts when only a remote physical copy survives.
  for(let i=1;i<=7;i++){const launch={id:`old-${i}`,sequence:i,ownerId:'A',ownerLife:99,ownerName:'Old',weapon:'launcher',eye:{x:0,y:0,z:0},direction:{x:0,y:0,z:-1},birthCallback:0,time:0} as OriginalSoloLaunch;f.launches.set(launch.id,launch);f.b.projectiles.set(launch.id,{launch,state:{} as OriginalSoloProjectile['state']});}
  const batch=new OriginalSoloLaunchBatch({worlds:f.worlds,launches:f.launches,receipts:f.receipts,sequence:20,callback:7,time:1});
  const yes=batch.reserve(f.a,prefix(),0,command()),no=batch.reserve(f.a,prefix(),1,command());expect(no).toEqual({ok:false,reason:'projectile-cap'});expect(batch.reserve(f.a,prefix(),1,command())).toBe(no);expect(batch.nextSequence).toBe(21);
  expect(()=>batch.seal([yes])).toThrow(/unclaimed/i);batch.validateClaim(f.a,prefix(),no);batch.seal([yes,no]);batch.prepareCommit()();expect(f.launches.size).toBe(8);expect(f.a.projectiles.size).toBe(1);
 });
 it('authenticates issuer identity, exact owner/prefix and all unique claims before sealing',()=>{
  const f=fixture(),admission=f.batch.reserve(f.a,prefix(),0,command());
  expect(()=>f.batch.validateClaim(f.b,prefix(),admission)).toThrow(/foreign/i);expect(()=>f.batch.validateClaim(f.a,{...prefix(),callback:2},admission)).toThrow(/foreign/i);expect(()=>f.batch.validateClaim(f.a,prefix(),{...admission})).toThrow(/foreign/i);
  expect(()=>f.batch.seal([])).toThrow(/unclaimed/i);expect(()=>f.batch.seal([admission,admission])).toThrow(/unclaimed/i);
  f.batch.seal([admission]);expect(()=>f.batch.reserve(f.a,prefix(),1,command())).toThrow(/seal/i);
 });
 it('captures transport decisions once and retains admissions through rollback and cached retry',()=>{
  const hook=vi.fn(()=>true),f=fixture(hook),admission=f.batch.reserve(f.a,prefix(),0,command());f.batch.seal([admission]);expect(hook).toHaveBeenCalledTimes(1);
  const old=f.batch.prepareCommit();f.batch.rollback();old();expect(f.launches.size).toBe(0);expect(f.a.projectiles.size).toBe(0);
  expect(f.batch.reserve(f.a,prefix(),0,command())).toBe(admission);f.batch.seal([admission]);expect(hook).toHaveBeenCalledTimes(1);f.batch.prepareCommit()();expect(f.a.projectiles.size).toBe(1);
 });
 it('honors rejected remote delivery without filtering the owner or admitting name echoes',()=>{
  const hook=vi.fn(()=>false),f=fixture(hook),admission=f.batch.reserve(f.a,prefix(),0,command());f.batch.seal([admission]);expect(hook).toHaveBeenCalledTimes(1);expect(f.batch.incoming(f.b)).toEqual([]);expect(f.batch.spawnEvents.map(row=>row.world.id)).toEqual(['A']);f.batch.prepareCommit()();expect(f.b.projectiles.size).toBe(0);
 });
 it.each(['world','projectiles','catalog','receipts'] as const)('rejects changed %s bindings before publication',kind=>{
  const f=fixture(),admission=f.batch.reserve(f.a,prefix(),0,command());f.batch.seal([admission]);
  if(kind==='world')f.worlds.set('B',world('B','Bravo',2));
  else if(kind==='projectiles')f.b.projectiles.set('foreign',{} as OriginalSoloProjectile);
  else if(kind==='catalog')f.launches.set('foreign',{} as OriginalSoloLaunch);
  else f.receipts.set('foreign',new Map());
  expect(()=>f.batch.prepareCommit()).toThrow(/changed/i);expect(f.a.projectiles.size).toBe(0);
 });
 it('rejects caught transport-hook reentry and recipient replacement without leaking any body',()=>{
  for(const mode of ['reentry','replacement'] as const){const f=fixture(()=>{if(mode==='reentry'){try{f.batch.reserve(f.a,prefix(),1,command());}catch{/* caught hook failure still poisons batch */}}else f.worlds.set('B',world('B','Replacement'));return true;});
   const admission=f.batch.reserve(f.a,prefix(),0,command());expect(()=>f.batch.seal([admission])).toThrow();expect(f.launches.size).toBe(0);expect(f.a.projectiles.size).toBe(0);
  }
 });
 it.each(['command','prefix'] as const)('poisons caught reentry during %s decoding without issuing a launch',kind=>{
  const f=fixture(),input=command(),p=prefix();let reads=0;
  const reenter=()=>{reads++;try{f.batch.reserve(f.a,prefix(),1,command());}catch{/* caller catches the nested rejection */}};
  if(kind==='command')Object.defineProperty(input.eye,'x',{get:()=>{reenter();return 1;}});
  else Object.defineProperty(p,'callback',{get:()=>{reenter();return 1;}});
  expect(()=>f.batch.reserve(f.a,p,0,input)).toThrow(/closed|reentrant/i);expect(reads).toBe(1);expect(f.launches.size).toBe(0);expect(f.a.projectiles.size).toBe(0);expect(()=>f.batch.seal([])).toThrow();
 });
 it('uses prepared Map references without calling patched instance set hooks during publication',()=>{
  const f=fixture(),admission=f.batch.reserve(f.a,prefix(),0,command());f.batch.seal([admission]);const publish=f.batch.prepareCommit();
  const hooks=[vi.spyOn(f.launches,'set').mockImplementation(()=>{throw Error('catalog hook');}),vi.spyOn(f.receipts,'set').mockImplementation(()=>{throw Error('receipt hook');}),vi.spyOn(f.a.projectiles,'set').mockImplementation(()=>{throw Error('physical hook');})];
  try{publish();for(const hook of hooks)expect(hook).not.toHaveBeenCalled();expect(f.a.projectiles.size).toBe(1);}finally{for(const hook of hooks)hook.mockRestore();}
 });
 it('rejects malformed finite vectors, rotation mismatch, foreign callback and sequence overflow before issuance',()=>{
  for(const raw of [{...command(),eye:{x:NaN,y:0,z:0}},{...command(),direction:{x:0,y:0,z:0}},{...command(),weapon:'rpg' as const,sourceRotation:{x:20,y:0,z:0}}]){const f=fixture();expect(()=>f.batch.reserve(f.a,prefix(),0,raw)).toThrow();expect(f.batch.nextSequence).toBe(0);expect(f.launches.size).toBe(0);}
  const f=fixture();expect(()=>f.batch.reserve(f.a,{...prefix(),sceneGeneration:2},0,command())).toThrow();expect(()=>f.batch.reserve(f.a,prefix(),-1,command())).toThrow();
  const overflow=new OriginalSoloLaunchBatch({worlds:f.worlds,launches:f.launches,receipts:f.receipts,sequence:Number.MAX_SAFE_INTEGER,callback:1,time:1});expect(()=>overflow.reserve(f.a,prefix(),0,command())).toThrow(/overflow/i);
 });
 it('bounds world and request counts including rejected-cap requests',()=>{
  const worlds=new Map(Array.from({length:9},(_,i)=>[String(i),world(String(i))] as const));expect(()=>new OriginalSoloLaunchBatch({worlds,launches:new Map(),receipts:new Map(),sequence:0,callback:1,time:1})).toThrow(/budget/i);
  const f=fixture(),claims:OriginalSoloReservedLaunchAdmission[]=[];for(let i=0;i<64;i++)claims.push(f.batch.reserve(f.a,prefix(),i,command()));expect(()=>f.batch.reserve(f.a,prefix(),64,command())).toThrow(/count/i);f.batch.seal(claims);expect(f.batch.nextSequence).toBe(8);
 });
 it('preflights final catalog sizes including newly reserved launches before any transport hook',()=>{
  for(const kind of ['launches','receipts'] as const){const hook=vi.fn(()=>true),f=fixture(hook);
   for(let i=0;i<512;i++){const id=`prior-${i}`;if(kind==='launches')f.launches.set(id,{id,ownerId:'unrelated-stable-owner'} as OriginalSoloLaunch);else f.receipts.set(id,new Map());}
   const batch=new OriginalSoloLaunchBatch({worlds:f.worlds,launches:f.launches,receipts:f.receipts,sequence:0,callback:1,time:1,deliverLaunch:hook});
   const admission=batch.reserve(f.a,prefix(),0,command());expect(admission.ok).toBe(true);expect(()=>batch.seal([admission])).toThrow(/final.*catalog.*budget/i);
   expect(hook).not.toHaveBeenCalled();expect(f.a.projectiles.size).toBe(0);expect(f[kind].size).toBe(512);
  }
 });
 it('preflights name-eligible receiver final projectile size before asking a rejecting transport hook',()=>{
  const hook=vi.fn(()=>false),f=fixture(hook);for(let i=0;i<512;i++)f.b.projectiles.set(`unrelated-${i}`,{} as OriginalSoloProjectile);
  const batch=new OriginalSoloLaunchBatch({worlds:f.worlds,launches:f.launches,receipts:f.receipts,sequence:0,callback:1,time:1,deliverLaunch:hook}),admission=batch.reserve(f.a,prefix(),0,command());
  expect(admission.ok).toBe(true);expect(()=>batch.seal([admission])).toThrow(/final.*recipient.*budget/i);expect(hook).not.toHaveBeenCalled();expect(f.a.projectiles.size).toBe(0);expect(f.b.projectiles.size).toBe(512);expect(f.launches.size).toBe(0);expect(f.receipts.size).toBe(0);
 });
});
