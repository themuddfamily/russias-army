import {IDBFactory} from 'fake-indexeddb';
import {afterAll,beforeAll,describe,expect,it,vi} from 'vitest';
import {startup,asyncCycle} from './originalSoloDefaultStartup.fixture';
import type {ReceiverPickup} from '../shared/originalReceiverModelWorld';
import type {IndexedDBOriginalPickupBatchStore,PickupBatchManifest} from './originalPickupBatchStore';

type EmulatorPruneCounts={before:number;remaining:number;removed:number};
/** CPU-emulator maintenance only. Its scheduler retains terminal transaction
 * request/rollback caches indefinitely; native IndexedDB needs no such hook.
 * Preserve upgrade transactions because queued upgrade-abort cleanup uses them. */
function pruneTerminalEmulatorTransactions(factory:IDBFactory):EmulatorPruneCounts {
 const databases=(factory as unknown as {_databases:unknown})._databases;
 if(!(databases instanceof Map))throw Error('Unsupported IndexedDB emulator database registry');
 const arrays:Array<Array<{_state:string;mode:string}>>=[];
 for(const database of databases.values()){
  const transactions=database?.transactions;
  if(!Array.isArray(transactions)||transactions.some(transaction=>!transaction||
   !['active','inactive','committing','finished'].includes(transaction._state)||
   !['readonly','readwrite','versionchange'].includes(transaction.mode)))
   throw Error('Unsupported IndexedDB emulator transaction registry');
  arrays.push(transactions);
 }
 // Validate the entire registry before touching any array; live identities and
 // scheduler order remain unchanged. No transaction, writer, row or CAS changes.
 let before=0,remaining=0;
 for(const transactions of arrays){
  before+=transactions.length;
  for(let index=transactions.length-1;index>=0;index--)
   if(transactions[index]._state==='finished'&&transactions[index].mode!=='versionchange')transactions.splice(index,1);
  remaining+=transactions.length;
 }
 return {before,remaining,removed:before-remaining};
}

// Diagnostic sinks record `this` in Vitest's global mock registry. Clear
// those histories without changing their implementations or gameplay state.
function clearFixtureDiagnostics(f:ReturnType<typeof startup>):void {
 for(const target of [f.game,f.game.arena,f.game.originalExplosionPresentation,
  f.game.originalCombatEffectPresentation,f.game.originalEffectPlanePool]){
  if(target)for(const value of Object.values(target))if(vi.isMockFunction(value))value.mockClear();
 }
 for(const history of [f.inputs,f.events,f.humanShots,f.puffContexts,f.drops,f.barrelBirths])history.length=0;
 for(const history of f.programs.values())history.length=0;f.birthReads.clear();
}
type Restores=Array<()=>void>;
function replaceMethod(target:any,key:string,replacement:any,restores:Restores):void {
 const own=Object.getOwnPropertyDescriptor(target,key);
 Object.defineProperty(target,key,{configurable:true,writable:true,value:replacement});
 restores.push(()=>{if(own)Object.defineProperty(target,key,own);else Reflect.deleteProperty(target,key);});
}
let disposalOrder=0;
function observeDisposal(target:any,restores:Restores){
 const original=target.dispose,result={calls:0,order:0};
 // Plain scoped wrappers avoid spyOn's strong registry retaining the target.
 replaceMethod(target,'dispose',function(this:any,...args:unknown[]){
  result.calls++;result.order ||= ++disposalOrder;return original.apply(this,args);
 },restores);return result;
}
async function closeFixture(f:ReturnType<typeof startup>,restores:Restores=[]):Promise<void>{
 try{await f.game.disposeSoloWorldsAsync(false);f.dispose();}
 finally{clearFixtureDiagnostics(f);for(const restore of restores.reverse())restore();}
}

/** Normal Game bootstrap and factory, packaged maps/meshes, actual source
 * lifecycle and Game consumers. Solver advancement and native raster/audio
 * timing are explicitly excluded; storage is real IndexedDB through its CPU
 * implementation. No inline bootstrap override is installed in these cases. */
describe('normal paged Game Solo startup and historical pickup acceptance',()=>{
 it('prunes terminal emulator caches while preserving active writes, queued order, rollback and committed rows',async()=>{
  const factory=new IDBFactory();
  const request=factory.open('emulator-terminal-maintenance',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('rows');
  const db=await new Promise<IDBDatabase>((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
  const terminal=(transaction:IDBTransaction)=>new Promise<'complete'|'abort'>((resolve,reject)=>{
   transaction.oncomplete=()=>resolve('complete');transaction.onabort=()=>resolve('abort');
   transaction.onerror=()=>reject(transaction.error);
  });
  try{
   const seed=db.transaction('rows','readwrite'),seedDone=terminal(seed);seed.objectStore('rows').put('original','base');await seedDone;
   const raw=(factory as any)._databases.get(db.name),upgrade=raw.transactions.find((value:any)=>value.mode==='versionchange');
   expect(upgrade).toBeDefined();
   const first=db.transaction('rows','readwrite'),firstDone=terminal(first);
   first.objectStore('rows').put('changed','base');const temporary=first.objectStore('rows').put('abort-only','temporary');
   const second=db.transaction('rows','readwrite'),secondDone=terminal(second);second.objectStore('rows').put('published','committed');
   const read=db.transaction('rows','readonly'),readDone=terminal(read);
   const base=read.objectStore('rows').get('base'),temp=read.objectStore('rows').get('temporary'),committed=read.objectStore('rows').get('committed');
   let pendingCounts:EmulatorPruneCounts|undefined,pendingError:unknown;
   temporary.onsuccess=()=>{
    try{
     const live=raw.transactions.filter((value:any)=>value._state!=='finished');
     expect(live.map((value:any)=>value===first||value===second||value===read)).toEqual([true,true,true]);
     expect((second as any)._started).toBe(false);expect((read as any)._started).toBe(false);
     pendingCounts=pruneTerminalEmulatorTransactions(factory);
     const retained=raw.transactions.filter((value:any)=>value._state!=='finished');
     expect(retained.length).toBe(live.length);expect(retained.every((value:any,index:number)=>Object.is(value,live[index]))).toBe(true);
     expect(raw.transactions.some((value:any)=>Object.is(value,upgrade))).toBe(true);
    }catch(error){pendingError=error;}finally{first.abort();}
   };
   expect(await firstDone).toBe('abort');expect(await secondDone).toBe('complete');expect(await readDone).toBe('complete');
   if(pendingError)throw pendingError;
   expect(pendingCounts!.removed).toBeGreaterThan(0);
   expect(base.result).toBe('original');expect(temp.result).toBeUndefined();expect(committed.result).toBe('published');
   const final=pruneTerminalEmulatorTransactions(factory);
   expect(final).toMatchObject({remaining:1});expect(final.removed).toBe(3);expect(Object.is(raw.transactions[0],upgrade)).toBe(true);
   const verify=db.transaction('rows','readonly'),verifyDone=terminal(verify),value=verify.objectStore('rows').get('committed');
   await verifyDone;expect(value.result).toBe('published');pruneTerminalEmulatorTransactions(factory);
   expect(()=>pruneTerminalEmulatorTransactions({_databases:new Map([['bad',{transactions:[{}]}]])} as unknown as IDBFactory)).toThrow('Unsupported');
  }finally{db.close();}
 });
 it.each(['barrack','woodlands'] as const)('%s parks synchronous admission and coalesces its actual storage bootstrap',async map=>{
  const f=startup(map,{paged:true});try{
   expect(f.game.ensureSoloWorlds()).toBeUndefined();
   const first=f.game.initializeSoloWorldsAsync(),second=f.game.initializeSoloWorldsAsync();
   expect(f.game.soloWorlds).toBeUndefined();
   const [worlds,same]=await Promise.all([first,second]);expect(same).toBe(worlds);
   expect(f.game.ensureSoloWorlds()).toBe(worlds);expect(f.game.soloPickupOwner).toBeDefined();
   expect(f.game.soloPickupStore).toBeDefined();expect(f.game.soloCurrentCohortAt).toBeTypeOf('function');
   const player=worlds.worlds.get('player')!,history=f.game.soloPickupOwner.sourceAt('player',player.lifeGeneration).history;
   expect(history.root).toMatchObject({count:0,highWaterId:0});
   await asyncCycle(f.game,worlds,0);
   expect(player.modelState.pickupHistory.root).toEqual(f.game.soloPickupOwner.sourceAt('player',player.lifeGeneration).history.root);
   expect(player.modelState.pickups).toEqual([]);expect(player.loadout.selected).toBe('launcher');
   expect(f.game.soloReceiverModels.presentation.freeze()).toBe(player.modelState);
   expect(f.game.soloReceiverTransients.presentation.freeze()).toBe(player.transientState);
  }finally{await closeFixture(f);}
 });
 it('does not fall back to inline history after storage bootstrap fails',async()=>{
  const restores:Restores=[],f=startup('barrack',{paged:true}),broken=new IDBFactory(),error=new Error('declared startup storage failure');
  const open=broken.open;replaceMethod(broken,'open',()=>{throw error;},restores);
  try{
   await expect(f.game.initializeSoloWorldsAsync(broken)).rejects.toThrow('declared startup storage failure');
   expect(f.game.soloWorlds).toBeUndefined();expect(f.game.soloLoadedSceneFactory).toBeUndefined();
   broken.open=open;const worlds=await f.game.initializeSoloWorldsAsync(new IDBFactory());
   expect(worlds.worlds.get('player')).toBeDefined();expect(f.game.soloPickupOwner).toBeDefined();
  }finally{await closeFixture(f,restores);}
 });
 it('drains a pending bootstrap before closing its owned storage and borrowed resource owners',async()=>{
  const f=startup('woodlands',{paged:true});try{
   const bootstrap=f.game.initializeSoloWorldsAsync(),drain=f.game.disposeSoloWorldsAsync(false);
   await Promise.allSettled([bootstrap,drain]);await drain;
   expect(f.game.soloWorlds).toBeUndefined();expect(f.game.soloPickupStore).toBeUndefined();
   expect(f.game.soloLoadedSceneFactory).toBeUndefined();expect(f.game.soloStartupResources).toBeUndefined();
  }finally{await closeFixture(f);}
 });
 it('releases preserved presenters before starting a fresh storage generation',async()=>{
  const restores:Restores=[],f=startup('barrack',{paged:true});try{
   const oldWorlds=await f.game.initializeSoloWorldsAsync();await asyncCycle(f.game,oldWorlds,0);
   const oldStore=f.game.soloPickupStore,oldStartup=f.game.soloStartupResources,oldModels=f.game.soloReceiverModels;
   const modelRelease=observeDisposal(oldModels.presentation,restores),startupRelease=observeDisposal(oldStartup.planeOwner.planeMaterial,restores);
   await f.game.disposeSoloWorldsAsync(true);
   expect(oldModels.frozen).toBe(true);expect(modelRelease.calls).toBe(0);expect(startupRelease.calls).toBe(0);
   expect(f.game.soloPickupStore).toBeUndefined();expect(f.game.soloStartupResources).toBe(oldStartup);
   const next=await f.game.initializeSoloWorldsAsync();
   expect(next).not.toBe(oldWorlds);expect(f.game.soloWorlds).toBe(next);expect(f.game.soloPickupStore).not.toBe(oldStore);
   expect(Object.is(f.game.soloStartupResources,oldStartup)).toBe(false);expect(modelRelease.calls).toBe(1);expect(startupRelease.calls).toBe(1);
   expect(modelRelease.order).toBeLessThan(startupRelease.order);
   expect(()=>oldStartup.resources).toThrow('released');
   await asyncCycle(f.game,next,1/30);expect(next.worlds.get('player').modelState.pickupHistory.root.count).toBe(0);
   expect(f.game.soloPickupOwner).toBeDefined();expect(f.game.soloPickupCancelling).toBe(false);
  }finally{await closeFixture(f,restores);}
 });
 it('escalates coalesced presentation preservation to a complete reset before resolving cleanup',async()=>{
  const restores:Restores=[],f=startup('woodlands',{paged:true});try{
   const worlds=await f.game.initializeSoloWorldsAsync();await asyncCycle(f.game,worlds,0);
   const startupOwner=f.game.soloStartupResources,models=f.game.soloReceiverModels;
   const modelRelease=observeDisposal(models.presentation,restores),startupRelease=observeDisposal(startupOwner.planeOwner.planeMaterial,restores);
   const preserve=f.game.disposeSoloWorldsAsync(true),reset=f.game.disposeSoloWorldsAsync(false);
   expect(reset).toBe(preserve);await Promise.all([preserve,reset]);
   expect(modelRelease.calls).toBe(1);expect(startupRelease.calls).toBe(1);
   expect(f.game.soloReceiverModels).toBeUndefined();expect(f.game.soloReceiverTransients).toBeUndefined();
   expect(f.game.soloStartupResources).toBeUndefined();expect(f.game.soloPickupStore).toBeUndefined();
   expect(f.game.soloWorlds).toBeUndefined();expect(()=>startupOwner.resources).toThrow('released');
  }finally{await closeFixture(f,restores);}
 });
 it('escalates a reset arriving after preserved presenters freeze but storage close still awaits',async()=>{
  const restores:Restores=[],f=startup('barrack',{paged:true});let release!:()=>void;let closing:Promise<void>|undefined;
  try{
   const worlds=await f.game.initializeSoloWorldsAsync();await asyncCycle(f.game,worlds,0);
   const store=f.game.soloPickupStore,close=store.close.bind(store),startupOwner=f.game.soloStartupResources,models=f.game.soloReceiverModels;
   const modelRelease=observeDisposal(models.presentation,restores),startupRelease=observeDisposal(startupOwner.planeOwner.planeMaterial,restores);
   let entered!:()=>void;const started=new Promise<void>(resolve=>{entered=resolve;}),held=new Promise<void>(resolve=>{release=resolve;});
   replaceMethod(store,'close',async()=>{entered();await held;await close();},restores);
   closing=f.game.disposeSoloWorldsAsync(true);await started;
   expect(models.frozen).toBe(true);expect(modelRelease.calls).toBe(0);expect(startupRelease.calls).toBe(0);
   expect(f.game.soloWorlds).toBeUndefined();expect(f.game.soloStartupResources).toBe(startupOwner);
   const reset=f.game.disposeSoloWorldsAsync(false);expect(reset).toBe(closing);release();await reset;
   expect(modelRelease.calls).toBe(1);expect(startupRelease.calls).toBe(1);
   expect(f.game.soloReceiverModels).toBeUndefined();expect(f.game.soloStartupResources).toBeUndefined();
   expect(f.game.soloPickupStore).toBeUndefined();expect(()=>startupOwner.resources).toThrow('released');
  }finally{
   release?.();await closing?.catch(()=>{});await closeFixture(f,restores);
  }
 });
 for(const [map,count] of [['barrack',17],['barrack',33],['woodlands',17],['woodlands',33]] as const){
  describe.sequential(`${map}: one live default Game session through ${count} drops`,()=>{
   let f:ReturnType<typeof startup>,worlds:any,human:any,store:IndexedDBOriginalPickupBatchStore;
   let oldPin:PickupBatchManifest|undefined,currentPin:PickupBatchManifest|undefined;
   let oldPage:readonly Readonly<ReceiverPickup>[]|undefined;
   let callback=0,completedLives=0,giHandle:string|undefined,gunHandle:string|undefined,gi:unknown,gun:unknown;
   let stopped=false,failed=false,deadline=Infinity,deadlineCleanup:Promise<void>|undefined;
   let emulatorTransactions:EmulatorPruneCounts={before:0,remaining:0,removed:0};
   const active=()=>{
    if(stopped||failed)throw Error('Historical pickup acceptance session already stopped');
    if(performance.now()>=deadline){stopped=true;throw Error('Historical pickup acceptance step exceeded its 45-second deadline');}
   };
   const step=async(action:()=>Promise<void>)=>{
    active();deadline=performance.now()+45000;
    const timer=setTimeout(()=>{
     stopped=true;
     // Vitest does not cancel timed-out async functions. Stop this session and
     // cancel its real outstanding CURRENT IO before another step can start.
     deadlineCleanup=f.game.disposeSoloWorldsAsync(false);void deadlineCleanup!.catch(()=>{});
    },45000);
    try{await action();active();}catch(error){failed=true;throw error;}
    finally{clearTimeout(timer);deadline=Infinity;if(deadlineCleanup)await deadlineCleanup;}
   };
   const advance=async()=>{
    active();await asyncCycle(f.game,worlds,callback++/30);active();
    emulatorTransactions=pruneTerminalEmulatorTransactions(f.game.soloPickupStorageFactory);
    // Remove fixture diagnostics only; authority, storage, banks and presenter
    // identities survive across every sequential test step in this session.
    clearFixtureDiagnostics(f);
   };
   beforeAll(async()=>{
    f=startup(map,{paged:true});worlds=await f.game.initializeSoloWorldsAsync();human=worlds.worlds.get('player')!;store=f.game.soloPickupStore;
   });
   afterAll(async()=>{
    stopped=true;
    try{
     await deadlineCleanup?.catch(()=>{});
     // Store close owns all remaining test pins as well as production leases.
     if(f){await f.game.disposeSoloWorldsAsync(false);f.dispose();}
    }finally{if(f)clearFixtureDiagnostics(f);}
    // Completed describe callbacks stay registered until file completion. Drop
    // their closed scene/store/resource graphs after terminal owned cleanup.
    f=undefined as unknown as ReturnType<typeof startup>;worlds=undefined;human=undefined;
    store=undefined as unknown as IndexedDBOriginalPickupBatchStore;
    gi=undefined;gun=undefined;oldPage=undefined;oldPin=undefined;currentPin=undefined;
    giHandle=undefined;gunHandle=undefined;deadlineCleanup=undefined;
   });
   for(let first=0;first<count;first+=2){
    const end=Math.min(first+2,count);
    it(`commits lives ${first+1}–${end} with all 76 real fade callbacks per life`,()=>step(async()=>{
     expect(completedLives).toBe(first);
     console.info('Paged Game pickup step',JSON.stringify({map,targetDrops:count,firstLife:first+1,lastLife:end,phase:'start',completedLives,callback,heapUsedBytes:process.memoryUsage().heapUsed,emulatorTransactions}));
     for(let life=first;life<end;life++){
      active();const id='paged-pickup-peer';
      const peer=await f.game.registerSoloObserverAsync({id,name:'Paged Pickup Peer',eye:{x:1100+300*life,y:1000,z:0}},f.game.elapsed);active();
      peer.weapon='rpg';await advance();
      const actor=human.modelState.actors.find((value:any)=>value.actorId===id)!,presenter=f.game.soloReceiverModels.presentation;
      if(!life){giHandle=actor.gi;gunHandle=actor.gun;gi=presenter.readRig(giHandle);gun=presenter.readGun(gunHandle);}
      expect(actor.gi).toBe(giHandle);expect(actor.gun).toBe(gunHandle);
      expect(presenter.readRig(actor.gi)).toBe(gi);expect(presenter.readGun(actor.gun)).toBe(gun);
      await f.game.retireSoloObserverAsync(id);active();expect(worlds.worlds.has(id)).toBe(false);
      expect(human.modelState.pickupHistory.root.count).toBe(life); // Receipt death precedes detach.
      await advance();expect(human.modelState.pickupHistory.root.count).toBe(life+1);expect(human.modelState.pickups).toEqual([]);
      for(let frame=0;frame<76;frame++)await advance();
      expect(human.modelState.fades).toEqual([]);expect(human.modelState.fifo).toContain(giHandle);
      expect(human.modelState.pickupHistory.root.count).toBe(life+1);
      if(life===15){oldPin=await store.readManifestAndPin('acceptance-old');active();oldPage=await store.readPage(oldPin,'player',0);active();expect(oldPage).toHaveLength(16);}
      completedLives=life+1;
     }
     expect(completedLives).toBe(end);expect(human.modelState.pickupHistory.root.count).toBe(end);
     console.info('Paged Game pickup step',JSON.stringify({map,targetDrops:count,firstLife:first+1,lastLife:end,phase:'complete',completedLives,callback,storedCount:human.modelState.pickupHistory.root.count,heapUsedBytes:process.memoryUsage().heapUsed,emulatorTransactions}));
    }),60000);
   }
   it(`proves all ${count} independent stored positions, old pin retention and one real collection`,()=>step(async()=>{
    expect(completedLives).toBe(count);
    expect(human.modelState.pickupHistory.root).toMatchObject({count,highWaterId:count,pageCount:Math.ceil(count/16)});
    expect(human.modelState.giHandles).toHaveLength(1);
    currentPin=await store.readManifestAndPin('acceptance-current');active();let rows=0,previousId=0,previousX=-Infinity;
    let oldest:Readonly<ReceiverPickup>|undefined;
    for(let page=0;page<Math.ceil(count/16);page++){
     const records=await store.readPage(currentPin,'player',page);active();expect(records.length).toBeLessThanOrEqual(16);
     for(const record of records){
      expect(record.id).toBeGreaterThan(previousId);expect(record.position.x-previousX).toBeGreaterThan(100);
      expect(record.handle).toBe(gunHandle);expect(record.weapon).toBe('rpg');
      oldest??=record;previousId=record.id;previousX=record.position.x;rows++;
     }
    }
    expect(rows).toBe(count);expect(await store.readPage(oldPin!,'player',0)).toEqual(oldPage);active();
    await store.unpin('acceptance-current');currentPin=undefined;active();
    const score=human.loadout.score,reserve=human.loadout.reserve.rpg;
    f.game.camera.position.copy(oldest!.position);f.game.checkpointSoloHumanBody();await advance();
    expect(human.modelState.pickupHistory.root).toMatchObject({count:count-1,highWaterId:count});
    expect(human.loadout.score).toBe(score+5);expect(human.loadout.reserve.rpg).toBe(reserve+12);
    expect(await store.readPage(oldPin!,'player',0)).toEqual(oldPage);active();
    await store.unpin('acceptance-old');oldPin=undefined;active();
   }),60000);
  });
 }
});
