import {describe,it,expect,vi} from 'vitest';
import {createOriginalSoloCurrentSceneLease,type OriginalSoloCurrentSceneProducerOptions} from './originalSoloCurrentSceneProducer';
import {OriginalSoloObserverWorlds,type OriginalSoloEvent,type OriginalSoloReceiverSceneLease,type OriginalSoloReceiverCurrentContext} from './originalSoloObserverWorld';
import {advanceOriginalReceiverGunCallback} from './originalReceiverGunCallback';
import {OriginalReceiverLoadoutWorld,type ReceiverLoadoutCheckpoint} from './originalReceiverLoadoutWorld';
import {OriginalReceiverLocalWeaponWorld,type ReceiverLocalWeaponWorldCheckpoint} from './originalReceiverLocalWeaponWorld';
import {OriginalReceiverWeaponReportWorld} from './originalReceiverWeaponReportWorld';
import {ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES} from './originalReceiverLocalWeaponInventory';
import {createOriginalReceiverGeometryQuery} from './originalReceiverGeometryBackend';
import {createReceiverLocalHitscanQuery,type ReceiverLocalHitscanAction,type ReceiverLocalHitscanSceneCapture} from './originalReceiverLocalHitscan';
import {ORIGINAL_RECEIVER_SCENE_LAYERS,type OriginalReceiverRayModel} from './originalReceiverSceneRay';
import {createOriginalSceneGeometry,type OriginalSceneData} from './originalSceneGeometry';
import type {OriginalMapRuntime} from './originalMapRuntime';
import type {ReceiverCurrentEnvironmentCommand} from './originalReceiverCurrentEnvironment';
import type {ReceiverModelBackend,ReceiverModelPose} from './originalReceiverModelWorld';
import {originalPlayerEye} from './originalPlayerPhysics';
import type {WeaponId} from './protocol';

const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],zero={x:0,y:0,z:0};
const slots:WeaponId[]=['pistol','shotgun','rifle','launcher','rpg','sniper'];
const all=()=>Object.fromEntries(slots.map(w=>[w,true])) as Record<WeaponId,boolean>;
const counts=(n:number)=>Object.fromEntries(slots.map(w=>[w,n])) as Record<WeaponId,number>;
const pose=():ReceiverModelPose=>({position:{...zero},yaw:0,phase:0,scale:1,rotation:{x:0,y:0,z:0,w:1}});
interface RecordState {
 lease:OriginalSoloReceiverSceneLease;local?:OriginalReceiverLocalWeaponWorld;loadout?:OriginalReceiverLoadoutWorld;
 captures:ReceiverLocalHitscanSceneCapture[];actions:ReceiverLocalHitscanAction[];calls:number;cameraCalls:number;births:string[];
 contexts:OriginalSoloReceiverCurrentContext[];
 reports?:OriginalReceiverWeaponReportWorld;
}

// Explicit CPU triangles and all-layer accounting, including proved-empty
// sky/doors/barrels/projectiles. Real private ledgers and mirror births are used;
// this geometry/parent/muzzle binding does not claim native resource equality.
function fixture(weapon:'rifle'|'shotgun'='rifle',reportBank=false,admitDamage=false){
 const scale=.02,data:OriginalSceneData={nodes:[{name:'cpu-floor',parent:'World',resource:'cpu-floor',matrix:I,visibility:1,shader:'default'}],meshes:[{resource:'cpu-floor',part:0,positions:[[-100,-100,-100],[100,-100,-100],[0,100,-100]],faces:[[0,1,2]],normals:[],tex_coords:[]}]};
 const geometry=createOriginalSceneGeometry(data,{scale}),runtime:OriginalMapRuntime={map:'woodlands',data,scale,geometry,spawnPoints:[],profile:{scale,radius:1,bodyHeight:1,eyeHeight:1,bounds:geometry.bounds}};
 const events:OriginalSoloEvent[]=[],records=new Map<string,RecordState>(),input={fire:true,send:false,sendAfterGun:false};
 let eventHook:((event:OriginalSoloEvent)=>void)|undefined;
 const worlds=new OriginalSoloObserverWorlds(runtime,{admitWeaponReportDamage:admitDamage,onEvent:e=>{events.push(e);eventHook?.(e);},createReceiverScene:registration=>{
  const record:RecordState={lease:undefined as unknown as OriginalSoloReceiverSceneLease,captures:[],actions:[],calls:0,cameraCalls:0,births:[],contexts:[]};records.set(registration.id,record);
  const peer=registration.id==='A'?'B':'A';
  const options:OriginalSoloCurrentSceneProducerOptions={sourceScale:scale,maxCapturedBlasts:8,maxCapturedProjectiles:8,environment:{maxCommands:64,maxOutcomes:32,maxModels:128,maxTextChars:65536},controller:{model:{eyeHeight:1,goodyBspWorld:1,maxModels:128,maxPickups:16,lifecycleJournal:{maxEntries:64,maxTextChars:65536}},transient:{maxModels:32,maxActors:32,maxShaders:32},transientState:true,maxEffects:64},createBackends:context=>{
   const prefix={kind:'callback' as const,sceneGeneration:context.lifeGeneration,callback:0};
   if(reportBank)record.reports=new OriginalReceiverWeaponReportWorld({prefix,shots:0,hurts:[]},{maxNames:32,maxTextChars:65536,maxCommands:64});
   const seed:ReceiverLoadoutCheckpoint={prefix,map:'woodlands',selected:weapon,owned:all(),ammo:counts(10),reserve:counts(0),refillTarget:weapon==='rifle'?28:6,counter:{waitgun:0,poldwaitgun:0},score:0,goldScore:0};
   record.loadout=new OriginalReceiverLoadoutWorld(seed,{maxCommands:64,maxTextChars:65536,weaponModelPresent:all()});
   const localSeed:ReceiverLocalWeaponWorldCheckpoint={prefix,cameraHandle:`camera:${context.id}`,cameraWorldMatrix:[...I],selectedWeapon:weapon,loadedRocket:false,motion:{weapon,ticker:0,gunPositionSource:{...zero}},models:Object.entries(ORIGINAL_RECEIVER_LOCAL_WEAPON_RESOURCES).map(([handle,resource])=>({handle:handle as ReceiverLocalWeaponWorldCheckpoint['models'][number]['handle'],resource,inWorld:false,worldMatrix:[...I],groupAncestry:[`camera:${context.id}`]}))};
   record.local=new OriginalReceiverLocalWeaponWorld(localSeed,{sourceScale:scale,maxCommands:64,maxTextChars:65536,bindModels:(_op,state)=>({models:state.models,loadedRocket:state.loadedRocket})});
   const query=createOriginalReceiverGeometryQuery({sceneGeneration:context.lifeGeneration,provenance:'declared-complete-CPU-layers',budget:{maxModels:128,maxTriangles:128,maxVertices:384},coverageAt:(callback,p,actors)=>({sceneGeneration:context.lifeGeneration,callback,prefix:p,actorRegistry:actors,expectedHandles:[...(actors?.models??[]).map(m=>m.handle),...record.local!.freeze().models.map(m=>m.handle),...record.captures.at(-1)!.models.filter(m=>m.kind==='transient').map(m=>m.handle)],accountedLayers:ORIGINAL_RECEIVER_SCENE_LAYERS,unresolved:[]}),resolveModel:(model,_callback,_prefix,actors):OriginalReceiverRayModel=>({handle:model.handle,layer:model.kind==='gi'?(actors!.actors.some(a=>a.gi===model.handle)?'live-gi':'corpse'):model.kind==='gun'?'held-gun':model.kind==='local-weapon'?'local-weapon':'transient',inWorld:model.inWorld,geometryProvenance:model.geometryProvenance,groupAncestry:model.group==='gsmokes'?['gsmokes']:[],positions:[[-10,-10,0],[10,-10,0],[0,10,0]],faces:[[0,1,2]],worldMatrix:[1,0,0,0,0,1,0,0,0,0,1,0,model.pose.position.x,model.pose.position.y,model.pose.position.z,1],sidedness:'double'})});
   const validated=createReceiverLocalHitscanQuery(query);
   const model:ReceiverModelBackend={cloneGI:()=>({pose:pose(),geometryProvenance:'CPU-GI'}),cloneGun:()=>({pose:pose(),geometryProvenance:'CPU-gun'}),heldGunPose:gi=>gi.pose,sphere:()=>({bspWorld:1,provenance:'declared-resource'}),reparentGunMembership:x=>x,dropYaw:()=>0,nearestDetailedDownward:()=>({hit:null,coverage:{complete:true,missing:[],provenance:'declared-empty-downward'}})};
   return {model,localWeaponWorld:record.local,loadoutWorld:record.loadout,weaponReportWorld:record.reports,localHitscan:{nearestBullet:(capture,origin,direction)=>{record.captures.push(capture);return validated.nearestBullet(capture,origin,direction);}},transient:{clonePlane:()=>{record.births.push('plane');return {pose:pose(),geometryProvenance:'CPU-plane',inWorld:true};},cloneMuzzle:()=>{record.births.push('muzzle');return {pose:pose(),geometryProvenance:'CPU-muzzle',inWorld:true};},pointAt:()=>pose().rotation!,selfRotate:q=>q}};
  },captureLocalWeaponCallback:()=>{record.cameraCalls++;return {cameraWorldMatrix:[...I],velocityWorld:{...zero},commands:[]};},captureLoadoutProgram:(context,prefixes,previous,admitted)=>{
   record.calls++;record.contexts.push(context);const receiptCommands=admitted.map(a=>({kind:'admitted-bang' as const,blast:a.blast}));if(!prefixes.callback)return {receiptCommands};
   if(prefixes.callback.kind!=='callback')throw Error('Expected gun callback prefix');
   const names=new Map(context.actorNames);
   for(const row of context.receiptActorNames)names.set(row.actorId,{name:row.name,lifeGeneration:row.lifeGeneration});
   const peerName=names.get(peer)?.name;if(!peerName)throw Error('Missing admitted peer name');
   const gunPhase=advanceOriginalReceiverGunCallback(previous.loadout,{prefix:prefixes.callback,held:{typing:false,reload:false,fire:input.fire,digits:[false,false,false,false,false,false]},weaponModelPresent:all()});
   const commands:ReceiverCurrentEnvironmentCommand[]=[{kind:'loadout-capture',checkpoint:gunPhase.checkpoint}];
   if(input.send&&!input.sendAfterGun)commands.unshift({kind:'weapon-report-send'});
   for(const intent of gunPhase.intents){
    if(intent.kind==='rocket-remove')commands.push({kind:'weapon-rocket',loadedRocket:false});
    else if(intent.kind==='rocket-parent')commands.push({kind:'weapon-rocket',loadedRocket:true});
    else if(intent.kind==='load-pose')commands.push({kind:'weapon-reload'});
    else if(intent.kind==='recoil-pose')commands.push({kind:'weapon-fire'});
    else if(intent.kind==='sortweapons')commands.push({kind:'weapon-whichgun',weapon:intent.weapon});
    else if(intent.kind==='fire'&&intent.action==='hitscan')for(let ray=0;ray<intent.rayCoordinates.length;ray++){
     // Recovered coords do not change cosine3D; explicit camera-origin and
     // muzzle WORLD pose are CPU adapters, not a guessed renderer transform.
     const action:ReceiverLocalHitscanAction={prefix:prefixes.callback,weapon:intent.weapon as 'rifle'|'shotgun',sourceRotation:{x:0,y:0,z:context.id==='A'?0:180},origin:{...originalPlayerEye(context.body)},bspWorld:1,actorNames:{[peer]:peerName},effectId:`output:${context.id}:${prefixes.callback.callback}:${ray}`,muzzleId:`muzzle:${context.id}:${prefixes.callback.callback}:${ray}`,gunPose:pose()};
     record.actions.push(action);commands.push({kind:'local-hitscan',action});
    }
   }
   if(input.send&&input.sendAfterGun)commands.push({kind:'weapon-report-send'});
   commands.push({kind:'weapon-finish'});return {receiptCommands,callbackCommands:commands,gunPhase};
  },goodyAt:c=>c.alive?{eyePosition:originalPlayerEye(c.body),modelPosition:originalPlayerEye(c.body),bspWorld:1,weapon:c.weapon!}:null,snapshotAt:(prefix,state)=>({prefix,missing:[],provenance:'declared-complete-CPU-external',models:(state.localWeapons?.models??[]).map(m=>({handle:m.handle,name:m.handle,resource:m.resource,kind:'local-weapon' as const,group:'gsmokes' as const,inWorld:m.inWorld,geometryProvenance:'CPU-local',worldMatrix:m.worldMatrix,pose:pose()}))})};
  record.lease=createOriginalSoloCurrentSceneLease(options);return record.lease;
 }});
 const a=worlds.register({id:'A',name:'Alpha',eye:{x:0,y:1,z:0}}),b=worlds.register({id:'B',name:'Bravo',eye:{x:0,y:1,z:-5}});a.weapon=weapon;b.weapon=weapon;
 const physical=(n:number)=>{const time=n/30,ids=[...worlds.worlds.keys()];worlds.physics(time,{skipIds:new Set(ids)});for(const id of ids)worlds.goody(id);return time;};
 const cycle=(n:number)=>{const time=physical(n);worlds.completeGoody(time);worlds.actors(time);};
 const shots=(id:string)=>events.flatMap(e=>e.kind==='local-hitscan-outcome'&&e.recipientId===id?[e.outcome]:[]);
 const reports=(id:string)=>events.flatMap(e=>e.kind==='weapon-report'&&e.recipientId===id?[e]:[]);
 return {worlds,a,b,records,input,events,physical,cycle,shots,reports,setHook:(hook:(event:OriginalSoloEvent)=>void)=>{eventHook=hook;}};
}

describe('real gun helper through private Solo shot publication (declared CPU geometry)',()=>{
 it.each(['rifle','shotgun'] as const)('admits %s named damage only after a committed send from actual staged rays',weapon=>{
  const f=fixture(weapon,true,true);try{
   f.cycle(1);const amount=weapon==='rifle'?6:36;
   expect(f.a.health.canonical).toBe(100);expect(f.b.health.canonical).toBe(100);
   expect(f.a.loadout!.ammo[weapon]).toBe(9);expect(f.shots('A')).toHaveLength(weapon==='rifle'?1:2);
   f.input.fire=false;f.input.send=true;f.cycle(2);
   expect(f.a.health.canonical).toBe(100-amount);expect(f.b.health.canonical).toBe(100-amount);
   expect(f.events.flatMap(e=>e.kind==='damaged'?[e.damage]:[])).toEqual([amount,amount]);
   expect(f.a.loadout!.ammo[weapon]).toBe(9);expect(f.records.get('A')!.reports!.freeze().hurts).toEqual([]);
   f.input.send=false;f.cycle(3);expect(f.b.health.canonical).toBe(100-amount);expect(f.events.filter(e=>e.kind==='damaged')).toHaveLength(2);
  }finally{f.worlds.clear();}
 });
 it('does not admit damage on a failed joint send and admits captured sends once on retry',()=>{
  const f=fixture('rifle',true,true);try{
   f.cycle(1);f.input.fire=false;f.input.send=true;
   const time=f.physical(2),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later admitted report failed');});
   expect(()=>f.worlds.completeGoody(time)).toThrow('later admitted report failed');
   expect(f.a.health.canonical).toBe(100);expect(f.b.health.canonical).toBe(100);expect(f.records.get('A')!.reports!.freeze().shots).toBe(1);
   const calls=f.records.get('A')!.calls;f.input.send=false;failure.mockRestore();f.worlds.completeGoody(time);
   expect(f.records.get('A')!.calls).toBe(calls);expect(f.a.health.canonical).toBe(94);expect(f.b.health.canonical).toBe(94);
   expect(f.records.get('A')!.reports!.freeze().hurts).toEqual([]);expect(f.events.filter(e=>e.kind==='damaged')).toHaveLength(2);
   f.worlds.actors(time);f.cycle(3);expect(f.b.health.canonical).toBe(94);expect(f.events.filter(e=>e.kind==='damaged')).toHaveLength(2);
  }finally{f.worlds.clear();}
 });
 it('keeps both actual ray reports admitted after a public report listener fails',()=>{
  const f=fixture('rifle',true,true);try{
   f.cycle(1);f.input.fire=false;f.input.send=true;
   f.setHook(e=>{if(e.kind==='weapon-report'&&e.recipientId==='A'){
    expect(f.a.health.canonical).toBe(94);expect(f.b.health.canonical).toBe(94);throw Error('failed admitted report notification');
   }});
   const time=f.physical(2);expect(()=>f.worlds.completeGoody(time)).toThrow(AggregateError);
   expect(f.events.filter(e=>e.kind==='damaged')).toHaveLength(2);expect(f.records.get('A')!.reports!.freeze().hurts).toEqual([]);
   f.setHook(()=>{});f.input.send=false;f.worlds.actors(time);f.cycle(3);expect(f.b.health.canonical).toBe(94);expect(f.events.filter(e=>e.kind==='damaged')).toHaveLength(2);
  }finally{f.worlds.clear();}
 });
 it.each(['rifle','shotgun'] as const)('stages %s rays, source ammo and reports once, then drains before the next callback',weapon=>{
  const f=fixture(weapon);try{
   f.cycle(1);const r=f.records.get('A')!,rays=weapon==='shotgun'?2:1;
   expect(f.a.loadout!.ammo[weapon]).toBe(9);expect(f.b.loadout!.ammo[weapon]).toBe(9);
   expect(f.a.gunPhase?.phase).toMatchObject({weapon,bullets:10,ready:true});
   expect(f.shots('A')).toHaveLength(rays);expect(f.shots('A').map(o=>o.hurt)).toEqual(Array.from({length:rays},()=>({actorId:'B',name:'Bravo',amount:weapon==='shotgun'?18:6,sourcePositionWorld:{x:0,y:1,z:-5}})));
   expect(f.shots('A').every(o=>o.positiveShot===1&&o.hit?.layer==='live-gi')).toBe(true);
   expect(r.births).toEqual(Array.from({length:rays},()=>['plane','muzzle']).flat());
   expect(r.captures[0].actors.actors.map(a=>a.actorId)).toEqual(['B']);
   expect(r.contexts[0].actorNames.size).toBe(0);
   expect(r.contexts[0].receiptActorNames).toEqual([{actorId:'B',name:'Bravo',lifeGeneration:f.b.lifeGeneration}]);
   expect(Object.isFrozen(r.contexts[0].receiptActorNames)).toBe(true);expect(Object.isFrozen(r.contexts[0].receiptActorNames[0])).toBe(true);
   expect(r.captures[0].models.filter(m=>m.kind==='transient')).toHaveLength(0);
   if(rays===2)expect(r.captures[1].models.filter(m=>m.kind==='transient')).toHaveLength(2);
   const phase=f.events.findIndex(e=>e.kind==='gun-phase-state'&&e.recipientId==='A'),shot=f.events.findIndex(e=>e.kind==='local-hitscan-outcome'&&e.recipientId==='A');expect(shot).toBeGreaterThan(phase);
   expect(f.a.health.canonical).toBe(100);expect(f.b.health.canonical).toBe(100);
   f.cycle(2);expect(r.calls).toBe(2);expect(r.cameraCalls).toBe(2);expect(f.a.loadout!.ammo[weapon]).toBe(9);expect(f.shots('A')).toHaveLength(rays);expect(r.lease.drainLocalHitscanOutcomes!()).toEqual([]);
  }finally{f.worlds.clear();}
 });
 it('rolls back a real earlier shot after a later receiver fails and retries captured actions without rereading held input',()=>{
  const f=fixture();try{
   const time=f.physical(1),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later shot receiver failed');});
   expect(()=>f.worlds.completeGoody(time)).toThrow('later shot receiver failed');const r=f.records.get('A')!;
   expect(r.captures).toHaveLength(1);expect(r.loadout!.freeze().ammo.rifle).toBe(10);expect(r.local!.freeze().prefix.callback).toBe(0);expect(f.a.loadout).toBeUndefined();expect(f.a.transientState).toBeUndefined();expect(f.shots('A')).toEqual([]);
   const calls=r.calls,cameras=r.cameraCalls;f.input.fire=false;(r.actions[0].sourceRotation as {z:number}).z=180;(r.actions[0].actorNames as Record<string,string|0>).B=0;
   expect(f.a.actorNames.size).toBe(0);
   expect(()=>r.lease.captureCurrent!({...r.contexts[0],receiptActorNames:[{actorId:'B',name:'Changed',lifeGeneration:f.b.lifeGeneration}]})).toThrow('Changed Solo CURRENT retry');
   expect(()=>r.lease.captureCurrent!({...r.contexts[0],receiptActorNames:[{actorId:'B',name:'Bravo',lifeGeneration:f.b.lifeGeneration+1}]})).toThrow('Changed Solo CURRENT retry');
   failure.mockRestore();f.worlds.completeGoody(time);expect(r.calls).toBe(calls);expect(r.cameraCalls).toBe(cameras);expect(r.captures).toHaveLength(2);
   expect(f.a.loadout!.ammo.rifle).toBe(9);expect(f.shots('A')).toMatchObject([{hurt:{actorId:'B',name:'Bravo',amount:6}}]);expect(f.shots('A')).toHaveLength(1);expect(f.a.transientState!.actors.map(a=>a.kind)).toEqual(['blood','muzzle']);
   f.worlds.actors(time);f.cycle(2);expect(f.shots('A')).toHaveLength(1);expect(r.lease.drainLocalHitscanOutcomes!()).toEqual([]);
  }finally{f.worlds.clear();}
 });
 it('accepts a renamed replacement peer without changing captured prior names before joint commit',()=>{
  const f=fixture();try{
   f.cycle(1);const r=f.records.get('A')!,oldLife=f.b.lifeGeneration,oldNames=f.a.actorNames,oldGI=r.captures[0].actors.actors.find(a=>a.actorId==='B')!.gi;
   expect(oldNames.get('B')).toEqual({name:'Bravo',lifeGeneration:oldLife});
   f.worlds.dispose('B');const death=r.contexts.at(-1)!;
   expect(death.deliveryKind).toBe('death');expect(death.receiptActorNames).toEqual([]);expect(Object.isFrozen(death.receiptActorNames)).toBe(true);
   expect(death.actorNames).toBe(oldNames);expect(oldNames.get('B')).toEqual({name:'Bravo',lifeGeneration:oldLife});
   expect(r.contexts[0].actorNames.size).toBe(0);expect(r.contexts[0].receiptActorNames).toEqual([{actorId:'B',name:'Bravo',lifeGeneration:oldLife}]);
   // failure-03 preserved the immediate replacement attempt: death receipt
   // marks the peer dead, but its model detaches on the following callback.
   // Exercise that supported lifecycle rather than relaxing the reset guard.
   f.cycle(2);const detachedNames=f.a.actorNames;
   expect(detachedNames.size).toBe(0);expect(detachedNames).not.toBe(oldNames);
   expect(f.a.modelState!.actors.some(a=>a.actorId==='B')).toBe(false);
   expect(f.a.modelState!.fades.some(fade=>fade.handle===oldGI)).toBe(true);
   expect(oldNames.get('B')).toEqual({name:'Bravo',lifeGeneration:oldLife});
   // The replacement is closer than the retained corpse. A corpse still blocks
   // a detailed bullet; moving the CPU spawn avoids assuming it disappears.
   const replacement=f.worlds.register({id:'B',name:'Charlie',eye:{x:0,y:1,z:-3}},2/30);replacement.weapon='rifle';expect(replacement.lifeGeneration).toBeGreaterThan(oldLife);
   const originalPrepare=replacement.mirror.prepareSynchronousDelivery.bind(replacement.mirror);
   const inspection=vi.spyOn(replacement.mirror,'prepareSynchronousDelivery').mockImplementation((...args)=>{
    expect(f.a.actorNames).toBe(detachedNames);expect(detachedNames.size).toBe(0);expect(oldNames.get('B')).toEqual({name:'Bravo',lifeGeneration:oldLife});
    expect(r.contexts.at(-1)!.actorNames).toBe(detachedNames);
    expect(r.contexts.at(-1)!.receiptActorNames).toEqual([{actorId:'B',name:'Charlie',lifeGeneration:replacement.lifeGeneration}]);
    return originalPrepare(...args);
   });
   f.cycle(3);inspection.mockRestore();
   expect(f.a.actorNames.get('B')).toEqual({name:'Charlie',lifeGeneration:replacement.lifeGeneration});expect(f.a.actorNames).not.toBe(oldNames);
   expect(oldNames.get('B')).toEqual({name:'Bravo',lifeGeneration:oldLife});
   const reborn=f.a.modelState!.actors.find(a=>a.actorId==='B')!;expect(reborn).toBeDefined();expect(reborn.gi).not.toBe(oldGI);
   expect(f.a.modelState!.fades.some(fade=>fade.handle===oldGI)).toBe(true);
   expect(f.shots('A')).toHaveLength(2);expect(f.shots('A')[1]).toMatchObject({prefix:{callback:3},hit:{handle:reborn.gi,layer:'live-gi'},hurt:{actorId:'B',name:'Charlie',amount:6}});
   expect(f.a.loadout!.ammo.rifle).toBe(8);expect(oldNames.get('B')!.name).toBe('Bravo');
  }finally{f.worlds.clear();}
 });
});

describe('private report accumulation through actual captured gun queries',()=>{
 it.each(['rifle','shotgun'] as const)('sends prior %s hits before a new shot, then retains only that new shot',weapon=>{
  const f=fixture(weapon,true);try{
   const rays=weapon==='rifle'?1:2,amount=weapon==='rifle'?6:36;
   f.cycle(1);const bank=f.records.get('A')!.reports!;
   expect(bank.freeze()).toMatchObject({shots:rays,hurts:[{name:'Bravo',amount}]});expect(f.reports('A')).toEqual([]);
   f.cycle(2);expect(bank.freeze().shots).toBe(rays);
   f.input.send=true;f.cycle(3);
   expect(f.reports('A').map(e=>e.report)).toEqual([{shots:rays,hurts:[{name:'Bravo',amount}]}]);
   const sent=f.events.findIndex(e=>e.kind==='weapon-report'&&e.recipientId==='A'),newShot=f.events.findIndex(e=>e.kind==='local-hitscan-outcome'&&e.recipientId==='A'&&e.outcome.prefix.callback===3);
   if(weapon==='rifle'){expect(newShot).toBeGreaterThan(sent);expect(bank.freeze()).toMatchObject({shots:1,hurts:[{name:'Bravo',amount:6}]});}
   else expect(bank.freeze()).toMatchObject({shots:0,hurts:[]});
   f.input.fire=false;f.cycle(4);expect(f.reports('A')[1].report).toEqual(weapon==='rifle'?{shots:1,hurts:[{name:'Bravo',amount:6}]}:{});
   expect(bank.freeze()).toMatchObject({shots:0,hurts:[]});expect(f.a.health.canonical).toBe(100);expect(f.b.health.canonical).toBe(100);
  }finally{f.worlds.clear();}
 });
 it('rolls back a prepared send and a new shot together, then retries captured send/input once',()=>{
  const f=fixture('rifle',true);try{
   f.cycle(1);f.cycle(2);const r=f.records.get('A')!,prior=r.reports!.freeze();f.input.send=true;
   const time=f.physical(3),failure=vi.spyOn(f.b.mirror,'prepareSynchronousDelivery').mockImplementationOnce(()=>{throw Error('later report receiver failed');});
   expect(()=>f.worlds.completeGoody(time)).toThrow('later report receiver failed');expect(r.reports!.freeze()).toBe(prior);expect(f.reports('A')).toEqual([]);expect(f.a.loadout!.ammo.rifle).toBe(9);
   const calls=r.calls;f.input.send=false;f.input.fire=false;failure.mockRestore();f.worlds.completeGoody(time);
   expect(r.calls).toBe(calls);expect(f.reports('A').map(e=>e.report)).toEqual([{shots:1,hurts:[{name:'Bravo',amount:6}]}]);expect(r.reports!.freeze()).toMatchObject({shots:1,hurts:[{name:'Bravo',amount:6}]});expect(f.a.loadout!.ammo.rifle).toBe(8);
   f.worlds.actors(time);f.cycle(4);expect(f.reports('A')).toHaveLength(1);expect(r.lease.drainWeaponReports!()).toEqual([]);
  }finally{f.worlds.clear();}
 });
 it('clears reports before a throwing public send listener and never replays that report',()=>{
  const f=fixture('rifle',true);try{
   f.cycle(1);f.input.fire=false;f.input.send=true;f.setHook(e=>{if(e.kind==='weapon-report'&&e.recipientId==='A'){
    expect(f.records.get('A')!.reports!.freeze()).toMatchObject({shots:0,hurts:[]});
    expect(f.records.get('B')!.lease.drainWeaponReports!()).toEqual([]);throw Error('public report send failed');
   }});
   const time=f.physical(2);expect(()=>f.worlds.completeGoody(time)).toThrow(AggregateError);expect(f.reports('B')).toHaveLength(1);
   f.setHook(()=>{});f.worlds.actors(time);f.input.send=false;f.cycle(3);expect(f.reports('A')).toHaveLength(1);expect(f.records.get('A')!.reports!.freeze().shots).toBe(0);
  }finally{f.worlds.clear();}
 });
 it('rejects a send placed after gun commands and releases the unpublished participants',()=>{
  const f=fixture('rifle',true);try{
   f.input.send=true;f.input.sendAfterGun=true;const time=f.physical(1);
   expect(()=>f.worlds.completeGoody(time)).toThrow('CURRENT weapon report must precede gun commands once');
   const r=f.records.get('A')!;expect(()=>r.reports!.freeze()).toThrow('released');expect(()=>r.loadout!.freeze()).toThrow('released');
   expect(r.captures).toEqual([]);expect(r.births).toEqual([]);expect(f.a.loadout).toBeUndefined();expect(f.a.callback).toBe(0);expect(f.events).toEqual([]);
  }finally{f.worlds.clear();}
 });
 it('keeps a same-callback new hit after a throwing send listener, then sends only that new batch',()=>{
  const f=fixture('rifle',true);try{
   f.cycle(1);f.cycle(2);f.input.send=true;f.setHook(e=>{if(e.kind==='weapon-report'&&e.recipientId==='A'){
    expect(e.report).toEqual({shots:1,hurts:[{name:'Bravo',amount:6}]});
    expect(f.records.get('A')!.reports!.freeze()).toMatchObject({shots:1,hurts:[{name:'Bravo',amount:6}]});throw Error('failed send with later gun hit');
   }});
   const time=f.physical(3);expect(()=>f.worlds.completeGoody(time)).toThrow(AggregateError);expect(f.shots('A')).toHaveLength(2);expect(f.a.loadout!.ammo.rifle).toBe(8);
   f.setHook(()=>{});f.worlds.actors(time);f.input.fire=false;f.cycle(4);
   expect(f.reports('A').map(e=>e.prefix.callback)).toEqual([3,4]);expect(f.reports('A').map(e=>e.report.shots)).toEqual([1,1]);
   expect(f.records.get('A')!.reports!.freeze()).toMatchObject({shots:0,hurts:[]});
   f.input.send=false;f.cycle(5);expect(f.reports('A')).toHaveLength(2);expect(f.shots('A')).toHaveLength(2);
  }finally{f.worlds.clear();}
 });
});
